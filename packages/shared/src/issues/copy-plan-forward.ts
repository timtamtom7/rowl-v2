import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join, relative } from 'path';
import matter from 'gray-matter';
import type { Issue } from './types.ts';
import { slugify } from './slug.ts';
import { formatTimestamp } from './timestamp.ts';
import { normalizePath } from '../utils/paths.ts';

export interface CopyPlanForwardInput {
  sessionPlanPath: string;        // absolute
  sessionId: string;
  issue: Issue | undefined;
  workspaceRoot: string;          // absolute
  planStoragePath: string;        // workspace-relative, e.g. 'docs/plans'
  now?: Date;                     // override for tests
  tz?: 'UTC' | 'local';           // override for tests
}

export interface PlanFrontmatter {
  issueId: string | null;
  issueSlug: string | null;
  sessionId: string;
  acceptedAt: string;
  planVersion: number;
}

/**
 * Copy a session's plan file into the workspace's git-trackable plan store,
 * prepending frontmatter that links the plan back to its issue + session.
 *
 * Returns the workspace-relative path of the written file.
 *
 * @remarks
 * **Concurrency:** This function is designed to be called serially from the
 * Electron main process' event loop. The `countExistingPlans` →
 * `resolveCollision` → atomic-write chain is TOCTOU-safe only under that
 * assumption. Do not invoke from worker threads or concurrent async flows
 * against the same target directory without adding a per-target lock —
 * doing so will corrupt `planVersion` counts and may race collision suffixes.
 */
export async function copyPlanForward(input: CopyPlanForwardInput): Promise<string> {
  const { sessionPlanPath, sessionId, issue, workspaceRoot, planStoragePath } = input;
  const now = input.now ?? new Date();
  const tz = input.tz ?? 'UTC';

  const slug = issue ? slugify(issue.title) : null;
  const targetDir = issue
    ? join(workspaceRoot, planStoragePath, slug!)
    : join(workspaceRoot, planStoragePath, '_orphaned', sessionId);

  mkdirSync(targetDir, { recursive: true });

  const ts = formatTimestamp(now, tz);
  const filename = resolveCollision(targetDir, `plan-${ts}.md`);
  const targetAbs = join(targetDir, filename);
  const version = countExistingPlans(targetDir) + 1;

  const body = readFileSync(sessionPlanPath, 'utf-8');
  const fm: PlanFrontmatter = {
    issueId: issue?.id ?? null,
    issueSlug: slug,
    sessionId,
    acceptedAt: now.toISOString(),
    planVersion: version,
  };
  const output = matter.stringify(stripExistingFrontmatter(body), fm);

  atomicWriteFileSync(targetAbs, output);
  return normalizePath(relative(workspaceRoot, targetAbs));
}

export function countExistingPlans(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => /^plan-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.md$/.test(f)).length;
}

export function resolveCollision(dir: string, desired: string): string {
  if (!existsSync(join(dir, desired))) return desired;
  const base = desired.replace(/\.md$/, '');
  let n = 2;
  while (existsSync(join(dir, `${base}-${n}.md`))) n++;
  return `${base}-${n}.md`;
}

function stripExistingFrontmatter(body: string): string {
  // If the session plan file already has frontmatter, drop it — we're
  // writing our own.
  try {
    const parsed = matter(body);
    return parsed.content;
  } catch {
    return body;
  }
}

function atomicWriteFileSync(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, path);
}
