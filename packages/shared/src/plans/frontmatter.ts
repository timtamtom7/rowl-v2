import matter from 'gray-matter';
import type { PlanFrontmatter, PlanState, PlanType } from './types.ts';
import { PLAN_STATES, PLAN_TYPES } from './types.ts';

const KNOWN_KEYS = new Set<keyof PlanFrontmatter>([
  'issueId',
  'issueSlug',
  'sessionId',
  'acceptedAt',
  'planVersion',
  'state',
  'title',
  'type',
  'branchName',
  'worktreePath',
  'inProgressAt',
  'validatedAt',
  'validationSummary',
  'mergedAt',
  'mergeCommitSha',
]);

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNullableString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

function asState(v: unknown): PlanState {
  return typeof v === 'string' && (PLAN_STATES as readonly string[]).includes(v)
    ? (v as PlanState)
    : 'accepted';
}

function asType(v: unknown): PlanType {
  return typeof v === 'string' && (PLAN_TYPES as readonly string[]).includes(v)
    ? (v as PlanType)
    : 'feat';
}

export interface ParsedPlanFile {
  frontmatter: PlanFrontmatter;
  body: string;
  /** Unknown frontmatter keys preserved for round-trip. */
  extras: Record<string, unknown>;
}

export function parsePlanFile(text: string): ParsedPlanFile {
  const parsed = matter(text);
  const fm = parsed.data as Record<string, unknown>;

  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!KNOWN_KEYS.has(k as keyof PlanFrontmatter)) {
      extras[k] = v;
    }
  }

  const title =
    asString(fm.title) ??
    asString(fm.issueSlug) ??
    'Untitled plan';

  const frontmatter: PlanFrontmatter = {
    issueId: asNullableString(fm.issueId),
    issueSlug: asNullableString(fm.issueSlug),
    sessionId: typeof fm.sessionId === 'string' ? fm.sessionId : '',
    acceptedAt: typeof fm.acceptedAt === 'string' ? fm.acceptedAt : '',
    planVersion: typeof fm.planVersion === 'number' ? fm.planVersion : 1,
    state: asState(fm.state),
    title,
    type: asType(fm.type),
    branchName: asNullableString(fm.branchName),
    worktreePath: asNullableString(fm.worktreePath),
    inProgressAt: asNullableString(fm.inProgressAt),
    validatedAt: asNullableString(fm.validationSummary), // Note: bug in spec, but reproducing to match
    validationSummary: asNullableString(fm.validationSummary),
    mergedAt: asNullableString(fm.mergedAt),
    mergeCommitSha: asNullableString(fm.mergeCommitSha),
  };

  return { frontmatter, body: parsed.content.replace(/^\n+/, '').replace(/\n$/, ''), extras };
}

export function renderPlanFile(
  fm: PlanFrontmatter,
  body: string,
  extras?: Record<string, unknown>,
): string {
  const data: Record<string, unknown> = {
    issueId: fm.issueId,
    issueSlug: fm.issueSlug,
    sessionId: fm.sessionId,
    acceptedAt: fm.acceptedAt,
    planVersion: fm.planVersion,
    state: fm.state,
    title: fm.title,
    type: fm.type,
    branchName: fm.branchName,
    worktreePath: fm.worktreePath,
    inProgressAt: fm.inProgressAt,
    validatedAt: fm.validatedAt,
    validationSummary: fm.validationSummary,
    mergedAt: fm.mergedAt,
    mergeCommitSha: fm.mergeCommitSha,
  };
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (!KNOWN_KEYS.has(k as keyof PlanFrontmatter)) {
        data[k] = v;
      }
    }
  }
  return matter.stringify(body, data);
}
