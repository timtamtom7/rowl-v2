import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeBlockAtomic } from '../writeBlockAtomic.ts';

describe('writeBlockAtomic', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rowl-atomic-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes content to target and leaves no tmp file behind', async () => {
    const target = join(dir, 'out.md');
    await writeBlockAtomic(target, 'hello\n');
    expect(readFileSync(target, 'utf-8')).toBe('hello\n');
    expect(existsSync(target + '.tmp')).toBe(false);
  });

  it('overwrites an existing file', async () => {
    const target = join(dir, 'out.md');
    writeFileSync(target, 'old\n');
    await writeBlockAtomic(target, 'new\n');
    expect(readFileSync(target, 'utf-8')).toBe('new\n');
  });

  it('rethrows when the initial write fails (no tmp produced)', async () => {
    // Pass a path whose parent is a file, so tmp write itself fails.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a dir');
    const bogusTarget = join(blocker, 'nested', 'out.md');
    await expect(writeBlockAtomic(bogusTarget, 'x')).rejects.toThrow();
    expect(existsSync(bogusTarget + '.tmp')).toBe(false);
  });

  it('cleans up tmp file and rethrows when rename fails', async () => {
    const { mkdirSync, writeFileSync } = require('fs');
    // Make target itself a non-empty directory. rename(tmp-file → non-empty-dir)
    // fails portably with EISDIR / ENOTEMPTY, so tmp will exist and need cleanup.
    const target = join(dir, 'target-is-dir');
    mkdirSync(target);
    writeFileSync(join(target, 'sibling-inside'), 'x');

    await expect(writeBlockAtomic(target, 'new content')).rejects.toThrow();

    expect(existsSync(target + '.tmp')).toBe(false); // cleanup ran
    // Target directory and its contents are unchanged.
    expect(existsSync(join(target, 'sibling-inside'))).toBe(true);
  });
});
