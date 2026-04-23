import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  checkoutBranch,
  commit,
  listBranches,
  revParse,
  statusPorcelain,
  worktreeAdd,
  worktreeRemove,
} from './git-commands.ts';

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rowl-gitwrap-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), 'hi\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return dir;
}

describe('git-commands', () => {
  let repo: string;
  beforeEach(() => { repo = initRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('listBranches returns at least main', async () => {
    const branches = await listBranches(repo);
    expect(branches).toContain('main');
  });

  it('checkoutBranch creates a new branch', async () => {
    await checkoutBranch(repo, 'feat/x', { create: true });
    const branches = await listBranches(repo);
    expect(branches).toContain('feat/x');
  });

  it('worktreeAdd creates the worktree directory with checkout', async () => {
    const path = join(repo, '.worktrees', 'feat-x');
    await worktreeAdd(repo, { branch: 'feat/x', path, createBranch: true });
    // Verify HEAD of the new worktree points to feat/x.
    const head = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: path, encoding: 'utf-8' }).trim();
    expect(head).toBe('feat/x');
  });

  it('worktreeRemove cleans up a worktree', async () => {
    const path = join(repo, '.worktrees', 'feat-y');
    await worktreeAdd(repo, { branch: 'feat/y', path, createBranch: true });
    await worktreeRemove(repo, path);
    const list = execFileSync('git', ['worktree', 'list'], { cwd: repo, encoding: 'utf-8' });
    expect(list).not.toContain('feat-y');
  });

  it('statusPorcelain reports clean trees as empty', async () => {
    const status = await statusPorcelain(repo);
    expect(status).toBe('');
  });

  it('statusPorcelain reports dirty trees', async () => {
    writeFileSync(join(repo, 'dirty.txt'), 'uncommitted');
    const status = await statusPorcelain(repo);
    expect(status).toContain('dirty.txt');
  });

  it('revParse returns a commit SHA', async () => {
    const sha = await revParse(repo, 'HEAD');
    expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('commit produces a new HEAD', async () => {
    writeFileSync(join(repo, 'a.txt'), 'A');
    execFileSync('git', ['add', '.'], { cwd: repo });
    const before = await revParse(repo, 'HEAD');
    await commit(repo, { subject: 'feat: add A', body: 'body line' });
    const after = await revParse(repo, 'HEAD');
    expect(before).not.toBe(after);
  });
});
