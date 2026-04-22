import matter from 'gray-matter';
import type { Issue } from './types.ts';

interface LegacyIssueFrontmatter {
  id: string;
  title: string;
  description?: string;
  status: Issue['status'];
  priority: Issue['priority'];
  createdAt: string;
  updatedAt: string;
  linkedSessionId?: string;
  linkedSessionIds?: string[];
  linkedPlanPaths?: string[];
  attachments?: string[];
  [extra: string]: unknown;
}

export class IssueParseError extends Error {
  static readonly code = 'ISSUE_PARSE_ERROR' as const;
  readonly code = IssueParseError.code;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IssueParseError';
  }
}

/**
 * Result of parsing an issue file.
 *
 * `issue` contains only the declared `Issue` fields. `extras` holds any
 * unknown frontmatter keys so they can be round-tripped back to disk without
 * being smuggled onto the `Issue` object itself.
 */
export interface ParsedIssue {
  issue: Issue;
  extras: Record<string, unknown>;
}

/**
 * Parse a markdown-with-frontmatter issue file.
 *
 * - Migrates legacy singular `linkedSessionId` -> `linkedSessionIds: [id]`.
 *   The legacy key is dropped from `extras` (it is migrated, not preserved).
 * - Unknown frontmatter keys are returned in `extras` for round-trip safety.
 * - Throws `IssueParseError` on malformed YAML.
 */
export function parseIssueFile(text: string): ParsedIssue {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text);
  } catch (err) {
    throw new IssueParseError('Malformed issue frontmatter', { cause: err });
  }

  const fm = parsed.data as LegacyIssueFrontmatter;

  // Legacy migration.
  const linkedSessionIds = Array.isArray(fm.linkedSessionIds)
    ? fm.linkedSessionIds
    : typeof fm.linkedSessionId === 'string' && fm.linkedSessionId.length > 0
      ? [fm.linkedSessionId]
      : [];

  const linkedPlanPaths = Array.isArray(fm.linkedPlanPaths) ? fm.linkedPlanPaths : [];
  const attachments = Array.isArray(fm.attachments) ? fm.attachments : undefined;

  const description =
    parsed.content.trim() === ''
      ? fm.description ?? ''
      : parsed.content.replace(/^\n+/, '').replace(/\n+$/, '');

  // Collect unknown frontmatter keys for round-trip preservation.
  // `linkedSessionId` is intentionally dropped — it has been migrated into
  // `linkedSessionIds` and should not be persisted alongside the new shape.
  const knownKeys = new Set([
    'id', 'title', 'description', 'status', 'priority',
    'createdAt', 'updatedAt', 'linkedSessionId', 'linkedSessionIds',
    'linkedPlanPaths', 'attachments',
  ]);
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!knownKeys.has(key)) extras[key] = value;
  }

  const issue: Issue = {
    id: fm.id,
    title: fm.title,
    description: description || undefined,
    status: fm.status,
    priority: fm.priority,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt,
    linkedSessionIds,
    linkedPlanPaths,
    ...(attachments ? { attachments } : {}),
  };

  return { issue, extras };
}

/**
 * Serialize an `Issue` to markdown-with-frontmatter.
 *
 * Body is the issue's `description`. `extras` is any unknown frontmatter keys
 * the caller wants to preserve (typically the `extras` returned by
 * `parseIssueFile`). Core `Issue` fields are written first, then extras — so
 * output ordering stays stable across round-trips.
 *
 * The legacy `linkedSessionId` key is explicitly dropped if present in extras.
 */
export function serializeIssueFile(
  issue: Issue,
  extras: Record<string, unknown> = {},
): string {
  const fm: Record<string, unknown> = {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    linkedSessionIds: issue.linkedSessionIds,
    linkedPlanPaths: issue.linkedPlanPaths,
  };
  if (issue.attachments && issue.attachments.length > 0) {
    fm.attachments = issue.attachments;
  }

  for (const [key, value] of Object.entries(extras)) {
    if (key === 'linkedSessionId') continue; // migrated; never re-emit
    if (key in fm) continue; // never override a core field
    fm[key] = value;
  }

  return matter.stringify(issue.description ?? '', fm);
}
