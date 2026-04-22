# Issue → Plan Pipeline (Kickoff + Plan Gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Rowl's Issues sidebar into a structured workflow where "Start Session" spins up a safe-mode session seeded from the issue, and Accept-Plan copies the session's plan forward to a git-trackable workspace path linked back to the issue.

**Architecture:**
- Pure helpers (slug, timestamp, file-format, first-turn-context, copy-plan-forward) land in `packages/shared/src/issues/`.
- Main-process IPC exposes `issuesApi` and `plansApi` so the renderer never touches `gray-matter` directly.
- Renderer `useIssues` hook flips from `localStorage` to IPC calls with a one-shot migration on first launch.
- UI (IssueCard, IssueDetailModal, session header chip, PlanViewerModal, Plans right-sidebar tab) hooks into the same helpers.

**Tech Stack:** TypeScript, React, Electron, bun:test, `gray-matter` (YAML frontmatter), React + Radix UI primitives.

**Spec:** `docs/superpowers/specs/2026-04-22-issue-to-plan-pipeline-design.md`

**Prerequisite:** Task 14 (Plans sidebar tab) MUST NOT start until `docs/superpowers/plans/2026-04-21-right-sidebar-chrome.md` is executed and merged. Tasks 1–13 can proceed independently.

---

## File Structure

**New files (pure helpers — shared):**
- `packages/shared/src/issues/file-format.ts` — `parseIssueFile`, `serializeIssueFile`, legacy `linkedSessionId` migration
- `packages/shared/src/issues/slug.ts` — `slugify(title)`
- `packages/shared/src/issues/timestamp.ts` — `formatTimestamp(date)` → `YYYY-MM-DD-HHMM`
- `packages/shared/src/issues/first-turn-context.ts` — `formatFirstTurnContext(issue)`
- `packages/shared/src/issues/copy-plan-forward.ts` — `copyPlanForward(...)` + `countExistingPlans`, `resolveCollision`, `prependYamlFrontmatter`
- `packages/shared/src/issues/issues-storage.ts` — workspace-facing read/write/delete ops (used by main-process IPC)

**Modified (shared):**
- `packages/shared/src/issues/types.ts` — `Issue` interface (add arrays, rename singular, mark `linkedSessionIds`/`linkedPlanPaths` required)
- `packages/shared/src/issues/index.ts` — barrel re-exports
- `packages/shared/src/protocol/dto.ts` — `CreateSessionOptions` adds `transferredSessionSummary?` and `linkedIssueId?`
- `packages/shared/src/workspaces/types.ts` — `WorkspaceConfig.defaults.planStoragePath?`

**Modified (server-core):**
- `packages/server-core/src/sessions/SessionManager.ts` — `createSession` reads new options; `ManagedSession.linkedIssueId`; plan-submitted handler exposes plan path to renderer

**New files (main process):**
- `apps/electron/src/main/ipc/issues-ipc.ts` — `issuesApi` IPC handlers (list, read, write, delete, writeAttachment)
- `apps/electron/src/main/ipc/plans-ipc.ts` — `plansApi` IPC handlers (copyForward, list, read)

**Modified (main process):**
- `apps/electron/src/main/preload.ts` — exposes `window.electronAPI.issues` and `window.electronAPI.plans`
- Wherever the IPC-handler registry lives (grep for existing `ipcMain.handle(`) — register new handlers at startup

**New files (renderer):**
- `apps/electron/src/renderer/hooks/useStartSessionFromIssue.ts` — kickoff handler (builds context → createSession → updateIssue)
- `apps/electron/src/renderer/components/app-shell/PlanViewerModal.tsx` — read-only plan renderer
- `apps/electron/src/renderer/components/app-shell/PlansPanel.tsx` — right-sidebar tab content

**Modified (renderer):**
- `apps/electron/src/renderer/hooks/useIssues.ts` — swap localStorage for IPC; add migration
- `apps/electron/src/renderer/components/app-shell/IssueCard.tsx` — primary "Start Session" CTA + badges
- `apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx` — markdown body, attachments paste/drop, linked-sessions/plans sections
- `apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx` — route kickoff through new hook (not bare `onCreateSession(title)`)
- Session header component (TBD — grep for where `session.name` is rendered in the main chat chrome) — issue chip

**Tests (bun:test, co-located):**
- `packages/shared/src/issues/file-format.test.ts`
- `packages/shared/src/issues/slug.test.ts`
- `packages/shared/src/issues/timestamp.test.ts`
- `packages/shared/src/issues/first-turn-context.test.ts`
- `packages/shared/src/issues/copy-plan-forward.test.ts`
- `packages/shared/src/issues/issues-storage.test.ts`

---

## Task-by-Task

### Task 1: Issue type changes + file-format parse/serialize

**Files:**
- Modify: `packages/shared/src/issues/types.ts`
- Create: `packages/shared/src/issues/file-format.ts`
- Create: `packages/shared/src/issues/file-format.test.ts`
- Modify: `packages/shared/src/issues/index.ts`

**Context:** The existing `Issue` type has a singular `linkedSessionId?: string`. After this task, it has required `linkedSessionIds: string[]`, new required `linkedPlanPaths: string[]`, and optional `attachments?: string[]`. Issues are serialized as markdown files with YAML frontmatter (`gray-matter`). Legacy singular `linkedSessionId` must be upgraded transparently at parse time.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/issues/file-format.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import type { Issue } from './types.ts';
import { parseIssueFile, serializeIssueFile } from './file-format.ts';

const FIXTURE: Issue = {
  id: 'issue_abc123',
  title: 'Add Letta memory sync',
  description: 'Some **markdown** body.\n\nSecond paragraph.',
  status: 'in_progress',
  priority: 'medium',
  createdAt: '2026-04-22T14:30:00.000Z',
  updatedAt: '2026-04-22T15:12:00.000Z',
  linkedSessionIds: ['260422-tall-basalt'],
  linkedPlanPaths: ['docs/plans/add-letta-memory-sync/plan-2026-04-22-1430.md'],
  attachments: ['issues/issue_abc123/attachments/a1b2c3d4e5f6.png'],
};

describe('parseIssueFile / serializeIssueFile', () => {
  it('round-trips all fields', () => {
    const text = serializeIssueFile(FIXTURE);
    const parsed = parseIssueFile(text);
    expect(parsed).toEqual(FIXTURE);
  });

  it('migrates legacy singular linkedSessionId to linkedSessionIds', () => {
    const legacy = `---
id: issue_legacy
title: Old issue
status: backlog
priority: low
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
linkedSessionId: old-session-id
---

body`;
    const parsed = parseIssueFile(legacy);
    expect(parsed.linkedSessionIds).toEqual(['old-session-id']);
    expect(parsed.linkedPlanPaths).toEqual([]);
    expect((parsed as unknown as { linkedSessionId?: string }).linkedSessionId).toBeUndefined();
  });

  it('defaults missing linkedPlanPaths and linkedSessionIds to []', () => {
    const minimal = `---
id: issue_mini
title: Minimal
status: backlog
priority: low
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

`;
    const parsed = parseIssueFile(minimal);
    expect(parsed.linkedSessionIds).toEqual([]);
    expect(parsed.linkedPlanPaths).toEqual([]);
    expect(parsed.attachments).toBeUndefined();
  });

  it('preserves unknown frontmatter keys on round-trip', () => {
    const withExtra = `---
id: issue_x
title: Has extra
status: backlog
priority: low
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
linkedSessionIds: []
linkedPlanPaths: []
futureField: hello
---

body`;
    const parsed = parseIssueFile(withExtra);
    const serialized = serializeIssueFile(parsed);
    expect(serialized).toContain('futureField: hello');
  });

  it('throws a typed error on malformed frontmatter', () => {
    const broken = `---
id: issue_x
title: "unterminated
---

body`;
    expect(() => parseIssueFile(broken)).toThrow(/frontmatter/i);
  });
});
```

- [ ] **Step 2: Update the `Issue` type**

Replace the contents of `packages/shared/src/issues/types.ts` (keep existing helpers like `createIssue`, `generateIssueId`, etc., but fix the `Issue` interface and any callers in this file):

```typescript
export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type IssuePriority = 'low' | 'medium' | 'high';

export interface Issue {
  id: string;
  title: string;
  description?: string;           // markdown body
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: string;              // ISO 8601
  updatedAt: string;              // ISO 8601
  linkedSessionIds: string[];     // required; [] when none
  linkedPlanPaths: string[];      // required; [] when none (workspace-relative paths)
  attachments?: string[];         // optional; workspace-relative paths under issues/{id}/attachments/
}

export function generateIssueId(): string {
  // Keep whatever crypto-based implementation already exists; if the file uses a
  // different scheme, leave it alone. This plan assumes a stable `issue_{hex}`.
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `issue_${hex}`;
}

export function createIssue(
  title: string,
  options?: Partial<Pick<Issue, 'description' | 'priority'>>,
): Omit<Issue, 'id'> {
  const now = new Date().toISOString();
  return {
    title,
    description: options?.description ?? '',
    status: 'backlog',
    priority: options?.priority ?? 'medium',
    createdAt: now,
    updatedAt: now,
    linkedSessionIds: [],
    linkedPlanPaths: [],
  };
}
```

Preserve any other exports already in `types.ts` (`ISSUE_STATUS_INFO`, `getNextStatus`, `getPreviousStatus`) exactly as-is.

- [ ] **Step 3: Implement `file-format.ts`**

`packages/shared/src/issues/file-format.ts`:

```typescript
import matter from 'gray-matter';
import type { Issue } from './types.ts';

interface LegacyIssueFrontmatter {
  id: string;
  title: string;
  description?: string;
  status: Issue['status'];
  priority: Issue['priority'];
  createdAt: string;
  updatedAt: string;
  linkedSessionId?: string;
  linkedSessionIds?: string[];
  linkedPlanPaths?: string[];
  attachments?: string[];
  [extra: string]: unknown;
}

export class IssueParseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'IssueParseError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Parse a markdown-with-frontmatter issue file into an `Issue`.
 * Migrates legacy singular `linkedSessionId` → `linkedSessionIds: [id]`.
 * Throws `IssueParseError` on malformed YAML.
 */
export function parseIssueFile(text: string): Issue {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text);
  } catch (err) {
    throw new IssueParseError('Malformed issue frontmatter', err);
  }

  const fm = parsed.data as LegacyIssueFrontmatter;

  // Legacy migration.
  const linkedSessionIds = Array.isArray(fm.linkedSessionIds)
    ? fm.linkedSessionIds
    : typeof fm.linkedSessionId === 'string' && fm.linkedSessionId.length > 0
      ? [fm.linkedSessionId]
      : [];

  const linkedPlanPaths = Array.isArray(fm.linkedPlanPaths) ? fm.linkedPlanPaths : [];
  const attachments = Array.isArray(fm.attachments) ? fm.attachments : undefined;

  const description = parsed.content.trim() === '' ? fm.description ?? '' : parsed.content.replace(/^\n+/, '').replace(/\n+$/, '');

  return {
    id: fm.id,
    title: fm.title,
    description: description || undefined,
    status: fm.status,
    priority: fm.priority,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt,
    linkedSessionIds,
    linkedPlanPaths,
    ...(attachments ? { attachments } : {}),
  };
}

/**
 * Serialize an `Issue` to markdown-with-frontmatter.
 * Body is the issue's `description`. Preserves any unknown frontmatter keys
 * that were present on the original parsed object (round-trip safety).
 */
export function serializeIssueFile(
  issue: Issue,
  extraFrontmatter?: Record<string, unknown>,
): string {
  const fm: Record<string, unknown> = {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    linkedSessionIds: issue.linkedSessionIds,
    linkedPlanPaths: issue.linkedPlanPaths,
  };
  if (issue.attachments && issue.attachments.length > 0) {
    fm.attachments = issue.attachments;
  }
  if (extraFrontmatter) {
    for (const [key, value] of Object.entries(extraFrontmatter)) {
      if (!(key in fm) && key !== 'linkedSessionId') fm[key] = value;
    }
  }

  return matter.stringify(issue.description ?? '', fm);
}
```

Note: `serializeIssueFile` takes an optional `extraFrontmatter` so callers that previously read an issue (and retained unknown keys) can pass them back on write. In practice, the main-process IPC will re-parse the current on-disk file, extract the extras via a small `parseWithExtras` helper, merge, and write — see Task 8.

- [ ] **Step 4: Re-export from the barrel**

`packages/shared/src/issues/index.ts`:

```typescript
export * from './types.ts';
export * from './file-format.ts';
```

- [ ] **Step 5: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/issues/file-format.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/issues/types.ts packages/shared/src/issues/file-format.ts \
        packages/shared/src/issues/file-format.test.ts packages/shared/src/issues/index.ts
git commit -m "feat(issues): markdown+frontmatter file format with legacy migration"
```

---

### Task 2: Slug generation

**Files:**
- Create: `packages/shared/src/issues/slug.ts`
- Create: `packages/shared/src/issues/slug.test.ts`

**Context:** Plan folder names are derived from the issue title (e.g., "Add Letta memory sync" → `add-letta-memory-sync`). Slugs must be filesystem-safe, handle unicode, truncate long titles, and provide a stable way to deduplicate when two titles produce the same slug.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/issues/slug.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { slugify } from './slug.ts';

describe('slugify', () => {
  it('lowercases and joins ASCII words with dashes', () => {
    expect(slugify('Add Letta memory sync')).toBe('add-letta-memory-sync');
  });

  it('strips punctuation', () => {
    expect(slugify("Fix user's login (bug!)")).toBe('fix-users-login-bug');
  });

  it('collapses multiple spaces and dashes', () => {
    expect(slugify('hello   world --  foo')).toBe('hello-world-foo');
  });

  it('transliterates common unicode to ASCII-ish forms', () => {
    expect(slugify('Déjà vu café')).toBe('deja-vu-cafe');
  });

  it('falls back to "untitled" when input is empty or all-punctuation', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
  });

  it('truncates to 60 chars without cutting words mid-token when possible', () => {
    const long = 'a '.repeat(100).trim(); // ~200 chars of "a a a a ..."
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('removes leading and trailing dashes', () => {
    expect(slugify('---foo---')).toBe('foo');
  });
});
```

- [ ] **Step 2: Implement `slug.ts`**

`packages/shared/src/issues/slug.ts`:

```typescript
const MAX_SLUG_LEN = 60;

/**
 * Convert an arbitrary title into a filesystem-safe slug.
 * - NFD-normalize then strip combining marks (handles accented Latin).
 * - Lowercase.
 * - Replace anything not [a-z0-9] with a dash.
 * - Collapse runs of dashes, trim edges.
 * - Truncate to 60 chars on a word boundary when possible.
 * - Empty input → 'untitled'.
 */
export function slugify(input: string): string {
  const normalized = input
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (normalized.length === 0) return 'untitled';

  if (normalized.length <= MAX_SLUG_LEN) return normalized;

  // Try to truncate on a dash boundary.
  const truncated = normalized.slice(0, MAX_SLUG_LEN);
  const lastDash = truncated.lastIndexOf('-');
  if (lastDash > 0 && lastDash > MAX_SLUG_LEN - 15) {
    return truncated.slice(0, lastDash);
  }
  return truncated.replace(/-$/, '');
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/issues/slug.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 4: Re-export from barrel**

Append to `packages/shared/src/issues/index.ts`:

```typescript
export * from './slug.ts';
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/issues/slug.ts packages/shared/src/issues/slug.test.ts \
        packages/shared/src/issues/index.ts
git commit -m "feat(issues): add slugify helper for plan folder names"
```

---

### Task 3: Timestamp helper

**Files:**
- Create: `packages/shared/src/issues/timestamp.ts`
- Create: `packages/shared/src/issues/timestamp.test.ts`

**Context:** Plan files are named `plan-YYYY-MM-DD-HHMM.md`. Copy-forward and PlanViewer both need a stable timestamp formatter.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/issues/timestamp.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { formatTimestamp, parseTimestamp } from './timestamp.ts';

describe('formatTimestamp', () => {
  it('formats a date as YYYY-MM-DD-HHMM in UTC', () => {
    const d = new Date('2026-04-22T14:30:45.000Z');
    expect(formatTimestamp(d, 'UTC')).toBe('2026-04-22-1430');
  });

  it('pads single-digit month/day/hour/minute', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(formatTimestamp(d, 'UTC')).toBe('2026-01-02-0304');
  });

  it('respects local timezone when asked', () => {
    // Deterministic UTC input; use explicit tz so the test isn't host-dependent.
    const d = new Date('2026-06-15T23:30:00.000Z');
    const utc = formatTimestamp(d, 'UTC');
    expect(utc).toBe('2026-06-15-2330');
  });
});

describe('parseTimestamp', () => {
  it('round-trips a formatted timestamp back to the same year/month/day/hour/minute', () => {
    const ts = '2026-04-22-1430';
    const parts = parseTimestamp(ts);
    expect(parts).toEqual({ year: 2026, month: 4, day: 22, hour: 14, minute: 30 });
  });

  it('returns null for malformed input', () => {
    expect(parseTimestamp('not-a-timestamp')).toBeNull();
    expect(parseTimestamp('2026-04-22')).toBeNull();
    expect(parseTimestamp('2026-04-22-14:30')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `timestamp.ts`**

`packages/shared/src/issues/timestamp.ts`:

```typescript
/**
 * Format a date as YYYY-MM-DD-HHMM. Used for plan filenames.
 * @param date
 * @param tz 'UTC' to always use UTC, undefined to use local time.
 */
export function formatTimestamp(date: Date, tz: 'UTC' | 'local' = 'local'): string {
  const get = (fn: 'getFullYear' | 'getMonth' | 'getDate' | 'getHours' | 'getMinutes') => {
    return tz === 'UTC'
      ? (date as unknown as Record<string, () => number>)[`getUTC${fn.slice(3)}`]()
      : (date as unknown as Record<string, () => number>)[fn]();
  };

  const yyyy = String(get('getFullYear')).padStart(4, '0');
  const mm = String(get('getMonth') + 1).padStart(2, '0');
  const dd = String(get('getDate')).padStart(2, '0');
  const hh = String(get('getHours')).padStart(2, '0');
  const mi = String(get('getMinutes')).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${mi}`;
}

export function parseTimestamp(ts: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/.exec(ts);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/issues/timestamp.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 4: Re-export and commit**

Append `export * from './timestamp.ts';` to `packages/shared/src/issues/index.ts`, then:

```bash
git add packages/shared/src/issues/timestamp.ts packages/shared/src/issues/timestamp.test.ts \
        packages/shared/src/issues/index.ts
git commit -m "feat(issues): add formatTimestamp for plan filenames"
```

---

### Task 4: First-turn context formatter

**Files:**
- Create: `packages/shared/src/issues/first-turn-context.ts`
- Create: `packages/shared/src/issues/first-turn-context.test.ts`

**Context:** When a session is kicked off from an issue, the issue becomes the first-turn context seeded into the agent. The format is defined in spec §3.2.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/issues/first-turn-context.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import type { Issue } from './types.ts';
import { formatFirstTurnContext } from './first-turn-context.ts';

const BASE: Issue = {
  id: 'issue_abc',
  title: 'Add Letta memory sync',
  description: 'We want to replace the in-memory store with Letta.',
  status: 'todo',
  priority: 'high',
  createdAt: '2026-04-22T14:30:00.000Z',
  updatedAt: '2026-04-22T14:30:00.000Z',
  linkedSessionIds: [],
  linkedPlanPaths: [],
};

describe('formatFirstTurnContext', () => {
  it('includes title, metadata, description, and SubmitPlan reminder', () => {
    const out = formatFirstTurnContext(BASE);
    expect(out).toContain('## Issue: Add Letta memory sync');
    expect(out).toContain('**Status:** todo');
    expect(out).toContain('**Priority:** high');
    expect(out).toContain('**ID:** issue_abc');
    expect(out).toContain('We want to replace the in-memory store with Letta.');
    expect(out).toContain('SubmitPlan');
    expect(out).toContain('safe permission mode');
  });

  it('omits the Description section when description is empty', () => {
    const out = formatFirstTurnContext({ ...BASE, description: undefined });
    expect(out).not.toContain('### Description');
  });

  it('omits the Attachments section when none', () => {
    const out = formatFirstTurnContext(BASE);
    expect(out).not.toContain('### Attachments');
  });

  it('renders image attachments as markdown image refs and non-images as links', () => {
    const out = formatFirstTurnContext({
      ...BASE,
      attachments: [
        'issues/issue_abc/attachments/a1b2c3.png',
        'issues/issue_abc/attachments/d4e5f6.pdf',
      ],
    });
    expect(out).toContain('![attachment](issues/issue_abc/attachments/a1b2c3.png)');
    expect(out).toContain('[d4e5f6.pdf](issues/issue_abc/attachments/d4e5f6.pdf)');
  });

  it('is deterministic (snapshot-style)', () => {
    const out1 = formatFirstTurnContext(BASE);
    const out2 = formatFirstTurnContext(BASE);
    expect(out1).toBe(out2);
  });
});
```

- [ ] **Step 2: Implement `first-turn-context.ts`**

`packages/shared/src/issues/first-turn-context.ts`:

```typescript
import type { Issue } from './types.ts';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);

function renderAttachment(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const basename = path.split('/').pop() ?? path;
  if (IMAGE_EXTS.has(ext)) {
    return `![attachment](${path})`;
  }
  return `[${basename}](${path})`;
}

export function formatFirstTurnContext(issue: Issue): string {
  const parts: string[] = [
    'You are being started to work on this issue.',
    '',
    `## Issue: ${issue.title}`,
    '',
    `**Status:** ${issue.status} | **Priority:** ${issue.priority} | **ID:** ${issue.id}`,
  ];

  if (issue.description && issue.description.trim().length > 0) {
    parts.push('', '### Description', '', issue.description.trim());
  }

  if (issue.attachments && issue.attachments.length > 0) {
    parts.push('', '### Attachments', '');
    for (const a of issue.attachments) parts.push(renderAttachment(a));
  }

  parts.push(
    '',
    '---',
    '',
    'You are in **safe permission mode**. Before implementing anything, you MUST call the `SubmitPlan` tool to propose a plan for this issue. The user will review and accept or refine it before execution begins.',
  );

  return parts.join('\n');
}
```

- [ ] **Step 3: Run, re-export, commit**

```bash
cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/issues/first-turn-context.test.ts
```
Expected: 5 PASS.

Append `export * from './first-turn-context.ts';` to `packages/shared/src/issues/index.ts`, then:

```bash
git add packages/shared/src/issues/first-turn-context.ts \
        packages/shared/src/issues/first-turn-context.test.ts \
        packages/shared/src/issues/index.ts
git commit -m "feat(issues): formatFirstTurnContext for session kickoff"
```

---

### Task 5: Copy-plan-forward helper

**Files:**
- Create: `packages/shared/src/issues/copy-plan-forward.ts`
- Create: `packages/shared/src/issues/copy-plan-forward.test.ts`

**Context:** When the user clicks Accept Plan in a session, the session's plan file (at `sessions/{id}/plans/*.md`) gets copied to a stable git-trackable path under `docs/plans/{slug}/plan-{ts}.md` with frontmatter linking back to issue + session. If the issue is missing, plan lands under `docs/plans/_orphaned/{sessionId}/`.

This task implements the pure helper. Integration happens in Task 12.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/issues/copy-plan-forward.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import matter from 'gray-matter';
import type { Issue } from './types.ts';
import { copyPlanForward } from './copy-plan-forward.ts';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue_abc',
    title: 'Add Letta memory sync',
    status: 'in_progress',
    priority: 'medium',
    createdAt: '2026-04-22T14:30:00.000Z',
    updatedAt: '2026-04-22T15:12:00.000Z',
    linkedSessionIds: ['sess-1'],
    linkedPlanPaths: [],
    ...overrides,
  };
}

describe('copyPlanForward', () => {
  let workspaceRoot: string;
  let sessionPlanPath: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-plan-'));
    const planDir = join(workspaceRoot, 'sessions', 'sess-1', 'plans');
    mkdirSync(planDir, { recursive: true });
    sessionPlanPath = join(planDir, 'initial.md');
    writeFileSync(sessionPlanPath, '# Plan body\n\nDo the thing.\n');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('writes to docs/plans/{slug}/plan-{ts}.md with full frontmatter', async () => {
    const issue = makeIssue();
    const now = new Date('2026-04-22T15:12:00.000Z');

    const rel = await copyPlanForward({
      sessionPlanPath,
      sessionId: 'sess-1',
      issue,
      workspaceRoot,
      planStoragePath: 'docs/plans',
      now,
      tz: 'UTC',
    });

    expect(rel).toBe('docs/plans/add-letta-memory-sync/plan-2026-04-22-1512.md');
    const absolute = join(workspaceRoot, rel);
    const content = readFileSync(absolute, 'utf-8');
    const parsed = matter(content);
    expect(parsed.data).toEqual({
      issueId: 'issue_abc',
      issueSlug: 'add-letta-memory-sync',
      sessionId: 'sess-1',
      acceptedAt: '2026-04-22T15:12:00.000Z',
      planVersion: 1,
    });
    expect(parsed.content.trim()).toBe('# Plan body\n\nDo the thing.');
  });

  it('increments planVersion based on existing plans in the folder', async () => {
    const issue = makeIssue();
    const targetDir = join(workspaceRoot, 'docs', 'plans', 'add-letta-memory-sync');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'plan-2026-01-01-0000.md'), 'old');
    writeFileSync(join(targetDir, 'plan-2026-01-02-0000.md'), 'old');

    const rel = await copyPlanForward({
      sessionPlanPath,
      sessionId: 'sess-1',
      issue,
      workspaceRoot,
      planStoragePath: 'docs/plans',
      now: new Date('2026-04-22T15:12:00.000Z'),
      tz: 'UTC',
    });

    const parsed = matter(readFileSync(join(workspaceRoot, rel), 'utf-8'));
    expect(parsed.data.planVersion).toBe(3);
  });

  it('resolves timestamp collisions by appending -2, -3', async () => {
    const issue = makeIssue();
    const targetDir = join(workspaceRoot, 'docs', 'plans', 'add-letta-memory-sync');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'plan-2026-04-22-1512.md'), 'first');

    const rel = await copyPlanForward({
      sessionPlanPath,
      sessionId: 'sess-1',
      issue,
      workspaceRoot,
      planStoragePath: 'docs/plans',
      now: new Date('2026-04-22T15:12:00.000Z'),
      tz: 'UTC',
    });

    expect(rel).toBe('docs/plans/add-letta-memory-sync/plan-2026-04-22-1512-2.md');
  });

  it('writes to _orphaned/{sessionId}/ when issue is undefined', async () => {
    const rel = await copyPlanForward({
      sessionPlanPath,
      sessionId: 'sess-1',
      issue: undefined,
      workspaceRoot,
      planStoragePath: 'docs/plans',
      now: new Date('2026-04-22T15:12:00.000Z'),
      tz: 'UTC',
    });

    expect(rel).toBe('docs/plans/_orphaned/sess-1/plan-2026-04-22-1512.md');
    const parsed = matter(readFileSync(join(workspaceRoot, rel), 'utf-8'));
    expect(parsed.data.issueId).toBeNull();
    expect(parsed.data.issueSlug).toBeNull();
  });

  it('creates the target directory when it does not exist', async () => {
    const issue = makeIssue();
    // No pre-existing docs/plans.
    await copyPlanForward({
      sessionPlanPath,
      sessionId: 'sess-1',
      issue,
      workspaceRoot,
      planStoragePath: 'docs/plans',
      now: new Date('2026-04-22T15:12:00.000Z'),
      tz: 'UTC',
    });
    const dir = join(workspaceRoot, 'docs', 'plans', 'add-letta-memory-sync');
    expect(readdirSync(dir).length).toBe(1);
  });
});
```

- [ ] **Step 2: Implement `copy-plan-forward.ts`**

`packages/shared/src/issues/copy-plan-forward.ts`:

```typescript
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join, relative } from 'path';
import matter from 'gray-matter';
import type { Issue } from './types.ts';
import { slugify } from './slug.ts';
import { formatTimestamp } from './timestamp.ts';

export interface CopyPlanForwardInput {
  sessionPlanPath: string;        // absolute
  sessionId: string;
  issue: Issue | undefined;
  workspaceRoot: string;          // absolute
  planStoragePath: string;        // workspace-relative, e.g. 'docs/plans'
  now?: Date;                     // override for tests
  tz?: 'UTC' | 'local';           // override for tests
}

export interface PlanFrontmatter {
  issueId: string | null;
  issueSlug: string | null;
  sessionId: string;
  acceptedAt: string;
  planVersion: number;
}

/**
 * Copy a session's plan file into the workspace's git-trackable plan store,
 * prepending frontmatter that links the plan back to its issue + session.
 *
 * Returns the workspace-relative path of the written file.
 */
export async function copyPlanForward(input: CopyPlanForwardInput): Promise<string> {
  const { sessionPlanPath, sessionId, issue, workspaceRoot, planStoragePath } = input;
  const now = input.now ?? new Date();
  const tz = input.tz ?? 'UTC';

  const slug = issue ? slugify(issue.title) : null;
  const targetDir = issue
    ? join(workspaceRoot, planStoragePath, slug!)
    : join(workspaceRoot, planStoragePath, '_orphaned', sessionId);

  mkdirSync(targetDir, { recursive: true });

  const ts = formatTimestamp(now, tz);
  const filename = resolveCollision(targetDir, `plan-${ts}.md`);
  const targetAbs = join(targetDir, filename);
  const version = countExistingPlans(targetDir) + 1;

  const body = readFileSync(sessionPlanPath, 'utf-8');
  const fm: PlanFrontmatter = {
    issueId: issue?.id ?? null,
    issueSlug: slug,
    sessionId,
    acceptedAt: now.toISOString(),
    planVersion: version,
  };
  const output = matter.stringify(stripExistingFrontmatter(body), fm);

  atomicWriteFileSync(targetAbs, output);
  return relative(workspaceRoot, targetAbs).split('\\').join('/');
}

export function countExistingPlans(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => /^plan-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.md$/.test(f)).length;
}

export function resolveCollision(dir: string, desired: string): string {
  if (!existsSync(join(dir, desired))) return desired;
  const base = desired.replace(/\.md$/, '');
  let n = 2;
  while (existsSync(join(dir, `${base}-${n}.md`))) n++;
  return `${base}-${n}.md`;
}

function stripExistingFrontmatter(body: string): string {
  // If the session plan file already has frontmatter, drop it — we're
  // writing our own.
  try {
    const parsed = matter(body);
    return parsed.content;
  } catch {
    return body;
  }
}

function atomicWriteFileSync(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, path);
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/issues/copy-plan-forward.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 4: Re-export and commit**

Append `export * from './copy-plan-forward.ts';` to `packages/shared/src/issues/index.ts`, then:

```bash
git add packages/shared/src/issues/copy-plan-forward.ts \
        packages/shared/src/issues/copy-plan-forward.test.ts \
        packages/shared/src/issues/index.ts
git commit -m "feat(issues): copyPlanForward writes plans to docs/plans/"
```

---

### Task 6: CreateSessionOptions + WorkspaceConfig additions

**Files:**
- Modify: `packages/shared/src/protocol/dto.ts`
- Modify: `packages/shared/src/workspaces/types.ts`
- Modify: `packages/server-core/src/sessions/SessionManager.ts`

**Context:** The session kickoff flow needs a way to inject `transferredSessionSummary` and a `linkedIssueId` from the renderer into a new session. Today, `transferredSessionSummary` is only populated via the separate `RemoteSessionTransferPayload` RPC (see SessionManager line ~7000). We extend `CreateSessionOptions` so a normal `createSession` call can seed both.

`ManagedSession.linkedIssueId` persists on the session header so the Accept-Plan copy-forward can later resolve which issue to link.

`WorkspaceConfig.defaults.planStoragePath?` lets workspaces override `'docs/plans'`.

- [ ] **Step 1: Add new optional fields to `CreateSessionOptions`**

Open `packages/shared/src/protocol/dto.ts` and add two fields to the `CreateSessionOptions` interface (after `branchFromSessionId`):

```typescript
export interface CreateSessionOptions {
  name?: string
  permissionMode?: PermissionMode
  workingDirectory?: string | 'user_default' | 'none'
  model?: string
  llmConnection?: string
  systemPromptPreset?: 'default' | 'mini' | string
  hidden?: boolean
  sessionStatus?: SessionStatus
  labels?: string[]
  isFlagged?: boolean
  enabledSourceSlugs?: string[]
  branchFromMessageId?: string
  branchFromSessionId?: string
  // ↓↓↓ new ↓↓↓
  /** If set, injected as the first-turn context for the new session. */
  transferredSessionSummary?: string
  /** If set, links the session back to an Issue for copy-forward resolution. */
  linkedIssueId?: string
}
```

- [ ] **Step 2: Add `planStoragePath` to `WorkspaceConfig.defaults`**

Open `packages/shared/src/workspaces/types.ts` and add inside `WorkspaceConfig.defaults`:

```typescript
defaults?: {
  model?: string
  defaultLlmConnection?: string
  enabledSourceSlugs?: string[]
  permissionMode?: PermissionMode
  cyclablePermissionModes?: PermissionMode[]
  workingDirectory?: string
  thinkingLevel?: ThinkingLevel
  colorTheme?: string
  // ↓↓↓ new ↓↓↓
  /** Workspace-relative path for copy-forwarded plan artifacts. Default: 'docs/plans'. */
  planStoragePath?: string
}
```

- [ ] **Step 3: Wire new options into `SessionManager.createSession`**

Open `packages/server-core/src/sessions/SessionManager.ts`. Find the `createSession` method (around line 2144). After the existing defaults/validation block and **after** the `ManagedSession` is constructed and persisted — but **before** returning the Session DTO — copy the new options onto the managed session:

Search for where the new `ManagedSession` is stored into the manager's map (look for `this.sessions.set(` within `createSession`). Immediately after that line, add:

```typescript
    // Issue-pipeline kickoff fields (optional). The SubmitPlan flow reads
    // linkedIssueId later to resolve which issue a plan copy-forwards to.
    if (options?.transferredSessionSummary && options.transferredSessionSummary.trim().length > 0) {
      managed.transferredSessionSummary = options.transferredSessionSummary.trim();
    }
    if (options?.linkedIssueId) {
      managed.linkedIssueId = options.linkedIssueId;
    }
```

Next, add `linkedIssueId?: string` to the `ManagedSession` class/interface. Search for the class (grep for `class ManagedSession` or the interface in this file — explorer put it near line 856 where `transferredSessionSummary` lives). Add alongside:

```typescript
  /** Issue this session was kicked off from; used by Accept-Plan copy-forward. */
  linkedIssueId?: string
```

Also persist `linkedIssueId` to the stored session header so it survives restart. Find the `StoredSession` type (grep for `transferredSessionSummary` in the session storage module — likely `packages/shared/src/sessions/storage.ts`) and add:

```typescript
  linkedIssueId?: string
```

Finally, in whatever function hydrates `ManagedSession` from a stored header at startup, copy `stored.linkedIssueId` onto `managed.linkedIssueId`. Also, wherever a session is persisted (grep in SessionManager for calls that write the session header — typically a `saveSession` or `persistSession` helper), include `linkedIssueId: managed.linkedIssueId` in the written payload.

- [ ] **Step 4: Compile check**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run --cwd packages/shared tsc --noEmit && bun run --cwd packages/server-core tsc --noEmit`
Expected: no TypeScript errors. If `tsc` isn't available via that command, fall back to `bunx tsc --noEmit -p packages/shared/tsconfig.json` and similarly for server-core.

- [ ] **Step 5: Run existing tests to ensure no regression**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test packages/shared packages/server-core 2>&1 | tail -30`
Expected: no new failures. Existing passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/protocol/dto.ts packages/shared/src/workspaces/types.ts \
        packages/server-core/src/sessions/SessionManager.ts \
        packages/shared/src/sessions/storage.ts
git commit -m "feat(sessions): CreateSessionOptions.transferredSessionSummary + linkedIssueId"
```

---

### Task 7: issues-storage pure module (workspace-facing read/write/delete)

**Files:**
- Create: `packages/shared/src/issues/issues-storage.ts`
- Create: `packages/shared/src/issues/issues-storage.test.ts`

**Context:** Main-process IPC handlers (Task 8) need to read/write issue files. This task implements the filesystem layer as a pure module so it's testable without Electron.

Operations:
- `listIssues(workspaceRoot)` → `Issue[]`
- `readIssue(workspaceRoot, id)` → `Issue | null`
- `writeIssue(workspaceRoot, issue)` → void (atomic)
- `deleteIssue(workspaceRoot, id)` → void (removes `.md` + attachments folder)
- `writeAttachment(workspaceRoot, issueId, filename, bytes)` → workspace-relative path

- [ ] **Step 1: Write the failing test**

`packages/shared/src/issues/issues-storage.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Issue } from './types.ts';
import {
  deleteIssue,
  listIssues,
  readIssue,
  writeAttachment,
  writeIssue,
} from './issues-storage.ts';

function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    title: `Issue ${id}`,
    status: 'backlog',
    priority: 'low',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedSessionIds: [],
    linkedPlanPaths: [],
    ...overrides,
  };
}

describe('issues-storage', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rowl-issues-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('writeIssue creates issues/{id}.md', () => {
    writeIssue(root, makeIssue('issue_a'));
    expect(existsSync(join(root, 'issues', 'issue_a.md'))).toBe(true);
  });

  it('listIssues returns all issues newest-first by updatedAt', () => {
    writeIssue(root, makeIssue('issue_a', { updatedAt: '2026-01-01T00:00:00.000Z' }));
    writeIssue(root, makeIssue('issue_b', { updatedAt: '2026-01-03T00:00:00.000Z' }));
    writeIssue(root, makeIssue('issue_c', { updatedAt: '2026-01-02T00:00:00.000Z' }));

    const ids = listIssues(root).map(i => i.id);
    expect(ids).toEqual(['issue_b', 'issue_c', 'issue_a']);
  });

  it('listIssues returns [] when issues/ does not exist', () => {
    expect(listIssues(root)).toEqual([]);
  });

  it('readIssue returns null for unknown id', () => {
    expect(readIssue(root, 'missing')).toBeNull();
  });

  it('readIssue round-trips through writeIssue', () => {
    const issue = makeIssue('issue_rt', { description: '# Hello', linkedSessionIds: ['s1'] });
    writeIssue(root, issue);
    expect(readIssue(root, 'issue_rt')).toEqual(issue);
  });

  it('deleteIssue removes the .md and attachments folder', () => {
    const issue = makeIssue('issue_del');
    writeIssue(root, issue);
    mkdirSync(join(root, 'issues', 'issue_del', 'attachments'), { recursive: true });
    writeFileSync(join(root, 'issues', 'issue_del', 'attachments', 'x.png'), 'data');

    deleteIssue(root, 'issue_del');
    expect(existsSync(join(root, 'issues', 'issue_del.md'))).toBe(false);
    expect(existsSync(join(root, 'issues', 'issue_del'))).toBe(false);
  });

  it('deleteIssue does not throw when attachments folder is missing', () => {
    writeIssue(root, makeIssue('issue_noattach'));
    expect(() => deleteIssue(root, 'issue_noattach')).not.toThrow();
  });

  it('writeAttachment stores bytes and returns workspace-relative path', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const rel = writeAttachment(root, 'issue_x', 'abc123.png', bytes);
    expect(rel).toBe('issues/issue_x/attachments/abc123.png');
    const content = readFileSync(join(root, rel));
    expect(Array.from(content)).toEqual([1, 2, 3, 4, 5]);
  });

  it('writeIssue is atomic (no partial file on error — tmp file cleanup)', () => {
    // We don't simulate write failure here; just verify the issue file exists
    // and no .tmp file is left behind in the happy path.
    writeIssue(root, makeIssue('issue_atomic'));
    const issuesDir = join(root, 'issues');
    const entries = require('fs').readdirSync(issuesDir);
    expect(entries.some((f: string) => f.includes('.tmp-'))).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `issues-storage.ts`**

`packages/shared/src/issues/issues-storage.ts`:

```typescript
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import type { Issue } from './types.ts';
import { parseIssueFile, serializeIssueFile } from './file-format.ts';

function issuesDir(workspaceRoot: string): string {
  return join(workspaceRoot, 'issues');
}

function issuePath(workspaceRoot: string, id: string): string {
  return join(issuesDir(workspaceRoot), `${id}.md`);
}

function attachmentsDir(workspaceRoot: string, id: string): string {
  return join(issuesDir(workspaceRoot), id, 'attachments');
}

export function listIssues(workspaceRoot: string): Issue[] {
  const dir = issuesDir(workspaceRoot);
  if (!existsSync(dir)) return [];

  const issues: Issue[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (!stat.isFile()) continue;
      const text = readFileSync(full, 'utf-8');
      issues.push(parseIssueFile(text));
    } catch {
      // Skip unreadable / malformed files silently; caller sees what it sees.
    }
  }

  return issues.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readIssue(workspaceRoot: string, id: string): Issue | null {
  const path = issuePath(workspaceRoot, id);
  if (!existsSync(path)) return null;
  try {
    return parseIssueFile(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeIssue(workspaceRoot: string, issue: Issue): void {
  const path = issuePath(workspaceRoot, issue.id);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, serializeIssueFile(issue));
}

export function deleteIssue(workspaceRoot: string, id: string): void {
  const mdPath = issuePath(workspaceRoot, id);
  if (existsSync(mdPath)) rmSync(mdPath, { force: true });

  const attachDir = join(issuesDir(workspaceRoot), id);
  if (existsSync(attachDir)) {
    try {
      rmSync(attachDir, { recursive: true, force: true });
    } catch (err) {
      // Attachment folder cleanup failure must not block the .md delete.
      // eslint-disable-next-line no-console
      console.warn(`[issues-storage] Failed to remove attachments for ${id}:`, err);
    }
  }
}

export function writeAttachment(
  workspaceRoot: string,
  issueId: string,
  filename: string,
  bytes: Uint8Array,
): string {
  const dir = attachmentsDir(workspaceRoot, issueId);
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, filename);
  writeFileSync(abs, bytes);
  return `issues/${issueId}/attachments/${filename}`;
}

function atomicWriteFileSync(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, path);
}
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/issues/issues-storage.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 4: Re-export and commit**

Append `export * from './issues-storage.ts';` to `packages/shared/src/issues/index.ts`, then:

```bash
git add packages/shared/src/issues/issues-storage.ts \
        packages/shared/src/issues/issues-storage.test.ts \
        packages/shared/src/issues/index.ts
git commit -m "feat(issues): filesystem read/write/delete module"
```

---

### Task 8: Main-process IPC — issuesApi + plansApi

**Files:**
- Create: `apps/electron/src/main/ipc/issues-ipc.ts`
- Create: `apps/electron/src/main/ipc/plans-ipc.ts`
- Modify: `apps/electron/src/main/preload.ts`
- Modify: wherever IPC handlers are registered at startup (grep for `ipcMain.handle(` to find the registry/bootstrap file)

**Context:** The renderer must not import `gray-matter` (it's a Node module and crossing the sandbox boundary directly is messy). IPC is the clean boundary. `issuesApi` reads/writes issues; `plansApi` lists, reads, and copy-forwards plans.

- [ ] **Step 1: Grep for the existing IPC registration pattern**

Run: `cd /Users/mauriello/Dev/rowl-v2 && grep -rn "ipcMain.handle(" apps/electron/src/main | head -20`

Note the file where handlers are registered (call it `IPC_BOOTSTRAP_FILE` below) and the shape they use (likely `ipcMain.handle('channel.name', async (_, args) => { ... })`).

- [ ] **Step 2: Implement `issues-ipc.ts`**

`apps/electron/src/main/ipc/issues-ipc.ts`:

```typescript
import { ipcMain } from 'electron';
import {
  deleteIssue,
  listIssues,
  readIssue,
  writeAttachment,
  writeIssue,
  type Issue,
} from '@craft-agent/shared/issues';
import { getWorkspaceRoot } from '../workspace-resolution.ts'; // <— use existing helper; grep for current workspace-root lookup
import { createHash } from 'crypto';

export function registerIssuesIpc(): void {
  ipcMain.handle('issues:list', async (_e, workspaceId: string): Promise<Issue[]> => {
    const root = getWorkspaceRoot(workspaceId);
    return listIssues(root);
  });

  ipcMain.handle('issues:read', async (_e, workspaceId: string, issueId: string): Promise<Issue | null> => {
    const root = getWorkspaceRoot(workspaceId);
    return readIssue(root, issueId);
  });

  ipcMain.handle('issues:write', async (_e, workspaceId: string, issue: Issue): Promise<void> => {
    const root = getWorkspaceRoot(workspaceId);
    writeIssue(root, issue);
  });

  ipcMain.handle('issues:delete', async (_e, workspaceId: string, issueId: string): Promise<void> => {
    const root = getWorkspaceRoot(workspaceId);
    deleteIssue(root, issueId);
  });

  ipcMain.handle(
    'issues:write-attachment',
    async (_e, workspaceId: string, issueId: string, ext: string, bytes: Uint8Array): Promise<{ path: string; hash: string }> => {
      if (bytes.byteLength > 10 * 1024 * 1024) {
        throw new Error('Attachment exceeds 10 MB limit');
      }
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
      const filename = `${hash}.${sanitizeExt(ext)}`;
      const root = getWorkspaceRoot(workspaceId);
      const path = writeAttachment(root, issueId, filename, bytes);
      return { path, hash };
    },
  );
}

function sanitizeExt(ext: string): string {
  return ext.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'bin';
}
```

If `getWorkspaceRoot(workspaceId)` does not exist, grep for how other handlers resolve a workspace root (e.g., `workspaceManager.get(workspaceId).path` or similar) and use that pattern. This plan cannot anticipate the exact helper name — the implementer must match existing code.

- [ ] **Step 3: Implement `plans-ipc.ts`**

`apps/electron/src/main/ipc/plans-ipc.ts`:

```typescript
import { ipcMain } from 'electron';
import { readFileSync } from 'fs';
import { glob } from 'glob';
import { join, relative } from 'path';
import matter from 'gray-matter';
import {
  copyPlanForward,
  readIssue,
  type Issue,
} from '@craft-agent/shared/issues';
import { getWorkspaceRoot, getWorkspaceConfig } from '../workspace-resolution.ts';

export interface PlanListEntry {
  workspaceRelativePath: string;
  issueId: string | null;
  issueSlug: string | null;
  sessionId: string;
  acceptedAt: string;
  planVersion: number;
}

export function registerPlansIpc(): void {
  ipcMain.handle(
    'plans:copy-forward',
    async (
      _e,
      workspaceId: string,
      sessionPlanPath: string,
      sessionId: string,
      issueId: string | undefined,
    ): Promise<string> => {
      const root = getWorkspaceRoot(workspaceId);
      const cfg = getWorkspaceConfig(workspaceId);
      const planStoragePath = cfg.defaults?.planStoragePath ?? 'docs/plans';
      const issue: Issue | undefined = issueId ? readIssue(root, issueId) ?? undefined : undefined;

      return copyPlanForward({
        sessionPlanPath,
        sessionId,
        issue,
        workspaceRoot: root,
        planStoragePath,
        tz: 'local',
      });
    },
  );

  ipcMain.handle('plans:list', async (_e, workspaceId: string): Promise<PlanListEntry[]> => {
    const root = getWorkspaceRoot(workspaceId);
    const cfg = getWorkspaceConfig(workspaceId);
    const planStoragePath = cfg.defaults?.planStoragePath ?? 'docs/plans';

    const pattern = join(root, planStoragePath, '**', 'plan-*.md');
    const files = await glob(pattern, { nodir: true });

    const entries: PlanListEntry[] = [];
    for (const abs of files) {
      try {
        const content = readFileSync(abs, 'utf-8');
        const fm = matter(content).data as PlanListEntry & { [k: string]: unknown };
        entries.push({
          workspaceRelativePath: relative(root, abs).split('\\').join('/'),
          issueId: (fm.issueId as string | null) ?? null,
          issueSlug: (fm.issueSlug as string | null) ?? null,
          sessionId: String(fm.sessionId ?? ''),
          acceptedAt: String(fm.acceptedAt ?? ''),
          planVersion: Number(fm.planVersion ?? 1),
        });
      } catch {
        // Skip malformed plan files — don't crash the list call.
      }
    }
    return entries.sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  });

  ipcMain.handle(
    'plans:read',
    async (_e, workspaceId: string, workspaceRelativePath: string): Promise<{ frontmatter: PlanListEntry; body: string } | null> => {
      const root = getWorkspaceRoot(workspaceId);
      const abs = join(root, workspaceRelativePath);
      try {
        const text = readFileSync(abs, 'utf-8');
        const parsed = matter(text);
        const fm = parsed.data as PlanListEntry;
        return { frontmatter: fm, body: parsed.content };
      } catch {
        return null;
      }
    },
  );
}
```

- [ ] **Step 4: Register handlers at startup**

In `IPC_BOOTSTRAP_FILE` (from Step 1), add the imports and calls next to the other `register*Ipc()` calls:

```typescript
import { registerIssuesIpc } from './ipc/issues-ipc.ts';
import { registerPlansIpc } from './ipc/plans-ipc.ts';

// …inside whatever init function registers handlers:
registerIssuesIpc();
registerPlansIpc();
```

- [ ] **Step 5: Expose on preload**

Open `apps/electron/src/main/preload.ts` (or wherever `contextBridge.exposeInMainWorld('electronAPI', {...})` is called — grep for `exposeInMainWorld`). Add inside the exposed object:

```typescript
issues: {
  list: (workspaceId: string) => ipcRenderer.invoke('issues:list', workspaceId),
  read: (workspaceId: string, id: string) => ipcRenderer.invoke('issues:read', workspaceId, id),
  write: (workspaceId: string, issue: unknown) => ipcRenderer.invoke('issues:write', workspaceId, issue),
  delete: (workspaceId: string, id: string) => ipcRenderer.invoke('issues:delete', workspaceId, id),
  writeAttachment: (workspaceId: string, issueId: string, ext: string, bytes: Uint8Array) =>
    ipcRenderer.invoke('issues:write-attachment', workspaceId, issueId, ext, bytes),
},
plans: {
  copyForward: (workspaceId: string, sessionPlanPath: string, sessionId: string, issueId: string | undefined) =>
    ipcRenderer.invoke('plans:copy-forward', workspaceId, sessionPlanPath, sessionId, issueId),
  list: (workspaceId: string) => ipcRenderer.invoke('plans:list', workspaceId),
  read: (workspaceId: string, relPath: string) => ipcRenderer.invoke('plans:read', workspaceId, relPath),
},
```

- [ ] **Step 6: Add TS ambient declarations for the renderer**

Find the file where `window.electronAPI` is typed (grep for `electronAPI:` in `.d.ts` files under `apps/electron/src/renderer/`). Add matching types:

```typescript
issues: {
  list(workspaceId: string): Promise<Issue[]>;
  read(workspaceId: string, id: string): Promise<Issue | null>;
  write(workspaceId: string, issue: Issue): Promise<void>;
  delete(workspaceId: string, id: string): Promise<void>;
  writeAttachment(workspaceId: string, issueId: string, ext: string, bytes: Uint8Array): Promise<{ path: string; hash: string }>;
};
plans: {
  copyForward(workspaceId: string, sessionPlanPath: string, sessionId: string, issueId: string | undefined): Promise<string>;
  list(workspaceId: string): Promise<Array<{
    workspaceRelativePath: string;
    issueId: string | null;
    issueSlug: string | null;
    sessionId: string;
    acceptedAt: string;
    planVersion: number;
  }>>;
  read(workspaceId: string, relPath: string): Promise<{ frontmatter: { issueId: string | null; issueSlug: string | null; sessionId: string; acceptedAt: string; planVersion: number }; body: string } | null>;
};
```

- [ ] **Step 7: Compile check**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run --cwd apps/electron tsc --noEmit 2>&1 | tail -30`
Expected: no errors related to the new code. If `@craft-agent/shared/issues` fails to resolve, confirm the barrel re-exports (Task 1 step 4 + Task 5 step 4).

- [ ] **Step 8: Manual smoke test (no automated test possible without Electron)**

In DevTools console after launching the app (`bun run dev` from repo root, then open DevTools in the app):

```javascript
await window.electronAPI.issues.list('some-workspace-id')  // Should return []
await window.electronAPI.issues.write('some-workspace-id', {
  id: 'issue_smoke',
  title: 'Smoke test',
  status: 'backlog',
  priority: 'low',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  linkedSessionIds: [],
  linkedPlanPaths: [],
})
await window.electronAPI.issues.list('some-workspace-id')  // Should return [{ id: 'issue_smoke', ... }]
```

Verify the file appears at `{workspace}/issues/issue_smoke.md`. Delete it afterward.

- [ ] **Step 9: Commit**

```bash
git add apps/electron/src/main/ipc/issues-ipc.ts apps/electron/src/main/ipc/plans-ipc.ts \
        apps/electron/src/main/preload.ts apps/electron/src/renderer/types/electron.d.ts \
        "$IPC_BOOTSTRAP_FILE"
git commit -m "feat(electron): issuesApi + plansApi IPC handlers"
```

(Replace `$IPC_BOOTSTRAP_FILE` with the actual file path from Step 1.)

---

### Task 9: Refactor `useIssues` hook to IPC + localStorage migration

**Files:**
- Modify: `apps/electron/src/renderer/hooks/useIssues.ts`

**Context:** Today `useIssues` reads/writes `localStorage["craft-agent-issues"]` with a local `generateId()`. After this task it calls `window.electronAPI.issues.*`, uses the shared `generateIssueId`, and runs a one-shot migration on first launch when legacy data is detected.

- [ ] **Step 1: Replace the hook contents**

Open `apps/electron/src/renderer/hooks/useIssues.ts` and replace the file with:

```typescript
import { useCallback, useEffect, useState } from 'react';
import {
  createIssue,
  generateIssueId,
  type Issue,
  type IssuePriority,
  type IssueStatus,
} from '@craft-agent/shared/issues';

const LEGACY_LS_KEY = 'craft-agent-issues';
const MIGRATION_PROMPT_KEY = 'craft-agent-issues-migration-prompted';

export interface UseIssuesResult {
  issues: Issue[];
  loading: boolean;
  migrationPending: number | null;           // count of legacy issues, or null
  addIssue: (title: string, options?: { description?: string; priority?: IssuePriority }) => Promise<Issue>;
  updateIssue: (id: string, updates: Partial<Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'linkedSessionIds' | 'linkedPlanPaths' | 'attachments'>>) => Promise<Issue | null>;
  updateIssueStatus: (id: string, status: IssueStatus) => Promise<Issue | null>;
  deleteIssue: (id: string) => Promise<boolean>;
  getIssue: (id: string) => Issue | null;
  getOpenCount: () => number;
  getIssuesByStatus: (status: IssueStatus) => Issue[];
  runMigration: () => Promise<{ migrated: number; failed: number }>;
  dismissMigrationPrompt: () => void;
}

export function useIssues(workspaceId: string): UseIssuesResult {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.issues.list(workspaceId);
    setIssues(list);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refresh();
        // Check for legacy localStorage data only if we haven't already
        // prompted the user and dismissed.
        if (!cancelled) {
          const raw = localStorage.getItem(LEGACY_LS_KEY);
          const dismissed = localStorage.getItem(MIGRATION_PROMPT_KEY) === 'dismissed';
          if (raw && !dismissed) {
            try {
              const legacy = JSON.parse(raw) as Array<unknown>;
              if (Array.isArray(legacy) && legacy.length > 0) {
                setMigrationPending(legacy.length);
              }
            } catch {
              // Malformed legacy data; ignore.
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const addIssue = useCallback<UseIssuesResult['addIssue']>(async (title, options) => {
    const base = createIssue(title, options);
    const issue: Issue = { ...base, id: generateIssueId() };
    await window.electronAPI.issues.write(workspaceId, issue);
    await refresh();
    return issue;
  }, [workspaceId, refresh]);

  const updateIssue = useCallback<UseIssuesResult['updateIssue']>(async (id, updates) => {
    const current = await window.electronAPI.issues.read(workspaceId, id);
    if (!current) return null;
    const next: Issue = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await window.electronAPI.issues.write(workspaceId, next);
    await refresh();
    return next;
  }, [workspaceId, refresh]);

  const updateIssueStatus = useCallback<UseIssuesResult['updateIssueStatus']>(async (id, status) => {
    return updateIssue(id, { status });
  }, [updateIssue]);

  const deleteIssue = useCallback<UseIssuesResult['deleteIssue']>(async (id) => {
    await window.electronAPI.issues.delete(workspaceId, id);
    await refresh();
    return true;
  }, [workspaceId, refresh]);

  const getIssue = useCallback<UseIssuesResult['getIssue']>((id) => {
    return issues.find(i => i.id === id) ?? null;
  }, [issues]);

  const getOpenCount = useCallback<UseIssuesResult['getOpenCount']>(() => {
    return issues.filter(i => i.status !== 'done').length;
  }, [issues]);

  const getIssuesByStatus = useCallback<UseIssuesResult['getIssuesByStatus']>((status) => {
    return issues.filter(i => i.status === status);
  }, [issues]);

  const runMigration = useCallback<UseIssuesResult['runMigration']>(async () => {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return { migrated: 0, failed: 0 };
    let legacy: Array<{
      id: string;
      title: string;
      description?: string;
      status: IssueStatus;
      priority: IssuePriority;
      createdAt: string;
      updatedAt: string;
      linkedSessionId?: string;
    }>;
    try {
      legacy = JSON.parse(raw);
    } catch {
      return { migrated: 0, failed: 0 };
    }

    let migrated = 0;
    let failed = 0;
    const remaining: typeof legacy = [];

    for (const old of legacy) {
      const issue: Issue = {
        id: old.id,
        title: old.title,
        description: old.description,
        status: old.status,
        priority: old.priority,
        createdAt: old.createdAt,
        updatedAt: old.updatedAt,
        linkedSessionIds: old.linkedSessionId ? [old.linkedSessionId] : [],
        linkedPlanPaths: [],
      };
      try {
        await window.electronAPI.issues.write(workspaceId, issue);
        migrated++;
      } catch {
        failed++;
        remaining.push(old);
      }
    }

    if (remaining.length === 0) {
      localStorage.removeItem(LEGACY_LS_KEY);
    } else {
      localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(remaining));
    }

    setMigrationPending(null);
    await refresh();
    return { migrated, failed };
  }, [workspaceId, refresh]);

  const dismissMigrationPrompt = useCallback(() => {
    localStorage.setItem(MIGRATION_PROMPT_KEY, 'dismissed');
    setMigrationPending(null);
  }, []);

  return {
    issues,
    loading,
    migrationPending,
    addIssue,
    updateIssue,
    updateIssueStatus,
    deleteIssue,
    getIssue,
    getOpenCount,
    getIssuesByStatus,
    runMigration,
    dismissMigrationPrompt,
  };
}
```

- [ ] **Step 2: Update `useIssues` call sites**

Grep for uses: `grep -rn "useIssues(" apps/electron/src/renderer`.

Each call site must now pass a `workspaceId`. Find the nearest workspace context (look for existing hooks like `useActiveWorkspace` or similar — grep for `useWorkspace`, `activeWorkspace`, `workspaceId`). If no such hook exists, add `workspaceId` as a prop from the parent that already knows it (the `AppShell` layer).

- [ ] **Step 3: Add a migration prompt in `IssuesPanel.tsx`**

Near the top of `IssuesPanel`, after the `useIssues` call, render a one-line prompt when `migrationPending !== null`:

```tsx
{migrationPending !== null && (
  <div className="border border-amber-500/40 bg-amber-500/10 text-amber-500 px-3 py-2 rounded flex items-center gap-3 text-sm">
    <span>Migrate {migrationPending} issues from local storage to files?</span>
    <button
      className="underline"
      onClick={async () => {
        const result = await runMigration()
        // Toast or inline banner (see Task 10 for the toast helper choice).
        console.info(`[issues] Migrated ${result.migrated}, failed ${result.failed}`)
      }}
    >
      Migrate
    </button>
    <button className="underline opacity-70" onClick={dismissMigrationPrompt}>
      Not now
    </button>
  </div>
)}
```

Destructure `migrationPending`, `runMigration`, `dismissMigrationPrompt` from the `useIssues(...)` result.

- [ ] **Step 4: TypeCheck**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run --cwd apps/electron tsc --noEmit 2>&1 | grep useIssues | head -5`
Expected: no type errors.

- [ ] **Step 5: Manual smoke test**

Run the app (`bun run dev` from repo root). Verify:
- Existing localStorage issues (if any) show the migration banner.
- Clicking Migrate moves them to files and clears the banner.
- Clicking Not now dismisses the banner and sets the dismissed flag.
- Creating a new issue in a fresh workspace writes a file at `{workspace}/issues/{id}.md`.
- Deleting an issue removes its file.

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/hooks/useIssues.ts \
        apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx
git commit -m "feat(issues): IPC-backed useIssues with localStorage migration"
```

---

### Task 10: IssueCard + IssueDetailModal — Start Session CTA, badges, markdown body, attachments

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/IssueCard.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx`

**Context:** IssueCard loses the "Convert to session (that drops the ID)" handler; the new primary CTA is "Start Session" wired through Task 11's hook. IssueDetailModal:
- Keeps title input.
- Switches description from plaintext Textarea to a markdown `<textarea>` with paste/drop handlers that upload image attachments via IPC and insert markdown image refs at the cursor.
- Adds a "Linked sessions" list (click-to-open session) and "Linked plans" list (click-to-open PlanViewerModal — stub for now; Task 14 implements the modal).
- Header gains a primary "Start Session" button.

YAGNI: we do not wire in CodeMirror for this increment. A textarea with paste handling is enough. If the spec comes back later and wants a proper editor, that's a separate increment.

- [ ] **Step 1: Update `IssueCard` props**

Open `apps/electron/src/renderer/components/app-shell/IssueCard.tsx`. Update the interface:

```typescript
interface IssueCardProps {
  issue: Issue;
  onSelect: () => void;
  onStatusChange: (status: IssueStatus) => void;
  onStartSession: (issue: Issue) => void;  // was onConvertToSession
}
```

Rename `onConvertToSession` to `onStartSession` at its one call site inside the component. Update the button label and primary-CTA styling:

```tsx
<Button
  variant="default"
  size="sm"
  onClick={(e) => { e.stopPropagation(); onStartSession(issue) }}
>
  Start Session
</Button>
```

Add a compact badge below the title when either list has entries:

```tsx
{(issue.linkedSessionIds.length > 0 || issue.linkedPlanPaths.length > 0) && (
  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
    {issue.linkedSessionIds.length > 0 && (
      <span>{issue.linkedSessionIds.length} session{issue.linkedSessionIds.length === 1 ? '' : 's'}</span>
    )}
    {issue.linkedSessionIds.length > 0 && issue.linkedPlanPaths.length > 0 && <span>·</span>}
    {issue.linkedPlanPaths.length > 0 && (
      <span>{issue.linkedPlanPaths.length} plan{issue.linkedPlanPaths.length === 1 ? '' : 's'}</span>
    )}
  </div>
)}
```

- [ ] **Step 2: Update `IssueDetailModal` props and body**

Open `apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx`. Replace `onConvertToSession` with `onStartSession`. Add an `onOpenSession(sessionId: string)` callback (fired when user clicks a linked session):

```typescript
interface IssueDetailModalProps {
  issue: Issue;
  workspaceId: string;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Issue>) => Promise<Issue | null>;
  onDelete: () => void;
  onStartSession: (issue: Issue) => void;
  onStatusChange: (status: IssueStatus) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenPlan: (workspaceRelativePath: string) => void;  // opens PlanViewerModal
}
```

Replace the description `<Textarea>` with a paste-aware textarea. Inside the component:

```tsx
const textareaRef = React.useRef<HTMLTextAreaElement>(null)

async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
  const items = Array.from(e.clipboardData.items)
  const imageItem = items.find(it => it.type.startsWith('image/'))
  if (!imageItem) return
  e.preventDefault()
  const file = imageItem.getAsFile()
  if (!file) return
  await insertAttachment(file)
}

async function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
  e.preventDefault()
  const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
  if (!file) return
  await insertAttachment(file)
}

async function insertAttachment(file: File) {
  if (file.size > 10 * 1024 * 1024) {
    setInlineError('Image exceeds 10 MB limit')
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  try {
    const { path } = await window.electronAPI.issues.writeAttachment(workspaceId, issue.id, ext, bytes)
    const ref = `![attachment](./${issue.id}/attachments/${path.split('/').pop()})`
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const next = description.slice(0, start) + ref + description.slice(end)
    setDescription(next)
    // Track attachment path for frontmatter write-back.
    setAttachments(prev => [...(prev ?? []), path])
  } catch (err) {
    setInlineError(`Couldn't save image: ${(err as Error).message}`)
  }
}
```

Wire these to the textarea:

```tsx
<textarea
  ref={textareaRef}
  value={description}
  onChange={e => setDescription(e.target.value)}
  onPaste={handlePaste}
  onDrop={handleDrop}
  className="w-full min-h-[160px] font-mono text-sm p-2 rounded border bg-background"
  placeholder="Markdown supported. Paste or drop images to attach."
/>
```

Add `attachments` and `inlineError` to local state. Wire through to `onUpdate` when Save is clicked:

```tsx
await onUpdate(issue.id, {
  title,
  description,
  priority,
  attachments: attachments && attachments.length > 0 ? attachments : undefined,
})
```

Add the Linked sessions / Linked plans sections below the priority buttons:

```tsx
{issue.linkedSessionIds.length > 0 && (
  <div className="space-y-1">
    <div className="text-xs font-medium text-muted-foreground">Linked sessions</div>
    <ul className="text-sm space-y-1">
      {issue.linkedSessionIds.map(sid => (
        <li key={sid}>
          <button className="underline text-left" onClick={() => onOpenSession(sid)}>
            {sid}
          </button>
        </li>
      ))}
    </ul>
  </div>
)}
{issue.linkedPlanPaths.length > 0 && (
  <div className="space-y-1">
    <div className="text-xs font-medium text-muted-foreground">Linked plans</div>
    <ul className="text-sm space-y-1">
      {issue.linkedPlanPaths.map(p => (
        <li key={p}>
          <button className="underline text-left" onClick={() => onOpenPlan(p)}>
            {p.split('/').pop()}
          </button>
        </li>
      ))}
    </ul>
  </div>
)}
```

Update the header's primary CTA:

```tsx
<Button variant="default" onClick={() => onStartSession(issue)}>
  Start Session
</Button>
```

Inline error rendering (at the bottom of the modal body, above the footer):

```tsx
{inlineError && (
  <div className="text-xs text-destructive">{inlineError}</div>
)}
```

- [ ] **Step 3: Right-click → "Start Session from issue" on IssueCard (spec §3.1 entry point #3)**

Grep for an existing context-menu primitive first: `grep -rn "ContextMenu\|@radix-ui/react-context-menu" apps/electron/src/renderer/components --include='*.tsx' | head -5`.

- **If a `ContextMenu` primitive exists** (`apps/electron/src/renderer/components/ui/context-menu.tsx` or similar), wrap `IssueCard`'s outer div:

  ```tsx
  import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '../ui/context-menu'

  // …wrapping the card body:
  <ContextMenu>
    <ContextMenuTrigger asChild>
      <div onClick={onSelect} className={/* existing classes */}>
        {/* existing card contents */}
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem onSelect={() => onStartSession(issue)}>
        Start Session from issue
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  ```

- **If no ContextMenu primitive exists**, skip wiring the right-click affordance for Y. The primary CTA on the card plus the button in the detail-modal header cover the flow. Leave a one-line code comment in `IssueCard.tsx`:

  ```tsx
  // TODO(follow-up): right-click "Start Session from issue" — pending ContextMenu primitive.
  ```

Do **not** add a new dependency for this step.

- [ ] **Step 4: Update `IssuesPanel` to pass the new props**

Open `apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx`. Update the `IssueCard` usage:

```tsx
<IssueCard
  issue={issue}
  onSelect={() => setSelectedIssue(issue)}
  onStatusChange={status => updateIssueStatus(issue.id, status)}
  onStartSession={() => handleStartSession(issue)}
/>
```

And the `IssueDetailModal` usage:

```tsx
{selectedIssue && (
  <IssueDetailModal
    issue={selectedIssue}
    workspaceId={workspaceId}
    onClose={() => setSelectedIssue(null)}
    onUpdate={updateIssue}
    onDelete={() => { deleteIssue(selectedIssue.id); setSelectedIssue(null) }}
    onStartSession={issue => { handleStartSession(issue); setSelectedIssue(null) }}
    onStatusChange={status => updateIssueStatus(selectedIssue.id, status)}
    onOpenSession={onOpenSession}
    onOpenPlan={onOpenPlan}
  />
)}
```

`handleStartSession`, `onOpenSession`, `onOpenPlan` are added in Task 11 / Task 14. For now, temporarily define them as props or no-op stubs so the file compiles:

```tsx
const handleStartSession = (issue: Issue) => {
  console.warn('[issues] handleStartSession not wired yet', issue.id)
}
const onOpenSession = (sessionId: string) => {
  console.warn('[issues] onOpenSession not wired yet', sessionId)
}
const onOpenPlan = (path: string) => {
  console.warn('[issues] onOpenPlan not wired yet', path)
}
```

- [ ] **Step 5: TypeCheck + smoke test**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run --cwd apps/electron tsc --noEmit 2>&1 | tail -10`
Expected: no type errors.

Smoke (app running): open the issue detail modal, paste an image → verify a file appears under `{workspace}/issues/{issueId}/attachments/` and a markdown ref is inserted.

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/IssueCard.tsx \
        apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx \
        apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx
git commit -m "feat(issues): Start Session CTA, badges, markdown+attachments in detail modal"
```

---

### Task 11: `useStartSessionFromIssue` hook + wire into IssuesPanel

**Files:**
- Create: `apps/electron/src/renderer/hooks/useStartSessionFromIssue.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx`

**Context:** Replace the stub `handleStartSession` with a real hook that builds the first-turn context, creates a safe-mode session via `window.electronAPI.createSession(...)`, and updates the issue with `linkedSessionIds` + status transition.

- [ ] **Step 1: Implement the hook**

`apps/electron/src/renderer/hooks/useStartSessionFromIssue.ts`:

```typescript
import { useCallback } from 'react';
import { formatFirstTurnContext, type Issue } from '@craft-agent/shared/issues';

export interface StartSessionFromIssueDeps {
  workspaceId: string;
  updateIssue: (id: string, updates: Partial<Issue>) => Promise<Issue | null>;
  onSessionCreated?: (sessionId: string) => void;  // e.g., navigate to it
}

export function useStartSessionFromIssue(deps: StartSessionFromIssueDeps) {
  const { workspaceId, updateIssue, onSessionCreated } = deps;

  return useCallback(async (issue: Issue): Promise<string> => {
    const summary = formatFirstTurnContext(issue);
    const session = await window.electronAPI.createSession(workspaceId, {
      name: issue.title,
      permissionMode: 'safe',
      transferredSessionSummary: summary,
      linkedIssueId: issue.id,
    });

    const sessionId = typeof session === 'string' ? session : session.id;

    await updateIssue(issue.id, {
      linkedSessionIds: [...issue.linkedSessionIds, sessionId],
      status: issue.status === 'backlog' ? 'in_progress' : issue.status,
    });

    onSessionCreated?.(sessionId);
    return sessionId;
  }, [workspaceId, updateIssue, onSessionCreated]);
}
```

Note: the hook assumes `window.electronAPI.createSession(workspaceId, options)` returns either a session object with `id` or the id directly. Grep for existing callers to confirm the exact shape and adjust the `sessionId = typeof session === 'string' ...` line accordingly.

- [ ] **Step 2: Wire into `IssuesPanel`**

Replace the stubs added in Task 10 Step 4 with:

```tsx
import { useStartSessionFromIssue } from '../../hooks/useStartSessionFromIssue'

// …inside IssuesPanel:
const startSessionFromIssue = useStartSessionFromIssue({
  workspaceId,
  updateIssue,
  onSessionCreated: onCreateSession,  // reuses the existing prop that navigates to a session
})

const handleStartSession = async (issue: Issue) => {
  try {
    await startSessionFromIssue(issue)
  } catch (err) {
    console.error('[issues] Failed to start session', err)
  }
}
```

The existing `onCreateSession` prop on `IssuesPanelProps` today takes a `title: string`. Widen it in `IssuesPanelProps`:

```typescript
interface IssuesPanelProps {
  onBack?: () => void
  onCreateSession: (titleOrSessionId: string) => void  // now accepts either — caller detects
}
```

A cleaner approach: introduce a new prop `onOpenSession: (sessionId: string) => void` and leave `onCreateSession` alone. If the parent component (grep for `<IssuesPanel` to find the mount site) passes both, do that. Otherwise widen in place. Pick whichever is less invasive based on call-site count.

- [ ] **Step 3: Smoke test**

Run the app. Click Start Session on an issue. Expect:
- A new session opens, named after the issue title.
- In the session, the first turn contains the issue context and the agent acknowledges the SubmitPlan requirement (visible in the chat transcript or dev logs).
- After the session is created, opening the issue's detail modal shows the new session ID under "Linked sessions".
- If the issue was `backlog`, its status flipped to `in_progress`.

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/hooks/useStartSessionFromIssue.ts \
        apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx
git commit -m "feat(issues): useStartSessionFromIssue kickoff handler"
```

---

### Task 12: Accept-Plan copy-forward wiring

**Files:**
- Modify: `packages/server-core/src/sessions/SessionManager.ts` (expose plan path in the plan-submitted event)
- Modify: renderer-side plan-approval handler (grep for `PlanReviewResult` usage in `apps/electron/src/renderer/`)

**Context:** When the user clicks Accept Plan (`{ action: 'approve' }`) or Save Only (`{ action: 'saveOnly' }`) in the plan review UI, the renderer fetches the session's linked issue ID from the managed session, then invokes `window.electronAPI.plans.copyForward(...)`. On success, it calls `updateIssue(issueId, { linkedPlanPaths: [...issue.linkedPlanPaths, rel] })`.

- [ ] **Step 1: Expose `sessionPlanPath` + `linkedIssueId` in the plan-submitted event**

Grep for the plan-submitted emit site: `grep -rn "plan_submitted\|onPlanSubmitted" packages/server-core/src/sessions/SessionManager.ts`.

Ensure the event payload already includes the plan file path (likely does — that's how the review UI loads the plan). Confirm it also includes `linkedIssueId` from the managed session. If not, add it:

```typescript
// Inside the managed.agent.onPlanSubmitted handler in SessionManager.ts:
this.emit('plan_submitted', {
  sessionId: managed.id,
  planPath,                              // already there
  linkedIssueId: managed.linkedIssueId,  // add if missing
})
```

Update the TypeScript type for this event (grep for `plan_submitted` in the event-type union).

- [ ] **Step 2: Find the renderer-side plan approval handler**

Grep: `grep -rn "PlanReviewResult\|'approve'\|'saveOnly'" apps/electron/src/renderer --include='*.ts*'`

The handler is where the review modal's decision is submitted back to the agent. It typically looks like:

```typescript
const handleReview = async (result: PlanReviewResult) => {
  if (result.action === 'approve' || result.action === 'saveOnly') {
    // existing logic to resume/cancel the agent
  }
}
```

- [ ] **Step 3: Insert the copy-forward call**

Inside that handler, immediately after the `action === 'approve'` or `action === 'saveOnly'` branch is entered, call copy-forward. The handler already has access to the session (grep for the variable; commonly `session` or `activeSession`) and `workspaceId`.

```typescript
if (result.action === 'approve' || result.action === 'saveOnly') {
  try {
    const rel = await window.electronAPI.plans.copyForward(
      workspaceId,
      session.pendingPlanPath,       // grep for where the renderer stores the submitted plan path; adjust field name
      session.id,
      session.linkedIssueId,         // undefined if none → orphaned folder
    )
    if (session.linkedIssueId) {
      const issue = await window.electronAPI.issues.read(workspaceId, session.linkedIssueId)
      if (issue) {
        await window.electronAPI.issues.write(workspaceId, {
          ...issue,
          linkedPlanPaths: [...issue.linkedPlanPaths, rel],
          updatedAt: new Date().toISOString(),
        })
      }
    }
    // existing resume/cancel logic continues below…
  } catch (err) {
    console.error('[plans] copy-forward failed', err)
    // Surface an inline error near the plan dialog.
  }
}
```

If `session.pendingPlanPath` doesn't exist as a field, the renderer must be pulling the plan file path from the plan-submitted event. Grep for the event listener and capture the `planPath` there into state so the review handler can read it.

If `session.linkedIssueId` isn't available on the renderer-side session object, thread it through from the plan-submitted event (Step 1) into wherever the renderer stores active session metadata.

- [ ] **Step 4: Smoke test**

- Start session from an issue (Task 11).
- In the session, tell the agent "Plan this work."
- Agent calls SubmitPlan; plan review dialog appears.
- Click Accept Plan.
- Verify `{workspace}/docs/plans/{issue-slug}/plan-YYYY-MM-DD-HHMM.md` exists with correct frontmatter.
- Verify the issue's detail modal now shows the plan under "Linked plans".

- [ ] **Step 5: Orphaned-flow smoke test**

- Start a session without an issue (the normal "New session" flow).
- In it, have the agent SubmitPlan.
- Accept it.
- Verify `{workspace}/docs/plans/_orphaned/{sessionId}/plan-*.md` exists.

- [ ] **Step 6: Commit**

```bash
git add packages/server-core/src/sessions/SessionManager.ts \
        apps/electron/src/renderer/  # files touched in Step 2-3
git commit -m "feat(plans): copy-forward plan to docs/plans/{slug}/ on Accept Plan"
```

---

### Task 13: Session header "Working on Issue" chip

**Files:**
- Modify: the session header component (grep for where `session.name` is rendered at the top of an active session chat)

**Context:** When a session has `linkedIssueId`, show a small chip above or next to the session title. Click → opens `IssueDetailModal`. If issue is deleted, show greyed-out "Issue deleted".

- [ ] **Step 1: Locate the session header**

Run: `grep -rn "session\.name\|session\.title" apps/electron/src/renderer/components --include='*.tsx' | head -20`

Pick the file that renders the current session's header/title bar. Common names: `SessionHeader.tsx`, `ChatHeader.tsx`, or inline in an `AppShell` layout file.

- [ ] **Step 2: Expose `linkedIssueId` on the renderer session object**

If the renderer's session object doesn't already carry `linkedIssueId` (it should after Task 6 + Task 12 wiring), grep for where the session object is hydrated from the main process and add the field.

- [ ] **Step 3: Render the chip**

Inside the session header component, near the title:

```tsx
import { useEffect, useState } from 'react'
import type { Issue } from '@craft-agent/shared/issues'

// …inside the component, assuming `session` and `workspaceId` are in scope:
const [linkedIssue, setLinkedIssue] = useState<Issue | null | 'deleted'>(null)

useEffect(() => {
  if (!session.linkedIssueId) { setLinkedIssue(null); return }
  let cancelled = false
  ;(async () => {
    const issue = await window.electronAPI.issues.read(workspaceId, session.linkedIssueId!)
    if (!cancelled) setLinkedIssue(issue ?? 'deleted')
  })()
  return () => { cancelled = true }
}, [session.linkedIssueId, workspaceId])

// …in JSX, adjacent to the session title:
{linkedIssue === 'deleted' && (
  <span className="text-xs text-muted-foreground/60 italic">Issue deleted</span>
)}
{linkedIssue && linkedIssue !== 'deleted' && (
  <button
    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
    onClick={() => onOpenIssue(linkedIssue.id)}
  >
    Working on Issue: <span className="font-medium">{linkedIssue.title}</span>
  </button>
)}
```

`onOpenIssue` should route to the IssuesPanel with the detail modal open for the given issue — thread it down from the AppShell's existing panel-open plumbing (grep for how IssuesPanel is toggled today).

- [ ] **Step 4: Smoke test**

- Start session from an issue → header shows the chip with the issue title.
- Delete the issue while the session is active → chip becomes greyed "Issue deleted".
- Click the chip for a live issue → IssueDetailModal opens.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/  # the header file(s)
git commit -m "feat(sessions): 'Working on Issue' chip in session header"
```

---

### Task 14: Plans right-sidebar tab + PlanViewerModal

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/PlansPanel.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/PlanViewerModal.tsx`
- Modify: right-sidebar tab registration (file TBD — introduced by the prerequisite plan `docs/superpowers/plans/2026-04-21-right-sidebar-chrome.md`)

**Context:** Prerequisite — the right-sidebar chrome plan must be merged first (it lands the tab-registration API). This task adds the Plans tab content and a read-only PlanViewerModal.

- [ ] **Step 1: Verify prerequisite is merged**

Run: `git log --oneline --all | grep -i "right-sidebar\|sidebar chrome" | head -5`

If the prerequisite hasn't landed, STOP. Execute `docs/superpowers/plans/2026-04-21-right-sidebar-chrome.md` first.

- [ ] **Step 2: Implement `PlanViewerModal`**

`apps/electron/src/renderer/components/app-shell/PlanViewerModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'  // adjust import path to existing dialog primitive
import { Button } from '../ui/button'

interface PlanViewerModalProps {
  workspaceId: string
  workspaceRelativePath: string
  onClose: () => void
  onOpenSession: (sessionId: string) => void
  onOpenIssue: (issueId: string) => void
}

interface PlanData {
  frontmatter: {
    issueId: string | null
    issueSlug: string | null
    sessionId: string
    acceptedAt: string
    planVersion: number
  }
  body: string
}

export function PlanViewerModal({
  workspaceId, workspaceRelativePath, onClose, onOpenSession, onOpenIssue,
}: PlanViewerModalProps) {
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [sessionExists, setSessionExists] = useState<boolean | null>(null)
  const [issueExists, setIssueExists] = useState<boolean | null>(null)

  useEffect(() => {
    (async () => {
      const data = await window.electronAPI.plans.read(workspaceId, workspaceRelativePath)
      setPlan(data)
      if (data) {
        // Probe existence.
        setSessionExists(await sessionExistsCheck(workspaceId, data.frontmatter.sessionId))
        setIssueExists(data.frontmatter.issueId
          ? (await window.electronAPI.issues.read(workspaceId, data.frontmatter.issueId)) !== null
          : false)
      }
    })()
  }, [workspaceId, workspaceRelativePath])

  if (!plan) return null

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Plan v{plan.frontmatter.planVersion} — {new Date(plan.frontmatter.acceptedAt).toLocaleString()}
          </DialogTitle>
        </DialogHeader>
        <pre className="whitespace-pre-wrap font-mono text-sm max-h-[60vh] overflow-auto p-3 bg-muted/20 rounded">
          {plan.body}
        </pre>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            disabled={sessionExists === false}
            onClick={() => onOpenSession(plan.frontmatter.sessionId)}
          >
            {sessionExists === false ? 'Session deleted' : 'Go to session'}
          </Button>
          <Button
            variant="outline"
            disabled={!issueExists}
            onClick={() => plan.frontmatter.issueId && onOpenIssue(plan.frontmatter.issueId)}
          >
            {!plan.frontmatter.issueId ? 'No linked issue' : issueExists === false ? 'Issue deleted' : 'Open issue'}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigator.clipboard.writeText(workspaceRelativePath)}
          >
            Copy path
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

async function sessionExistsCheck(workspaceId: string, sessionId: string): Promise<boolean> {
  // Grep for existing renderer helper: `window.electronAPI.getSession(workspaceId, sessionId)` or similar.
  try {
    const s = await window.electronAPI.getSession?.(workspaceId, sessionId)
    return s !== null && s !== undefined
  } catch {
    return false
  }
}
```

If no `getSession` IPC method exists, add one (single-line handler that wraps `SessionManager.getSession`) and expose it on preload.

Markdown rendering note: `<pre>` is a deliberate YAGNI choice — no `react-markdown` dependency added for Y. If a richer renderer is already in the codebase (grep for existing markdown renderers in session output), use it instead.

- [ ] **Step 3: Implement `PlansPanel`**

`apps/electron/src/renderer/components/app-shell/PlansPanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { PlanViewerModal } from './PlanViewerModal'

interface PlansPanelProps {
  workspaceId: string
  onOpenSession: (sessionId: string) => void
  onOpenIssue: (issueId: string) => void
}

interface PlanEntry {
  workspaceRelativePath: string
  issueId: string | null
  issueSlug: string | null
  sessionId: string
  acceptedAt: string
  planVersion: number
}

export function PlansPanel({ workspaceId, onOpenSession, onOpenIssue }: PlansPanelProps) {
  const [plans, setPlans] = useState<PlanEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setPlans(await window.electronAPI.plans.list(workspaceId))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { refresh() }, [refresh])

  // Group by issueSlug, preserve newest-first order inside each group.
  const groups = plans.reduce<Record<string, PlanEntry[]>>((acc, p) => {
    const key = p.issueSlug ?? '_orphaned'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Plans</h2>
        <button className="text-xs underline" onClick={refresh}>Refresh</button>
      </div>
      {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
      {!loading && plans.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No plans yet. Accept a plan in a session to see it here.
        </div>
      )}
      {Object.entries(groups).map(([slug, entries]) => (
        <div key={slug} className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">{slug}</div>
          <ul className="space-y-0.5">
            {entries.map(p => (
              <li key={p.workspaceRelativePath}>
                <button
                  className="text-xs underline text-left"
                  onClick={() => setSelected(p.workspaceRelativePath)}
                >
                  v{p.planVersion} — {new Date(p.acceptedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {selected && (
        <PlanViewerModal
          workspaceId={workspaceId}
          workspaceRelativePath={selected}
          onClose={() => setSelected(null)}
          onOpenSession={onOpenSession}
          onOpenIssue={onOpenIssue}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Register the Plans tab with the right-sidebar chrome**

Open the right-sidebar tab registry file (introduced by the prerequisite plan; grep for `registerSidebarTab\|sidebarTabs\|RIGHT_SIDEBAR_TABS` or similar). Register a new tab entry with:
- id: `'plans'`
- label: `'Plans'`
- icon: `FileText` from `lucide-react` (already used elsewhere)
- component: `<PlansPanel workspaceId={workspaceId} onOpenSession={...} onOpenIssue={...} />`

If the prerequisite uses a different API shape, adapt to whatever it exposes. The exact registration code cannot be specified here because it depends on the prerequisite.

- [ ] **Step 5: Wire `onOpenPlan` in IssuesPanel / IssueDetailModal to open `PlanViewerModal`**

Revisit Task 10 Step 4 (the renumbered step that wires props into `IssuesPanel`). Replace the `onOpenPlan` stub and add a local state handler for `onOpenIssue`:

```tsx
// At the top of IssuesPanel:
const [planViewerPath, setPlanViewerPath] = useState<string | null>(null)

// `selectedIssue` is already state in IssuesPanel (from Task 10). `issues` is from useIssues.
const openIssueById = useCallback((id: string) => {
  const found = issues.find(i => i.id === id)
  if (found) setSelectedIssue(found)
  else console.warn('[plans] onOpenIssue: issue not found', id)
}, [issues])

// Pass setPlanViewerPath as onOpenPlan to IssueDetailModal.
// <IssueDetailModal ... onOpenPlan={setPlanViewerPath} />

// Render PlanViewerModal at the bottom of IssuesPanel's JSX:
{planViewerPath && (
  <PlanViewerModal
    workspaceId={workspaceId}
    workspaceRelativePath={planViewerPath}
    onClose={() => setPlanViewerPath(null)}
    onOpenSession={onOpenSession}
    onOpenIssue={openIssueById}
  />
)}
```

- [ ] **Step 6: Smoke test**

- Open the right sidebar → new Plans tab present.
- Accept a plan in a session.
- Plans tab list updates (click Refresh if needed).
- Click a plan → PlanViewerModal opens with markdown body and three action buttons.
- Delete the linked session → re-open the plan → "Go to session" is disabled.
- Delete the linked issue → "Open issue" is disabled.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/PlansPanel.tsx \
        apps/electron/src/renderer/components/app-shell/PlanViewerModal.tsx \
        apps/electron/src/renderer/components/app-shell/IssuesPanel.tsx \
        apps/electron/src/renderer/components/app-shell/IssueDetailModal.tsx
# Plus whatever file registers the sidebar tab (from Step 4).
git commit -m "feat(plans): right-sidebar Plans tab + PlanViewerModal"
```

---

### Task 15: Integration walkthrough

**Files:** None — this is a verification task.

**Context:** Final end-to-end check that the pipeline works as specified.

- [ ] **Step 1: Run all unit tests**

```bash
cd /Users/mauriello/Dev/rowl-v2 && bun test packages/shared/src/issues 2>&1 | tail -30
```
Expected: all tests PASS (file-format, slug, timestamp, first-turn-context, copy-plan-forward, issues-storage).

- [ ] **Step 2: Run the full integration checklist from spec §7.2**

Manually in the running app:

- [ ] Create issue → edit in modal with markdown + pasted image → save → file on disk has correct frontmatter and attachment under `issues/{id}/attachments/`.
- [ ] Click "Start Session" on the issue → new session opens with first-turn context populated, permission mode forced to safe, issue's `linkedSessionIds` updated, status transitions backlog → in_progress.
- [ ] In the session, ask the agent to plan → `SubmitPlan` tool call shows up → plan appears in chat → click "Accept Plan" → file appears at `docs/plans/{slug}/plan-*.md` with correct frontmatter, issue's `linkedPlanPaths` updated.
- [ ] Open right-sidebar Plans tab → plan is listed → click it → `PlanViewerModal` renders markdown → "Go to session" and "Open issue" buttons work.
- [ ] Delete linked session → `PlanViewerModal` shows "Go to session" disabled.
- [ ] Start a fresh workspace with old localStorage issues → migration banner appears → click Migrate → files created, banner cleared.
- [ ] Delete issue → `.md` and attachment folder both gone.
- [ ] Start a session WITHOUT an issue, have the agent SubmitPlan, Accept → plan lands under `docs/plans/_orphaned/{sessionId}/`.

- [ ] **Step 3: Commit the completion note**

```bash
git commit --allow-empty -m "chore: issue-to-plan pipeline Y complete"
```

---

## Notes for implementers

1. **Gotcha: legacy `useIssues` ID shape.** The old hook uses `issue_${timestamp}_${random}` IDs, not `issue_{hex}`. Migrated issues keep their legacy IDs (Task 9). Tests use `issue_abc` etc. — don't constrain the real ID format in runtime code.

2. **Gotcha: `gray-matter` strips YAML-incompatible content.** If a user writes `---` in their description, it may confuse the parser. gray-matter handles this correctly on the first `---` pair only, but be aware during review.

3. **`PlanReviewResult` field is `action`, not `decision`.** The spec has a minor typo.

4. **`transferredSessionSummary` flow is new for non-transfer callers.** Existing transfer RPC keeps working because Task 6 only ADDS a new path.

5. **Right-sidebar tab registration API is defined by the prerequisite plan.** Task 14 may need small adjustments once that plan lands.

6. **YAGNI markdown editor.** Spec §5.1 mentions CodeMirror ("same pattern as session input") for the description editor. This plan deliberately deviates: a plain textarea with paste/drop handlers covers all Y requirements (writing markdown, pasting images). CodeMirror integration is a clear follow-up and not a blocker for the pipeline. Resist scope creep unless a later sub-project explicitly calls for it.

7. **Workspace-scoped IPC.** Every IPC call takes `workspaceId` — this matches existing Rowl patterns for other per-workspace resources.

8. **Per-issue attachment dedup is content-hashed.** Writing the same image twice reuses the existing file (same SHA-256 prefix → same filename).

9. **Atomic writes.** We use temp-file + rename within the same directory (`issues-storage.ts`, `copy-plan-forward.ts`). This is atomic on the same filesystem but not across mount points. Workspaces are always a single root so this is fine.

10. **Toast/notification.** We use inline error banners + `console.error`/`console.warn` intentionally — no new toast infrastructure in Y. If a toast system lands via the right-sidebar-chrome plan, a follow-up can adopt it.

11. **Permission-denied errors (spec §6.10).** The plan does NOT introduce a dedicated `safeWriteFile` helper. Instead, the IPC handlers (Task 8) let `writeFileSync`/`renameSync` throw naturally; errors propagate across IPC to the renderer where call sites surface them via inline error banners (`setInlineError(...)`) and `console.error`. `atomicWriteFileSync` is safe against partial writes (temp file + rename), so a mid-write failure leaves the existing file untouched. If a cross-cutting toast system lands later, migrating these sites is a trivial one-liner change per call site.
