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
