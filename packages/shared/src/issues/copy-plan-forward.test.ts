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
