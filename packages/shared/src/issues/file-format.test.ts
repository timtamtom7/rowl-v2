import { describe, expect, it } from 'bun:test';
import type { Issue } from './types.ts';
import { createIssue, generateIssueId } from './types.ts';
import { IssueParseError, parseIssueFile, serializeIssueFile } from './file-format.ts';

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
  it('round-trips all fields with no extras', () => {
    const text = serializeIssueFile(FIXTURE);
    const { issue, extras } = parseIssueFile(text);
    expect(issue).toEqual(FIXTURE);
    expect(extras).toEqual({});
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
    const { issue, extras } = parseIssueFile(legacy);
    expect(issue.linkedSessionIds).toEqual(['old-session-id']);
    expect(issue.linkedPlanPaths).toEqual([]);
    // Legacy key is migrated, not preserved as an extra.
    expect(extras).not.toHaveProperty('linkedSessionId');
  });

  it('defaults missing linkedPlanPaths and linkedSessionIds to [] and has no extras', () => {
    const minimal = `---
id: issue_mini
title: Minimal
status: backlog
priority: low
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

`;
    const { issue, extras } = parseIssueFile(minimal);
    expect(issue.linkedSessionIds).toEqual([]);
    expect(issue.linkedPlanPaths).toEqual([]);
    expect(issue.attachments).toBeUndefined();
    expect(extras).toEqual({});
  });

  it('preserves unknown frontmatter keys via the extras object and survives a shallow-clone edit', () => {
    const withExtra = `---
id: issue_x
title: Has extra
status: backlog
priority: low
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
linkedSessionIds: []
linkedPlanPaths: []
futureField: someValue
---

body`;
    const { issue, extras } = parseIssueFile(withExtra);
    expect(extras.futureField).toBe('someValue');

    // Realistic edit flow: caller shallow-clones the issue, flips a field,
    // and writes back. Extras must survive because they are tracked separately.
    const serialized = serializeIssueFile({ ...issue, status: 'done' }, extras);
    expect(serialized).toContain('futureField: someValue');
    expect(serialized).toContain('status: done');

    const { issue: reparsed, extras: reparsedExtras } = parseIssueFile(serialized);
    expect(reparsed.status).toBe('done');
    expect(reparsedExtras.futureField).toBe('someValue');
  });

  it('throws a typed IssueParseError on malformed frontmatter', () => {
    const broken = `---
id: issue_x
title: "unterminated
---

body`;
    expect(() => parseIssueFile(broken)).toThrow(IssueParseError);
  });

  it('round-trips an issue with no description as undefined', () => {
    const issue: Issue = { ...createIssue('Just a title'), id: generateIssueId() };
    const { issue: parsed } = parseIssueFile(serializeIssueFile(issue));
    expect(parsed.description).toBeUndefined();
    expect(parsed.title).toBe('Just a title');
  });
});
