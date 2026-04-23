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
