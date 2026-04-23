import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
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

// ---------------------------------------------------------------------------
// Backup storage — ~/.craft-agent/issues-backup/{workspaceId}.json
// Survives filesystem deletion, git clean, .gitignore wipes, etc.
// ---------------------------------------------------------------------------

const BACKUP_DIR = join(homedir(), '.craft-agent', 'issues-backup');

function backupPath(workspaceId: string): string {
  return join(BACKUP_DIR, `${workspaceId}.json`);
}

function readBackup(workspaceId: string): Issue[] | null {
  const path = backupPath(workspaceId);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as Issue[];
    return null;
  } catch {
    return null;
  }
}

function writeBackup(workspaceId: string, issues: Issue[]): void {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const tmp = `${backupPath(workspaceId)}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(issues, null, 2), 'utf-8');
  renameSync(tmp, backupPath(workspaceId));
}

function removeBackup(workspaceId: string): void {
  const path = backupPath(workspaceId);
  if (existsSync(path)) rmSync(path, { force: true });
}

// ---------------------------------------------------------------------------
// Auto-restore: if filesystem issues/ dir is empty but backup exists,
// silently restore all issues from backup to filesystem.
// ---------------------------------------------------------------------------

function autoRestoreFromBackup(workspaceRoot: string, workspaceId: string): Issue[] | null {
  const dir = issuesDir(workspaceRoot);
  const fsHasFiles = existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.md'));
  if (fsHasFiles) return null; // filesystem is healthy, no restore needed

  const backup = readBackup(workspaceId);
  if (!backup || backup.length === 0) return null; // no backup to restore from

  // Restore all issues from backup to filesystem
  mkdirSync(dir, { recursive: true });
  for (const issue of backup) {
    try {
      const path = issuePath(workspaceRoot, issue.id);
      mkdirSync(dirname(path), { recursive: true });
      atomicWriteFileSync(path, serializeIssueFile(issue, {}));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[issues-storage] Restore failed for ${issue.id}:`, err);
    }
  }

  // eslint-disable-next-line no-console
  console.info(`[issues-storage] Auto-restored ${backup.length} issues from backup for ${workspaceId}`);
  return backup;
}

export function listIssues(workspaceRoot: string, workspaceId?: string): Issue[] {
  // Try auto-restore first if workspaceId is provided
  if (workspaceId) {
    const restored = autoRestoreFromBackup(workspaceRoot, workspaceId);
    if (restored) return restored;
  }

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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[issues-storage] Skipped ${entry}: ${(err as Error).message}`);
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

export function writeIssue(
  workspaceRoot: string,
  workspaceId: string | undefined,
  issue: Issue,
): void {
  const path = issuePath(workspaceRoot, issue.id);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, serializeIssueFile(issue, {}));

  // Sync backup
  if (workspaceId) {
    try {
      const all = listIssues(workspaceRoot); // read fresh from fs
      writeBackup(workspaceId, all);
    } catch {
      // backup is best-effort; don't fail the primary write
    }
  }
}

export function deleteIssue(
  workspaceRoot: string,
  workspaceId: string | undefined,
  id: string,
): void {
  const mdPath = issuePath(workspaceRoot, id);
  if (existsSync(mdPath)) rmSync(mdPath, { force: true });

  const attachDir = join(issuesDir(workspaceRoot), id);
  if (existsSync(attachDir)) {
    try {
      rmSync(attachDir, { recursive: true, force: true });
    } catch (err) {
      // The .md file is already gone at this point. Attachment-folder cleanup
      // is best-effort — surface a warning but don't propagate, so the primary
      // delete stays successful from the caller's perspective.
      // eslint-disable-next-line no-console
      console.warn(`[issues-storage] Failed to remove attachments for ${id}:`, err);
    }
  }

  // Sync backup
  if (workspaceId) {
    try {
      const all = listIssues(workspaceRoot);
      if (all.length === 0) {
        removeBackup(workspaceId);
      } else {
        writeBackup(workspaceId, all);
      }
    } catch {
      // backup is best-effort
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
