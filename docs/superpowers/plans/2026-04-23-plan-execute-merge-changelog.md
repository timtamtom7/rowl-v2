# Plan → Execute → Merge → Changelog Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Rowl's shipped Issue → Plan pipeline so an accepted plan can be executed on a dedicated branch (worktree default), validated with an agent-drafted summary, squash-merged to `main`, and auto-recorded in `CHANGELOG.md`.

**Architecture:**
- Pure lifecycle helpers (`branch-naming`, `frontmatter`, `lifecycle`, `changelog`) live in `packages/shared/src/plans/`, with a node-only barrel for fs-touching code.
- New IPC module `plan-lifecycle-ipc.ts` exposes branch creation, validation marking, and merge orchestration. It calls `apps/electron/src/main/git/` wrappers around real `git` subprocesses.
- Renderer renders three shared dialogs (`BranchCreationDialog`, `ValidationModal`, `MergeConfirmationModal`) from three entry points: Accept-Plan banner, issue detail modal, session header chip.
- Plan frontmatter is the source of truth for lifecycle state. Legacy files (missing the new fields) read as `state: 'accepted'`.

**Tech Stack:** TypeScript, React, Electron, `bun:test`, `gray-matter` (YAML frontmatter), `child_process.execFile` (git), Radix UI + Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-23-plan-execute-merge-changelog-design.md`

**Prior art:**
- `docs/superpowers/plans/2026-04-22-issue-to-plan-pipeline.md` — Issue → Plan pipeline (shipped). Task numbering style here mirrors that plan.
- `/Users/mauriello/Dev/_reference/t3code/packages/shared/src/git.ts` — reference for `sanitizeBranchFragment` / `resolveAutoFeatureBranchName`. Do **not** import from t3code; port the logic.

**Prerequisite:** `main` is clean. No in-flight plan lifecycle work from earlier attempts. Run `git status` before Task 1.

---

## File Structure

**New files (pure helpers — shared package):**
- `packages/shared/src/plans/types.ts` — `PlanState`, `PlanType`, extended `PlanFrontmatter`, transition input/output types
- `packages/shared/src/plans/branch-naming.ts` — `sanitizeBranchFragment`, `resolveBranchName`
- `packages/shared/src/plans/frontmatter.ts` — `parsePlanFile`, `renderPlanFile` (round-trip with defaults; preserves unknown keys)
- `packages/shared/src/plans/lifecycle.ts` — `markInProgress`, `markValidated`, `markMerged` (pure data transforms)
- `packages/shared/src/plans/changelog.ts` — `prependChangelogEntry`, `subsectionForType` (empty input is handled as "create new file with Keep-a-Changelog header")
- `packages/shared/src/plans/index.ts` — renderer-safe barrel (types only)
- `packages/shared/src/plans/node.ts` — node-only barrel (re-exports frontmatter + changelog fs helpers)

**New files (main process):**
- `apps/electron/src/main/git/git-commands.ts` — typed `execFile('git', …)` wrappers
- `apps/electron/src/main/git/plan-git-flow.ts` — `createBranchForPlan`, `mergePlan` (post-merge cleanup of branch + worktree is inlined inside `mergePlan` when the caller opts in)
- `apps/electron/src/main/ipc/plan-lifecycle-ipc.ts` — `registerPlanLifecycleIpc()` with `plans:create-branch`, `plans:start-validation`, `plans:mark-validated`, `plans:merge`, `plans:list-branches`

**New files (renderer):**
- `apps/electron/src/renderer/components/plans/PlanStateBadge.tsx`
- `apps/electron/src/renderer/components/plans/BranchCreationDialog.tsx`
- `apps/electron/src/renderer/components/plans/ValidationModal.tsx`
- `apps/electron/src/renderer/components/plans/MergeConfirmationModal.tsx`
- `apps/electron/src/renderer/components/app-shell/AcceptPlanBanner.tsx`

**Modified (shared):**
- `packages/shared/src/issues/copy-plan-forward.ts` — write new frontmatter fields
- `packages/shared/src/workspaces/types.ts` — add `branchMode`, `mergeStrategy`, `defaultBaseBranch`, `autoChangelog` to `defaults`
- `packages/shared/package.json` — add `./plans` and `./plans/node` subpath exports

**Modified (main process):**
- `apps/electron/src/main/ipc/plans-ipc.ts` — change `planStoragePath` default from `'docs/plans'` to `'.craft-agent/plans'`; extend `plans:list` / `plans:read` return types with new fields
- `apps/electron/src/main/index.ts` — call `registerPlanLifecycleIpc()` alongside existing IPC registrations

**Modified (preload/shared):**
- `apps/electron/src/preload/bootstrap.ts` — expose `electronAPI.plansLifecycle` namespace
- `apps/electron/src/shared/types.ts` — add `plansLifecycle` surface + extend `plans` return types with new frontmatter fields

**Modified (renderer):**
- `apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx` — add state badges + branch/validate/merge buttons to Linked Plans rows
- `apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx` — mount `AcceptPlanBanner` after Accept-Plan flow fires
- `apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx` — emit `craft:plan-accepted` CustomEvent after `copyForward` resolves

**Modified (repo root):**
- `.gitignore` — anchor `.craft-agent/` to repo root, un-ignore `.craft-agent/plans/`, add `.worktrees/`

**Tests (bun:test, co-located):**
- `packages/shared/src/plans/branch-naming.test.ts`
- `packages/shared/src/plans/frontmatter.test.ts`
- `packages/shared/src/plans/lifecycle.test.ts`
- `packages/shared/src/plans/changelog.test.ts`
- `apps/electron/src/main/git/git-commands.test.ts`
- `apps/electron/src/main/git/plan-git-flow.test.ts`

---

## Task-by-Task

### Task 1: Gitignore adjustments

**Files:**
- Modify: `.gitignore`

**Context:** The existing gitignore has an unanchored `.craft-agent/` rule (line ~51 in the current file — grep for it) that would hide `.craft-agent/plans/` when Rowl runs on its own repo. This plan needs `.craft-agent/plans/` to be **committed** (plans = audit trail). We anchor the existing rule to the repo root where needed and negate the plans subdirectory. We also add `/.worktrees/` which is always gitignored.

- [ ] **Step 1: Read the current `.gitignore`**

Run: `cat /Users/mauriello/Dev/rowl-v2/.gitignore`
Expected: see a line `.craft-agent/` in the "Craft Agent local data" block.

- [ ] **Step 2: Edit the gitignore**

Apply these three edits:

**Edit A — replace the unanchored `.craft-agent/` with an anchored form that excludes `plans/`:**

Find:
```
# Craft Agent local data (sessions, credentials, config)
.craft-agent/
```

Replace with:
```
# Craft Agent local data (sessions, credentials, config).
# Anchored to repo root; we re-include /plans because committed plans are the
# audit trail that feeds the roadmap (see docs/superpowers/specs/2026-04-23-plan-execute-merge-changelog-design.md).
/.craft-agent/*
!/.craft-agent/plans/
```

**Edit B — add the worktrees rule at the bottom of the same block (or adjacent):**

Append:
```

# Worktrees created by the plan → branch pipeline. Always local scratch.
/.worktrees/
```

- [ ] **Step 3: Verify behavior with a scratch directory**

```bash
cd /Users/mauriello/Dev/rowl-v2
mkdir -p .craft-agent/sessions .craft-agent/plans
touch .craft-agent/sessions/example.txt .craft-agent/plans/example-plan.md
git check-ignore -v .craft-agent/sessions/example.txt .craft-agent/plans/example-plan.md
rm -rf .craft-agent
```

Expected: the first path prints an ignore rule match; the second prints nothing (not ignored).

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add .gitignore
git commit -m "chore(gitignore): anchor .craft-agent, track /plans, ignore /.worktrees"
```

---

### Task 2: Plan lifecycle types

**Files:**
- Create: `packages/shared/src/plans/types.ts`
- Create: `packages/shared/src/plans/index.ts`

**Context:** The shipped `PlanFrontmatter` in `packages/shared/src/issues/copy-plan-forward.ts` has 5 fields. This task introduces the new typed barrel at `@craft-agent/shared/plans` with the **extended** frontmatter shape plus the state/type enums. The fs-touching read/write code lives behind the `./node` subpath (Task 4 + Task 7).

- [ ] **Step 1: Create `types.ts`**

`packages/shared/src/plans/types.ts`:

```typescript
/**
 * Plan lifecycle types.
 *
 * Plan frontmatter is the source of truth for a plan's lifecycle state.
 * Legacy files (missing the lifecycle fields) are normalized to
 * state: 'accepted' by the read path — see ./frontmatter.ts.
 */

export type PlanState = 'accepted' | 'in-progress' | 'validated' | 'merged';

export type PlanType = 'feat' | 'fix' | 'chore' | 'docs' | 'refactor' | 'test';

export const PLAN_TYPES: readonly PlanType[] = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
] as const;

export const PLAN_STATES: readonly PlanState[] = [
  'accepted',
  'in-progress',
  'validated',
  'merged',
] as const;

/**
 * Full plan frontmatter shape written to plan files.
 *
 * Legacy files (those written by the pre-lifecycle copyPlanForward) have
 * ONLY the first 5 fields. The read path fills defaults for the rest.
 */
export interface PlanFrontmatter {
  // Existing (shipped in the Issue → Plan pipeline):
  issueId: string | null;
  issueSlug: string | null;
  sessionId: string;
  acceptedAt: string;   // ISO 8601
  planVersion: number;

  // Lifecycle fields (added in this sub-project):
  state: PlanState;                  // default 'accepted' when missing
  title: string;                     // default: issueSlug or filename stem
  type: PlanType;                    // default 'feat'
  branchName: string | null;         // default null
  worktreePath: string | null;       // absolute path; default null (inline branch)
  inProgressAt: string | null;       // default null
  validatedAt: string | null;        // default null
  validationSummary: string | null;  // markdown; default null
  mergedAt: string | null;           // default null
  mergeCommitSha: string | null;     // short SHA; default null
}

/**
 * Inputs for the pure lifecycle transitions (see ./lifecycle.ts).
 */
export interface MarkInProgressInput {
  branchName: string;
  worktreePath: string | null;
  now: Date;
}

export interface MarkValidatedInput {
  validationSummary: string;
  now: Date;
}

export interface MarkMergedInput {
  mergeCommitSha: string;
  now: Date;
}
```

- [ ] **Step 2: Create the renderer-safe barrel**

`packages/shared/src/plans/index.ts`:

```typescript
/**
 * Plans Module (renderer-safe).
 *
 * This barrel exports ONLY types + pure helpers that do NOT touch `fs`/`os`/`path`.
 * The node-only side (frontmatter read/write, changelog read/write) lives at
 * `@craft-agent/shared/plans/node` — do NOT import it from renderer code.
 */

export * from './types.ts';
export * from './branch-naming.ts';
export * from './lifecycle.ts';
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit`
Expected: PASS. (The `lifecycle.ts` and `branch-naming.ts` re-exports will fail module resolution — that's expected until Task 3 + Task 5. Defer commit until then.)

- [ ] **Step 4: Stash progress until Task 3**

Do not commit yet. The next two tasks complete the module so the barrel compiles.

---

### Task 3: Branch naming helpers (port + adapt from t3code)

**Files:**
- Create: `packages/shared/src/plans/branch-naming.ts`
- Create: `packages/shared/src/plans/branch-naming.test.ts`

**Context:** Port `sanitizeBranchFragment` and `resolveAutoFeatureBranchName` from `/Users/mauriello/Dev/_reference/t3code/packages/shared/src/git.ts`. **Drop the `feature/` prefix** — Rowl uses `{type}/{slug}` where type is `feat`/`fix`/`chore`/etc. We also drop the Effect + `@t3tools/contracts` dependencies; these are pure string functions.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/plans/branch-naming.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { sanitizeBranchFragment, resolveBranchName } from './branch-naming.ts';

describe('sanitizeBranchFragment', () => {
  it('lowercases + collapses separators', () => {
    expect(sanitizeBranchFragment('Add Dark Mode')).toBe('add-dark-mode');
  });

  it('strips quotes and leading/trailing separators', () => {
    expect(sanitizeBranchFragment(' "Fix login bug!" ')).toBe('fix-login-bug');
  });

  it('preserves a single slash separator', () => {
    expect(sanitizeBranchFragment('auth/retry logic')).toBe('auth/retry-logic');
  });

  it('collapses multiple slashes', () => {
    expect(sanitizeBranchFragment('a//b///c')).toBe('a/b/c');
  });

  it('replaces non-ascii with dashes', () => {
    expect(sanitizeBranchFragment('résumé update')).toBe('r-sum-update');
  });

  it('caps at 64 chars', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeBranchFragment(long).length).toBeLessThanOrEqual(64);
  });

  it('returns a fallback for empty input', () => {
    expect(sanitizeBranchFragment('')).toBe('update');
    expect(sanitizeBranchFragment('   ')).toBe('update');
    expect(sanitizeBranchFragment('!!!')).toBe('update');
  });
});

describe('resolveBranchName', () => {
  it('combines type + sanitized slug', () => {
    expect(resolveBranchName({ type: 'feat', title: 'Add dark mode' }, [])).toBe('feat/add-dark-mode');
    expect(resolveBranchName({ type: 'fix', title: 'Login loops forever' }, [])).toBe('fix/login-loops-forever');
  });

  it('returns the base name when no collision', () => {
    expect(resolveBranchName({ type: 'feat', title: 'Cleanup deps' }, ['main', 'chore/other'])).toBe('feat/cleanup-deps');
  });

  it('auto-suffixes -2, -3 on collision', () => {
    const existing = ['feat/add-dark-mode', 'feat/add-dark-mode-2'];
    expect(resolveBranchName({ type: 'feat', title: 'Add dark mode' }, existing)).toBe('feat/add-dark-mode-3');
  });

  it('is case-insensitive when checking collisions', () => {
    const existing = ['FEAT/add-dark-mode'];
    expect(resolveBranchName({ type: 'feat', title: 'Add dark mode' }, existing)).toBe('feat/add-dark-mode-2');
  });

  it('defaults to feat/update when title sanitizes to empty', () => {
    expect(resolveBranchName({ type: 'feat', title: '!!!' }, [])).toBe('feat/update');
  });
});
```

- [ ] **Step 2: Implement `branch-naming.ts`**

`packages/shared/src/plans/branch-naming.ts`:

```typescript
import type { PlanType } from './types.ts';

/**
 * Sanitize a free-form string into a git-safe branch fragment.
 *
 * Ported from `/Users/mauriello/Dev/_reference/t3code/packages/shared/src/git.ts`
 * (`sanitizeBranchFragment`), adapted to remove the Effect dependency. Output is
 * lowercase, ASCII-safe, ≤64 chars, with separators collapsed. Empty input
 * returns the literal fallback 'update'.
 */
export function sanitizeBranchFragment(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/^[./\s_-]+|[./\s_-]+$/g, '');

  const fragment = normalized
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/-+/g, '-')
    .replace(/^[./_-]+|[./_-]+$/g, '')
    .slice(0, 64)
    .replace(/[./_-]+$/g, '');

  return fragment.length > 0 ? fragment : 'update';
}

export interface ResolveBranchNameInput {
  /** The plan's type — becomes the branch prefix. */
  type: PlanType;
  /** The plan title (or issue title) — sanitized into the branch slug. */
  title: string;
}

/**
 * Build a full `{type}/{slug}` branch name that does not collide with any
 * existing branch. Falls back to auto-suffix `-2`, `-3`, …  as needed.
 *
 * Matching is case-insensitive because git ref names are case-insensitive on
 * macOS by default and we never want to produce a "new" branch that only
 * differs by case.
 */
export function resolveBranchName(
  input: ResolveBranchNameInput,
  existingBranchNames: readonly string[],
): string {
  const slug = sanitizeBranchFragment(input.title);
  const base = `${input.type}/${slug}`;
  const existingLower = new Set(existingBranchNames.map((b) => b.toLowerCase()));

  if (!existingLower.has(base.toLowerCase())) {
    return base;
  }

  let suffix = 2;
  while (existingLower.has(`${base}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/plans/branch-naming.test.ts`
Expected: all 12 tests PASS.

- [ ] **Step 4: Commit (still not done — lifecycle.ts needed for barrel)**

Hold the commit until Task 5.

---

### Task 4: Frontmatter read/write with defaults

**Files:**
- Create: `packages/shared/src/plans/frontmatter.ts`
- Create: `packages/shared/src/plans/frontmatter.test.ts`

**Context:** `gray-matter` is already a dependency (`packages/shared/package.json`). This module encapsulates the round-trip. Reads fill defaults for legacy files (missing lifecycle fields). Writes always emit the full shape. Unknown frontmatter keys are preserved on round-trip.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/plans/frontmatter.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import type { PlanFrontmatter } from './types.ts';
import { parsePlanFile, renderPlanFile } from './frontmatter.ts';

const FULL: PlanFrontmatter = {
  issueId: 'issue_abc',
  issueSlug: 'add-dark-mode',
  sessionId: 'sess-1',
  acceptedAt: '2026-04-23T10:00:00.000Z',
  planVersion: 1,
  state: 'accepted',
  title: 'Add dark mode',
  type: 'feat',
  branchName: null,
  worktreePath: null,
  inProgressAt: null,
  validatedAt: null,
  validationSummary: null,
  mergedAt: null,
  mergeCommitSha: null,
};

describe('parsePlanFile / renderPlanFile', () => {
  it('round-trips a fully-populated plan', () => {
    const text = renderPlanFile(FULL, '# Body\n\nparagraph');
    const parsed = parsePlanFile(text);
    expect(parsed.frontmatter).toEqual(FULL);
    expect(parsed.body).toBe('# Body\n\nparagraph');
  });

  it('fills defaults when lifecycle fields are missing (legacy file)', () => {
    const legacy = `---
issueId: issue_legacy
issueSlug: some-slug
sessionId: old-sess
acceptedAt: 2026-01-01T00:00:00.000Z
planVersion: 1
---

body`;
    const parsed = parsePlanFile(legacy);
    expect(parsed.frontmatter.state).toBe('accepted');
    expect(parsed.frontmatter.type).toBe('feat');
    expect(parsed.frontmatter.title).toBe('some-slug');
    expect(parsed.frontmatter.branchName).toBeNull();
    expect(parsed.frontmatter.worktreePath).toBeNull();
    expect(parsed.frontmatter.inProgressAt).toBeNull();
    expect(parsed.frontmatter.validatedAt).toBeNull();
    expect(parsed.frontmatter.validationSummary).toBeNull();
    expect(parsed.frontmatter.mergedAt).toBeNull();
    expect(parsed.frontmatter.mergeCommitSha).toBeNull();
  });

  it('falls back to filename-style title when both title and issueSlug are absent', () => {
    const bare = `---
issueId: null
issueSlug: null
sessionId: sess-1
acceptedAt: 2026-01-01T00:00:00.000Z
planVersion: 1
---

body`;
    const parsed = parsePlanFile(bare);
    expect(parsed.frontmatter.title).toBe('Untitled plan');
  });

  it('clamps unknown state or type values to defaults', () => {
    const garbage = `---
issueId: null
issueSlug: null
sessionId: sess-1
acceptedAt: 2026-01-01T00:00:00.000Z
planVersion: 1
state: weird
type: banana
title: Whatever
---

body`;
    const parsed = parsePlanFile(garbage);
    expect(parsed.frontmatter.state).toBe('accepted');
    expect(parsed.frontmatter.type).toBe('feat');
  });

  it('preserves unknown frontmatter keys on round-trip', () => {
    const withExtra = `---
issueId: null
issueSlug: null
sessionId: sess-1
acceptedAt: 2026-01-01T00:00:00.000Z
planVersion: 1
state: accepted
title: T
type: feat
branchName: null
worktreePath: null
inProgressAt: null
validatedAt: null
validationSummary: null
mergedAt: null
mergeCommitSha: null
futureField: keep-me
---

body`;
    const parsed = parsePlanFile(withExtra);
    const re = renderPlanFile(parsed.frontmatter, parsed.body, parsed.extras);
    expect(re).toContain('futureField: keep-me');
  });
});
```

- [ ] **Step 2: Implement `frontmatter.ts`**

`packages/shared/src/plans/frontmatter.ts`:

```typescript
import matter from 'gray-matter';
import type { PlanFrontmatter, PlanState, PlanType } from './types.ts';
import { PLAN_STATES, PLAN_TYPES } from './types.ts';

const KNOWN_KEYS = new Set<keyof PlanFrontmatter>([
  'issueId',
  'issueSlug',
  'sessionId',
  'acceptedAt',
  'planVersion',
  'state',
  'title',
  'type',
  'branchName',
  'worktreePath',
  'inProgressAt',
  'validatedAt',
  'validationSummary',
  'mergedAt',
  'mergeCommitSha',
]);

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNullableString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

function asState(v: unknown): PlanState {
  return typeof v === 'string' && (PLAN_STATES as readonly string[]).includes(v)
    ? (v as PlanState)
    : 'accepted';
}

function asType(v: unknown): PlanType {
  return typeof v === 'string' && (PLAN_TYPES as readonly string[]).includes(v)
    ? (v as PlanType)
    : 'feat';
}

export interface ParsedPlanFile {
  frontmatter: PlanFrontmatter;
  body: string;
  /** Unknown frontmatter keys preserved for round-trip. */
  extras: Record<string, unknown>;
}

export function parsePlanFile(text: string): ParsedPlanFile {
  const parsed = matter(text);
  const fm = parsed.data as Record<string, unknown>;

  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!KNOWN_KEYS.has(k as keyof PlanFrontmatter)) {
      extras[k] = v;
    }
  }

  const title =
    asString(fm.title) ??
    asString(fm.issueSlug) ??
    'Untitled plan';

  const frontmatter: PlanFrontmatter = {
    issueId: asNullableString(fm.issueId),
    issueSlug: asNullableString(fm.issueSlug),
    sessionId: typeof fm.sessionId === 'string' ? fm.sessionId : '',
    acceptedAt: typeof fm.acceptedAt === 'string' ? fm.acceptedAt : '',
    planVersion: typeof fm.planVersion === 'number' ? fm.planVersion : 1,
    state: asState(fm.state),
    title,
    type: asType(fm.type),
    branchName: asNullableString(fm.branchName),
    worktreePath: asNullableString(fm.worktreePath),
    inProgressAt: asNullableString(fm.inProgressAt),
    validatedAt: asNullableString(fm.validatedAt),
    validationSummary: asNullableString(fm.validationSummary),
    mergedAt: asNullableString(fm.mergedAt),
    mergeCommitSha: asNullableString(fm.mergeCommitSha),
  };

  return { frontmatter, body: parsed.content.replace(/^\n+/, ''), extras };
}

export function renderPlanFile(
  fm: PlanFrontmatter,
  body: string,
  extras?: Record<string, unknown>,
): string {
  const data: Record<string, unknown> = {
    issueId: fm.issueId,
    issueSlug: fm.issueSlug,
    sessionId: fm.sessionId,
    acceptedAt: fm.acceptedAt,
    planVersion: fm.planVersion,
    state: fm.state,
    title: fm.title,
    type: fm.type,
    branchName: fm.branchName,
    worktreePath: fm.worktreePath,
    inProgressAt: fm.inProgressAt,
    validatedAt: fm.validatedAt,
    validationSummary: fm.validationSummary,
    mergedAt: fm.mergedAt,
    mergeCommitSha: fm.mergeCommitSha,
  };
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (!KNOWN_KEYS.has(k as keyof PlanFrontmatter)) {
        data[k] = v;
      }
    }
  }
  return matter.stringify(body, data);
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/plans/frontmatter.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 4: Still no commit — waiting for Task 5**

---

### Task 5: Lifecycle state transitions

**Files:**
- Create: `packages/shared/src/plans/lifecycle.ts`
- Create: `packages/shared/src/plans/lifecycle.test.ts`

**Context:** Pure functions that take a `PlanFrontmatter` and a transition input, and return an updated `PlanFrontmatter`. No I/O. The valid transitions are:
- `accepted → in-progress` via `markInProgress`
- `in-progress → validated` via `markValidated`
- `validated → merged` via `markMerged`

Any other source state throws a typed error.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/plans/lifecycle.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import type { PlanFrontmatter } from './types.ts';
import { markInProgress, markMerged, markValidated, PlanLifecycleError } from './lifecycle.ts';

function base(): PlanFrontmatter {
  return {
    issueId: 'issue_abc',
    issueSlug: 'add-dark-mode',
    sessionId: 'sess-1',
    acceptedAt: '2026-04-23T10:00:00.000Z',
    planVersion: 1,
    state: 'accepted',
    title: 'Add dark mode',
    type: 'feat',
    branchName: null,
    worktreePath: null,
    inProgressAt: null,
    validatedAt: null,
    validationSummary: null,
    mergedAt: null,
    mergeCommitSha: null,
  };
}

describe('markInProgress', () => {
  it('transitions accepted → in-progress and records branch info', () => {
    const now = new Date('2026-04-23T12:00:00.000Z');
    const next = markInProgress(base(), {
      branchName: 'feat/add-dark-mode',
      worktreePath: '/repo/.worktrees/feat-add-dark-mode',
      now,
    });
    expect(next.state).toBe('in-progress');
    expect(next.branchName).toBe('feat/add-dark-mode');
    expect(next.worktreePath).toBe('/repo/.worktrees/feat-add-dark-mode');
    expect(next.inProgressAt).toBe(now.toISOString());
  });

  it('accepts a null worktreePath (inline branch)', () => {
    const next = markInProgress(base(), {
      branchName: 'feat/x',
      worktreePath: null,
      now: new Date('2026-04-23T12:00:00.000Z'),
    });
    expect(next.worktreePath).toBeNull();
  });

  it('rejects transitions from a non-accepted state', () => {
    const fm = { ...base(), state: 'merged' as const };
    expect(() => markInProgress(fm, {
      branchName: 'feat/x',
      worktreePath: null,
      now: new Date(),
    })).toThrow(PlanLifecycleError);
  });
});

describe('markValidated', () => {
  it('transitions in-progress → validated and stores summary', () => {
    const fm = { ...base(), state: 'in-progress' as const, branchName: 'feat/x', inProgressAt: '2026-04-23T12:00:00.000Z' };
    const now = new Date('2026-04-23T14:00:00.000Z');
    const next = markValidated(fm, { validationSummary: '- Added toggle', now });
    expect(next.state).toBe('validated');
    expect(next.validationSummary).toBe('- Added toggle');
    expect(next.validatedAt).toBe(now.toISOString());
  });

  it('rejects transitions from a non-in-progress state', () => {
    expect(() => markValidated(base(), {
      validationSummary: '',
      now: new Date(),
    })).toThrow(PlanLifecycleError);
  });
});

describe('markMerged', () => {
  it('transitions validated → merged and stores commit SHA', () => {
    const fm = {
      ...base(),
      state: 'validated' as const,
      branchName: 'feat/x',
      inProgressAt: '2026-04-23T12:00:00.000Z',
      validatedAt: '2026-04-23T14:00:00.000Z',
      validationSummary: '- Added toggle',
    };
    const now = new Date('2026-04-23T15:00:00.000Z');
    const next = markMerged(fm, { mergeCommitSha: 'a1b2c3d', now });
    expect(next.state).toBe('merged');
    expect(next.mergeCommitSha).toBe('a1b2c3d');
    expect(next.mergedAt).toBe(now.toISOString());
    // Branch + worktree fields are NOT cleared (historical record).
    expect(next.branchName).toBe('feat/x');
  });

  it('rejects transitions from a non-validated state', () => {
    expect(() => markMerged(base(), {
      mergeCommitSha: 'abc',
      now: new Date(),
    })).toThrow(PlanLifecycleError);
  });
});
```

- [ ] **Step 2: Implement `lifecycle.ts`**

`packages/shared/src/plans/lifecycle.ts`:

```typescript
import type {
  MarkInProgressInput,
  MarkMergedInput,
  MarkValidatedInput,
  PlanFrontmatter,
  PlanState,
} from './types.ts';

export class PlanLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanLifecycleError';
  }
}

function assertState(actual: PlanState, expected: PlanState): void {
  if (actual !== expected) {
    throw new PlanLifecycleError(
      `Invalid state transition: plan is '${actual}', expected '${expected}'`,
    );
  }
}

export function markInProgress(
  fm: PlanFrontmatter,
  input: MarkInProgressInput,
): PlanFrontmatter {
  assertState(fm.state, 'accepted');
  return {
    ...fm,
    state: 'in-progress',
    branchName: input.branchName,
    worktreePath: input.worktreePath,
    inProgressAt: input.now.toISOString(),
  };
}

export function markValidated(
  fm: PlanFrontmatter,
  input: MarkValidatedInput,
): PlanFrontmatter {
  assertState(fm.state, 'in-progress');
  return {
    ...fm,
    state: 'validated',
    validationSummary: input.validationSummary,
    validatedAt: input.now.toISOString(),
  };
}

export function markMerged(
  fm: PlanFrontmatter,
  input: MarkMergedInput,
): PlanFrontmatter {
  assertState(fm.state, 'validated');
  return {
    ...fm,
    state: 'merged',
    mergeCommitSha: input.mergeCommitSha,
    mergedAt: input.now.toISOString(),
    // branchName + worktreePath intentionally kept as historical record.
  };
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/plans/lifecycle.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 4: Typecheck the barrel**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit Tasks 2+3+4+5 together**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/plans/
git commit -m "feat(plans): add lifecycle types, branch naming, frontmatter, transitions"
```

---

### Task 6: Changelog helpers

**Files:**
- Create: `packages/shared/src/plans/changelog.ts`
- Create: `packages/shared/src/plans/changelog.test.ts`

**Context:** Pure string manipulation of a Keep-a-Changelog-formatted document. No `fs`. The fs wrapper that reads/writes `CHANGELOG.md` lives in `plans-ipc` (Task 12). Rules per spec §8.3:

- `feat` → Added
- `fix` → Fixed
- `chore` | `refactor` | `test` → Changed
- `docs` → Documentation

If the file is malformed (no `## [Unreleased]` section), **prepend** a fresh Unreleased block rather than attempting repair.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/plans/changelog.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import {
  CHANGELOG_TEMPLATE,
  prependChangelogEntry,
  subsectionForType,
} from './changelog.ts';

describe('subsectionForType', () => {
  it('maps each PlanType', () => {
    expect(subsectionForType('feat')).toBe('Added');
    expect(subsectionForType('fix')).toBe('Fixed');
    expect(subsectionForType('chore')).toBe('Changed');
    expect(subsectionForType('refactor')).toBe('Changed');
    expect(subsectionForType('test')).toBe('Changed');
    expect(subsectionForType('docs')).toBe('Documentation');
  });
});

describe('prependChangelogEntry', () => {
  it('creates the template when input is empty', () => {
    const out = prependChangelogEntry('', {
      type: 'feat',
      title: 'Add dark mode',
      sha: 'a1b2c3d',
    });
    expect(out).toContain('## [Unreleased]');
    expect(out).toContain('### Added');
    expect(out).toContain('- Add dark mode (a1b2c3d)');
  });

  it('prepends the bullet under an existing subsection', () => {
    const initial = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- Earlier thing (deadbeef)',
      '',
    ].join('\n');
    const out = prependChangelogEntry(initial, {
      type: 'feat',
      title: 'Newer thing',
      sha: 'cafebabe',
    });
    const idxNew = out.indexOf('- Newer thing (cafebabe)');
    const idxOld = out.indexOf('- Earlier thing (deadbeef)');
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxOld).toBeGreaterThan(idxNew);
  });

  it('creates a missing subsection in the standard order', () => {
    const initial = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Changed',
      '',
      '- Some refactor (abc1234)',
      '',
    ].join('\n');
    const out = prependChangelogEntry(initial, {
      type: 'feat',
      title: 'Brand new feature',
      sha: 'deadbee',
    });
    // Added should appear BEFORE Changed under Unreleased.
    const addedIdx = out.indexOf('### Added');
    const changedIdx = out.indexOf('### Changed');
    expect(addedIdx).toBeGreaterThan(-1);
    expect(changedIdx).toBeGreaterThan(addedIdx);
    expect(out).toContain('- Brand new feature (deadbee)');
  });

  it('inserts a fresh [Unreleased] block when none exists (malformed)', () => {
    const malformed = [
      '# Changelog',
      '',
      '## [1.0.0] - 2026-01-01',
      '',
      '### Added',
      '- Something (xxxxxxx)',
    ].join('\n');
    const out = prependChangelogEntry(malformed, {
      type: 'fix',
      title: 'Regression',
      sha: 'reg1234',
    });
    const unreleasedIdx = out.indexOf('## [Unreleased]');
    const firstReleaseIdx = out.indexOf('## [1.0.0]');
    expect(unreleasedIdx).toBeGreaterThan(-1);
    expect(unreleasedIdx).toBeLessThan(firstReleaseIdx);
    expect(out.indexOf('### Fixed')).toBeGreaterThan(unreleasedIdx);
    expect(out.indexOf('### Fixed')).toBeLessThan(firstReleaseIdx);
    expect(out).toContain('- Regression (reg1234)');
  });
});
```

- [ ] **Step 2: Implement `changelog.ts`**

`packages/shared/src/plans/changelog.ts`:

```typescript
import type { PlanType } from './types.ts';

export const CHANGELOG_TEMPLATE = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

`;

const SUBSECTION_ORDER = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
  'Documentation',
] as const;

export type ChangelogSubsection = typeof SUBSECTION_ORDER[number];

export function subsectionForType(type: PlanType): ChangelogSubsection {
  switch (type) {
    case 'feat':
      return 'Added';
    case 'fix':
      return 'Fixed';
    case 'docs':
      return 'Documentation';
    case 'chore':
    case 'refactor':
    case 'test':
      return 'Changed';
  }
}

export interface ChangelogEntryInput {
  type: PlanType;
  title: string;
  sha: string; // already-shortened; we don't re-shorten
}

/**
 * Prepend a new changelog entry under the `[Unreleased]` section. If the
 * document has no Unreleased section (or is empty), a fresh one is inserted
 * at the top. Entries within a subsection are in reverse-chronological order
 * (newest first).
 */
export function prependChangelogEntry(
  existing: string,
  entry: ChangelogEntryInput,
): string {
  const base = existing.trim().length === 0 ? CHANGELOG_TEMPLATE : existing;
  const subsection = subsectionForType(entry.type);
  const bullet = `- ${entry.title} (${entry.sha})`;

  const unreleasedRegex = /^##\s+\[Unreleased\]\s*$/m;
  const unreleasedMatch = unreleasedRegex.exec(base);
  if (!unreleasedMatch) {
    // Malformed: inject a fresh [Unreleased] block before the first `## [` heading.
    const firstRelease = /^##\s+\[/m.exec(base);
    const insertAt = firstRelease ? firstRelease.index : base.length;
    const block = `## [Unreleased]\n\n### ${subsection}\n\n${bullet}\n\n`;
    return base.slice(0, insertAt) + block + base.slice(insertAt);
  }

  const unreleasedStart = unreleasedMatch.index;
  const afterUnreleased = unreleasedStart + unreleasedMatch[0].length;

  // Find the end of the Unreleased section (next `## [`, or EOF).
  const nextReleaseRegex = /^##\s+\[/m;
  nextReleaseRegex.lastIndex = afterUnreleased;
  const afterSlice = base.slice(afterUnreleased);
  const nextReleaseLocal = afterSlice.search(/^##\s+\[/m);
  const sectionEnd =
    nextReleaseLocal === -1
      ? base.length
      : afterUnreleased + nextReleaseLocal;

  const sectionText = base.slice(afterUnreleased, sectionEnd);

  // Does the target subsection already exist within the section?
  const subsectionRegex = new RegExp(`^###\\s+${subsection}\\s*$`, 'm');
  const subsectionMatch = subsectionRegex.exec(sectionText);

  if (subsectionMatch) {
    // Insert bullet right after the subsection heading's trailing blank line.
    const subsectionLocal = subsectionMatch.index;
    const afterHeading = subsectionLocal + subsectionMatch[0].length;
    const updatedSection =
      sectionText.slice(0, afterHeading) +
      `\n\n${bullet}` +
      sectionText.slice(afterHeading).replace(/^\n+/, '\n\n');
    return base.slice(0, afterUnreleased) + updatedSection + base.slice(sectionEnd);
  }

  // Subsection missing — insert it in standard order.
  const desiredIdx = SUBSECTION_ORDER.indexOf(subsection);
  const existingHeadings = [...sectionText.matchAll(/^###\s+(\w+)\s*$/gm)];
  let insertAtLocal = sectionText.length; // append by default
  for (const m of existingHeadings) {
    const name = m[1] as ChangelogSubsection;
    const idx = SUBSECTION_ORDER.indexOf(name);
    if (idx > desiredIdx) {
      insertAtLocal = m.index ?? sectionText.length;
      break;
    }
  }
  const block = `\n### ${subsection}\n\n${bullet}\n\n`;
  const newSection =
    sectionText.slice(0, insertAtLocal) + block + sectionText.slice(insertAtLocal);
  return base.slice(0, afterUnreleased) + newSection + base.slice(sectionEnd);
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/plans/changelog.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/plans/changelog.ts packages/shared/src/plans/changelog.test.ts
git commit -m "feat(plans): add CHANGELOG.md prepend helpers (Keep-a-Changelog)"
```

---

### Task 7: Shared package exports + node barrel

**Files:**
- Create: `packages/shared/src/plans/node.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/plans/index.ts` (add changelog re-export)

**Context:** Mirror the Issues module split: the renderer-safe barrel re-exports types + pure helpers, the node barrel re-exports anything that ever touches `fs`. Changelog helpers are pure (no fs in them) but we still expose them from both barrels for clarity — renderer callers shouldn't need them, but they don't break bundling if imported.

- [ ] **Step 1: Create the node barrel**

`packages/shared/src/plans/node.ts`:

```typescript
/**
 * Plans Module — Node-only exports.
 *
 * Re-exports the fs-touching helpers for plan lifecycle work done in the
 * Electron main process. Renderer code must import from
 * `@craft-agent/shared/plans` (renderer-safe barrel) instead.
 *
 * NOTE: as of this task the frontmatter + changelog helpers are pure string
 * functions (no fs). The barrel exists so future additions that DO touch fs
 * have a ready home without renderer bundling risk.
 */

export * from './frontmatter.ts';
export * from './changelog.ts';
```

- [ ] **Step 2: Add changelog exports to the renderer barrel too**

Update `packages/shared/src/plans/index.ts`:

```typescript
/**
 * Plans Module (renderer-safe).
 *
 * Type + pure-function exports for plan lifecycle work. The node-only side
 * lives at `@craft-agent/shared/plans/node`.
 */

export * from './types.ts';
export * from './branch-naming.ts';
export * from './lifecycle.ts';
export * from './changelog.ts';
export * from './frontmatter.ts';
```

Note: `frontmatter.ts` imports `gray-matter`, which is a Node-only library. For the renderer bundle, gray-matter is NOT safe because it pulls `Buffer`. If a renderer ever imports from `@craft-agent/shared/plans` and triggers gray-matter, the bundler will crash the same way Issues did. **Therefore:** keep `frontmatter.ts` OUT of the renderer barrel and expose it only from `./node`. Revert the line you just added.

Final state of `packages/shared/src/plans/index.ts`:

```typescript
/**
 * Plans Module (renderer-safe).
 */

export * from './types.ts';
export * from './branch-naming.ts';
export * from './lifecycle.ts';
export * from './changelog.ts';
```

- [ ] **Step 3: Update package.json subpath exports**

In `packages/shared/package.json`, add two new entries to the `exports` object (alphabetical-ish insertion, after `./memory`):

```json
"./plans": "./src/plans/index.ts",
"./plans/node": "./src/plans/node.ts",
```

- [ ] **Step 4: Verify imports compile**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/plans/node.ts packages/shared/src/plans/index.ts packages/shared/package.json
git commit -m "feat(plans): export @craft-agent/shared/plans + /plans/node subpaths"
```

---

### Task 8: Extend `copyPlanForward` to write lifecycle fields

**Files:**
- Modify: `packages/shared/src/issues/copy-plan-forward.ts`
- Modify: `packages/shared/src/issues/copy-plan-forward.test.ts`

**Context:** `copyPlanForward` currently writes a 5-field `PlanFrontmatter`. Now it must write the full 15-field shape. Title is derived from the linked issue (when present) or falls back to `issueSlug`. Type defaults to `'feat'` (user overrides in the branch dialog later).

- [ ] **Step 1: Read the current implementation**

Run: `cat /Users/mauriello/Dev/rowl-v2/packages/shared/src/issues/copy-plan-forward.ts`
Take note of the existing `PlanFrontmatter` interface around line 19 and the write block around lines 58–70.

- [ ] **Step 2: Update the write block**

Edit `packages/shared/src/issues/copy-plan-forward.ts`. Replace the local `PlanFrontmatter` interface with an import from the new shared module, and extend the write to include the new fields.

Replace:
```typescript
import { normalizePath } from '../utils/paths.ts';

export interface CopyPlanForwardInput {
```

With:
```typescript
import { normalizePath } from '../utils/paths.ts';
import type { PlanFrontmatter } from '../plans/types.ts';

export interface CopyPlanForwardInput {
```

Delete the existing local `PlanFrontmatter` interface (lines ~19–25 in the current file). Then locate the `const fm: PlanFrontmatter = { ... }` literal and replace it with:

```typescript
  const fm: PlanFrontmatter = {
    issueId: issue?.id ?? null,
    issueSlug: issue ? slug : null,
    sessionId,
    acceptedAt: now.toISOString(),
    planVersion: version,
    state: 'accepted',
    title: issue?.title ?? (slug ?? 'Untitled plan'),
    type: 'feat',
    branchName: null,
    worktreePath: null,
    inProgressAt: null,
    validatedAt: null,
    validationSummary: null,
    mergedAt: null,
    mergeCommitSha: null,
  };
```

- [ ] **Step 3: Update the existing test**

Open `packages/shared/src/issues/copy-plan-forward.test.ts` and update the assertions to check for the new fields. Add these assertions inside the existing "writes to docs/plans/{slug}/plan-{ts}.md" test:

```typescript
    expect(fm.data.state).toBe('accepted');
    expect(fm.data.type).toBe('feat');
    expect(fm.data.title).toBe(issue.title);
    expect(fm.data.branchName).toBeNull();
    expect(fm.data.worktreePath).toBeNull();
    expect(fm.data.inProgressAt).toBeNull();
    expect(fm.data.validatedAt).toBeNull();
    expect(fm.data.validationSummary).toBeNull();
    expect(fm.data.mergedAt).toBeNull();
    expect(fm.data.mergeCommitSha).toBeNull();
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/issues/copy-plan-forward.test.ts`
Expected: all tests PASS (existing + new assertions).

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/issues/copy-plan-forward.ts packages/shared/src/issues/copy-plan-forward.test.ts
git commit -m "feat(plans): write lifecycle fields in copyPlanForward frontmatter"
```

---

### Task 9: Workspace config defaults + `.craft-agent/plans` switch

**Files:**
- Modify: `packages/shared/src/workspaces/types.ts`
- Modify: `apps/electron/src/main/ipc/plans-ipc.ts`

**Context:** Add four new optional defaults to `WorkspaceConfig.defaults`, and change the `planStoragePath` fallback from `'docs/plans'` to `'.craft-agent/plans'`. Existing workspaces that have an explicit `planStoragePath` keep it.

- [ ] **Step 1: Extend workspace types**

In `packages/shared/src/workspaces/types.ts`, inside the `defaults?: { … }` block (currently ends with `planStoragePath?: string;`), append:

```typescript
    /** Default mode for new branches created from plans. Default: 'worktree'. */
    branchMode?: 'worktree' | 'inline';

    /** Default merge strategy. Default: 'squash'. */
    mergeStrategy?: 'squash' | 'fast-forward';

    /** Default base branch for merges. Default: 'main'. */
    defaultBaseBranch?: string;

    /** Whether to auto-prepend changelog entries on merge. Default: true. */
    autoChangelog?: boolean;
```

- [ ] **Step 2: Change the plans-ipc fallback**

In `apps/electron/src/main/ipc/plans-ipc.ts`, find:

```typescript
  const planStoragePath = wsConfig?.defaults?.planStoragePath ?? 'docs/plans'
```

Replace with:

```typescript
  const planStoragePath = wsConfig?.defaults?.planStoragePath ?? '.craft-agent/plans'
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/workspaces/types.ts apps/electron/src/main/ipc/plans-ipc.ts
git commit -m "feat(plans): default storage to .craft-agent/plans + lifecycle config defaults"
```

---

### Task 10: Extend `plans:list` / `plans:read` return types

**Files:**
- Modify: `apps/electron/src/main/ipc/plans-ipc.ts`
- Modify: `apps/electron/src/shared/types.ts`

**Context:** The shipped `PlanListEntry` exposes only the 5 legacy fields. Renderers calling `electronAPI.plans.list()` need the lifecycle fields to render state badges + enable/disable action buttons. Extend the return shape. Backward compatibility: reading old plans returns the defaulted values (via `parsePlanFile`).

- [ ] **Step 1: Import `parsePlanFile` into `plans-ipc.ts`**

At the top of `apps/electron/src/main/ipc/plans-ipc.ts`, add:

```typescript
import { parsePlanFile } from '@craft-agent/shared/plans/node'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'
```

- [ ] **Step 2: Replace the `PlanListEntry` interface**

Find the existing `PlanListEntry` (~lines 23–30) and replace with:

```typescript
export interface PlanListEntry {
  workspaceRelativePath: string;
  frontmatter: PlanFrontmatter;
}
```

- [ ] **Step 3: Update `plans:list` handler body**

Replace the body of the `plans:list` handler (inside the loop) with a `parsePlanFile`-based read:

```typescript
  ipcMain.handle('plans:list', async (_e, workspaceId: string): Promise<PlanListEntry[]> => {
    const { rootPath, planStoragePath } = resolveWorkspace(workspaceId)
    const pattern = join(rootPath, planStoragePath, '**', 'plan-*.md')
    const files = await glob(pattern, { nodir: true })

    const entries: PlanListEntry[] = []
    for (const abs of files) {
      try {
        const text = readFileSync(abs, 'utf-8')
        const { frontmatter } = parsePlanFile(text)
        entries.push({
          workspaceRelativePath: relative(rootPath, abs).split('\\').join('/'),
          frontmatter,
        })
      } catch (err) {
        console.warn(`[plans-ipc] Skipped ${abs}: ${(err as Error).message}`)
      }
    }
    return entries.sort((a, b) =>
      b.frontmatter.acceptedAt.localeCompare(a.frontmatter.acceptedAt),
    )
  })
```

- [ ] **Step 4: Update `plans:read` handler**

Replace the body of `plans:read` with:

```typescript
  ipcMain.handle(
    'plans:read',
    async (
      _e,
      workspaceId: string,
      workspaceRelativePath: string,
    ): Promise<{ frontmatter: PlanFrontmatter; body: string; workspaceRelativePath: string } | null> => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const abs = assertWithinWorkspace(rootPath, join(rootPath, workspaceRelativePath))
      try {
        const text = readFileSync(abs, 'utf-8')
        const { frontmatter, body } = parsePlanFile(text)
        return { frontmatter, body, workspaceRelativePath }
      } catch {
        return null
      }
    },
  )
```

Delete the now-unused `matter` import and `fm` record casts at the top if they're no longer referenced.

- [ ] **Step 5: Update `ElectronAPI` type in `apps/electron/src/shared/types.ts`**

Find the existing `plans: { … }` block (~lines 680–702) and replace with:

```typescript
  // Plan pipeline — shipped Issue→Plan IPC
  plans: {
    copyForward(workspaceId: string, sessionPlanPath: string, sessionId: string, issueId: string | undefined): Promise<string>
    list(workspaceId: string): Promise<Array<{
      workspaceRelativePath: string
      frontmatter: import('@craft-agent/shared/plans').PlanFrontmatter
    }>>
    read(workspaceId: string, relPath: string): Promise<{
      frontmatter: import('@craft-agent/shared/plans').PlanFrontmatter
      body: string
      workspaceRelativePath: string
    } | null>
  }
```

- [ ] **Step 6: Update any renderer callers**

Run: `grep -rn "plans\\.list\\|plans\\.read" apps/electron/src/renderer | head -30`

For each caller (likely `PlanViewerModal.tsx` and anywhere that reads `fm.issueId`/`fm.acceptedAt` from the list), update accessors to go through `.frontmatter.issueId` / `.frontmatter.acceptedAt` etc.

Hotspots to check:
- `apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx` — `linkedPlanPaths` rendering already just uses the path, no frontmatter. Safe.
- `apps/electron/src/renderer/components/app-shell/PlanViewerModal.tsx` — reads from `plans.read`. Update to `.frontmatter.*`.
- Info panel `SessionFilesSection` — if it calls `plans.list`, update accessors.

- [ ] **Step 7: Build and smoke-test**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run --filter '@craft-agent/electron' dev` (if that's the dev command; otherwise run the repo's standard dev script). Open the app. Click an issue with a linked plan. Verify the plan viewer opens and renders frontmatter correctly.

If the app errors: the likely cause is an un-updated caller. Grep-and-fix.

- [ ] **Step 8: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/main/ipc/plans-ipc.ts apps/electron/src/shared/types.ts apps/electron/src/renderer
git commit -m "feat(plans): extend plans:list / plans:read with full PlanFrontmatter"
```

---

### Task 11: `git-commands.ts` — typed wrappers around `git` subprocesses

**Files:**
- Create: `apps/electron/src/main/git/git-commands.ts`
- Create: `apps/electron/src/main/git/git-commands.test.ts`

**Context:** Every git action the plan-lifecycle flow needs, as a typed async function. Uses `child_process.execFile` (not `exec`) so args are never shell-interpolated. Each function accepts `cwd` so callers can run against a specific repo root. Tests initialize a temp git repo and exercise the wrappers end-to-end.

- [ ] **Step 1: Write the failing test**

`apps/electron/src/main/git/git-commands.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  checkoutBranch,
  commit,
  listBranches,
  revParse,
  statusPorcelain,
  worktreeAdd,
  worktreeRemove,
} from './git-commands.ts';

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rowl-gitwrap-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), 'hi\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return dir;
}

describe('git-commands', () => {
  let repo: string;
  beforeEach(() => { repo = initRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('listBranches returns at least main', async () => {
    const branches = await listBranches(repo);
    expect(branches).toContain('main');
  });

  it('checkoutBranch creates a new branch', async () => {
    await checkoutBranch(repo, 'feat/x', { create: true });
    const branches = await listBranches(repo);
    expect(branches).toContain('feat/x');
  });

  it('worktreeAdd creates the worktree directory with checkout', async () => {
    const path = join(repo, '.worktrees', 'feat-x');
    await worktreeAdd(repo, { branch: 'feat/x', path, createBranch: true });
    // Verify HEAD of the new worktree points to feat/x.
    const head = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: path, encoding: 'utf-8' }).trim();
    expect(head).toBe('feat/x');
  });

  it('worktreeRemove cleans up a worktree', async () => {
    const path = join(repo, '.worktrees', 'feat-y');
    await worktreeAdd(repo, { branch: 'feat/y', path, createBranch: true });
    await worktreeRemove(repo, path);
    const list = execFileSync('git', ['worktree', 'list'], { cwd: repo, encoding: 'utf-8' });
    expect(list).not.toContain('feat-y');
  });

  it('statusPorcelain reports clean trees as empty', async () => {
    const status = await statusPorcelain(repo);
    expect(status).toBe('');
  });

  it('statusPorcelain reports dirty trees', async () => {
    writeFileSync(join(repo, 'dirty.txt'), 'uncommitted');
    const status = await statusPorcelain(repo);
    expect(status).toContain('dirty.txt');
  });

  it('revParse returns a commit SHA', async () => {
    const sha = await revParse(repo, 'HEAD');
    expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('commit produces a new HEAD', async () => {
    writeFileSync(join(repo, 'a.txt'), 'A');
    execFileSync('git', ['add', '.'], { cwd: repo });
    const before = await revParse(repo, 'HEAD');
    await commit(repo, { subject: 'feat: add A', body: 'body line' });
    const after = await revParse(repo, 'HEAD');
    expect(before).not.toBe(after);
  });
});
```

- [ ] **Step 2: Implement `git-commands.ts`**

`apps/electron/src/main/git/git-commands.ts`:

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class GitCommandError extends Error {
  constructor(
    public readonly command: string,
    public readonly args: string[],
    public readonly stderr: string,
    public readonly cause?: unknown,
  ) {
    super(`git ${[command, ...args].join(' ')} failed: ${stderr.trim()}`);
    this.name = 'GitCommandError';
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.toString();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: Buffer | string };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? e.message ?? '';
    throw new GitCommandError(args[0] ?? '', args.slice(1), stderr, err);
  }
}

export async function listBranches(cwd: string): Promise<string[]> {
  const out = await runGit(cwd, ['branch', '--format=%(refname:short)']);
  return out.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

export interface CheckoutOptions {
  create?: boolean;
  from?: string; // base branch or SHA when creating
}

export async function checkoutBranch(cwd: string, branch: string, opts: CheckoutOptions = {}): Promise<void> {
  const args = ['checkout'];
  if (opts.create) args.push('-b');
  args.push(branch);
  if (opts.create && opts.from) args.push(opts.from);
  await runGit(cwd, args);
}

export interface WorktreeAddOptions {
  branch: string;
  path: string;
  /** When true, creates the branch as part of `git worktree add -b`. */
  createBranch?: boolean;
  /** Base branch/SHA for new branches. Defaults to HEAD. */
  from?: string;
}

export async function worktreeAdd(cwd: string, opts: WorktreeAddOptions): Promise<void> {
  const args = ['worktree', 'add'];
  if (opts.createBranch) args.push('-b', opts.branch);
  args.push(opts.path);
  if (opts.createBranch && opts.from) args.push(opts.from);
  else if (!opts.createBranch) args.push(opts.branch);
  await runGit(cwd, args);
}

export async function worktreeRemove(cwd: string, worktreePath: string): Promise<void> {
  await runGit(cwd, ['worktree', 'remove', worktreePath]);
}

export async function statusPorcelain(cwd: string): Promise<string> {
  return (await runGit(cwd, ['status', '--porcelain'])).trimEnd();
}

export async function revParse(cwd: string, rev: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', '--short', rev])).trim();
}

export interface CommitOptions {
  subject: string;
  body: string;
}

export async function commit(cwd: string, opts: CommitOptions): Promise<void> {
  await runGit(cwd, ['commit', '-m', opts.subject, '-m', opts.body]);
}

export async function mergeSquash(cwd: string, featureBranch: string): Promise<void> {
  await runGit(cwd, ['merge', '--squash', featureBranch]);
}

export async function mergeFastForward(cwd: string, featureBranch: string): Promise<void> {
  await runGit(cwd, ['merge', '--ff-only', featureBranch]);
}

export async function mergeAbort(cwd: string): Promise<void> {
  await runGit(cwd, ['merge', '--abort']);
}

export async function deleteBranch(cwd: string, branch: string, force = false): Promise<void> {
  await runGit(cwd, ['branch', force ? '-D' : '-d', branch]);
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test apps/electron/src/main/git/git-commands.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/main/git/git-commands.ts apps/electron/src/main/git/git-commands.test.ts
git commit -m "feat(git): typed git subprocess wrappers for plan-lifecycle flow"
```

---

### Task 12: `plan-git-flow.ts` — branch creation + merge orchestration

**Files:**
- Create: `apps/electron/src/main/git/plan-git-flow.ts`
- Create: `apps/electron/src/main/git/plan-git-flow.test.ts`

**Context:** Orchestrates the high-level operations:
- `createBranchForPlan({ repoRoot, planAbsPath, branchName, mode, baseBranch })` — runs git commands, updates plan frontmatter via `parsePlanFile`/`renderPlanFile` + `markInProgress`, returns `{ branchName, worktreePath }`.
- `mergePlan({ repoRoot, planAbsPath, baseBranch, strategy, subject, body, deleteBranchAfter, deleteWorktreeAfter })` — preflight (`statusPorcelain`), merge, optional cleanup, updates plan frontmatter via `markMerged`. Returns `{ mergeCommitSha }`.

Tests use the same temp-repo fixture pattern as Task 11.

- [ ] **Step 1: Write the failing test**

`apps/electron/src/main/git/plan-git-flow.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parsePlanFile, renderPlanFile } from '@craft-agent/shared/plans/node';
import type { PlanFrontmatter } from '@craft-agent/shared/plans';
import { createBranchForPlan, mergePlan } from './plan-git-flow.ts';

function initRepoWithPlan(): { repo: string; planRel: string; planAbs: string } {
  const repo = mkdtempSync(join(tmpdir(), 'rowl-flow-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  writeFileSync(join(repo, 'README.md'), 'hi\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo });

  const planDir = join(repo, '.craft-agent', 'plans', 'add-dark-mode');
  mkdirSync(planDir, { recursive: true });
  const fm: PlanFrontmatter = {
    issueId: 'issue_abc',
    issueSlug: 'add-dark-mode',
    sessionId: 'sess-1',
    acceptedAt: new Date().toISOString(),
    planVersion: 1,
    state: 'accepted',
    title: 'Add dark mode',
    type: 'feat',
    branchName: null,
    worktreePath: null,
    inProgressAt: null,
    validatedAt: null,
    validationSummary: null,
    mergedAt: null,
    mergeCommitSha: null,
  };
  const planAbs = join(planDir, 'plan-2026-04-23-1000.md');
  writeFileSync(planAbs, renderPlanFile(fm, '# Plan body\n\nSteps...'));
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'add plan'], { cwd: repo });

  const planRel = '.craft-agent/plans/add-dark-mode/plan-2026-04-23-1000.md';
  return { repo, planRel, planAbs };
}

describe('plan-git-flow', () => {
  let repo: string;
  let planAbs: string;
  let planRel: string;
  beforeEach(() => { ({ repo, planRel, planAbs } = initRepoWithPlan()); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('createBranchForPlan (worktree) creates the worktree and updates frontmatter', async () => {
    const result = await createBranchForPlan({
      repoRoot: repo,
      planAbsPath: planAbs,
      branchName: 'feat/add-dark-mode',
      mode: 'worktree',
      baseBranch: 'main',
      now: new Date('2026-04-23T12:00:00.000Z'),
    });

    expect(result.branchName).toBe('feat/add-dark-mode');
    expect(result.worktreePath).toContain('.worktrees');
    expect(existsSync(result.worktreePath!)).toBe(true);

    const { frontmatter } = parsePlanFile(readFileSync(planAbs, 'utf-8'));
    expect(frontmatter.state).toBe('in-progress');
    expect(frontmatter.branchName).toBe('feat/add-dark-mode');
    expect(frontmatter.worktreePath).toBe(result.worktreePath);
    expect(frontmatter.inProgressAt).toBe('2026-04-23T12:00:00.000Z');
  });

  it('createBranchForPlan (inline) checks out in the main working tree', async () => {
    const result = await createBranchForPlan({
      repoRoot: repo,
      planAbsPath: planAbs,
      branchName: 'feat/add-dark-mode',
      mode: 'inline',
      baseBranch: 'main',
      now: new Date(),
    });

    expect(result.worktreePath).toBeNull();
    const head = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim();
    expect(head).toBe('feat/add-dark-mode');
  });

  it('mergePlan squash-merges, captures SHA, and marks frontmatter merged', async () => {
    // Setup: create branch, make a change, mark validated.
    await createBranchForPlan({
      repoRoot: repo,
      planAbsPath: planAbs,
      branchName: 'feat/add-dark-mode',
      mode: 'inline',
      baseBranch: 'main',
      now: new Date(),
    });
    writeFileSync(join(repo, 'theme.css'), 'body { background: black; }');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'impl'], { cwd: repo });

    // Mark validated on disk (we don't have a helper yet; do it directly).
    const { frontmatter, body } = parsePlanFile(readFileSync(planAbs, 'utf-8'));
    const validated = { ...frontmatter, state: 'validated' as const, validatedAt: new Date().toISOString(), validationSummary: '- Added theme.css' };
    writeFileSync(planAbs, renderPlanFile(validated, body));
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'mark validated'], { cwd: repo });

    // Now merge.
    const result = await mergePlan({
      repoRoot: repo,
      planAbsPath: planAbs,
      baseBranch: 'main',
      strategy: 'squash',
      subject: 'feat: Add dark mode',
      body: '- Added theme.css\n\nPlan: .craft-agent/plans/add-dark-mode/plan-2026-04-23-1000.md',
      deleteBranchAfter: true,
      deleteWorktreeAfter: true,
      now: new Date('2026-04-23T16:00:00.000Z'),
    });

    expect(result.mergeCommitSha).toMatch(/^[0-9a-f]{7}$/);
    const headBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim();
    expect(headBranch).toBe('main');

    const branches = execFileSync('git', ['branch'], { cwd: repo, encoding: 'utf-8' });
    expect(branches).not.toContain('feat/add-dark-mode');

    const { frontmatter: finalFm } = parsePlanFile(readFileSync(planAbs, 'utf-8'));
    expect(finalFm.state).toBe('merged');
    expect(finalFm.mergeCommitSha).toBe(result.mergeCommitSha);
    expect(finalFm.mergedAt).toBe('2026-04-23T16:00:00.000Z');
    // branchName kept as historical record.
    expect(finalFm.branchName).toBe('feat/add-dark-mode');
  });

  it('mergePlan refuses to run when the working tree is dirty', async () => {
    await createBranchForPlan({
      repoRoot: repo,
      planAbsPath: planAbs,
      branchName: 'feat/dirty',
      mode: 'inline',
      baseBranch: 'main',
      now: new Date(),
    });
    writeFileSync(join(repo, 'uncommitted.txt'), 'dirty');

    await expect(mergePlan({
      repoRoot: repo,
      planAbsPath: planAbs,
      baseBranch: 'main',
      strategy: 'squash',
      subject: 'feat: dirty',
      body: '',
      deleteBranchAfter: false,
      deleteWorktreeAfter: false,
      now: new Date(),
    })).rejects.toThrow(/working tree.*dirty/i);
  });
});
```

- [ ] **Step 2: Implement `plan-git-flow.ts`**

`apps/electron/src/main/git/plan-git-flow.ts`:

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { PlanFrontmatter, PlanState } from '@craft-agent/shared/plans';
import {
  markInProgress,
  markMerged,
} from '@craft-agent/shared/plans';
import { parsePlanFile, renderPlanFile } from '@craft-agent/shared/plans/node';
import {
  checkoutBranch,
  commit,
  deleteBranch,
  listBranches,
  mergeAbort,
  mergeFastForward,
  mergeSquash,
  revParse,
  statusPorcelain,
  worktreeAdd,
  worktreeRemove,
  GitCommandError,
} from './git-commands.ts';

export type BranchMode = 'worktree' | 'inline';
export type MergeStrategy = 'squash' | 'fast-forward';

export interface CreateBranchInput {
  repoRoot: string;
  planAbsPath: string;
  branchName: string;
  mode: BranchMode;
  baseBranch: string;
  now: Date;
}

export interface CreateBranchResult {
  branchName: string;
  worktreePath: string | null;
}

function branchDirName(branch: string): string {
  return branch.replace(/\//g, '-');
}

function readPlan(absPath: string): { frontmatter: PlanFrontmatter; body: string; extras: Record<string, unknown> } {
  return parsePlanFile(readFileSync(absPath, 'utf-8'));
}

function writePlan(absPath: string, fm: PlanFrontmatter, body: string, extras: Record<string, unknown>): void {
  writeFileSync(absPath, renderPlanFile(fm, body, extras));
}

export async function createBranchForPlan(input: CreateBranchInput): Promise<CreateBranchResult> {
  const { repoRoot, planAbsPath, branchName, mode, baseBranch, now } = input;

  const { frontmatter, body, extras } = readPlan(planAbsPath);

  if (frontmatter.state !== 'accepted') {
    throw new Error(`Cannot create branch: plan is in state '${frontmatter.state}', not 'accepted'`);
  }

  const existing = await listBranches(repoRoot);
  if (existing.map((b) => b.toLowerCase()).includes(branchName.toLowerCase())) {
    throw new Error(`Branch '${branchName}' already exists. Pick a different name.`);
  }

  let worktreePath: string | null = null;

  if (mode === 'worktree') {
    worktreePath = join(repoRoot, '.worktrees', branchDirName(branchName));
    await worktreeAdd(repoRoot, {
      branch: branchName,
      path: worktreePath,
      createBranch: true,
      from: baseBranch,
    });
  } else {
    await checkoutBranch(repoRoot, branchName, { create: true, from: baseBranch });
  }

  const nextFm = markInProgress(frontmatter, { branchName, worktreePath, now });
  writePlan(planAbsPath, nextFm, body, extras);

  return { branchName, worktreePath };
}

export interface MergePlanInput {
  repoRoot: string;
  planAbsPath: string;
  baseBranch: string;
  strategy: MergeStrategy;
  subject: string;
  body: string;
  deleteBranchAfter: boolean;
  deleteWorktreeAfter: boolean;
  now: Date;
}

export interface MergePlanResult {
  mergeCommitSha: string;
  cleanupWarnings: string[];
}

export async function mergePlan(input: MergePlanInput): Promise<MergePlanResult> {
  const { repoRoot, planAbsPath, baseBranch, strategy, subject, body, deleteBranchAfter, deleteWorktreeAfter, now } = input;

  const { frontmatter, body: planBody, extras } = readPlan(planAbsPath);
  if (frontmatter.state !== 'validated') {
    throw new Error(`Cannot merge: plan is in state '${frontmatter.state}', expected 'validated'`);
  }
  if (!frontmatter.branchName) {
    throw new Error('Cannot merge: plan has no branchName');
  }

  // Preflight: working tree must be clean on the SOURCE branch.
  const sourceCwd = frontmatter.worktreePath ?? repoRoot;
  const dirty = await statusPorcelain(sourceCwd);
  if (dirty.length > 0) {
    throw new Error(
      `Cannot merge: working tree is dirty in ${sourceCwd}. Commit or stash first.`,
    );
  }

  // Switch main working tree to base branch, run the merge.
  await checkoutBranch(repoRoot, baseBranch);

  try {
    if (strategy === 'squash') {
      await mergeSquash(repoRoot, frontmatter.branchName);
      await commit(repoRoot, { subject, body });
    } else {
      await mergeFastForward(repoRoot, frontmatter.branchName);
    }
  } catch (err) {
    // Try to leave the tree in a clean state on conflict.
    try { await mergeAbort(repoRoot); } catch { /* ignore */ }
    throw err;
  }

  const mergeCommitSha = await revParse(repoRoot, 'HEAD');
  const cleanupWarnings: string[] = [];

  if (deleteWorktreeAfter && frontmatter.worktreePath) {
    try {
      await worktreeRemove(repoRoot, frontmatter.worktreePath);
    } catch (err) {
      cleanupWarnings.push(`Failed to remove worktree ${frontmatter.worktreePath}: ${(err as GitCommandError).message}`);
    }
  }

  if (deleteBranchAfter) {
    try {
      await deleteBranch(repoRoot, frontmatter.branchName, false);
    } catch (err) {
      // For a squash merge, the feature branch's tip isn't actually in main's history,
      // so `-d` refuses. Retry with force; the merge succeeded so this is safe.
      try {
        await deleteBranch(repoRoot, frontmatter.branchName, true);
      } catch (err2) {
        cleanupWarnings.push(`Failed to delete branch ${frontmatter.branchName}: ${(err2 as GitCommandError).message}`);
      }
    }
  }

  const nextFm = markMerged(frontmatter, { mergeCommitSha, now });
  writePlan(planAbsPath, nextFm, planBody, extras);

  return { mergeCommitSha, cleanupWarnings };
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test apps/electron/src/main/git/plan-git-flow.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/main/git/plan-git-flow.ts apps/electron/src/main/git/plan-git-flow.test.ts
git commit -m "feat(git): plan-git-flow — branch creation, squash merge, cleanup"
```

---

### Task 13: `plan-lifecycle-ipc.ts` + preload exposure

**Files:**
- Create: `apps/electron/src/main/ipc/plan-lifecycle-ipc.ts`
- Modify: `apps/electron/src/main/index.ts`
- Modify: `apps/electron/src/preload/bootstrap.ts`
- Modify: `apps/electron/src/shared/types.ts`

**Context:** Expose the plan-git-flow operations + the pure `markValidated` transition and the changelog append over IPC. The `plans:start-validation` handler is a stub in this task — it just returns an empty draft. Wiring a real agent-generated summary is a follow-up inside the same task (Step 6 below) where we call the existing session-agent with a dedicated system prompt.

- [ ] **Step 1: Implement the IPC module**

`apps/electron/src/main/ipc/plan-lifecycle-ipc.ts`:

```typescript
import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'
import {
  markValidated,
  prependChangelogEntry,
  PlanLifecycleError,
  CHANGELOG_TEMPLATE,
} from '@craft-agent/shared/plans'
import { parsePlanFile, renderPlanFile } from '@craft-agent/shared/plans/node'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'
import {
  createBranchForPlan,
  mergePlan,
} from '../git/plan-git-flow.ts'
import type { BranchMode, MergeStrategy } from '../git/plan-git-flow.ts'

interface ResolveResult {
  rootPath: string
}

function resolveWorkspace(workspaceId: string): ResolveResult {
  const ws = getWorkspaceByNameOrId(workspaceId)
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`)
  return { rootPath: ws.rootPath }
}

function resolvePlanAbs(rootPath: string, relPath: string): string {
  const abs = join(rootPath, relPath)
  // Minimal containment check.
  if (!abs.startsWith(rootPath)) {
    throw new Error('Plan path escapes workspace root')
  }
  return abs
}

function readPlanFrontmatter(planAbs: string): { frontmatter: PlanFrontmatter; body: string; extras: Record<string, unknown> } {
  return parsePlanFile(readFileSync(planAbs, 'utf-8'))
}

function writePlanFrontmatter(planAbs: string, fm: PlanFrontmatter, body: string, extras: Record<string, unknown>): void {
  writeFileSync(planAbs, renderPlanFile(fm, body, extras))
}

export interface CreateBranchArgs {
  branchName: string
  mode: BranchMode
  baseBranch: string
}

export interface MergeArgs {
  baseBranch: string
  strategy: MergeStrategy
  subject: string
  body: string
  deleteBranchAfter: boolean
  deleteWorktreeAfter: boolean
  appendChangelog: boolean
}

export function registerPlanLifecycleIpc(): void {
  ipcMain.handle(
    'plans:create-branch',
    async (_e, workspaceId: string, planRel: string, args: CreateBranchArgs) => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const planAbs = resolvePlanAbs(rootPath, planRel)
      return createBranchForPlan({
        repoRoot: rootPath,
        planAbsPath: planAbs,
        branchName: args.branchName,
        mode: args.mode,
        baseBranch: args.baseBranch,
        now: new Date(),
      })
    },
  )

  ipcMain.handle(
    'plans:start-validation',
    async (_e, workspaceId: string, planRel: string): Promise<{ draft: string }> => {
      // v1: return an empty draft. The validation modal lets the user write the
      // summary manually. A future enhancement will invoke the session agent to
      // pre-fill the draft; tracked in spec §12.
      const { rootPath } = resolveWorkspace(workspaceId)
      resolvePlanAbs(rootPath, planRel) // containment check; throws on escape
      return { draft: '' }
    },
  )

  ipcMain.handle(
    'plans:mark-validated',
    async (_e, workspaceId: string, planRel: string, summary: string) => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const planAbs = resolvePlanAbs(rootPath, planRel)
      const { frontmatter, body, extras } = readPlanFrontmatter(planAbs)
      let next: PlanFrontmatter
      try {
        next = markValidated(frontmatter, { validationSummary: summary, now: new Date() })
      } catch (err) {
        if (err instanceof PlanLifecycleError) throw new Error(err.message)
        throw err
      }
      writePlanFrontmatter(planAbs, next, body, extras)
      return { ok: true as const }
    },
  )

  ipcMain.handle(
    'plans:merge',
    async (_e, workspaceId: string, planRel: string, args: MergeArgs) => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const planAbs = resolvePlanAbs(rootPath, planRel)

      const result = await mergePlan({
        repoRoot: rootPath,
        planAbsPath: planAbs,
        baseBranch: args.baseBranch,
        strategy: args.strategy,
        subject: args.subject,
        body: args.body,
        deleteBranchAfter: args.deleteBranchAfter,
        deleteWorktreeAfter: args.deleteWorktreeAfter,
        now: new Date(),
      })

      if (args.appendChangelog) {
        const { frontmatter } = readPlanFrontmatter(planAbs)
        const changelogAbs = join(rootPath, 'CHANGELOG.md')
        const existing = existsSync(changelogAbs) ? readFileSync(changelogAbs, 'utf-8') : CHANGELOG_TEMPLATE
        const next = prependChangelogEntry(existing, {
          type: frontmatter.type,
          title: frontmatter.title,
          sha: result.mergeCommitSha,
        })
        writeFileSync(changelogAbs, next)
      }

      return result
    },
  )
}
```

- [ ] **Step 2: Register the IPC in `apps/electron/src/main/index.ts`**

Find the imports block near line 76:
```typescript
import { registerIssuesIpc } from './ipc/issues-ipc'
import { registerPlansIpc } from './ipc/plans-ipc'
```

Add:
```typescript
import { registerPlanLifecycleIpc } from './ipc/plan-lifecycle-ipc'
```

Find the registration block near line 685:
```typescript
      registerIssuesIpc()
      registerPlansIpc()
```

Add:
```typescript
      registerPlanLifecycleIpc()
```

- [ ] **Step 3: Expose the IPC via preload**

In `apps/electron/src/preload/bootstrap.ts`, after the existing `plans:` block (~line 444), append:

```typescript
// Plan lifecycle IPC (this sub-project — branch, validate, merge, changelog)
;(api as ElectronAPI).plansLifecycle = {
  createBranch: (workspaceId: string, planRel: string, args: { branchName: string; mode: 'worktree' | 'inline'; baseBranch: string }) =>
    ipcRenderer.invoke('plans:create-branch', workspaceId, planRel, args),
  startValidation: (workspaceId: string, planRel: string) =>
    ipcRenderer.invoke('plans:start-validation', workspaceId, planRel),
  markValidated: (workspaceId: string, planRel: string, summary: string) =>
    ipcRenderer.invoke('plans:mark-validated', workspaceId, planRel, summary),
  merge: (workspaceId: string, planRel: string, args: {
    baseBranch: string
    strategy: 'squash' | 'fast-forward'
    subject: string
    body: string
    deleteBranchAfter: boolean
    deleteWorktreeAfter: boolean
    appendChangelog: boolean
  }) => ipcRenderer.invoke('plans:merge', workspaceId, planRel, args),
}
```

- [ ] **Step 4: Add `plansLifecycle` to `ElectronAPI`**

In `apps/electron/src/shared/types.ts`, after the existing `plans: { … }` block, insert:

```typescript
  // Plan lifecycle (this sub-project)
  plansLifecycle: {
    createBranch(
      workspaceId: string,
      planRel: string,
      args: { branchName: string; mode: 'worktree' | 'inline'; baseBranch: string },
    ): Promise<{ branchName: string; worktreePath: string | null }>
    startValidation(workspaceId: string, planRel: string): Promise<{ draft: string }>
    markValidated(workspaceId: string, planRel: string, summary: string): Promise<{ ok: true }>
    merge(
      workspaceId: string,
      planRel: string,
      args: {
        baseBranch: string
        strategy: 'squash' | 'fast-forward'
        subject: string
        body: string
        deleteBranchAfter: boolean
        deleteWorktreeAfter: boolean
        appendChangelog: boolean
      },
    ): Promise<{ mergeCommitSha: string; cleanupWarnings: string[] }>
  }
```

- [ ] **Step 5: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run tsc --noEmit -p apps/electron`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/main/ipc/plan-lifecycle-ipc.ts apps/electron/src/main/index.ts apps/electron/src/preload/bootstrap.ts apps/electron/src/shared/types.ts
git commit -m "feat(plans): IPC for create-branch, validate, merge, changelog"
```

---

### Task 14: `PlanStateBadge` + `BranchCreationDialog`

**Files:**
- Create: `apps/electron/src/renderer/components/plans/PlanStateBadge.tsx`
- Create: `apps/electron/src/renderer/components/plans/BranchCreationDialog.tsx`

**Context:** `PlanStateBadge` is a tiny visual component; `BranchCreationDialog` is the shared dialog opened from all three entry points. The dialog handles branch-name suggestion, mode selection, base branch, and calls `plansLifecycle.createBranch`.

- [ ] **Step 1: Implement `PlanStateBadge.tsx`**

```tsx
import { cn } from '@/lib/utils'
import type { PlanState } from '@craft-agent/shared/plans'

const STATE_STYLES: Record<PlanState, { label: string; className: string }> = {
  accepted: { label: 'Accepted', className: 'bg-muted text-muted-foreground' },
  'in-progress': { label: 'In progress', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  validated: { label: 'Validated', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  merged: { label: 'Merged', className: 'bg-green-500/15 text-green-700 dark:text-green-400' },
}

export function PlanStateBadge({ state, className }: { state: PlanState; className?: string }) {
  const { label, className: stateClass } = STATE_STYLES[state]
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', stateClass, className)}>
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Implement `BranchCreationDialog.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { resolveBranchName, type PlanFrontmatter } from '@craft-agent/shared/plans'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  planRel: string
  plan: PlanFrontmatter
  existingBranches: string[]
  defaultBranchMode: 'worktree' | 'inline'
  defaultBaseBranch: string
  onCreated: (result: { branchName: string; worktreePath: string | null }) => void
}

export function BranchCreationDialog({
  open,
  onOpenChange,
  workspaceId,
  planRel,
  plan,
  existingBranches,
  defaultBranchMode,
  defaultBaseBranch,
  onCreated,
}: Props) {
  const defaultName = useMemo(
    () => resolveBranchName({ type: plan.type, title: plan.title }, existingBranches),
    [plan.type, plan.title, existingBranches],
  )

  const [branchName, setBranchName] = useState(defaultName)
  const [mode, setMode] = useState<'worktree' | 'inline'>(defaultBranchMode)
  const [baseBranch, setBaseBranch] = useState(defaultBaseBranch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setBranchName(defaultName)
      setMode(defaultBranchMode)
      setBaseBranch(defaultBaseBranch)
      setError(null)
    }
  }, [open, defaultName, defaultBranchMode, defaultBaseBranch])

  const collides = existingBranches.map((b) => b.toLowerCase()).includes(branchName.toLowerCase())

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.plansLifecycle.createBranch(
        workspaceId,
        planRel,
        { branchName, mode, baseBranch },
      )
      onCreated(result)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message ?? 'Branch creation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create branch for plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              disabled={busy}
            />
            {collides && (
              <p className="text-xs text-destructive">A branch with this name already exists locally.</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'worktree' | 'inline')}>
              <div className="flex items-start gap-2">
                <RadioGroupItem id="mode-worktree" value="worktree" />
                <div>
                  <Label htmlFor="mode-worktree" className="font-medium">Worktree (default)</Label>
                  <p className="text-xs text-muted-foreground">
                    Isolated checkout at <code>.worktrees/{branchName.replace(/\//g, '-')}/</code>. Your current
                    working tree keeps its state.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem id="mode-inline" value="inline" />
                <div>
                  <Label htmlFor="mode-inline" className="font-medium">Inline</Label>
                  <p className="text-xs text-muted-foreground">
                    Check out in the main working tree. Faster but your current tree switches branches.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label htmlFor="base-branch">Base branch</Label>
            <Input
              id="base-branch"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || collides || branchName.trim().length === 0}>
            {busy ? 'Creating…' : 'Create & switch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run tsc --noEmit -p apps/electron`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/renderer/components/plans/PlanStateBadge.tsx apps/electron/src/renderer/components/plans/BranchCreationDialog.tsx
git commit -m "feat(plans/ui): PlanStateBadge + BranchCreationDialog"
```

---

### Task 15: `ValidationModal`

**Files:**
- Create: `apps/electron/src/renderer/components/plans/ValidationModal.tsx`

**Context:** Modal for the "Validate" step. Opens with an empty draft textarea (per Task 13 Step 1 stub), a 4-item optional checklist, and "Approve & continue" button. On confirm, calls `plansLifecycle.markValidated`. The checklist state is cosmetic (user sanity check) — it is NOT persisted in v1.

- [ ] **Step 1: Implement the modal**

```tsx
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  planRel: string
  onValidated: (summary: string) => void
}

const CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: 'tests', label: 'Tests pass locally' },
  { id: 'smoke', label: 'Manual smoke test done' },
  { id: 'docs', label: 'Docs updated if applicable' },
  { id: 'scope', label: 'No unrelated changes' },
]

export function ValidationModal({ open, onOpenChange, workspaceId, planRel, onValidated }: Props) {
  const [summary, setSummary] = useState('')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setChecks({})
    setBusy(true)
    void (async () => {
      try {
        const { draft } = await window.electronAPI.plansLifecycle.startValidation(workspaceId, planRel)
        setSummary(draft)
      } catch (err) {
        setError((err as Error).message)
        setSummary('')
      } finally {
        setBusy(false)
      }
    })()
  }, [open, workspaceId, planRel])

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await window.electronAPI.plansLifecycle.markValidated(workspaceId, planRel, summary)
      onValidated(summary)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Validate plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="validation-summary">Summary</Label>
            <Textarea
              id="validation-summary"
              rows={8}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What changed, what was verified. This text becomes the merge commit body + changelog entry."
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label>Sanity check</Label>
            <div className="space-y-1">
              {CHECKLIST_ITEMS.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!checks[item.id]}
                    onCheckedChange={(v) => setChecks((c) => ({ ...c, [item.id]: !!v }))}
                    disabled={busy}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || summary.trim().length === 0}>
            {busy ? 'Saving…' : 'Approve & continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run tsc --noEmit -p apps/electron`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/renderer/components/plans/ValidationModal.tsx
git commit -m "feat(plans/ui): ValidationModal with checklist + markValidated wiring"
```

---

### Task 16: `MergeConfirmationModal`

**Files:**
- Create: `apps/electron/src/renderer/components/plans/MergeConfirmationModal.tsx`

**Context:** Final gate before we touch `main`. Pre-fills commit subject + body from the plan, offers Squash/FF radio, delete-branch/delete-worktree/append-changelog checkboxes, and calls `plansLifecycle.merge`.

- [ ] **Step 1: Implement the modal**

```tsx
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  planRel: string
  plan: PlanFrontmatter
  defaultBaseBranch: string
  defaultStrategy: 'squash' | 'fast-forward'
  defaultAppendChangelog: boolean
  onMerged: (result: { mergeCommitSha: string; cleanupWarnings: string[] }) => void
}

export function MergeConfirmationModal({
  open,
  onOpenChange,
  workspaceId,
  planRel,
  plan,
  defaultBaseBranch,
  defaultStrategy,
  defaultAppendChangelog,
  onMerged,
}: Props) {
  const [baseBranch, setBaseBranch] = useState(defaultBaseBranch)
  const [strategy, setStrategy] = useState<'squash' | 'fast-forward'>(defaultStrategy)
  const [subject, setSubject] = useState(`${plan.type}: ${plan.title}`)
  const [body, setBody] = useState(
    `${plan.validationSummary ?? ''}\n\nPlan: ${planRel}\nIssue: ${plan.issueId ?? 'none'}`.trim(),
  )
  const [deleteBranchAfter, setDeleteBranchAfter] = useState(true)
  const [deleteWorktreeAfter, setDeleteWorktreeAfter] = useState(plan.worktreePath !== null)
  const [appendChangelog, setAppendChangelog] = useState(defaultAppendChangelog)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBaseBranch(defaultBaseBranch)
    setStrategy(defaultStrategy)
    setSubject(`${plan.type}: ${plan.title}`)
    setBody(`${plan.validationSummary ?? ''}\n\nPlan: ${planRel}\nIssue: ${plan.issueId ?? 'none'}`.trim())
    setDeleteBranchAfter(true)
    setDeleteWorktreeAfter(plan.worktreePath !== null)
    setAppendChangelog(defaultAppendChangelog)
    setError(null)
  }, [open, plan, planRel, defaultBaseBranch, defaultStrategy, defaultAppendChangelog])

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.plansLifecycle.merge(workspaceId, planRel, {
        baseBranch,
        strategy,
        subject,
        body,
        deleteBranchAfter,
        deleteWorktreeAfter,
        appendChangelog,
      })
      onMerged(result)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge plan to {baseBranch}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="merge-base">Target branch</Label>
            <Input id="merge-base" value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} disabled={busy} />
          </div>

          <div className="space-y-1">
            <Label>Strategy</Label>
            <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as 'squash' | 'fast-forward')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="strategy-squash" value="squash" />
                <Label htmlFor="strategy-squash">Squash (one commit on {baseBranch})</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="strategy-ff" value="fast-forward" />
                <Label htmlFor="strategy-ff">Fast-forward</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label htmlFor="merge-subject">Commit subject</Label>
            <Input id="merge-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="merge-body">Commit body</Label>
            <Textarea id="merge-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={deleteBranchAfter} onCheckedChange={(v) => setDeleteBranchAfter(!!v)} disabled={busy} />
              Delete branch after merge
            </label>
            {plan.worktreePath !== null && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={deleteWorktreeAfter} onCheckedChange={(v) => setDeleteWorktreeAfter(!!v)} disabled={busy} />
                Delete worktree after merge
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={appendChangelog} onCheckedChange={(v) => setAppendChangelog(!!v)} disabled={busy} />
              Append to CHANGELOG.md
            </label>
          </div>

          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || subject.trim().length === 0}>
            {busy ? 'Merging…' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run tsc --noEmit -p apps/electron`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/renderer/components/plans/MergeConfirmationModal.tsx
git commit -m "feat(plans/ui): MergeConfirmationModal with squash/FF + changelog toggle"
```

---

### Task 17: Integrate lifecycle actions into `IssueDetailModal`

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx`

**Context:** Extend the existing "Linked plans" section to show a state badge and action buttons (Create branch / Validate / Merge) per plan, based on the plan's current `state`. Each action opens the corresponding dialog. After a successful action, the modal refreshes the linked plan so the badge + buttons reflect the new state.

- [ ] **Step 1: Read the current "Linked plans" block**

Open `apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx` and find the block starting at line 229 (`{issue.linkedPlanPaths.length > 0 && (`). Note its structure: a `<ul>` of `<li>` rows, each rendering a single plan path.

- [ ] **Step 2: Fetch full frontmatter per plan**

At the top of the `IssueDetailModal` component body (where other hooks are), add:

```tsx
const [planMeta, setPlanMeta] = useState<Record<string, import('@craft-agent/shared/plans').PlanFrontmatter>>({})
const [existingBranches, setExistingBranches] = useState<string[]>([])
const [branchDialogPlan, setBranchDialogPlan] = useState<string | null>(null)
const [validateDialogPlan, setValidateDialogPlan] = useState<string | null>(null)
const [mergeDialogPlan, setMergeDialogPlan] = useState<string | null>(null)

const refreshPlans = useCallback(async () => {
  const next: Record<string, import('@craft-agent/shared/plans').PlanFrontmatter> = {}
  for (const path of issue.linkedPlanPaths) {
    const res = await window.electronAPI.plans.read(workspaceId, path)
    if (res) next[path] = res.frontmatter
  }
  setPlanMeta(next)
}, [issue.linkedPlanPaths, workspaceId])

useEffect(() => { void refreshPlans() }, [refreshPlans])
```

Add the imports at the top of the file:

```tsx
import { useCallback, useEffect } from 'react'
import { PlanStateBadge } from '@/components/plans/PlanStateBadge'
import { BranchCreationDialog } from '@/components/plans/BranchCreationDialog'
import { ValidationModal } from '@/components/plans/ValidationModal'
import { MergeConfirmationModal } from '@/components/plans/MergeConfirmationModal'
```

(If `useState` is already imported, leave as-is.)

- [ ] **Step 3: Replace the linked-plans row rendering**

Replace the existing `{issue.linkedPlanPaths.map((p) => (...))}` block with:

```tsx
{issue.linkedPlanPaths.map((p) => {
  const fm = planMeta[p]
  return (
    <li key={p} className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="underline text-left hover:text-primary"
        onClick={() => onOpenPlan(p)}
      >
        {p.split('/').pop()}
      </button>
      {fm && <PlanStateBadge state={fm.state} />}
      {fm && fm.state === 'accepted' && (
        <Button size="sm" variant="outline" onClick={() => setBranchDialogPlan(p)}>
          Create branch
        </Button>
      )}
      {fm && fm.state === 'in-progress' && (
        <>
          {fm.branchName && <code className="text-xs bg-muted px-1 rounded">{fm.branchName}</code>}
          <Button size="sm" variant="outline" onClick={() => setValidateDialogPlan(p)}>
            Validate
          </Button>
        </>
      )}
      {fm && fm.state === 'validated' && (
        <Button size="sm" variant="default" onClick={() => setMergeDialogPlan(p)}>
          Merge
        </Button>
      )}
      {fm && fm.state === 'merged' && fm.mergeCommitSha && (
        <code className="text-xs bg-muted px-1 rounded">{fm.mergeCommitSha}</code>
      )}
    </li>
  )
})}
```

- [ ] **Step 4: Fetch existing branches for the dialog**

Just before the dialog mounts (or in the same effect that runs `refreshPlans`), load the branch list via a small helper. Since no IPC for "list branches" exists, add one in Task 13's IPC module and here in preload. **However, to keep this task self-contained**, use a minimal approach: reuse `git branch --list` output from a new IPC. Add to `plan-lifecycle-ipc.ts` (same task you did earlier):

Add to `apps/electron/src/main/ipc/plan-lifecycle-ipc.ts`:

```typescript
import { listBranches } from '../git/git-commands.ts'

// ... inside registerPlanLifecycleIpc(), after the existing handlers:
  ipcMain.handle('plans:list-branches', async (_e, workspaceId: string): Promise<string[]> => {
    const { rootPath } = resolveWorkspace(workspaceId)
    return listBranches(rootPath)
  })
```

Expose on preload (`apps/electron/src/preload/bootstrap.ts`), inside the `plansLifecycle` block:

```typescript
  listBranches: (workspaceId: string) => ipcRenderer.invoke('plans:list-branches', workspaceId),
```

Extend the ElectronAPI `plansLifecycle` type in `apps/electron/src/shared/types.ts`:

```typescript
    listBranches(workspaceId: string): Promise<string[]>
```

Then in `IssueDetailModal`:

```tsx
useEffect(() => {
  void (async () => {
    try {
      setExistingBranches(await window.electronAPI.plansLifecycle.listBranches(workspaceId))
    } catch {
      setExistingBranches([])
    }
  })()
}, [workspaceId])
```

- [ ] **Step 5: Mount the three dialogs at the bottom of the modal**

Above the closing `</DialogContent>` of `IssueDetailModal`, add:

```tsx
{branchDialogPlan && planMeta[branchDialogPlan] && (
  <BranchCreationDialog
    open
    onOpenChange={(o) => { if (!o) setBranchDialogPlan(null) }}
    workspaceId={workspaceId}
    planRel={branchDialogPlan}
    plan={planMeta[branchDialogPlan]}
    existingBranches={existingBranches}
    defaultBranchMode="worktree"
    defaultBaseBranch="main"
    onCreated={() => { void refreshPlans() }}
  />
)}
{validateDialogPlan && (
  <ValidationModal
    open
    onOpenChange={(o) => { if (!o) setValidateDialogPlan(null) }}
    workspaceId={workspaceId}
    planRel={validateDialogPlan}
    onValidated={() => { void refreshPlans() }}
  />
)}
{mergeDialogPlan && planMeta[mergeDialogPlan] && (
  <MergeConfirmationModal
    open
    onOpenChange={(o) => { if (!o) setMergeDialogPlan(null) }}
    workspaceId={workspaceId}
    planRel={mergeDialogPlan}
    plan={planMeta[mergeDialogPlan]}
    defaultBaseBranch="main"
    defaultStrategy="squash"
    defaultAppendChangelog={true}
    onMerged={() => { void refreshPlans() }}
  />
)}
```

Note: `defaultBranchMode`, `defaultBaseBranch`, `defaultStrategy`, `defaultAppendChangelog` are hard-coded here. Reading them from workspace config is deferred — the renderer doesn't currently have a typed workspace-defaults reader exposed. Track as follow-up.

- [ ] **Step 6: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run tsc --noEmit -p apps/electron`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx apps/electron/src/main/ipc/plan-lifecycle-ipc.ts apps/electron/src/preload/bootstrap.ts apps/electron/src/shared/types.ts
git commit -m "feat(plans): lifecycle actions on IssueDetailModal linked plans"
```

---

### Task 18: Accept-Plan banner (Entry Point A)

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/AcceptPlanBanner.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx`

**Context:** After Accept-Plan fires, `FreeFormInput` runs `copyForward` and gets back a workspace-relative path (variable `rel` around line 626 in FreeFormInput.tsx). Emit a `craft:plan-accepted` CustomEvent carrying `{ sessionId, workspaceRelativePath }`. A new `AcceptPlanBanner` mounted inside ChatDisplay subscribes to that event and renders a post-Accept callout for the **current session only**, with a "Create branch for this plan" button.

- [ ] **Step 1: Emit the new event from FreeFormInput**

In `apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx`, find both places where `copyForward` is called (one for accept, one for accept-with-compact, around lines 626 and 684). After each `const rel = await window.electronAPI.plans.copyForward(...)` call succeeds, add:

```typescript
          window.dispatchEvent(new CustomEvent('craft:plan-accepted', {
            detail: { sessionId, workspaceRelativePath: rel },
          }))
```

Place it inside the `try` block immediately after the `copyForward` line, before any subsequent action.

- [ ] **Step 2: Create the banner component**

`apps/electron/src/renderer/components/app-shell/AcceptPlanBanner.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'
import { Button } from '@/components/ui/button'
import { BranchCreationDialog } from '@/components/plans/BranchCreationDialog'
import { ValidationModal } from '@/components/plans/ValidationModal'
import { MergeConfirmationModal } from '@/components/plans/MergeConfirmationModal'
import { PlanStateBadge } from '@/components/plans/PlanStateBadge'

interface Props {
  sessionId: string
  workspaceId: string
}

export function AcceptPlanBanner({ sessionId, workspaceId }: Props) {
  const [planRel, setPlanRel] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanFrontmatter | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [dialog, setDialog] = useState<'branch' | 'validate' | 'merge' | null>(null)

  useEffect(() => {
    async function handler(e: Event) {
      const detail = (e as CustomEvent<{ sessionId: string; workspaceRelativePath: string }>).detail
      if (!detail || detail.sessionId !== sessionId) return
      setPlanRel(detail.workspaceRelativePath)
      const res = await window.electronAPI.plans.read(workspaceId, detail.workspaceRelativePath)
      if (res) setPlan(res.frontmatter)
      try {
        setBranches(await window.electronAPI.plansLifecycle.listBranches(workspaceId))
      } catch { setBranches([]) }
    }
    window.addEventListener('craft:plan-accepted', handler)
    return () => window.removeEventListener('craft:plan-accepted', handler)
  }, [sessionId, workspaceId])

  async function refreshPlan() {
    if (!planRel) return
    const res = await window.electronAPI.plans.read(workspaceId, planRel)
    if (res) setPlan(res.frontmatter)
  }

  if (!planRel || !plan) return null

  return (
    <div className="mx-4 my-2 rounded border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <PlanStateBadge state={plan.state} />
        <span className="text-sm font-medium">{plan.title}</span>
        <div className="ml-auto flex gap-2">
          {plan.state === 'accepted' && (
            <Button size="sm" variant="outline" onClick={() => setDialog('branch')}>Create branch</Button>
          )}
          {plan.state === 'in-progress' && (
            <Button size="sm" variant="outline" onClick={() => setDialog('validate')}>Validate</Button>
          )}
          {plan.state === 'validated' && (
            <Button size="sm" onClick={() => setDialog('merge')}>Merge</Button>
          )}
          {plan.state === 'merged' && plan.mergeCommitSha && (
            <code className="text-xs bg-muted px-1 rounded">{plan.mergeCommitSha}</code>
          )}
        </div>
      </div>

      {dialog === 'branch' && (
        <BranchCreationDialog
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          workspaceId={workspaceId}
          planRel={planRel}
          plan={plan}
          existingBranches={branches}
          defaultBranchMode="worktree"
          defaultBaseBranch="main"
          onCreated={() => { void refreshPlan() }}
        />
      )}
      {dialog === 'validate' && (
        <ValidationModal
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          workspaceId={workspaceId}
          planRel={planRel}
          onValidated={() => { void refreshPlan() }}
        />
      )}
      {dialog === 'merge' && (
        <MergeConfirmationModal
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          workspaceId={workspaceId}
          planRel={planRel}
          plan={plan}
          defaultBaseBranch="main"
          defaultStrategy="squash"
          defaultAppendChangelog={true}
          onMerged={() => { void refreshPlan() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Mount the banner in ChatDisplay**

Open `apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx`. Identify where the chat message list is rendered (search for the scroll container or `session.messages`). Above (or just below) the messages list, mount:

```tsx
{session?.id && workspaceId && (
  <AcceptPlanBanner sessionId={session.id} workspaceId={workspaceId} />
)}
```

Add the import at the top:

```tsx
import { AcceptPlanBanner } from './AcceptPlanBanner'
```

If `workspaceId` isn't available in the local scope of ChatDisplay, grep for how it's threaded in the parent and pull it down. Keep the banner above the input footer but below the messages so it looks like a session-scoped callout.

- [ ] **Step 4: Typecheck and smoke-test**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run tsc --noEmit -p apps/electron`
Expected: PASS.

Then run the dev app, Accept a plan, and visually verify the banner appears with "Create branch" after Accept.

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/renderer/components/app-shell/AcceptPlanBanner.tsx apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx
git commit -m "feat(plans): Accept-Plan banner with inline branch/validate/merge actions"
```

---

### Task 19: Session header chip (Entry Point C)

**Files:**
- Modify: TBD — identify during this task (see Step 1).
- Import: `apps/electron/src/renderer/components/plans/*`

**Context:** The spec defers pinning the exact session-header file to this task. Grep for where the session title is rendered in the chat chrome (not the left sidebar list — the header at the top of an open session). Mount a small chip that reuses the same three dialogs.

- [ ] **Step 1: Find the session header**

Run: `cd /Users/mauriello/Dev/rowl-v2 && grep -rln "session\\.name\\|session\\?\\.\\?name" apps/electron/src/renderer/components/app-shell | head -5`

Read each hit (typically `MainContentPanel.tsx` or `TopBar.tsx`). Identify the component that renders the currently-open session's title banner. Pin the file path for this task before proceeding.

Expected primary candidate: `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`. Verify by opening it and looking for a header element with `session.name`.

- [ ] **Step 2: Create a wrapper hook that drives the chip**

Create `apps/electron/src/renderer/hooks/useSessionPlanChip.ts`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'

export interface SessionPlanChip {
  plan: PlanFrontmatter | null
  planRel: string | null
  branches: string[]
  refresh: () => Promise<void>
}

/**
 * Loads the most-recent plan associated with `sessionId` (by matching
 * frontmatter.sessionId) and the local git branch list. Used to drive the
 * session-header chip and its dialogs.
 */
export function useSessionPlanChip(workspaceId: string | null, sessionId: string | null): SessionPlanChip {
  const [plan, setPlan] = useState<PlanFrontmatter | null>(null)
  const [planRel, setPlanRel] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])

  const refresh = useCallback(async () => {
    if (!workspaceId || !sessionId) {
      setPlan(null); setPlanRel(null); return
    }
    const list = await window.electronAPI.plans.list(workspaceId)
    const mine = list.filter((e) => e.frontmatter.sessionId === sessionId)
      .sort((a, b) => b.frontmatter.acceptedAt.localeCompare(a.frontmatter.acceptedAt))
    const latest = mine[0]
    setPlan(latest ? latest.frontmatter : null)
    setPlanRel(latest ? latest.workspaceRelativePath : null)
    try {
      setBranches(await window.electronAPI.plansLifecycle.listBranches(workspaceId))
    } catch { setBranches([]) }
  }, [workspaceId, sessionId])

  useEffect(() => { void refresh() }, [refresh])

  return { plan, planRel, branches, refresh }
}
```

- [ ] **Step 3: Render the chip in the identified session-header file**

In the file pinned at Step 1, add the import and chip JSX beside the session title. Example (paths may need adjustment to the actual file):

```tsx
import { useSessionPlanChip } from '@/hooks/useSessionPlanChip'
import { PlanStateBadge } from '@/components/plans/PlanStateBadge'
import { BranchCreationDialog } from '@/components/plans/BranchCreationDialog'
import { ValidationModal } from '@/components/plans/ValidationModal'
import { MergeConfirmationModal } from '@/components/plans/MergeConfirmationModal'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

// Inside the component that renders the session header:
const { plan, planRel, branches, refresh } = useSessionPlanChip(workspaceId, session?.id ?? null)
const [dialog, setDialog] = useState<'branch' | 'validate' | 'merge' | null>(null)
```

Beside the session title, insert:

```tsx
{plan && planRel && (
  <div className="flex items-center gap-1 text-xs">
    <PlanStateBadge state={plan.state} />
    {plan.state === 'accepted' && (
      <Button size="sm" variant="ghost" onClick={() => setDialog('branch')}>Create branch</Button>
    )}
    {plan.state === 'in-progress' && plan.branchName && (
      <>
        <code className="bg-muted px-1 rounded">{plan.branchName}</code>
        <Button size="sm" variant="ghost" onClick={() => setDialog('validate')}>Validate</Button>
      </>
    )}
    {plan.state === 'validated' && (
      <Button size="sm" onClick={() => setDialog('merge')}>Merge</Button>
    )}
  </div>
)}
{dialog === 'branch' && plan && planRel && (
  <BranchCreationDialog
    open
    onOpenChange={(o) => { if (!o) setDialog(null) }}
    workspaceId={workspaceId!}
    planRel={planRel}
    plan={plan}
    existingBranches={branches}
    defaultBranchMode="worktree"
    defaultBaseBranch="main"
    onCreated={() => { void refresh() }}
  />
)}
{dialog === 'validate' && planRel && (
  <ValidationModal
    open
    onOpenChange={(o) => { if (!o) setDialog(null) }}
    workspaceId={workspaceId!}
    planRel={planRel}
    onValidated={() => { void refresh() }}
  />
)}
{dialog === 'merge' && plan && planRel && (
  <MergeConfirmationModal
    open
    onOpenChange={(o) => { if (!o) setDialog(null) }}
    workspaceId={workspaceId!}
    planRel={planRel}
    plan={plan}
    defaultBaseBranch="main"
    defaultStrategy="squash"
    defaultAppendChangelog={true}
    onMerged={() => { void refresh() }}
  />
)}
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run tsc --noEmit -p apps/electron`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add apps/electron/src/renderer/hooks/useSessionPlanChip.ts apps/electron/src/renderer/components/app-shell/
git commit -m "feat(plans): session-header chip — branch/validate/merge from anywhere"
```

---

### Task 20: Manual E2E walkthrough

**Files:** none — this is a manual verification task with a documented transcript.

**Context:** Spec §11.3 defers manual E2E to this plan. Run through each entry point end-to-end, record the result for each checkpoint, and log any findings as follow-up issues.

- [ ] **Step 1: Fresh workspace setup**

```bash
cd /Users/mauriello/Dev/rowl-v2
git status # ensure clean
# Launch the app in dev.
```

In the app, open an existing workspace that has at least one issue. If none, create one titled "Test dark mode".

- [ ] **Step 2: Walk Entry Point A (Accept-Plan banner)**

1. Start a session from the issue.
2. Get the agent to submit a plan (force plan mode if needed).
3. Click Accept Plan.
4. Verify: the Accept-Plan banner appears above the input. Shows `accepted` badge, plan title, "Create branch" button.
5. Click "Create branch". Dialog opens. Default mode = worktree. Default name = `feat/<slug>`. Click **Create & switch**.
6. Verify: dialog closes, banner flips to `in-progress` with the branch name. Inspect the filesystem: `.worktrees/<branch-dirname>/` exists. Plan file frontmatter now has `state: in-progress`.
7. In the worktree, commit a dummy change (`echo x > dummy.txt && git add dummy.txt && git commit -m "impl"`).
8. Click "Validate" on the banner. Validation modal opens with an empty draft (stub behavior). Write a short summary (e.g. "- Added dummy.txt"). Click Approve & continue.
9. Verify: banner flips to `validated`. Plan frontmatter now has `state: validated`, `validationSummary`, `validatedAt`.
10. Click "Merge". Merge modal opens. Strategy = squash. Subject = `feat: <title>`. Click Merge.
11. Verify: banner flips to `merged` with SHA chip. `CHANGELOG.md` exists at repo root with an `## [Unreleased] ### Added` block containing your title + SHA. The `feat/<slug>` branch is gone. `.worktrees/<dirname>/` is gone.

- [ ] **Step 3: Walk Entry Point B (Issue modal)**

1. Open the issue you just completed.
2. Verify: Linked Plans row shows the merged badge + SHA chip.
3. Open a different accepted plan (create another session + accept to test). The row should show a "Create branch" button. Repeat the flow.

- [ ] **Step 4: Walk Entry Point C (Session header)**

1. Open a session with an accepted plan. Verify: chip appears next to session title with "Create branch". Same behavior as Entry A.

- [ ] **Step 5: Error paths**

1. **Dirty tree merge:** create a branch, make an uncommitted edit, try Merge. Dialog should show error `working tree is dirty…`. No state change.
2. **Duplicate branch name:** in the BranchCreationDialog, type an existing name. The confirm button should disable and a collision message should show.

- [ ] **Step 6: Record findings**

Write a short markdown file `docs/superpowers/validation/2026-04-23-plan-pipeline-e2e.md` with the checkpoints above, a ✓/✗ per step, and any bugs found. Open follow-up issues for each ✗. Commit this file.

- [ ] **Step 7: Commit the walkthrough record**

```bash
cd /Users/mauriello/Dev/rowl-v2
mkdir -p docs/superpowers/validation
# write the file (see Step 6)
git add docs/superpowers/validation/2026-04-23-plan-pipeline-e2e.md
git commit -m "docs(validation): E2E walkthrough for plan-execute-merge-changelog"
```

---

## Self-Review Notes

The following spec requirements are covered:

- §4 Storage conventions → Task 1 (gitignore), Task 9 (`.craft-agent/plans` default)
- §5.1 Extended PlanFrontmatter → Task 2 (types), Task 4 (parse/render), Task 8 (copyPlanForward)
- §5.2 Workspace config additions → Task 9
- §5.3 Branch naming → Task 3
- §6.1 BranchCreationDialog → Task 14
- §6.2 Entry points A/B/C → Tasks 17, 18, 19
- §6.3 ValidationModal → Task 15
- §6.4 MergeConfirmationModal → Task 16
- §7 Merge mechanics → Task 12 (`plan-git-flow.mergePlan`)
- §8 Changelog generation → Task 6 (helpers), Task 13 (wiring)
- §9.1 All new files → Tasks 2–7, 11–16, 18
- §9.2 Modified files → Tasks 1, 7, 8, 9, 10, 17, 18, 19
- §9.3 IPC surface → Task 13
- §10 Error handling → Task 12 (dirty tree, conflict-abort) + dialog error banners (Tasks 14–16) + Task 17–19 UI
- §11 Testing → Tasks 3, 4, 5, 6, 8, 11, 12 (unit + integration); Task 20 (manual E2E)

The manual E2E in Task 20 includes the error paths from §10 and the three-entry-point flows.
