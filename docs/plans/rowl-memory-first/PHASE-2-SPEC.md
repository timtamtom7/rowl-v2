# Sub-project #1 — Memory-First Agent

## Phase 2: Agent-Editable Memory Tools

**Status:** spec draft, awaiting review
**Date:** 2026-04-18
**Scope:** Phase 2 only (of a multi-phase sub-project). Builds on Phase 1 (SHIPPED 2026-04-18).

---

## Summary

Rowl gains two agent-callable tools — `core_memory_replace` and `core_memory_append` — that let the agent edit the same markdown files humans already edit under `{workspace}/memory/`. Edits go through pure TypeScript functions in `packages/shared/src/memory/`, adapted by thin tool handlers in `packages/session-tools-core/`. Writes are atomic (tmp + rename), guarded against external-edit races via mtime checks, and recorded in an append-only `.history.jsonl` audit log next to the block files. The agent sees structured success/error results with stable error codes; the user sees nothing blocking — edits land silently, and the history file is their paper trail.

## Goal

Deliver the "agent learned something new about me and now remembers it" loop as the smallest shippable unit:

- The agent can call `core_memory_replace` with `(label, old_content, new_content)` to swap an exact substring in a named block.
- The agent can call `core_memory_append` with `(label, content)` to add to the end of a named block.
- Both tools are registered on both backends (Claude + Pi) via `SESSION_TOOL_DEFS`.
- Concurrent human edits do not get silently clobbered (mtime check → `STALE_MTIME` error → agent retries next turn with fresh block state).
- Every successful write is recorded in `memory/.history.jsonl`.
- Phase 1's read-every-turn injection continues unchanged.

## Non-goals (Phase 2)

- Creating new blocks via tool (`core_memory_create_block`) — deferred. Users still create new `.md` files manually. Rationale: avoids label-collision decisions and keeps the tool surface minimal.
- Deleting blocks via tool (`core_memory_delete_block`) — deferred. Same reason.
- Whole-block rewrite tool (`core_memory_rewrite`) — deferred. Replace + append cover 90% of real usage; rewrite can be done by the agent doing a targeted replace of the whole body.
- Toast / in-app notification when the agent edits memory — deferred. Silent + audit log is sufficient for Phase 2. UI surface is a separate design.
- Diff viewer / history browser UI — deferred. Users `cat memory/.history.jsonl` or (later) get a Palace-style viewer.
- Locking (flock) / mandatory OS-level exclusion — deferred. mtime-check covers the realistic race.
- Rotation of `.history.jsonl` — deferred. Single-user app, unbounded growth is fine for Phase 2.
- Agent-visible view of the audit log — deferred. The log is for the user, not the agent.
- Reminder engine / memory-aware automations — **Phase 3**.
- Per-session scratch blocks — deferred indefinitely.

---

## Architecture (one paragraph)

Pure write functions (`replaceInBlock`, `appendToBlock`) live in `packages/shared/src/memory/` alongside Phase 1's read-side (`loadMemoryBlocks`, `renderMemoryBlocks`, `ensureDefaultMemoryBlocks`). They share a `writeBlockAtomic` helper (tmp-file + rename) and an `appendHistory` helper that writes to `{workspace}/memory/.history.jsonl`. Thin tool adapters in `packages/session-tools-core/src/tools/` define Zod schemas, call the shared functions, and format the structured result for the agent. Both tools register via `SESSION_TOOL_DEFS` and become available to both Claude and Pi backends automatically. Reads still happen every turn via Phase 1's path (`PromptBuilder.buildContextParts()`); writes go through the new tool path during a turn. Because frontmatter (`label`, `description`, `limit`) is preserved through the parse → modify body → reconstruct pipeline, humans and the agent share one file format without conflict.

---

## Tool surface

### `core_memory_replace`

**Intent:** swap an exact substring in a named block's body.

**Input schema (Zod):**
```ts
z.object({
  label: z.string().min(1),
  old_content: z.string().min(1),
  new_content: z.string(),  // may be empty to delete the substring
})
```

**Match semantics (strict):**
- `old_content` must appear in the block's body **exactly once** (byte-for-byte).
- Zero matches → `NOT_FOUND` error.
- Multiple matches → `MULTIPLE_MATCHES` error. Agent retries with more surrounding context.
- Exactly one match → replace that occurrence with `new_content`.

**Frontmatter:** untouched. The match-and-replace is against the body only.

### `core_memory_append`

**Intent:** add content to the end of a named block's body.

**Input schema (Zod):**
```ts
z.object({
  label: z.string().min(1),
  content: z.string().min(1),
})
```

**Junction normalization:**
- Strip trailing whitespace from current body.
- Insert exactly one `\n`.
- Append `content` verbatim.

**Size warning:**
- After write, if `Buffer.byteLength(newBody) > 16384`, the result includes a `warnings` array with `"block '<label>' is now <N>B (soft cap 16KB)"`. Write still succeeds. No hard cap.

**Frontmatter:** untouched.

**No `---` protection in appended content.** gray-matter parses only the leading frontmatter fence; mid-body `---` is prose.

### Tool descriptions (shown to the agent)

These are the descriptions registered in `SESSION_TOOL_DEFS`. Keep close to this text; tune based on live-smoke agent behavior before merging.

**`core_memory_replace`:**
> Replace an exact substring in one of your memory blocks. Memory blocks are named markdown files under the workspace's `memory/` directory (e.g. `persona`, `human`, `project`) that are automatically injected into every turn. Use this to correct, update, or refine facts you've previously written. The `old_content` must appear exactly once in the named block; if it doesn't match or matches multiple times, you'll get an error and can retry with more surrounding context. Set `new_content` to an empty string to delete the substring.

**`core_memory_append`:**
> Add new content to the end of one of your memory blocks. Memory blocks are named markdown files under the workspace's `memory/` directory (e.g. `persona`, `human`, `project`) that are automatically injected into every turn. Use this to record new facts, preferences, or decisions you want to remember across turns. A newline is inserted automatically between the existing body and your new content — do not include a leading newline yourself.

Both tools accept `label` = the block name without `.md` (e.g. `"human"`, not `"human.md"`).

---

## Result shape

Both tool handlers return a common discriminated union from the shared layer:

```ts
type MemoryEditResult =
  | { ok: true; newSize: number; warnings?: string[] }
  | { ok: false; code: ErrorCode; message: string };

type ErrorCode =
  | 'BLOCK_MISSING'       // file doesn't exist for this label
  | 'PARSE_ERROR'         // file exists but gray-matter can't parse frontmatter
  | 'NOT_FOUND'           // old_content didn't match (replace only)
  | 'MULTIPLE_MATCHES'    // old_content matched 2+ times (replace only)
  | 'STALE_MTIME';        // file was modified between our read and our write
```

### Agent-visible text formatting

The tool adapter translates the structured result into the string the agent sees:

| Result | Agent sees |
|---|---|
| `{ok: true, newSize: 1247}` | `"ok (new size: 1247 bytes)"` |
| `{ok: true, newSize: 17000, warnings: ["block 'project' is now 17000B (soft cap 16KB)"]}` | `"ok (new size: 17000 bytes)\nwarning: block 'project' is now 17000B (soft cap 16KB)"` |
| `{ok: false, code: 'NOT_FOUND', message: "substring not found in block 'persona'"}` | `"error: substring not found in block 'persona'"` |
| `{ok: false, code: 'MULTIPLE_MATCHES', message: "found 3 matches in block 'persona', provide more surrounding context"}` | `"error: found 3 matches in block 'persona', provide more surrounding context"` |
| `{ok: false, code: 'STALE_MTIME', message: "block 'persona' was modified externally, retry"}` | `"error: block 'persona' was modified externally, retry"` |
| `{ok: false, code: 'BLOCK_MISSING', message: "no block with label 'foo'"}` | `"error: no block with label 'foo'"` |

The structured `code` field is **not** shown to the agent as a separate JSON field — it's for programmatic consumers (logs, audit log entries, future UI). Messages are stable enough that the agent can pattern-match; the intent is for the agent to read the English and recover.

---

## Concurrency model

Phase 1 assumed only humans write; Phase 2 adds the agent as a writer. Both can touch the same file.

**Design: optimistic mtime check.**

1. At the start of each tool call, `stat()` the block file and capture `mtimeMs`.
2. Read + modify in memory.
3. Before writing, re-`stat()` the file and compare `mtimeMs` to the captured value.
4. If changed → abort with `STALE_MTIME`. The agent's next turn naturally re-reads the file via Phase 1's path and can retry with fresh content.
5. If unchanged → proceed with atomic write (`tmp + rename`).

**What this protects against:**
- Human editing the file in VS Code / vim while the agent runs a tool: mtime changes, agent sees `STALE_MTIME`, retries next turn.
- Two agent tool calls in the same turn racing each other: the second call's pre-write stat sees the first call's rename and aborts.

**What this does NOT protect against:**
- An external editor that saves without changing mtime (extremely rare; content-hash alternative rejected as overkill).
- The microsecond window between our re-stat and our rename (TOCTOU). Damage is at most one lost edit, not silent corruption. Acceptable for a single-user personal app.
- Two Rowl processes against the same workspace. Not a supported configuration in Phase 2.

---

## Atomic writes

Shared helper `writeBlockAtomic(targetPath, content)`:

1. Write `content` to `<targetPath>.tmp` with `{flag: 'w'}`.
2. `fs.rename(tmp, target)` — atomic on POSIX same-filesystem.
3. On any error, best-effort `fs.unlink(tmp)` and rethrow the original error.

No explicit `fsync` — acceptable for human-editable workspace state; matches how humans' own editors save.

---

## Audit log

Append-only JSONL file at `{workspaceRootPath}/memory/.history.jsonl`. One line per successful write.

**Entry schemas:**

```jsonc
// replace
{ "ts": "2026-04-18T15:42:11.123Z",
  "label": "persona",
  "op": "replace",
  "old": "I reply in prose.",
  "new": "I reply in bullets." }

// append
{ "ts": "2026-04-18T15:45:02.891Z",
  "label": "human",
  "op": "append",
  "content": "User's name is Mario. Prefers bullets." }
```

**Truncation rule:** any string field (`old`, `new`, `content`) longer than 500 characters is truncated to 500 with a `…` suffix appended. The full content is already in the block file via the write itself; the log just needs enough to identify *what* was changed, not to be a rollback buffer.

**Error handling:** `appendHistory` wraps its I/O in try/catch, `console.warn`s on failure, and returns. A failing log write must NEVER fail the user-facing tool call.

**Write discipline:** `fs.appendFile(path, line, {flag: 'a'})`. POSIX guarantees atomicity for small appends (< `PIPE_BUF`, typically 4096 bytes). Truncating to 500 per string keeps typical lines well under that bound.

**No rotation.** File grows unbounded. Acceptable for personal use; a Phase 3+ feature if it ever matters.

---

## Flow: `core_memory_replace`

1. Agent calls tool with `{label, old_content, new_content}`.
2. Tool adapter (in `session-tools-core`) validates via Zod, pulls `workspaceRootPath` from the session context, calls `replaceInBlock({workspaceRootPath, label, oldContent, newContent})`.
3. `replaceInBlock`:
   1. Resolve path via existing `getMemoryBlockPath(workspaceRootPath, label)`.
   2. `stat` the file. `ENOENT` → return `{ok: false, code: 'BLOCK_MISSING', message: "no block with label '<label>'"}`.
   3. Capture `mtimeMs`.
   4. Read file. Parse with gray-matter → `{data: frontmatter, content: body}`.
   5. Count occurrences of `oldContent` in `body` (literal byte-level count, no regex).
   6. 0 → `NOT_FOUND`. N>1 → `MULTIPLE_MATCHES`.
   7. Build `newBody = body.replace(oldContent, newContent)` (single replacement since count was 1).
   8. Re-`stat` the file. If `mtimeMs` differs → `STALE_MTIME`.
   9. Reconstruct full file content using gray-matter's `stringify(newBody, frontmatter)`.
   10. `writeBlockAtomic(path, fullContent)`.
   11. `appendHistory({label, op: 'replace', old: oldContent, new: newContent, ts: now()})`.
   12. Return `{ok: true, newSize: Buffer.byteLength(newBody)}`.
4. Adapter formats result and returns it to the agent loop.

## Flow: `core_memory_append`

1. Agent calls tool with `{label, content}`.
2. Adapter validates, calls `appendToBlock({workspaceRootPath, label, content})`.
3. `appendToBlock`:
   1. Resolve path. `stat`. `ENOENT` → `BLOCK_MISSING`.
   2. Capture `mtimeMs`.
   3. Read + gray-matter parse → `{data, content: body}`.
   4. `newBody = body.replace(/\s+$/, '') + '\n' + content`.
   5. Re-`stat`. Differ → `STALE_MTIME`.
   6. Reconstruct with `matter.stringify(newBody, data)`.
   7. `writeBlockAtomic`.
   8. `appendHistory({label, op: 'append', content, ts: now()})`.
   9. Compute `newSize = Buffer.byteLength(newBody)`. If `> 16384`, include a `warnings` entry.
   10. Return `{ok: true, newSize, warnings?}`.

---

## Files to be created / modified

### New files

| Path | Purpose |
|---|---|
| `packages/shared/src/memory/editTypes.ts` | `MemoryEditResult`, `ErrorCode` types |
| `packages/shared/src/memory/writeBlockAtomic.ts` | tmp + rename helper |
| `packages/shared/src/memory/appendHistory.ts` | JSONL audit-log writer (non-throwing) |
| `packages/shared/src/memory/replaceInBlock.ts` | Pure replace function |
| `packages/shared/src/memory/appendToBlock.ts` | Pure append function |
| `packages/shared/src/memory/__tests__/writeBlockAtomic.test.ts` | |
| `packages/shared/src/memory/__tests__/appendHistory.test.ts` | |
| `packages/shared/src/memory/__tests__/replaceInBlock.test.ts` | |
| `packages/shared/src/memory/__tests__/appendToBlock.test.ts` | |
| `packages/session-tools-core/src/tools/core-memory-replace.ts` | Tool adapter |
| `packages/session-tools-core/src/tools/core-memory-append.ts` | Tool adapter |
| `packages/session-tools-core/src/tools/__tests__/core-memory-tools.integration.test.ts` | End-to-end (Zod + handler + filesystem) |

### Modified files

| Path | Change |
|---|---|
| `packages/shared/src/memory/index.ts` | Re-export `replaceInBlock`, `appendToBlock`, edit types |
| `packages/session-tools-core/src/tool-defs.ts` | Register both tools in `SESSION_TOOL_DEFS` |

### Not touched (explicit)

- `loadMemoryBlocks`, `renderMemoryBlocks`, `ensureDefaultMemoryBlocks` — Phase 1 read-side is stable.
- `PromptBuilder.buildContextParts()` — memory injection is unchanged.
- `SessionManager.createSession()` — no new init hooks.
- Any UI code — no in-app memory browser.

---

## Dependencies

- `gray-matter ^4.0.3` (Phase 1 dependency, reused).
- `zod` (already used by `session-tools-core`).
- No new npm packages.

---

## Error handling matrix

| Situation | Code | Agent sees | User sees |
|---|---|---|---|
| Block file missing | `BLOCK_MISSING` | `"error: no block with label 'foo'"` | nothing |
| Replace: 0 matches | `NOT_FOUND` | `"error: substring not found in block '<label>'"` | nothing |
| Replace: N>1 matches | `MULTIPLE_MATCHES` | `"error: found N matches in block '<label>', provide more surrounding context"` | nothing |
| Either: file edited mid-tool | `STALE_MTIME` | `"error: block '<label>' was modified externally, retry"` | nothing |
| Append: body grows past 16KB | (success) | `"ok (new size: NB)\nwarning: block '<label>' is now NB (soft cap 16KB)"` | block is larger |
| Atomic write fails (disk full, permissions) | — | tool call itself errors (existing SDK path) | session logs warning |
| History write fails | — | success as normal (history failure is swallowed) | `console.warn` line in server logs |
| Gray-matter parse fails on read | `PARSE_ERROR` | `"error: could not parse frontmatter in block '<label>'"` | nothing |

Phase 1's loader already logs and skips malformed files during reads; Phase 2's editor adds a distinct tool-visible error so the agent can tell the user the block is corrupted rather than silently failing or pretending it's missing.

---

## Testing strategy

Target: 20-25 new tests. Phase 1 landed 27.

### Unit — `writeBlockAtomic.test.ts`
- Writes new content to target via tmp-then-rename; no `.tmp` remains after success.
- On rename failure (simulated via read-only parent), `.tmp` is cleaned up and error propagates.
- Concurrent calls don't interleave: final content is exactly one of the two inputs, never a mix.

### Unit — `appendHistory.test.ts`
- Writes one JSONL line per call, terminated with `\n`.
- Long string fields (>500 chars) truncated to `500 chars + "…"`.
- When the target directory is unwritable, function `console.warn`s and returns normally (does not throw).
- Two sequential calls produce two valid JSON lines (newline-separated).

### Unit — `replaceInBlock.test.ts`
- Happy path: unique match replaced, frontmatter preserved, history entry written.
- `BLOCK_MISSING` when file doesn't exist.
- `NOT_FOUND` on 0 matches.
- `MULTIPLE_MATCHES` on 2 matches.
- `STALE_MTIME` when file is touched (`utimes`) between our initial stat and our write. Must be triggered deterministically; test forces a mtime bump after the read.
- Gray-matter parse failure → structured error result, no crash.
- `new_content` empty string is valid (acts as delete).
- Writing the same content back (no-op semantics) is allowed; history still records it.

### Unit — `appendToBlock.test.ts`
- Happy path: appends with one `\n` separator regardless of original trailing whitespace.
- Trailing whitespace (spaces + newlines + tabs) on old body is stripped before junction.
- Empty body + append produces `\n` + content (leading newline acceptable; matches normalization rule).
- `STALE_MTIME` on external edit.
- `BLOCK_MISSING` when file doesn't exist.
- 16KB warning triggered when newBody crosses boundary; not triggered at 16383 bytes; triggered at 16385 bytes.
- History entry written with op: 'append'.

### Integration — `core-memory-tools.integration.test.ts`

In `packages/session-tools-core/src/tools/__tests__/`. Uses a tmpdir workspace with pre-written memory blocks.

- Zod rejection: empty `label` → schema error before handler runs.
- `core_memory_replace` end-to-end: set up workspace, invoke handler via tool registration, assert agent-visible string format ("ok (new size: N bytes)").
- `core_memory_replace` error end-to-end: missing label → "error: no block with label 'foo'".
- `core_memory_append` end-to-end: success and size-warning cases.
- Tool registration visibility: both tools present in `SESSION_TOOL_DEFS` with correct names.

### Explicit non-test-types

- No E2E Electron test. Phase 1 landed without one; integration tests cover the wire format.
- No cross-backend test (Claude vs Pi). Both use the same `SESSION_TOOL_DEFS` and tool-call plumbing; if one works, the other works.

---

## Risks & open questions

| Risk | Mitigation |
|---|---|
| Agent burns retries on whitespace-sensitive exact matches. | Accept as tradeoff for determinism. Revisit with normalized-whitespace retry (deferred Option B from brainstorm) if empirical use shows it's a real problem. |
| 16KB soft cap is arbitrary. Blocks this large are already questionable. | Warning is advisory, not blocking. Users can ignore it; number can be revisited. |
| `STALE_MTIME` could fire spuriously on filesystems with coarse mtime granularity (some network/FUSE mounts). | Acceptable failure mode — the agent's worst case is "retry next turn." No data loss. |
| History file grows unbounded over months/years. | Personal-use app, acceptable. Rotation = Phase 3+ concern. |
| Gray-matter's `stringify` round-trip could normalize YAML in unexpected ways (reorder keys, change quoting) on every write. | Acceptable: frontmatter is human-authored but stable. If it becomes a problem, switch to manual frontmatter preservation (split on leading `---\n...\n---\n`, keep verbatim, rewrite body only). |
| Two tool calls in one turn on the same block: second call's pre-write mtime check will fire if the first's rename bumped mtime. Agent gets `STALE_MTIME` on its own prior edit. | Acceptable: rare in practice, agent handles it via next-turn reload. If it shows up as a real pattern, Phase 2.5 could track in-turn writes. |
| Tool description text is how the agent learns when to call these. If descriptions are bad, the agent won't use the tools. | Draft descriptions locked in this spec; tune against Letta's reference for voice if needed. Live-smoke-verify before merge (as Phase 1 did). |

---

## Success criteria

Phase 2 is done when:

- Starting a session, telling Rowl a fact about yourself ("my name is Mario, I prefer bullets"), and continuing — in the next turn or a new session — shows Rowl has persisted that fact into `memory/human.md` via an `append` or `replace` tool call. Visible "memory is live and mutable" signal.
- Editing `memory/persona.md` in an external editor while a tool call is in flight results in `STALE_MTIME` to the agent, not a silent clobber. The user's edit survives.
- `memory/.history.jsonl` accumulates one entry per successful tool call, with correct `ts`, `label`, `op`, and truncated content.
- Tool registration: both tools appear in `SESSION_TOOL_DEFS` and are callable from both Claude and Pi backends.
- All tests in `packages/shared/src/memory/__tests__/` and the new integration test pass.
- `bun run typecheck` green.
- `bun run electron:build` green.
- Live UI smoke in a fresh workspace validates: (1) agent spontaneously edits memory when told a new fact, (2) `.history.jsonl` captures the edit, (3) subsequent turn sees the edited block via Phase 1's read path.

---

## Future phases (context — not this spec)

- **Phase 3 — Reminder engine:** memory-aware automations that can schedule prompts, nudge the user, or trigger agent self-review of blocks. Likely grows `automations/` module.
- **Later:** `core_memory_create_block` / `core_memory_delete_block` tools if users need agent-driven block lifecycle. Currently the human creates blocks by creating `.md` files.
- **Later:** in-app Palace UI — browse/edit/diff memory blocks and the history log without leaving Rowl.
- **Later:** archival / searchable long-term memory beyond always-on blocks.
- **Later:** per-session scratch blocks (if the conversation surfaces a need for session-scoped memory that doesn't persist).
