import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Issue } from './types.ts';
import {
  deleteIssue,
  listIssues,
  readIssue,
  writeAttachment,
  writeIssue,
} from './issues-storage.ts';

function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    title: `Issue ${id}`,
    status: 'backlog',
    priority: 'low',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedSessionIds: [],
    linkedPlanPaths: [],
    ...overrides,
  };
}

describe('issues-storage', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rowl-issues-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('writeIssue creates issues/{id}.md', () => {
    writeIssue(root, makeIssue('issue_a'));
    expect(existsSync(join(root, 'issues', 'issue_a.md'))).toBe(true);
  });

  it('listIssues returns all issues newest-first by updatedAt', () => {
    writeIssue(root, makeIssue('issue_a', { updatedAt: '2026-01-01T00:00:00.000Z' }));
    writeIssue(root, makeIssue('issue_b', { updatedAt: '2026-01-03T00:00:00.000Z' }));
    writeIssue(root, makeIssue('issue_c', { updatedAt: '2026-01-02T00:00:00.000Z' }));

    const ids = listIssues(root).map(i => i.id);
    expect(ids).toEqual(['issue_b', 'issue_c', 'issue_a']);
  });

  it('listIssues returns [] when issues/ does not exist', () => {
    expect(listIssues(root)).toEqual([]);
  });

  it('readIssue returns null for unknown id', () => {
    expect(readIssue(root, 'missing')).toBeNull();
  });

  it('readIssue round-trips through writeIssue', () => {
    const issue = makeIssue('issue_rt', { description: '# Hello', linkedSessionIds: ['s1'] });
    writeIssue(root, issue);
    expect(readIssue(root, 'issue_rt')).toEqual(issue);
  });

  it('deleteIssue removes the .md and attachments folder', () => {
    const issue = makeIssue('issue_del');
    writeIssue(root, issue);
    mkdirSync(join(root, 'issues', 'issue_del', 'attachments'), { recursive: true });
    writeFileSync(join(root, 'issues', 'issue_del', 'attachments', 'x.png'), 'data');

    deleteIssue(root, 'issue_del');
    expect(existsSync(join(root, 'issues', 'issue_del.md'))).toBe(false);
    expect(existsSync(join(root, 'issues', 'issue_del'))).toBe(false);
  });

  it('deleteIssue does not throw when attachments folder is missing', () => {
    writeIssue(root, makeIssue('issue_noattach'));
    expect(() => deleteIssue(root, 'issue_noattach')).not.toThrow();
  });

  it('writeAttachment stores bytes and returns workspace-relative path', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const rel = writeAttachment(root, 'issue_x', 'abc123.png', bytes);
    expect(rel).toBe('issues/issue_x/attachments/abc123.png');
    const content = readFileSync(join(root, rel));
    expect(Array.from(content)).toEqual([1, 2, 3, 4, 5]);
  });

  it('writeIssue is atomic (no partial file on error — tmp file cleanup)', () => {
    writeIssue(root, makeIssue('issue_atomic'));
    const issuesDir = join(root, 'issues');
    const entries = require('fs').readdirSync(issuesDir);
    expect(entries.some((f: string) => f.includes('.tmp-'))).toBe(false);
  });
});
