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
