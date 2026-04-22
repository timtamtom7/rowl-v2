import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import type { Issue } from './types.ts';
import { parseIssueFile, serializeIssueFile } from './file-format.ts';

function issuesDir(workspaceRoot: string): string {
  return join(workspaceRoot, 'issues');
}

function issuePath(workspaceRoot: string, id: string): string {
  return join(issuesDir(workspaceRoot), `${id}.md`);
}

function attachmentsDir(workspaceRoot: string, id: string): string {
  return join(issuesDir(workspaceRoot), id, 'attachments');
}

export function listIssues(workspaceRoot: string): Issue[] {
  const dir = issuesDir(workspaceRoot);
  if (!existsSync(dir)) return [];

  const issues: Issue[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (!stat.isFile()) continue;
      const text = readFileSync(full, 'utf-8');
      const { issue } = parseIssueFile(text);
      issues.push(issue);
    } catch {
      // Skip unreadable / malformed files silently; caller sees what it sees.
    }
  }

  return issues.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readIssue(workspaceRoot: string, id: string): Issue | null {
  const path = issuePath(workspaceRoot, id);
  if (!existsSync(path)) return null;
  try {
    const { issue } = parseIssueFile(readFileSync(path, 'utf-8'));
    return issue;
  } catch {
    return null;
  }
}

export function writeIssue(workspaceRoot: string, issue: Issue): void {
  const path = issuePath(workspaceRoot, issue.id);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, serializeIssueFile(issue, {}));
}

export function deleteIssue(workspaceRoot: string, id: string): void {
  const mdPath = issuePath(workspaceRoot, id);
  if (existsSync(mdPath)) rmSync(mdPath, { force: true });

  const attachDir = join(issuesDir(workspaceRoot), id);
  if (existsSync(attachDir)) {
    try {
      rmSync(attachDir, { recursive: true, force: true });
    } catch (err) {
      // Attachment folder cleanup failure must not block the .md delete.
      // eslint-disable-next-line no-console
      console.warn(`[issues-storage] Failed to remove attachments for ${id}:`, err);
    }
  }
}

export function writeAttachment(
  workspaceRoot: string,
  issueId: string,
  filename: string,
  bytes: Uint8Array,
): string {
  const dir = attachmentsDir(workspaceRoot, issueId);
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, filename);
  writeFileSync(abs, bytes);
  return `issues/${issueId}/attachments/${filename}`;
}

function atomicWriteFileSync(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, path);
}
