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
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'IssueParseError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Parse a markdown-with-frontmatter issue file into an `Issue`.
 * Migrates legacy singular `linkedSessionId` → `linkedSessionIds: [id]`.
 * Throws `IssueParseError` on malformed YAML.
 */
export function parseIssueFile(text: string): Issue {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text);
  } catch (err) {
    throw new IssueParseError('Malformed issue frontmatter', err);
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

  const description = parsed.content.trim() === '' ? fm.description ?? '' : parsed.content.replace(/^\n+/, '').replace(/\n+$/, '');

  // Collect unknown frontmatter keys for round-trip preservation.
  const knownKeys = new Set([
    'id', 'title', 'description', 'status', 'priority',
    'createdAt', 'updatedAt', 'linkedSessionId', 'linkedSessionIds',
    'linkedPlanPaths', 'attachments',
  ]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!knownKeys.has(key)) extra[key] = value;
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

  // Attach extra keys directly onto the object for round-trip preservation.
  if (Object.keys(extra).length > 0) {
    Object.assign(issue, extra);
  }

  return issue;
}

/**
 * Serialize an `Issue` to markdown-with-frontmatter.
 * Body is the issue's `description`. Preserves any unknown frontmatter keys
 * passed in via `extraFrontmatter` (round-trip safety).
 */
const KNOWN_ISSUE_KEYS = new Set([
  'id', 'title', 'description', 'status', 'priority',
  'createdAt', 'updatedAt', 'linkedSessionIds', 'linkedPlanPaths', 'attachments',
]);

export function serializeIssueFile(
  issue: Issue,
  extraFrontmatter?: Record<string, unknown>,
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

  // Preserve any extra keys that were attached to the issue object at parse time.
  for (const [key, value] of Object.entries(issue as Record<string, unknown>)) {
    if (!KNOWN_ISSUE_KEYS.has(key) && key !== 'linkedSessionId') fm[key] = value;
  }

  // Also merge explicit extraFrontmatter (caller-provided).
  if (extraFrontmatter) {
    for (const [key, value] of Object.entries(extraFrontmatter)) {
      if (!(key in fm) && key !== 'linkedSessionId') fm[key] = value;
    }
  }

  return matter.stringify(issue.description ?? '', fm);
}
