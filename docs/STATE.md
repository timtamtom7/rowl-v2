# Rowl — Current State (Plans Front Door)

**Last updated:** 2026-04-20 (sub-project #2 feature #1 "workspace rail" — SHIPPED, awaiting merge to main)
**Current focus:** Sub-project #2 feature #1 (workspace rail replacement) — SHIPPED. Live Electron smoke passed through three polish rounds; final round (2026-04-20, commit `5f0ceaa`) landed glass LeftSidebar treatment, compact-mode `+` button, `newSession` menu primary/secondary restructure (Panel first, Window second), and a rounded shell clip-path so the rail↔topbar inside-L junction curves cleanly. Ready to merge `workspace-rail` → `main`.

> **If you are a new session resuming Rowl work, read this file FIRST.**
> It orients you in ~60 seconds and tells you what to read next.
>
> For the full feature backlog — every feature from every source repo, status by sub-project — read [`docs/ROADMAP.md`](./ROADMAP.md). STATE.md = what's active right now; ROADMAP.md = what Rowl is meant to become.

---

## Overall goal (immutable)

Rowl is a deliberate synthesis of four open-source reference projects. Each contributes a specific layer. Do NOT forget this — it is the whole reason for the multi-sub-project arc.

| Source repo | License | Contributes | Sub-project |
|-------------|---------|-------------|-------------|
| [craft-agents-oss](https://github.com/lukilabs/craft-agents-oss) | Apache-2.0 | **UI / Electron base + runtime** — sidebar, skills/MCP surface, Mac-native feel, agent backend seam, session model | base (#0) |
| [letta-code](https://github.com/letta-ai/letta-code) | MIT | **Memory-first agent architecture** — git-backed memory blocks, reminder engine, self-editing memory, Palace viewer | #1 |
| [paperclip](https://github.com/paperclipai/paperclip) | Apache-2.0 | **Organizing layer** — Goal → Issue → Document/Feedback/Approval model, goal ancestry | #2 |
| [t3code](https://github.com/pingdotgg/t3code) | MIT | **Niche features** — git-native turn checkpoints, worktrees, stacked PRs, composer draft persistence, context meter | #3 |

All four are license-compatible (MIT / Apache-2.0). Reference clones live at `/Users/mauriello/Dev/_reference/`.

**Rowl in one sentence:** memory-first agents inside the Craft Agents UI base, organized by Paperclip-style goal/issue/document structure, with t3code's niche engineering workflow features.

---

## Where we are right now

- **Sub-project:** #2 — Organizing layer (Paperclip-style), feature #1 "Workspace Rail" replacing the topbar workspace dropdown with an always-visible 72px left rail + compact breadcrumb.
- **Feature status:** SHIPPED 2026-04-20. Branch `workspace-rail` now 13 commits ahead of base after three live-smoke polish rounds (commits `89195d5`, `44d6645`, `5f0ceaa`). Round 3 landed: glass LeftSidebar (`bg-muted/60 backdrop-blur-xl` + `RADIUS_EDGE` on left corners, `RADIUS_INNER` on right), compact-mode `+` button in TopBar for narrow windows (<768px), `newSession` context menu reshuffled to surface "New Session in Panel" (primary, `Columns3` icon) above "Open in New Window", `shellRef` wrapper switched from `height: 100%` to `flex: 1` with `clip-path: inset(0 round 14 0 0 14)` so the rail↔topbar inside-L junction curves cleanly (bottom junction clips less visibly due to `paddingBottom: 6` on shellRef — accepted by user). Rail `border-r` divider removed; rail + sidebar now blend via vibrancy.
- **Spec:** `docs/plans/workspace-rail/SPEC.md`
- **Plan:** `docs/plans/workspace-rail/PLAN.md`
- **Branch:** `workspace-rail`, 13 commits, no remote.
- **Next:** Merge `workspace-rail` → `main` via `superpowers:finishing-a-development-branch`. Then continue into the three brainstorm topics in the queue: (a) multi-panel breadcrumbs + All Sessions panel↔dropdown toggle, (b) right sidebar redesign (glass detached overlay + workspace settings UI + memory UI), (c) planner/executor two-model architecture (sub-project #3).
- **Blocker:** None.

## Previous focus (closed)

- **Sub-project #1 Phase 2 SHIPPED 2026-04-19** — merged to `main` at commit `7660463` (`merge: sub-project #1 Phase 2 — agent-editable memory tools`). Live UI smoke PASSED 2026-04-19 19:49 local in `~/Downloads/superpowers` workspace: agent called `core_memory_append` then `core_memory_replace`; `human.md` + `memory/.history.jsonl` verified on disk.

## Last session handoff

**Session end: 2026-04-18 (sub-project #0 shipped)**

- Forked craft-agents-oss (upstream commit `61f7d48a5b4fd0a8094f002c9e3aea5f3824dcfb`) into `/Users/mauriello/Dev/rowl-v2/`. Full history preserved; `origin` remote removed.
- Rebranded user-visible surfaces: root `package.json` name → `rowl`, README top section, `NOTICE` addendum (Apache-2.0 §4(c) compliant), Electron bundle identity (`appId: dev.rowl.app`, `productName: Rowl`).
- Internal `@craft-agent/*` workspace names intentionally left as-is (minimal rebrand, avoids import-rewrite ripple). Consequence: dev-time Electron still uses `~/.craft-agent/` state dir; cannot run Rowl dev and packaged Craft Agents.app simultaneously.
- Established `docs/plans/` convention and `docs/STATE.md` as the living front door.
- Baseline verified: `bun install`, `bun run typecheck` (shared), and `bun run electron:build` all green. Electron window opens. Visual smoke confirmed by user.
- Inherited upstream issues accepted as known-baseline (see "Known-baseline issues" section above).
- No git remote configured; no GitHub repo created yet.

**Next session resumes by:** invoke `superpowers:brainstorming` to scope sub-project #1 (memory-first port) against the craft-agents codebase. The prior `/Users/mauriello/Dev/rowl/` phase-1a memory code (branch `phase-1a/core-memory-substrate`, tag `v-phase-1a`) is a translation reference only — Effect-TS there vs plain TS here, and craft-agents has a different agent backend shape (`packages/shared/src/agent/backend/types.ts`), so the port will be a rewrite, not a copy.

---

## Known-baseline issues (inherited from upstream craft-agents-oss)

These existed at fork time; we accepted them rather than pre-fixing upstream tech debt. Triage if/when they bite:

- `bun run typecheck:all` is red. Primary causes: missing `tsconfig.base.json` (referenced but not present in OSS release), outdated `@types/cacheable-request` vs `keyv`, regex/iteration target issues in `packages/session-tools-core`. The fast `bun run typecheck` (packages/shared only) is clean.
- `bun test` shows ~23 failing tests out of ~3617 (~99.0% pass). Failures concentrated in `apps/electron` renderer component tests (`react/jsx-dev-runtime` resolution, `croner` module missing) and `packages/session-tools-core`.
- At dev-time, Electron's state dir is still `~/.craft-agent/` (derived from internal workspace identifiers which we intentionally did NOT rename). If the packaged upstream **Craft Agents.app** is running on the same machine, it holds the lock at `~/.craft-agent/.server.lock` and blocks Rowl dev from booting. Quit Craft Agents.app before `bun run electron:start`. Packaged Rowl builds (electron-builder output) will use `appId: dev.rowl.app`, so no conflict in production.

## Multi-initiative map

| # | Initiative | Status | Why this order |
|---|-----------|--------|----------------|
| 0 | Bootstrap (fork craft-agents → rebrand → docs convention) | shipped | Must establish the base before any features. |
| 1 | Memory-first agent (Letta pattern port) | Phase 1 shipped 2026-04-18; Phase 2 shipped 2026-04-19 | Foundational. Every subsequent feature behaves differently with memory. |
| 2 | Organizing layer (Paperclip-style goals/issues/docs) | in progress — feature #1 (workspace rail) SHIPPED 2026-04-20; brainstorm queue: breadcrumbs + panel↔dropdown toggle, right sidebar redesign | Gives "why are we doing this" structure on top of memory. |
| 3 | t3code cherry-picks (checkpoints, worktrees, stacked PRs) | not-started | High-value, self-contained adds. |
| 4 | Research/review UX polish | not-started | Surfaces #2's data model as real research workflow UI. |

## Reading order when you resume

**Every session start:**
1. This file (`docs/STATE.md`) — top section
2. Current sub-project's plan file (see "Where we are right now" above)
3. Relevant plan task in progress

**If zooming out:**
4. `docs/plans/README.md` — plan conventions
5. Other sub-projects' SPEC/RESEARCH/STATUS

## Reference material (external, read-only)

- `/Users/mauriello/Dev/_reference/craft-agents-oss/` — the base we forked from (Apache-2.0)
- `/Users/mauriello/Dev/_reference/letta-code/` — memory pattern reference for #1
- `/Users/mauriello/Dev/_reference/paperclip/` — organizing-layer reference for #2
- `/Users/mauriello/Dev/_reference/t3code/` — niche-features reference for #3
- `/Users/mauriello/Dev/rowl/` — old pre-pivot Rowl (t3code fork) — frozen; read-only donor for memory-port translation reference when sub-project #1 planning starts

## Locked decisions

- **2026-04-18** — Base = craft-agents-oss fork at `/Users/mauriello/Dev/rowl-v2/`. Confirmed user intent (prior direction dropped this).
- **2026-04-18** — Minimal rebrand only: root `package.json`, `README.md`, `NOTICE`, Electron bundle metadata. Internal `@craft-agent/*` workspace names NOT renamed.
- **2026-04-18** — Plans location = inside this repo at `docs/plans/`. Living front door = `docs/STATE.md`.
- **2026-04-18** — `/Users/mauriello/Dev/rowl/` (old repo) frozen, not deleted. Untouched.
- **2026-04-18** — Trademark compliance: Apache-2.0 NOTICE preserved + addendum; "Craft"/"Craft Agents" branding removed from user-visible surfaces (productName, appId, README title).
- **2026-04-18** — Inherited upstream typecheck:all + ~0.6% test failures accepted as known-baseline rather than pre-fixed before Rowl work begins. Triage if they bite.
- **2026-04-18** — Sub-project #1 Phase 1 (always-on workspace memory blocks): code + tests complete on branch `phase-1/memory-blocks`. Memory files live at `{workspaceRootPath}/memory/<label>.md` with YAML frontmatter; loader is sync (deviation from spec's async signature, documented in plan) because `PromptBuilder.buildContextParts()` is sync. Blocks render as a single `<memory_blocks>` XML wrapper prepended to per-turn context (first position, before date/time). Three defaults (`persona`, `human`, `project`) are materialized lazily by `SessionManager.createSession()` on first session in a workspace. Missing/malformed blocks log-and-skip; never fail the turn.
- **2026-04-18** — Sub-project #1 Phase 1 SHIPPED. Live UI smoke confirmed end-to-end: creating a workspace + session at a fresh path materialized `memory/{persona,human,project}.md`; agent response named all three blocks on first turn; external edit to `human.md` reflected in the very next turn with no restart; malformed `broken.md` produced the expected `[memory] Skipped … invalid frontmatter (…)` log line without breaking the turn.
- **2026-04-19** — Sub-project #1 Phase 2 tool surface locked: exactly two agent-facing tools (`core_memory_replace`, `core_memory_append`). `core_memory_replace` uses strict substring match — 0 matches → `NOT_FOUND`, >1 matches → `MULTIPLE_MATCHES` (both surfaced as errors, no heuristic fallback). Concurrency via mtime re-stat between read and write → `STALE_MTIME` on race (agent retries on next turn after Phase 1 re-reads). Writes are atomic (temp file + rename). `core_memory_append` normalizes the junction by stripping trailing whitespace and joining with exactly one `\n`; empty existing body appends verbatim. Soft-warn threshold for append is 16 KB (warning bundled in result, write still succeeds). Every successful tool call appends a JSONL entry to `{workspaceRootPath}/memory/.history.jsonl` with truncated-at-500-chars fields; audit writes are best-effort and never fail the turn. Handlers resolve working directory via `ctx.workingDirectory ?? resolveSessionWorkingDirectory(...)` (mirroring `handleSkillValidate`) and return surface-form text — `ok (new size: N bytes)` on success, `error: …` on failure. Branch: `phase-2/memory-edit-tools`.
- **2026-04-19** — Gray-matter cache quirk fix locked in `replaceInBlock.ts` and `appendToBlock.ts`: always pass an options object (`matter(raw, {})`) when parsing. Root cause: gray-matter caches by content **before** calling `parseMatter`, so a second parse of identical malformed YAML returns the cached (partially-mutated) result without re-throwing, which silently bypasses our `try/catch` `PARSE_ERROR` branch. Passing any options object disables the cache path per gray-matter's own source comment.
- **2026-04-19** — Memory-tool handler working-directory resolution order locked: `ctx.workingDirectory ?? resolveSessionWorkingDirectory(...) ?? resolveSessionWorkspaceRoot(...)`. The third fallback reads the session.jsonl header's `workspaceRootPath` (tilde-expanded) and is required because the "Open folder" flow does not set a per-session `workingDirectory`. Matches Phase 1's block materialization which uses `workspace.rootPath`, so tools and defaults agree on where memory lives. Covered by 4 new integration tests in `core-memory-tools.integration.test.ts`.
- **2026-04-19** — Memory-tool routing in system prompt locked: system prompt `packages/shared/src/prompts/system.ts` includes a "Memory Blocks" section BEFORE "User preferences" that maps natural-language triggers ("my name is", "remember this", etc.) to `core_memory_append` / `core_memory_replace`. Without this, agent was falling through to the legacy `update_user_preferences` tool and hallucinating saves. Tool descriptions in `tool-defs.ts` also carry explicit imperative triggers and a "never claim to have saved without calling this tool" guardrail.
- **2026-04-19** — Sub-project #2 feature #1 "workspace rail" scope locked: 72px always-visible left rail replaces the topbar `WorkspaceSwitcher` dropdown. Hybrid icon strategy — real `iconUrl` field if set, else deterministic Bayer-matrix pattern generated from `workspaceId` hash. Auto-assigned color from a 12-hue Tailwind palette, also hashed from `workspaceId` (pure function, no persistence). Drag-to-reorder persisted in `UserPreferences.workspaceRailOrder: string[]` inside the existing preferences JSON on disk; reconciler runs on every render to add new workspaces to the tail and drop ids whose workspaces no longer exist (handles cross-window/out-of-process edits). Compact `{WorkspaceName} › {SessionName}` breadcrumb in topbar replaces the old dropdown; workspace half is the switcher menu, session half is a rename button (wired only if `onRenameSession` is supplied). V1 does NOT ship a right-click context menu on rail avatars — right-click handler is a documented no-op TODO; left-click-to-select + `+`-button-to-create are the load-bearing v1 surfaces. Keyboard drag support intentionally deferred (only `MouseSensor` registered). Dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) chosen over HTML5 drag API for reliable animation + keyboard affordance when we add it later.
- **2026-04-19** — Workspace-rail test strategy locked: bun-test can NOT load components that transitively import from `@craft-agent/ui`'s barrel (it pulls in a Vite-only `?url` PDF worker that bun-test refuses). Workaround: pure-logic helpers live in sibling `.helpers.ts` files (`WorkspaceBreadcrumb.helpers.ts`) or exported from the component itself (`computeOrderAfterDrag` in `WorkspaceRail.tsx`); tests import ONLY those pure helpers. RTL-style component tests are out of scope for this feature — live Electron smoke (Task 10) is the acceptance criterion for rendered behavior. Tooltip usages inside rail components import `@radix-ui/react-tooltip` directly (not `@/components/ui/tooltip`) to avoid the same barrel issue.
- **2026-04-20** — Shell rounded-corner approach locked: the two inside-L corners where WorkspaceRail meets TopBar (top) and window bottom (bottom) are rounded via `clip-path: inset(0 0 0 0 round ${RADIUS_EDGE}px 0 0 ${RADIUS_EDGE}px)` on the `shellRef` wrapper. Tried first with `border-radius` + `overflow: clip` / `overflow: hidden` — those DIDN'T visibly clip, likely because descendants (PanelStackContainer has inner `overflow: auto` with `position: sticky` sidebar) establish their own scroll/stacking contexts that escape overflow-based clipping. `clip-path` is unambiguous and works. Also switched `shellRef` from `height: 100%` to `flex: 1 + minHeight: 0` so the rounded top corner lands at the actual visible top edge rather than being pushed offscreen behind the topbar by the 100% overflow. Bottom junction rounds less visibly because `shellRef` has `paddingBottom: 6`, so the clip happens 6px below the panels' bottom edge — user accepted this trade-off.

## Update discipline (non-negotiable)

Update this file whenever:
1. **Session end** — update "Last session handoff".
2. **Phase/sub-project transition** — update "Where we are right now" and the multi-initiative map.
3. **Architectural decision** — append to "Locked decisions" with date.
