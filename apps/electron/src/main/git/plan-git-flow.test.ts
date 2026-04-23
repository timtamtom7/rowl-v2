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

    // Mark validated on disk so we get past the state check.
    const { frontmatter, body } = parsePlanFile(readFileSync(planAbs, 'utf-8'));
    const validated = { ...frontmatter, state: 'validated' as const, validatedAt: new Date().toISOString() };
    writeFileSync(planAbs, renderPlanFile(validated, body));

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
