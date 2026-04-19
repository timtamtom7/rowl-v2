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

  it('cleans up tmp file and rethrows when rename fails', async () => {
    // Pass a path whose parent is a file, so tmp write itself fails.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a dir');
    const bogusTarget = join(blocker, 'nested', 'out.md');
    await expect(writeBlockAtomic(bogusTarget, 'x')).rejects.toThrow();
    expect(existsSync(bogusTarget + '.tmp')).toBe(false);
  });
});
