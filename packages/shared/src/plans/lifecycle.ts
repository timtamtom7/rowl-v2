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
