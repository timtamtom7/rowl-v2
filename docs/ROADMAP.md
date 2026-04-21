# Rowl — Roadmap

**Last updated:** 2026-04-20

> **This doc is the single-source feature backlog.** It answers "what is Rowl meant to become, and what's done vs. outstanding?" — as a full picture.
>
> For "what's active right now?", read `docs/STATE.md` instead. STATE is the living front door (updated per-session); ROADMAP is the long-lived backlog (updated per-phase).

---

## The thesis

Rowl is a deliberate synthesis of four open-source reference projects. Each contributes a specific layer. **Every feature below traces back to one of these four sources.**

| Source repo | License | Contributes | Sub-project |
|-------------|---------|-------------|-------------|
| [craft-agents-oss](https://github.com/lukilabs/craft-agents-oss) | Apache-2.0 | UI / Electron base + runtime — sidebar, skills/MCP surface, Mac-native feel, agent backend seam, session model | base (#0) |
| [letta-code](https://github.com/letta-ai/letta-code) | MIT | Memory-first agent architecture — git-backed memory blocks, reminder engine, self-editing memory, Palace viewer | #1 |
| [paperclip](https://github.com/paperclipai/paperclip) | Apache-2.0 | Organizing layer — Goal → Issue → Document/Feedback/Approval model, goal ancestry | #2 |
| [t3code](https://github.com/pingdotgg/t3code) | MIT | Niche engineering features — git-native turn checkpoints, worktrees, stacked PRs, composer draft persistence, context meter | #3 |

**Rowl in one sentence:** memory-first agents inside the Craft Agents UI base, organized by Paperclip-style goal/issue/document structure, with t3code's niche engineering workflow features.

Reference clones for each source live (read-only) at `/Users/mauriello/Dev/_reference/`.

---

## Overall progress snapshot

```
█████░░░░░░░░░  ~40% through the synthesis

Sub-project  Status
  #0  ████████████  shipped
  #1  ████████░░░░  Phase 1+2 shipped; Phase 3 (reminders) + Palace UI open
  #2  ███░░░░░░░░░  feature #1 merged; #2 code complete (QA pending); data model not started
  #3  ░░░░░░░░░░░░  not started
  #4  ░░░░░░░░░░░░  not started
```

---

## Sub-project #0 — Bootstrap ✅ SHIPPED (2026-04-18)

Fork craft-agents-oss → rebrand → docs convention → baseline verified.

**Plan:** `docs/plans/2026-04-18-subproject-0-bootstrap.md`

Base fork point: craft-agents-oss upstream commit `61f7d48a5b4fd0a8094f002c9e3aea5f3824dcfb`. Internal `@craft-agent/*` workspace names intentionally retained.

---

## Sub-project #1 — Memory-first (from `letta-code`, MIT)

**Why:** foundational. Every subsequent feature behaves differently with memory.

**Plans:** `docs/plans/rowl-memory-first/`

| Phase | Feature | Status |
|---|---|---|
| 1 | Always-on workspace memory blocks — `persona.md` / `human.md` / `project.md` markdown files injected into every agent turn via `<memory_blocks>` XML wrapper at the top of the per-turn context. Lazy-init on first session in a workspace. | ✅ shipped 2026-04-18 (`phase-1/memory-blocks` → merged) |
| 2 | Agent-editable memory tools — `core_memory_replace` (strict substring match, `MULTIPLE_MATCHES` on ambiguity) + `core_memory_append` (16KB soft-warn, auto-junction rule). Atomic writes (temp + rename), mtime re-stat concurrency defense, JSONL audit log at `memory/.history.jsonl`. | ✅ shipped 2026-04-19 (`phase-2/memory-edit-tools` → merged at `7660463`) |
| 3 | **Reminder engine** — memory-aware scheduled prompts, event-driven nudges, agent self-review of blocks. Likely grows the existing `automations/` module. | ⏸ not scoped |
| later | **Palace UI** — in-app browser/editor/diff viewer for memory blocks + history log, so users don't need to leave Rowl to inspect memory. | ⏸ not scoped |
| later | Archival / searchable long-term memory beyond always-on blocks. | ⏸ deferred indefinitely (YAGNI until proven) |
| later | Per-session scratch blocks (separate from workspace blocks). | ⏸ deferred |

**Locked decisions (abridged; see STATE.md for full log):** 2 tools only, strict substring match, atomic writes, best-effort audit log, one file per block with YAML frontmatter at `{workspaceRoot}/memory/`.

---

## Sub-project #2 — Organizing layer (from `paperclip`, Apache-2.0) — 🟡 IN PROGRESS

**Why:** gives "why are we doing this" structure on top of memory. Sessions become the children of Issues/Goals rather than a flat pile.

The UI-chrome polish branches (workspace rail, breadcrumbs) are prep work — they shape the surface where Goals/Issues will eventually live. **The actual Paperclip data model has not been ported yet.**

| # | Feature | Branch / Plan | Status |
|---|---|---|---|
| 1 | **Workspace rail** — 72px always-visible left rail (deterministic Bayer-matrix icon + 12-hue palette), drag-to-reorder, compact `Workspace › Session` breadcrumb replaces the old topbar workspace dropdown. | merged to `main` at `992bee4` (2026-04-20) · `docs/plans/workspace-rail/` | ✅ SHIPPED + MERGED |
| 2 | **Multi-panel breadcrumbs + All Sessions panel↔dropdown toggle** — `Workspace › [Sessions ▾] · [A] · [B] …` chip row with overflow menu, per-workspace mode preference, Cmd+Shift+T reopen-last-closed, scroll-anchor preservation across mode toggle. | `breadcrumbs-panel-dropdown-toggle` (22 commits ahead of `main`) · `docs/plans/breadcrumbs-panel-dropdown-toggle/` | 🟡 code + automated tests done, manual QA pending |
| 3 | **Right sidebar redesign** — glass detached overlay, workspace settings UI, memory UI (surfaces #1's memory blocks in-app without Palace-level complexity). | 📋 brainstorm queue — not yet scoped | ⏸ |
| 4 | **Paperclip data model** — the actual Goal → Issue → Document/Feedback/Approval entities. Sessions become children of Issues. | ⏸ not yet scoped | ⏸ |
| 4a | Goal ancestry (parent/child goals, aggregate roll-up views). | part of #4 | ⏸ |
| 4b | Feedback / Approval workflows on sessions. | part of #4 | ⏸ |

**Brainstorm queue** (topics scoped during 2026-04-20 planning, awaiting plan files):
- Right sidebar redesign
- Paperclip data model port
- Planner / executor two-model architecture (may slot into sub-project #3 instead)

---

## Sub-project #3 — Niche engineering features (from `t3code`, MIT) — ⏸ NOT STARTED

**Why:** high-value, self-contained adds. Each feature is independently shippable.

May also absorb the **planner/executor** brainstorm from the #2 queue depending on scoping.

| Feature | Notes |
|---|---|
| **Git-native turn checkpoints** | Per-turn worktree snapshot. Scrub the agent's history like a DVCS timeline; "undo last turn" as a first-class operation. |
| **Worktree management** | Per-session worktree isolation so parallel sessions don't step on each other's branches. |
| **Stacked PRs** | Multi-branch stack management (review one logical change across several dependent PRs). |
| **Composer draft persistence** | Don't lose half-typed prompts when switching sessions or closing windows. |
| **Context meter** | Visible token-window usage in the composer so users know when they're about to exhaust context. |
| **Planner / executor two-model architecture** | Split the agent into a planner (picks steps) + executor (runs them) pair. Brainstormed during #2 planning; may belong here. |

**Donor repo:** the pre-pivot `/Users/mauriello/Dev/rowl/` (frozen t3code fork, branch `phase-1a/core-memory-substrate`, tag `v-phase-1a`) is a translation reference — but it's Effect-TS there vs plain TS here, so any port is a rewrite, not a copy.

---

## Sub-project #4 — Research/review UX polish — ⏸ NOT STARTED

**Why:** surfaces #2's Goals/Issues/Documents data model as real research workflow UI.

No features scoped — depends entirely on #2's data model landing first.

---

## Branch tree right now

```
main ──────────────────────────────────── (last merges: workspace-rail @ 992bee4, memory-first Phase 2 @ 7660463)
   │
   └── breadcrumbs-panel-dropdown-toggle 🟡 — 22 commits ahead of main
             - Tasks 1-16 done
             - Deferred view wiring landed (264f5b9, a60c1dd)
             - Only Task 17 (manual QA + polish/audit) left
```

**Merge sequencing:** `workspace-rail` already merged (commit `992bee4`); branch deleted locally. `breadcrumbs-panel-dropdown-toggle` merges directly to `main` on QA pass.

---

## Known-baseline debt (inherited from upstream; not blocking)

- `bun run typecheck:all` red (missing `tsconfig.base.json` at fork, outdated `@types/cacheable-request`, regex/iteration target issues in `session-tools-core`). Fast `bun run typecheck` is green.
- `bun test`: ~23/3617 failures upstream (~99.4% pass). Our tests are green.
- No git remote, no CI.
- Dev-time Electron state dir is still `~/.craft-agent/` — intentional tradeoff of the minimal-rebrand decision. Cannot run Rowl dev + packaged Craft Agents.app simultaneously.

---

## How to use this file

1. **Starting a new session?** Read `docs/STATE.md` first for active-focus context, then this file for the backlog map.
2. **Starting a new sub-project / feature?** Add a plan under `docs/plans/<slug>/`, update the corresponding row here from ⏸ to 🟡, and shift the STATE.md "Where we are right now" pointer.
3. **Shipping a sub-project / feature?** Flip the row here from 🟡 to ✅ with the shipping date, and update STATE.md's "Last session handoff".

Keep this file **tidy and short**. Feature descriptions here are one-liners pointing at plans — detailed design lives in the per-sub-project `SPEC.md` / `PLAN.md` files.
