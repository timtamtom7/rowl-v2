# Plan → Execute → Merge → Changelog Pipeline — Design Spec

**Date:** 2026-04-23
**Owner:** Rowl v2
**Status:** Design (pre-implementation)
**Prior art:** `docs/superpowers/plans/2026-04-22-issue-to-plan-pipeline.md` (shipped — Issue → Plan stage)

---

## 1. Goal

Extend Rowl's shipped "Issue → Plan" pipeline (Y) into a full **issue → plan → execute → merge → changelog** lifecycle. After a user accepts a plan, Rowl offers a branch (worktree-default, inline fallback), the session executes on that branch, the user validates the work with an agent-drafted summary, Rowl squash-merges to `main`, and a `CHANGELOG.md` entry is auto-prepended.

This is the **execution half** of the original Rowl product vision:

> "AI creates plan + branch name; user approves; AI follows plan; AI writes validation summary; user approves; AI merges to main cleanly; AI writes change summary with timestamp; all this feeds a docs/features/roadmap site."

## 2. Non-Goals

- **No multi-branch stacking** (t3code's `GitStackedAction` 3-tier push/PR flow). Out of scope for v1; single-branch squash merge only.
- **No remote push / PR creation.** Local merges only. GitHub/PR integration is a later sub-project.
- **No automated conflict resolution.** If squash-merge has conflicts, we surface them and the user resolves in their editor.
- **No release/versioning automation.** `## [Unreleased]` section only — the user bumps versions manually when cutting releases.
- **No breadcrumb trail of in-progress edits.** The plan file captures intent; git history captures what shipped. We do not try to record every step.

## 3. Background & Integration Points

### What already shipped (Y pipeline)
- `packages/shared/src/issues/` — issue CRUD, `copyPlanForward`, `PlanFrontmatter` with `issueId`, `issueSlug`, `sessionId`, `acceptedAt`, `planVersion`.
- `apps/electron/src/main/ipc/plans-ipc.ts` — `plans:copy-forward`, `plans:list`, `plans:read` handlers.
- `WorkspaceConfig.defaults.planStoragePath` (currently defaulting to `docs/plans`).
- `IssueDetailModal` with "Linked Plans" section + `PlanViewerModal`.
- Info panel's `SessionFilesSection` displays session plans inline.

### What we're adding
A lifecycle layer on top of the existing plan artifacts:

1. A **branch dialog** reachable from three surfaces (Accept-Plan banner, issue modal, session header).
2. A **worktree manager** that creates `.worktrees/<branch>/` or switches branch inline.
3. A **plan state machine** (`accepted → in-progress → validated → merged`) stored in plan frontmatter.
4. A **validation modal** with agent-drafted summary + checklist.
5. A **squash-merge flow** with post-merge cleanup.
6. A **`CHANGELOG.md` generator** that appends to `## [Unreleased]`.

### What we're porting (not wholesale copying)
- `/Users/mauriello/Dev/_reference/t3code/packages/shared/src/git.ts` → `sanitizeBranchFragment`, `resolveAutoFeatureBranchName` (drop the `feature/` prefix; use our own `feat/` / `fix/` convention).
- `/Users/mauriello/Dev/rowl/packages/contracts/src/orchestration.ts` → conceptual `Thread.branch` + `Thread.worktreePath` fields (NOT the Effect schema).

We are **not** importing `@t3tools/contracts` or `effect` — these are reference materials only. We build our own lightweight types in `@craft-agent/shared`.

### What we're NOT touching
- Session lifecycle, agent runtime, permission modes.
- The `copyPlanForward` function — only its frontmatter shape extends.
- The Info panel or `PlanViewerModal` UI (reused as-is).

## 4. Storage Conventions

### 4.1 Plan storage location

**Decision:** `.craft-agent/plans/{slug}/plan-{timestamp}.md`

The current default (`docs/plans`) collides with Rowl's own meta-plans when Rowl is run on its own repo. Moving to `.craft-agent/` gives us a namespace that's clearly the tool's data.

**Migration:**
- Change `WorkspaceConfig.defaults.planStoragePath` fallback in `plans-ipc.ts` from `'docs/plans'` to `'.craft-agent/plans'`.
- Existing plans in `docs/plans/` keep working — the fallback only applies to workspaces with no explicit setting.
- Add a one-shot migration tool (CLI or settings button) for workspaces where users want to move old plans; out of scope for v1 if painful.

**Git-tracking:** `.craft-agent/plans/` **IS committed** — plans are the audit trail that feeds the roadmap/changelog site. This differs from `issues/` (gitignored per-workspace scratch).

### 4.2 Worktree location

**Decision:** `.worktrees/<branch-safe-name>/` at repo root, gitignored.

Matches Claude Code's `superpowers:using-git-worktrees` convention. Branch names with slashes (e.g. `feat/add-dark-mode`) get flattened with `-` for the directory name: `.worktrees/feat-add-dark-mode/`.

Add to `.gitignore`:
```
/.worktrees/
```

### 4.3 Changelog location

**Decision:** `CHANGELOG.md` at repo root, Keep-a-Changelog format.

Single file. New merges prepend into `## [Unreleased]`, grouped by type. If the file doesn't exist when we go to write, we create it with a standard header.

## 5. Data Model

### 5.1 Extended `PlanFrontmatter`

```typescript
// packages/shared/src/issues/types.ts (extension)
export type PlanState = 'accepted' | 'in-progress' | 'validated' | 'merged';

export interface PlanFrontmatter {
  // Existing (shipped):
  issueId: string | null;
  issueSlug: string | null;
  sessionId: string;
  acceptedAt: string;      // ISO timestamp
  planVersion: number;

  // NEW — lifecycle:
  state: PlanState;        // default 'accepted' for new plans; older plans without this field read as 'accepted'
  title: string;           // derived from issue.title or first H1 in plan body, used for changelog + commit subject
  type: 'feat' | 'fix' | 'chore' | 'docs' | 'refactor' | 'test';  // default 'feat', overridable in the branch dialog
  branchName: string | null;         // set when branch is created
  worktreePath: string | null;       // absolute path; null if inline branch
  inProgressAt: string | null;       // ISO
  validatedAt: string | null;        // ISO
  validationSummary: string | null;  // multi-line markdown the user approved
  mergedAt: string | null;           // ISO
  mergeCommitSha: string | null;     // short SHA (7 chars) of the squash commit on main
}
```

**Backward compatibility:** Readers default missing fields (`state`, `title`, `type`, etc.) so pre-lifecycle plans still parse. Writers always include the full set.

### 5.2 Workspace config additions

```typescript
// packages/shared/src/workspaces/types.ts (additions to defaults)
defaults?: {
  // Existing fields stay unchanged...

  /** Default mode for new branches created from plans. Default: 'worktree'. */
  branchMode?: 'worktree' | 'inline';

  /** Default merge strategy. Default: 'squash'. */
  mergeStrategy?: 'squash' | 'fast-forward';

  /** Default base branch to merge into. Default: 'main'. */
  defaultBaseBranch?: string;

  /** Whether to auto-prepend changelog entries on merge. Default: true. */
  autoChangelog?: boolean;
};
```

These are **defaults**, overrideable per-action in the respective dialogs. The per-action UI never disappears; only the pre-filled choice changes.

### 5.3 Branch naming

Derived from plan `type` + `slug`: `{type}/{slug}`. Examples:
- Feature issue "Add dark mode" → `feat/add-dark-mode`
- Bug issue "Login loops forever" → `fix/login-loops-forever`
- Non-issue plan titled "Cleanup deps" → `feat/cleanup-deps` (type defaults to `feat`)

**Sanitization** (port from t3code `sanitizeBranchFragment`): lowercase, ASCII-safe, collapse separators, ≤64 chars after the prefix.

**Collision:** if the branch already exists locally, append `-2`, `-3`, etc. (port from t3code `resolveAutoFeatureBranchName`).

User can edit the full branch name in the dialog — the default is just a suggestion.

## 6. UX Surfaces

### 6.1 Branch-creation dialog (shared component)

One React component `BranchCreationDialog` reused from three entry points. It receives `{ plan, defaultBranchMode, onConfirm }` and renders:

- **Branch name** (text input, pre-filled with sanitized default, live-validated against existing branches)
- **Mode** (radio: Worktree / Inline, pre-selected from workspace default)
- **Base branch** (text input, default from workspace config, usually `main`)
- **Create & switch** button (primary) / Cancel

On confirm:
1. IPC to main: `plans:create-branch` with `{ planPath, branchName, mode, baseBranch }`.
2. Main runs `git worktree add` or `git checkout -b`.
3. Main updates plan frontmatter: `state: 'in-progress'`, `branchName`, `worktreePath`, `inProgressAt`.
4. Renderer refreshes plan list and closes dialog.

### 6.2 Entry points

**A) Accept-Plan banner** — inline in session transcript after plan Accept.
Existing post-Accept UI gets a new "Create branch for this plan" button next to the existing actions. Disabled if the plan already has a branch.

**B) Issue detail modal — Linked Plans section.**
Each linked plan row with `state === 'accepted'` gets a "Create branch" button. Rows with `state === 'in-progress' | 'validated'` show the branch name as a badge instead, clickable to jump to git status.

**C) Session header.**
A new chip/menu affordance next to the existing session controls. Shows current branch if one exists; otherwise shows "Create branch" which opens the dialog. This is the escape hatch for sessions started without a plan or when the user changes their mind.

All three surfaces open **the same dialog** with **the same IPC**. No duplicated logic.

### 6.3 Validation modal

Opened from:
- A "Validate" button in the Accept-Plan banner when `state === 'in-progress'`.
- A "Validate" button on the issue modal's Linked Plans row.
- A "Validate" menu item in the session header chip.

Contents:
- **Agent-drafted summary** (multi-line textarea, pre-filled). The agent is invoked server-side with a system prompt like *"Summarize what this branch changed since it was created. Be specific about files and behavior. 3–8 bullet points."* The user edits freely.
- **Checklist** (all optional, user toggles):
  - ☐ Tests pass locally
  - ☐ Manual smoke test done
  - ☐ Docs updated if applicable
  - ☐ No unrelated changes
- **Approve & continue** button → sets `state: 'validated'`, stores `validationSummary`, sets `validatedAt`. Closes modal. Surfaces the "Merge" action.

### 6.4 Merge confirmation modal

Opened when user clicks "Merge" on a validated plan.

- **Target branch** (pre-filled from plan's base, usually `main`)
- **Strategy** (radio: Squash / Fast-forward, default from workspace setting)
- **Commit subject** (pre-filled: `{type}: {title}`, editable)
- **Commit body** (pre-filled with `validationSummary`, editable)
- **Delete branch after merge** (checkbox, default on)
- **Delete worktree after merge** (checkbox, default on, only shown if `worktreePath != null`)
- **Append to CHANGELOG.md** (checkbox, default on from workspace setting)
- **Merge** button (primary) / Cancel

On confirm, main process runs the merge (see §7). On success, plan frontmatter updates to `state: 'merged'`.

## 7. Merge Mechanics

### 7.1 Preconditions (checked before merge starts)

1. Plan `state === 'validated'`.
2. Working tree on the feature branch is **clean** (no uncommitted changes). If not, merge dialog shows an error and offers "Open in editor" to the user.
3. Target branch (usually `main`) exists and is checkoutable.

### 7.2 Squash flow (default)

```
git checkout <base>                            # e.g. main
git merge --squash <featureBranch>
git commit -m "<subject>" -m "<body>"          # with "Plan: .craft-agent/plans/<slug>/<file>" footer
```

If `git merge --squash` has conflicts: abort (`git merge --abort`), surface the conflicting files in the UI, tell the user to rebase the feature branch first. We do NOT auto-resolve.

### 7.3 Fast-forward flow (alternative)

```
git checkout <base>
git merge --ff-only <featureBranch>
```

If FF isn't possible, surface the error and suggest squash.

### 7.4 Post-merge cleanup

If both preconditions & merge succeed:

1. Capture `mergeCommitSha` from `git rev-parse --short HEAD`.
2. If `deleteBranch`: `git branch -d <featureBranch>` (or `-D` if the user confirms an extra "force" prompt — only needed for FF-merge that didn't update the ref; shouldn't trigger for squash).
3. If `deleteWorktree` and `worktreePath != null`: `git worktree remove <worktreePath>`.
4. Update plan frontmatter: `state: 'merged'`, `mergedAt`, `mergeCommitSha`. **Keep `branchName` and `worktreePath` as historical record** — they are never cleared. The state field is the source of truth for "is this branch still live"; the names stay so the audit trail stays intact.
5. If `appendChangelog`: see §8.

### 7.5 Commit message format

Subject: `{type}: {title}`
Body:
```
{validationSummary}

Plan: .craft-agent/plans/{slug}/{plan-file}.md
Issue: {issueId or "none"}
```

## 8. Changelog Generation

### 8.1 Destination

`CHANGELOG.md` at repo root. Keep-a-Changelog v1.1.0 format.

### 8.2 Template for a fresh file

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

```

### 8.3 Append rule

On each merge (when `appendChangelog` is enabled):

1. If `CHANGELOG.md` does not exist, create it with the template above.
2. Parse to find the `## [Unreleased]` section.
3. Determine the subsection from plan `type`:
   - `feat` → `### Added`
   - `fix` → `### Fixed`
   - `refactor` | `chore` → `### Changed`
   - `docs` → `### Documentation`
   - `test` → `### Changed` (minor visibility)
4. Prepend a bullet: `- {title} ({mergeCommitSha})`
5. If the subsection doesn't exist under `[Unreleased]`, create it in the standard order: Added / Changed / Deprecated / Removed / Fixed / Security / Documentation.

### 8.4 Release cutting (manual, out of pipeline)

When the user wants to cut a release:

1. Open `CHANGELOG.md` manually.
2. Change `## [Unreleased]` → `## [x.y.z] - YYYY-MM-DD`.
3. Add a fresh `## [Unreleased]` block at the top.
4. Tag + release via their normal process.

This is NOT something Rowl automates in v1. We optimize for the single-contributor case; bumping versions is intentional human action.

## 9. Architecture

### 9.1 New files

- `packages/shared/src/plans/` (new subpath — `@craft-agent/shared/plans`)
  - `types.ts` — `PlanState`, extended `PlanFrontmatter`, input/output types for state transitions
  - `branch-naming.ts` — `sanitizeBranchFragment`, `resolveBranchName(plan, existingBranches)` (ported from t3code)
  - `frontmatter.ts` — read/write typed plan frontmatter with defaults for legacy files
  - `lifecycle.ts` — pure functions: `markInProgress`, `markValidated`, `markMerged`
  - `changelog.ts` — pure Keep-a-Changelog string manipulation (parse/insert/render)

- `packages/shared/src/plans/node.ts` — node-only barrel (re-exports anything that touches `fs`)

- `apps/electron/src/main/git/` (new folder)
  - `git-commands.ts` — typed wrappers around `child_process.execFile('git', ...)` — `listBranches`, `worktreeAdd`, `worktreeRemove`, `checkoutBranch`, `mergeSquash`, `mergeFastForward`, `commit`, `revParse`, `statusPorcelain`
  - `plan-git-flow.ts` — orchestration: `createBranchForPlan`, `mergePlan`, `cleanupAfterMerge`

- `apps/electron/src/main/ipc/plan-lifecycle-ipc.ts` — new IPC module:
  - `plans:create-branch`
  - `plans:start-validation` — generates draft summary via agent
  - `plans:mark-validated`
  - `plans:merge`
  - `plans:update-changelog` (internal, called by merge)

- `apps/electron/src/renderer/components/plans/`
  - `BranchCreationDialog.tsx`
  - `ValidationModal.tsx`
  - `MergeConfirmationModal.tsx`
  - `PlanStateBadge.tsx` — reused in issue modal + session header

### 9.2 Modified files

- `packages/shared/src/issues/types.ts` — export the extended `PlanFrontmatter` type
- `packages/shared/src/issues/copy-plan-forward.ts` — write `state: 'accepted'`, `title`, `type`, and null lifecycle fields into frontmatter
- `packages/shared/src/workspaces/types.ts` — add `branchMode`, `mergeStrategy`, `defaultBaseBranch`, `autoChangelog` defaults
- `apps/electron/src/main/ipc/plans-ipc.ts` — change `planStoragePath` fallback from `docs/plans` to `.craft-agent/plans`; extend `plans:read` / `plans:list` return types
- `apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx` — add branch button + state badges to Linked Plans rows
- `apps/electron/src/renderer/components/session/` — add branch chip + validate/merge entry points to session header. The implementation plan pins the exact file after re-reading the session header component tree; the chip uses the same `BranchCreationDialog` / `ValidationModal` / `MergeConfirmationModal` already defined above.
- `.gitignore` — add `/.worktrees/`

### 9.3 IPC surface (preload additions)

```typescript
// apps/electron/src/preload/plans-lifecycle.ts
window.plansLifecycle = {
  createBranch: (workspaceId, planPath, opts) => ipcRenderer.invoke('plans:create-branch', ...),
  startValidation: (workspaceId, planPath) => ipcRenderer.invoke('plans:start-validation', ...),
  markValidated: (workspaceId, planPath, summary, checklist) => ipcRenderer.invoke('plans:mark-validated', ...),
  merge: (workspaceId, planPath, opts) => ipcRenderer.invoke('plans:merge', ...),
};
```

## 10. Error Handling

| Situation | Behavior |
|---|---|
| Branch name collides locally | Auto-suffix `-2`, `-3` in the dialog's default. User can still override. |
| `git worktree add` fails (e.g. path exists) | Surface stderr in the dialog; do not silently retry. |
| Dirty working tree when starting merge | Merge modal shows an error banner with "Open <worktreePath>" button; merge button disabled. |
| Merge has conflicts | Abort the merge, surface conflicting files, suggest rebasing the feature branch. Plan state stays `validated` (user retries). |
| Validation summary generation fails (agent error) | Modal opens with empty textarea + an inline error; user can write the summary manually. |
| Changelog file is malformed (no `[Unreleased]` section) | Insert a new `[Unreleased]` at the top, don't try to "repair" existing content. |
| Post-merge cleanup partial failure (merge OK but branch-delete fails) | Record merge success in frontmatter; log the cleanup failure to a toast; don't roll back the merge. |

## 11. Testing Strategy

### 11.1 Unit tests (Bun test, `@craft-agent/shared`)

- `branch-naming.test.ts` — sanitization edge cases (unicode, empty, collisions)
- `lifecycle.test.ts` — state transitions are monotonic, legacy files default to `accepted`
- `changelog.test.ts` — parse + prepend into various shapes (empty, existing Unreleased, missing subsection); idempotency-adjacent behavior
- `frontmatter.test.ts` — round-trip preserves unknown fields; defaults fill missing

### 11.2 Integration tests (Bun test, temp repo fixtures)

- `plan-git-flow.test.ts` — in a temp `git init` repo:
  - create branch as worktree → verify `.worktrees/<name>/` exists and checked out
  - create branch inline → verify HEAD moved, no worktree
  - squash merge → verify single commit on base with correct message
  - cleanup → verify branch + worktree gone
  - merge with conflict → verify abort + plan state unchanged

### 11.3 Manual E2E checklist

Covered in the implementation plan, not this spec. Includes: full flow from Accept-Plan → branch → session edits → validate → merge → CHANGELOG updated; error paths; the three entry points all open the same dialog.

## 12. Open Questions / Deferred

1. **Agent summary generation backend** — which model, which prompt template, which session tools? Deferred to the implementation plan; should be consistent with the existing Plan-gate agent invocation.
2. **Migration UI for old `docs/plans/`** — out of v1 unless it becomes painful.
3. **Remote push / PR creation** — deferred to a future sub-project.

## 13. Rollout

1. Ship behind no flag; this is incremental new UI. Existing plan-accept flow continues working unchanged for users who don't click any of the new buttons.
2. The `planStoragePath` default change is **workspace-config-level** — existing workspaces with explicit `docs/plans` keep that value. New workspaces get `.craft-agent/plans`.
3. Once shipped, Rowl's own repo switches to the new default by updating its own workspace config.

## 14. References

- Prior-art spec: `docs/superpowers/specs/2026-04-22-issue-to-plan-pipeline-design.md`
- Prior-art plan: `docs/superpowers/plans/2026-04-22-issue-to-plan-pipeline.md`
- Port source (branch naming): `/Users/mauriello/Dev/_reference/t3code/packages/shared/src/git.ts`
- Port source (thread contract concept): `/Users/mauriello/Dev/rowl/packages/contracts/src/orchestration.ts`
- Convention: `superpowers:using-git-worktrees` skill
- Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
