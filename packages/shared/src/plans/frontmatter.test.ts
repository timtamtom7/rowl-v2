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
