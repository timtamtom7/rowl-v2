# Rowl — Current State (Plans Front Door)

**Last updated:** 2026-04-18 (sub-project #1 Phase 1 code complete; UI smoke pending)
**Current focus:** Sub-project #1 Phase 1 — Always-on workspace memory blocks. All 11 code-level tasks shipped on branch `phase-1/memory-blocks`. Task 12 manual UI smoke pending (blocked on quitting Craft Agents.app to free `~/.craft-agent/.server.lock`). Headless smoke passed end-to-end.

> **If you are a new session resuming Rowl work, read this file FIRST.**
> It orients you in ~60 seconds and tells you what to read next.

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

- **Sub-project:** #1 — Memory-first agent, Phase 1 (always-on workspace memory blocks)
- **Phase status:** code complete (Tasks 1–11 of 12 shipped). 23 memory unit + integration tests green. Headless smoke green.
- **Spec:** `docs/plans/rowl-memory-first/SPEC.md` (commit `79d838d`)
- **Plan:** `docs/plans/rowl-memory-first/PHASE-1-PLAN.md` (commit `069fce5`)
- **Branch:** `phase-1/memory-blocks` (13 commits ahead of main, no remote)
- **Remaining:** Task 12 manual UI smoke via Electron; final code review across all 12 tasks.
- **Blocker:** Craft Agents.app currently holds `~/.craft-agent/.server.lock` (PID 12724). Quit it to free the lock and run Rowl dev Electron for the UI smoke.

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
| 1 | Memory-first agent (Letta pattern port) | Phase 1 code complete (UI smoke pending) | Foundational. Every subsequent feature behaves differently with memory. |
| 2 | Organizing layer (Paperclip-style goals/issues/docs) | not-started | Gives "why are we doing this" structure on top of memory. |
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

## Update discipline (non-negotiable)

Update this file whenever:
1. **Session end** — update "Last session handoff".
2. **Phase/sub-project transition** — update "Where we are right now" and the multi-initiative map.
3. **Architectural decision** — append to "Locked decisions" with date.
