# Issue → Plan Pipeline: Kickoff + Plan Gate (Y)

**Status:** Design — ready for implementation plan
**Date:** 2026-04-22
**Scope:** First increment (Y) of the full issue → plan → execute → merge → changelog pipeline
**Next spec:** Execution / merge / changelog sub-projects (deferred)

---

## 1. Summary

Turn Rowl's existing Issues sidebar into the entry point for structured work. When a user clicks **"Start Session"** on an issue:

1. A new session is created, forced into **safe permission mode**, with the issue's title + body + attachments injected as the first-turn context.
2. The agent proposes a plan using the pre-existing `SubmitPlan` system. The user reviews and accepts it in the existing plan UI.
3. On acceptance, the plan file is copied forward from the session's private store to a git-trackable workspace path `docs/plans/{issue-slug}/plan-{YYYY-MM-DD-HHMM}.md` with YAML frontmatter linking it back to the issue and session.
4. Plans are browsable from a new **Plans** tab in the right sidebar.

The issue's metadata (`linkedSessionIds`, `linkedPlanPaths`, `status`) updates automatically as the pipeline progresses.

**Explicit non-goals for Y:** auto-merge, branch creation, changelog generation, roadmap site, Kanban board, dashboards, filter/search improvements, full Issues page overhaul. Those land in later sub-projects.

---

## 2. Architecture

### 2.1 Data model changes

Existing `Issue` type in `packages/shared/src/issues/types.ts`:

```typescript
export interface Issue {
  id: string;
  title: string;
  description?: string;
  status: IssueStatus;  // 'backlog' | 'todo' | 'in_progress' | 'done'
  priority: IssuePriority;
  createdAt: string;
  updatedAt: string;
  linkedSessionId?: string;  // singular, never populated today
}
```

**After Y:**

```typescript
export interface Issue {
  id: string;
  title: string;
  description?: string;          // markdown body (was plaintext)
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: string;
  updatedAt: string;
  linkedSessionIds: string[];    // was singular — now array, required
  linkedPlanPaths: string[];     // new — workspace-relative paths
  attachments?: string[];        // new — workspace-relative paths under issues/{id}/attachments/
}
```

Parse-time migration: when reading an existing issue that has the legacy singular `linkedSessionId: string`, convert to `linkedSessionIds: [id]` and drop the old key. Missing `linkedPlanPaths` defaults to `[]`. Missing `attachments` stays `undefined`.

### 2.2 Storage layout

Issues move from `localStorage["craft-agent-issues"]` (today) to files:

```
{workspace}/
  issues/
    {id}.md                          # YAML frontmatter + markdown body
    {id}/
      attachments/
        {sha256-12}.{ext}            # pasted images, content-hashed
  docs/
    plans/
      {issue-slug}/
        plan-2026-04-22-1430.md      # copy-forward from session
        plan-2026-04-22-1615.md      # second attempt, same issue
      _orphaned/
        {sessionId}/
          plan-*.md                  # issue was deleted before accept
```

`/issues/` is already in `.gitignore` (local, private). `/docs/plans/` is NOT in `.gitignore` (git-trackable — users who init git can commit plans alongside their repo).

### 2.3 Issue file format

```yaml
---
id: issue_a3f4b201
title: Add Letta memory sync
status: in_progress
priority: medium
createdAt: 2026-04-22T14:30:00.000Z
updatedAt: 2026-04-22T15:12:00.000Z
linkedSessionIds:
  - 260422-tall-basalt
linkedPlanPaths:
  - docs/plans/add-letta-memory-sync/plan-2026-04-22-1430.md
attachments:
  - issues/issue_a3f4b201/attachments/a1b2c3d4e5f6.png
---

Markdown body here. Image refs use workspace-relative paths:

![screenshot](./issue_a3f4b201/attachments/a1b2c3d4e5f6.png)
```

Parsing uses `gray-matter` (already a shared dep). Unknown frontmatter keys are preserved on write (forward compat).

### 2.4 Plan file format (copy-forward)

```yaml
---
issueId: issue_a3f4b201
issueSlug: add-letta-memory-sync
sessionId: 260422-tall-basalt
acceptedAt: 2026-04-22T15:12:00.000Z
planVersion: 2
---

# (body is the markdown from formatPlanAsMarkdown, unmodified)
```

The session's private copy at `sessions/{id}/plans/*.md` is NOT deleted — it's the authoritative record for that session. The copy-forward is a stable, linkable artifact.

---

## 3. Kickoff flow

### 3.1 Entry points

Three places can trigger kickoff:

1. **"Start Session" button** on `IssueCard` (primary CTA).
2. **"Start Session" button** in `IssueDetailModal` header.
3. **Right-click → "Start Session from issue"** on `IssueCard` context menu (for parity with keyboard flow).

All three call a single renderer-side handler:

```typescript
async function startSessionFromIssue(issue: Issue): Promise<string> {
  const summary = formatFirstTurnContext(issue);
  const sessionId = await window.electronAPI.createSession(workspaceId, {
    name: issue.title,
    permissionMode: 'safe',                // forced, not user-selected
    transferredSessionSummary: summary,
    linkedIssueId: issue.id,
  });
  await updateIssue(issue.id, {
    linkedSessionIds: [...issue.linkedSessionIds, sessionId],
    status: issue.status === 'backlog' ? 'in_progress' : issue.status,
  });
  return sessionId;
}
```

### 3.2 First-turn context format

```markdown
You are being started to work on this issue.

## Issue: {title}

**Status:** {status} | **Priority:** {priority} | **ID:** {id}

### Description

{description markdown, as-written}

### Attachments

{for each attachment: markdown image ref if image, link otherwise}

---

You are in **safe permission mode**. Before implementing anything, you MUST call the `SubmitPlan` tool to propose a plan for this issue. The user will review and accept or refine it before execution begins.
```

The existing system prompt in `packages/shared/src/prompts/system.ts` already instructs safe-mode agents to call `SubmitPlan` first — the first-turn context just reminds them and scopes the work.

### 3.3 CreateSessionOptions addition

`packages/shared/src/protocol/dto.ts`:

```typescript
export interface CreateSessionOptions {
  // ... existing fields
  linkedIssueId?: string;  // new — persisted on the session for copy-forward lookup
}
```

`SessionManager.createSession` stores this on `ManagedSession` as `linkedIssueId`. No other behavior change.

---

## 4. Accept-Plan copy-forward

### 4.1 Trigger

The existing Plan UI already handles `PlanReviewResult`:

```typescript
type PlanReviewResult =
  | { decision: 'approve' }
  | { decision: 'refine', feedback: string }
  | { decision: 'saveOnly' }
  | { decision: 'cancel' };
```

`'approve'` and `'saveOnly'` both trigger copy-forward. `'refine'` and `'cancel'` do not.

### 4.2 Copy-forward helper

Lives in `packages/shared/src/issues/copy-plan-forward.ts`. Called by the renderer's Accept-Plan handler; the session's Plan UI already knows `sessionPlanPath` (the plan file under `sessions/{id}/plans/`) from the existing `PlanSubmitted` flow.

```typescript
async function copyPlanForward(
  sessionPlanPath: string,
  session: ManagedSession,
  issue: Issue | undefined,
  workspaceRoot: string,
  planStoragePath: string,        // default 'docs/plans'
): Promise<string /* workspace-relative path */> {
  const slug = issue ? slugify(issue.title) : null;
  const targetDir = issue
    ? path.join(workspaceRoot, planStoragePath, slug)
    : path.join(workspaceRoot, planStoragePath, '_orphaned', session.id);

  await mkdir(targetDir, { recursive: true });

  const ts = formatTimestamp(new Date());      // YYYY-MM-DD-HHMM
  const version = countExistingPlans(targetDir) + 1;
  const target = resolveCollision(targetDir, `plan-${ts}.md`);

  const body = await readFile(sessionPlanPath, 'utf-8');
  const withFrontmatter = prependYamlFrontmatter(body, {
    issueId: issue?.id ?? null,
    issueSlug: slug,
    sessionId: session.id,
    acceptedAt: new Date().toISOString(),
    planVersion: version,
  });

  await atomicWriteFile(target, withFrontmatter);
  return path.relative(workspaceRoot, target);
}
```

On success, the renderer updates the issue:

```typescript
await updateIssue(issue.id, {
  linkedPlanPaths: [...issue.linkedPlanPaths, relativePath],
});
```

### 4.3 Workspace config

`packages/shared/src/workspaces/types.ts`:

```typescript
export interface WorkspaceConfig {
  // ... existing fields
  defaults?: {
    // ... existing fields
    planStoragePath?: string;    // default 'docs/plans'
  };
}
```

Users who want plans elsewhere (e.g., `docs/features/`) can override in workspace config. Default sticks.

---

## 5. UI surfaces

### 5.1 IssueDetailModal (`apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx`)

**Before Y:** plaintext title + plaintext textarea description + status/priority dropdowns + delete button.

**After Y:**

- Title input (unchanged).
- Markdown editor for description (CodeMirror-based, same pattern as session input).
- Paste / drag-drop of images → written to `{workspace}/issues/{id}/attachments/{hash}.{ext}`, inserted as markdown image refs.
- "Linked sessions" section: list of session IDs with names + click-to-open.
- "Linked plans" section: list of plan paths with "Open" button → opens `PlanViewerModal`.
- "Start Session" button in header (primary CTA).
- Status/priority dropdowns (unchanged).
- Delete button (unchanged, but now also removes `{workspace}/issues/{id}/` attachment folder).

### 5.2 IssueCard (`apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx`)

- Primary CTA: **"Start Session"** button (replaces current "Convert to session" that silently drops issue ID).
- Compact badge below title when links exist: `2 sessions · 1 plan`.
- Click on card body (not button) still opens detail modal.

### 5.3 IssuesPanel + useIssues refactor

- `useIssues` hook moves from `localStorage` to the electron file API.
- Reads from `{workspace}/issues/*.md` via `window.electronAPI.readDir` + `readFile`.
- Writes go through `window.electronAPI.writeFile` with atomic write semantics.
- First launch after upgrade: detect `localStorage["craft-agent-issues"]`, prompt once — "Migrate N issues to files?" — on confirm, write each issue to disk, then clear localStorage. On dismiss, leave localStorage alone (user can re-prompt from settings — later).

### 5.4 Session header

When a session has `linkedIssueId`, the session header displays a small chip:

```
Working on Issue: {issue.title}
```

Chip is clickable → opens `IssueDetailModal`. If the issue has been deleted, chip renders as greyed-out `Issue deleted` with no click handler.

### 5.5 Plans tab (right sidebar)

**Dependency:** requires `docs/superpowers/plans/2026-04-21-right-sidebar-chrome.md` to be executed and merged first. Y's sidebar-tab work MUST NOT start before that plan lands.

- New "Plans" tab icon in right sidebar rail (alongside existing Issues tab).
- List view: all `docs/plans/**/*.md` files, grouped by issue slug, newest first.
- Click a plan → `PlanViewerModal` opens.
- Empty state: "No plans yet. Accept a plan in a session to see it here."

### 5.6 PlanViewerModal (new)

Read-only modal rendering plan markdown:

- Header: issue title (linked) + accepted-at timestamp + plan version.
- Body: rendered markdown (same renderer as session output).
- Footer actions:
  - "Go to session" — opens the linked session (disabled if session deleted).
  - "Open issue" — opens `IssueDetailModal` (disabled if issue deleted).
  - "Copy path" — copies workspace-relative path to clipboard.

### 5.7 Explicit non-UI for Y

- No filter/search on Issues or Plans lists (today's simple list is fine).
- No Kanban or board view.
- No dashboard, roadmap site, or changelog generator.
- No execution/merge UI — Accept Plan just saves the file; execution continues in the session as it does today.

---

## 6. Edge cases & error handling

### 6.1 Workspace without git
Plans still write to `{workspace}/docs/plans/{slug}/plan-{ts}.md`. Git-tracking is a user choice, not a requirement. Copy-forward never invokes `git`.

### 6.2 Plan file naming collisions (same minute)
Two plans accepted in the same minute: second gets `plan-YYYY-MM-DD-HHMM-2.md`. Helper counts existing `plan-{sameTimestamp}*.md` and suffixes `-N`. `planVersion` in frontmatter is monotonic per issue-slug folder.

### 6.3 Missing issue at Accept-Plan time
If session has `linkedIssueId` but the issue file is gone, copy-forward writes to `docs/plans/_orphaned/{sessionId}/plan-{ts}.md`. Toast: "Issue not found. Plan saved to orphaned folder." Frontmatter still records `issueId` as a string.

### 6.4 Session deleted while plan references it
Plan files persist regardless of session lifecycle. `PlanViewerModal` disables "Go to session" with a greyed-out label. Issue's `linkedSessionIds` is NOT auto-pruned; stale IDs render as greyed-out in the detail modal.

### 6.5 Migration failure (localStorage → file)
Per-issue all-or-nothing: write file atomically, then delete localStorage entry. If file write throws, localStorage stays intact. Partial runs (5 of 6 succeeded) leave the remaining 1 in localStorage. Toast: "Migrated 5 of 6 issues. 1 failed — will retry on next launch."

### 6.6 Workspace switch mid-kickoff
Kickoff is synchronous (build context → createSession → update issue) under the current workspace. Workspace switch during the ~ms window completes the mutation against the original workspace (correct — the issue lives there). Session-create failure aborts the issue update.

### 6.7 Orphaned attachments (issue deleted)
Deleting an issue removes `{workspace}/issues/{id}.md` AND `{workspace}/issues/{id}/`. If attachment deletion fails, the `.md` still succeeds. Stale attachments get logged, don't block the delete.

### 6.8 Concurrent edits to same issue file
Only the renderer edits issue files. Single-window Rowl today means last-write-wins at file level is acceptable. Cross-window file-watching / merge UI is explicitly out of scope for Y.

### 6.9 `docs/plans/` doesn't exist
`copyPlanForward` calls `mkdir(planDir, { recursive: true })` before writing. Works whether the workspace has `docs/plans/`, `docs/` only, or nothing.

### 6.10 Permission-denied errors
All file writes (issue, attachment, plan copy-forward) go through a `safeWriteFile` helper that catches EACCES/ENOSPC/ENOENT and surfaces a toast: "Couldn't save {kind}: {reason}." UI state does not optimistically update on failure.

### 6.11 Image paste of huge files
Attachments >10 MB rejected with inline error. Smaller images hashed (SHA-256, first 12 chars) and written as `{hash}.{ext}`. Duplicate paste reuses the existing file (hash-based dedupe per issue).

---

## 7. Testing

### 7.1 Unit tests (bun test, `.test.ts` alongside source)

1. **`formatFirstTurnContext(issue)`** → `packages/shared/src/issues/first-turn-context.test.ts`
   - Given an issue with title + body + attachments, produces a deterministic markdown string.
   - Handles empty body, no attachments, long titles (no truncation in Y).
   - Snapshot test.

2. **Issue markdown parse/serialize** → `packages/shared/src/issues/file-format.test.ts`
   - Round-trip: `serialize(parse(x)) === x` for a fixture covering all fields, including `linkedSessionIds: []` and `linkedPlanPaths: []`.
   - Frontmatter with unknown keys is preserved on write.
   - Malformed frontmatter surfaces a typed error, not a crash.
   - Legacy `linkedSessionId` (singular) migrates to `linkedSessionIds: [id]` on parse.

3. **`copyPlanForward` helper** → `packages/shared/src/issues/copy-plan-forward.test.ts`
   - Writes to `docs/plans/{slug}/plan-{ts}.md` with correct frontmatter (issueId, sessionId, planVersion, acceptedAt).
   - `planVersion` increments based on existing files in the folder.
   - Timestamp collision produces `-2` suffix.
   - Missing issue → writes to `_orphaned/{sessionId}/`.

4. **Slug generation** → `packages/shared/src/issues/slug.test.ts`
   - "Add Letta memory sync" → `add-letta-memory-sync`.
   - Unicode, punctuation, long titles (truncate at 60 chars).
   - Collision-safe across issues (append issue-id suffix if slug already used).

5. **LocalStorage migration** → `apps/electron/src/renderer/hooks/useIssues.migration.test.ts`
   - Reads old localStorage shape, writes `.md` files, clears localStorage on per-issue success.
   - Partial failure leaves unfinished issues in localStorage.
   - Already-migrated workspace (no localStorage key) is a no-op.

### 7.2 Integration tests (manual, scripted in the plan)

- [ ] Create issue → edit in modal with markdown + pasted image → save → file on disk has correct frontmatter and attachment under `issues/{id}/attachments/`.
- [ ] "Start Session" on an issue → new session opens with first-turn context populated, permission mode forced to safe, issue's `linkedSessionIds` updated, status transitions backlog → in_progress.
- [ ] In the session, ask the agent to plan → `SubmitPlan` tool call shows up → plan appears in chat → click "Accept Plan" → file appears at `docs/plans/{slug}/plan-*.md` with correct frontmatter, issue's `linkedPlanPaths` updated.
- [ ] Open right-sidebar Plans tab → plan is listed → click it → `PlanViewerModal` renders markdown → "Go to session" and "Open issue" buttons work.
- [ ] Delete linked session → `PlanViewerModal` shows session disabled.
- [ ] Start fresh workspace with old localStorage issues → prompt appears → confirm → files created, localStorage cleared.
- [ ] Delete issue → `.md` and attachment folder both gone.

### 7.3 Explicit non-test areas

- Plan execution end-to-end (existing Plan system tests cover this).
- Concurrent multi-window editing (non-goal).
- Git-level behavior of `docs/plans/` (user's git workflow, not ours).

### 7.4 Test infrastructure

- No new test frameworks — bun test is already in the shared package.
- Fixtures live next to tests (`__fixtures__/issue-with-attachments.md`).
- No test-specific filesystem abstraction; tests write to `os.tmpdir()`.

---

## 8. Sequencing

1. **Prerequisite:** `docs/superpowers/plans/2026-04-21-right-sidebar-chrome.md` executed and merged. Y's Plans-tab work depends on this.
2. Data model + file storage (§2.1–2.3, §7.1 tests 2, 4).
3. Kickoff flow (§3, §7.1 test 1).
4. LocalStorage migration (§5.3, §7.1 test 5).
5. Issue detail modal markdown + attachments (§5.1).
6. Accept-Plan copy-forward (§4, §7.1 test 3).
7. Plans tab + PlanViewerModal (§5.5, §5.6) — only after prerequisite lands.
8. Session header chip (§5.4).
9. Integration walkthrough (§7.2 checklist).

Each step commits independently and leaves the app in a working state.

---

## 9. Out of scope for Y (deferred to later sub-projects)

- Execution tracking UI (which plan step is the agent on, cancel mid-plan, retry).
- Automated branch creation / git workflow.
- Merge-to-main automation.
- Changelog summary generation.
- Roadmap / features / docs site that consumes plan artifacts.
- Full Issues page overhaul (filter, search, Kanban, dashboards).
- Multi-window concurrent editing.
- Cross-workspace plan linking.

Each of these is a separate brainstorm → spec → plan cycle.
