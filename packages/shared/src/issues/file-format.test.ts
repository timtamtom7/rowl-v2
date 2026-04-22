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
