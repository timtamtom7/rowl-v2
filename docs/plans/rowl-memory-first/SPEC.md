# Sub-project #1 — Memory-First Agent

## Phase 1: Always-On Workspace Memory Blocks

**Status:** spec approved, awaiting implementation plan
**Date:** 2026-04-18
**Scope:** Phase 1 only (of a multi-phase sub-project)

---

## Summary

Rowl gains a workspace-scoped memory system where named, human-editable markdown files in a `memory/` directory are automatically injected into every agent turn. The agent always sees current memory without any tool call, session refresh, or explicit prompt. This ports the Letta "core memory block" pattern's Phase 1 (read-only, always-on) and leaves the self-editing tools and reminder engine for later phases.

## Goal

Deliver the "my memory is in every turn" feeling as the smallest shippable unit:

- A user can write three default markdown files in a `memory/` directory and Rowl immediately starts referencing them in every reply.
- Edits to those files show up in the next turn — no restart, no reload UI, no cache.
- All of it is workspace-scoped and git-friendly.

## Non-goals (Phase 1)

- Agent-editable memory tools (`core_memory_replace`, `core_memory_append`) — **Phase 2**.
- Reminder engine / scheduled memory-aware prompts — **Phase 3**.
- Archival / searchable long-term memory store — deferred indefinitely.
- Per-session scratch blocks — deferred.
- In-app "Palace" UI for browsing/editing memory — deferred. Users edit markdown files in their own editor.
- File-watcher with live-reload UI notifications — deferred (per-turn disk reads are cheap enough).
- Auto `git init` of `memory/` dir — deferred. Plain filesystem only; user may `git init` manually.
- Memory-specific permission model — deferred. Memory files inherit workspace filesystem permissions.
- Conflict resolution for concurrent edits — not yet a problem because nothing edits in Phase 1 except humans.

---

## Architecture (one paragraph)

Rowl adds a workspace-scoped memory system: a `memory/` directory containing one markdown file per block, human-editable, persisted on disk. Every agent turn, a new `MemoryBlockLoader` reads the directory, parses each file's YAML frontmatter + markdown body into a `MemoryBlock` record, and returns the set. `PromptBuilder.buildContextParts()` calls the loader and appends a single formatted `<memory_blocks>` context-part before every user message — so the agent sees current memory on every turn without changing the static system prompt (preserves Claude prompt caching). On first use in a workspace without a `memory/` directory, a lazy initializer writes three default block files with placeholder scaffolding. No in-memory cache, no file-watcher, no session-level state. Both backends (Claude + Pi) get the same behavior because `buildContextParts()` is shared.

## Injection point rationale

The per-turn dynamic context (date/time, session state, sources, working directory) is already prepended to the **user message**, not the system prompt, because the system prompt is kept static for Claude's prompt caching. Memory blocks follow the same channel and the same rule. Concrete seam: `PromptBuilder.buildContextParts()` at `packages/shared/src/agent/core/prompt-builder.ts` (verify current line numbers at implementation time).

---

## Data model

### Filesystem layout

```
{workspaceRootPath}/memory/
  persona.md
  human.md
  project.md
  <any-additional-user-created-blocks>.md
```

- One markdown file per block.
- Filename (minus `.md`) is the block's `label`.
- User may create additional block files freely.

### File format

Example `persona.md`:

```markdown
---
label: persona
description: who Rowl is, how it behaves
limit: 2000
---
You are Rowl, a memory-first coding agent. You remember what matters...
```

### Frontmatter schema

| Field | Type | Required | Purpose |
|---|---|---|---|
| `label` | string | yes | Block identifier. MUST match filename (minus `.md`). |
| `description` | string | yes | Human-readable purpose. Shown to the agent as the block's `description` attribute. |
| `limit` | int | no | Soft character cap. Warned, not truncated. |

### TypeScript types

Defined in `packages/shared/src/memory/types.ts`:

```ts
interface MemoryBlockFrontmatter {
  label: string;
  description: string;
  limit?: number;
}

interface MemoryBlock {
  label: string;
  description: string;
  content: string;    // markdown body (no frontmatter)
  limit?: number;
  filePath: string;   // absolute path, for error messages
}
```

### Invariants

- `label` in frontmatter MUST match filename minus extension. Mismatch → block is skipped with a warning.
- Exactly one block per file.
- Alphabetical order (by `label`) in the injected context.

---

## Injection format

All loaded blocks are rendered into a single XML wrapper and returned as the **first** context-part from `buildContextParts()` (before date/time, session state, sources, working-dir). Empty set → no wrapper at all (not empty tags).

Shape:

```
<memory_blocks>
<memory_block label="human" description="what Rowl knows about the user">
{human content}
</memory_block>
<memory_block label="persona" description="who Rowl is, how it behaves">
{persona content}
</memory_block>
<memory_block label="project" description="what this workspace is about">
{project content}
</memory_block>
</memory_blocks>
```

Rationale for XML: Claude parses structured XML input cleanly (Anthropic best-practice); labels are unambiguous references for future edit-tools; single wrapper makes the block-set visible as one conceptual unit.

---

## Flow: per-turn load + injection

1. User sends a message in the Electron UI → IPC → `SessionManager.chat()` → `agent.chat(message, attachments)`.
2. Inside `ClaudeAgent.chat()` (and parallel in `PiAgent.chat()`), control reaches `PromptBuilder.buildContextParts()` as it does today.
3. `buildContextParts()` calls a new helper: `loadMemoryBlocks(workspaceRootPath) → Promise<MemoryBlock[]>`.
4. `loadMemoryBlocks`:
   - `readdir` the `{workspaceRootPath}/memory/` directory.
   - For each `.md` file: `readFile` → `gray-matter` parse (root dep already) → validate frontmatter → construct `MemoryBlock`.
   - Reject: malformed YAML, missing `label` or `description`, label ≠ filename. Log each rejection with file path.
   - Sort alphabetically by `label`.
   - If the directory doesn't exist, return `[]`. (Initializer — see "Workspace init" — is a separate call, not inline in the hot path.)
5. `buildContextParts()` renders blocks to the XML form above. Result is a new context-part, **first** in the context-parts list.
6. Everything downstream is unchanged: context-parts are joined and prepended to the user message, the SDK is invoked, events stream back.

**No caching. No file-watcher. No IPC events.** One small directory scan + three small reads per turn. Measured in microseconds.

---

## Flow: workspace initialization (default blocks)

On session init, if `{workspaceRootPath}/memory/` does NOT exist, create it and write three default block files. If it exists (even if empty, even if user deleted some defaults), do nothing.

Entry point: new function `ensureDefaultMemoryBlocks(workspaceRootPath): Promise<void>`, called from `SessionManager` during session initialization alongside the existing per-workspace directory setup (the place that ensures `sessions/`, `data/`, etc. — locate at implementation time).

Why lazy (on-first-session) vs eager (on-workspace-create): keeps the feature isolated, avoids touching workspace-creation code. First session in a new workspace materializes memory; thereafter the files are just there.

### Default block contents (scaffolding)

`persona.md`:
```markdown
---
label: persona
description: who Rowl is, how it behaves
---
You are Rowl, a memory-first coding agent. You remember context across sessions via the memory blocks shown above and below. Edit this file to define your personality, voice, and working style.
```

`human.md`:
```markdown
---
label: human
description: what Rowl knows about the user
---
(Empty — edit this file to tell Rowl about yourself: your name, role, preferences, how you like to work.)
```

`project.md`:
```markdown
---
label: project
description: what this workspace is about
---
(Empty — edit this file to describe the project: goals, constraints, stack, key decisions.)
```

---

## Error handling

Principle: **memory is an enhancement, not a prerequisite.** A broken memory directory must never prevent the agent from responding. Every error is logged and skipped, not thrown.

| Failure | Behavior |
|---|---|
| `memory/` directory missing | `loadMemoryBlocks` returns `[]`. Initializer creates it on next session start. Turn proceeds without memory blocks. |
| File exists but YAML frontmatter malformed | Log `[memory] Skipped {path}: invalid frontmatter ({error})`. Skip file, continue loading others. |
| Frontmatter present but `label` field missing | Log `[memory] Skipped {path}: missing label`. Skip. |
| Frontmatter present but `description` field missing | Log `[memory] Skipped {path}: missing description`. Skip. |
| Frontmatter `label` doesn't match filename | Log `[memory] Skipped {path}: label '{label}' doesn't match filename`. Skip. Prevents silent rename drift. |
| Block content exceeds `limit` chars | Log warning `[memory] Block '{label}' exceeds limit ({actual}/{limit})`. Include anyway — don't truncate. |
| File read I/O error (permissions, disk) | Log error, skip file. Don't fail the turn. |
| `ensureDefaultMemoryBlocks` fails to create dir/files | Log error, turn proceeds with no memory. Don't crash session init. |

Log channel: reuse the existing session logger used by `SessionManager`. No new log subsystem.

---

## Testing strategy

Three layers, all in `packages/shared/src/memory/__tests__/`.

### Unit — `loadMemoryBlocks.test.ts`

- Loads 3 valid blocks → returns 3, alphabetical by label.
- Missing directory → returns `[]`.
- One file with malformed YAML → returns the 2 valid blocks, logs skip for the bad one.
- File with label mismatch → skipped with warning.
- File over `limit` → included with warning log.
- Empty block content (only frontmatter) → included, content is empty string.
- Uses a temp directory via `mkdtemp` so tests do not touch real workspaces.

### Unit — `ensureDefaultMemoryBlocks.test.ts`

- Fresh directory → creates `memory/` with 3 default files whose contents match expected scaffolding strings.
- Existing `memory/` dir (even empty) → no-op. Don't overwrite.
- Existing `memory/persona.md` → don't overwrite the user's version.
- Write error → logs, doesn't throw.

### Integration — `buildContextParts.memory.test.ts`

New test at the appropriate `PromptBuilder` test location (in the existing file if small; in a sibling file if the existing one is unwieldy — decide at implementation time).

- Given a workspace with 3 valid memory blocks, `buildContextParts()` output includes the expected `<memory_blocks>...</memory_blocks>` string as the first context-part.
- Given an empty `memory/`, `buildContextParts()` does NOT include `<memory_blocks>` in output (not empty tags).
- Given a workspace with no `memory/` dir, same: no `<memory_blocks>` present. No crash.

### Explicit non-test-types

No end-to-end Electron test for Phase 1. Slow and the integration test above covers the real wire format.

---

## Files to be created / modified

**New files:**

| Path | Purpose |
|---|---|
| `packages/shared/src/memory/types.ts` | `MemoryBlock`, `MemoryBlockFrontmatter` types |
| `packages/shared/src/memory/paths.ts` | `getMemoryDir(workspaceRootPath)` helper (single source of path truth) |
| `packages/shared/src/memory/loadMemoryBlocks.ts` | Directory scan + parse |
| `packages/shared/src/memory/ensureDefaultMemoryBlocks.ts` | Lazy init with scaffolding content |
| `packages/shared/src/memory/renderMemoryBlocks.ts` | XML-wrapper formatter |
| `packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts` | Tests for loader |
| `packages/shared/src/memory/__tests__/ensureDefaultMemoryBlocks.test.ts` | Tests for initializer |
| `packages/shared/src/memory/__tests__/buildContextParts.memory.test.ts` OR additions to existing PromptBuilder test file | Integration test |

**Modified files:**

| Path | Change |
|---|---|
| `packages/shared/src/agent/core/prompt-builder.ts` | `buildContextParts()` calls `loadMemoryBlocks` + prepends rendered block context-part |
| `packages/server-core/src/sessions/SessionManager.ts` | Call `ensureDefaultMemoryBlocks(workspaceRootPath)` during session init |

**Not touched (explicit):**

- `ClaudeAgent.chat()` / `PiAgent.chat()` — they already use `buildContextParts()`; no changes needed.
- Session JSONL persistence — memory lives outside sessions.
- Tool registration — no tools in Phase 1.
- Any UI code — editing happens in external editors.

---

## Dependencies

- `gray-matter` for frontmatter parsing (already a root dependency of craft-agents).
- No new npm packages.

---

## Risks & open questions

| Risk | Mitigation |
|---|---|
| `buildContextParts()` is called on every turn, including resume — unconfirmed but implied by existing date/time invalidation behavior. If NOT every turn, memory would be stale on resume. | Verify during plan step; add a direct test if not already covered. |
| Large blocks (e.g. user pastes a book into `project.md`) could bloat the per-turn payload. | `limit` field + warning. Hard cap is not Phase 1's problem — humans get one warning in logs. |
| Two sessions opened in the same workspace might see different snapshots if one edits mid-turn. | Non-issue in Phase 1 (humans edit; no agent edits). Revisit in Phase 2. |
| Block labels colliding with existing craft-agents concepts (e.g., `session`, `source`) confusing the agent. | Labels are namespaced under `<memory_block label=...>` so they don't collide with the real `<session>` or `<source>` XML used elsewhere. The `memory_block` wrapper makes intent explicit. |
| Order-sensitivity of the model if a later block references an earlier one. | Alphabetical ordering is deterministic, so the behavior is stable. Users who care about order can rename files (e.g., `01-persona.md`). |

---

## Success criteria

Phase 1 is done when:

- A user creating a fresh workspace can open a session, and Rowl's first response demonstrates awareness of the default scaffolding (e.g., the persona description). Visible "memory is live" signal.
- Editing `memory/persona.md` and sending the next message results in behavior that reflects the edit, with no restart.
- Adding a new `memory/foo.md` file with valid frontmatter causes Rowl to see that block on the next turn.
- Deleting `memory/human.md` results in Rowl no longer seeing that block, with no error.
- Introducing a malformed file results in a warning in logs but no impact on the turn.
- All tests in `packages/shared/src/memory/__tests__/` pass.
- `bun run typecheck` remains green.
- `bun run electron:build` remains green.

---

## Future phases (context — not this spec)

- **Phase 2 — Agent-editable memory:** add `core_memory_replace` and `core_memory_append` tools in `packages/session-tools-core/`, registered via `SESSION_TOOL_DEFS`. Agent can update its own memory during a conversation. Same markdown files, now mutable by tool calls.
- **Phase 3 — Reminder engine:** extend `automations/` module with memory-aware triggers (scheduled memory reviews, event-driven nudges).
- **Later:** optional in-app "Palace" UI for viewing/editing memory without leaving Rowl; archival search; per-session scratch blocks.
