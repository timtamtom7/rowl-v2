import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureDefaultMemoryBlocks } from '../ensureDefaultMemoryBlocks.ts';
import { loadMemoryBlocks } from '../loadMemoryBlocks.ts';

describe('ensureDefaultMemoryBlocks', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-memory-init-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('creates memory/ with 3 default files when none exist', async () => {
    await ensureDefaultMemoryBlocks(workspaceRoot);
    const memDir = join(workspaceRoot, 'memory');
    expect(existsSync(memDir)).toBe(true);
    expect(existsSync(join(memDir, 'persona.md'))).toBe(true);
    expect(existsSync(join(memDir, 'human.md'))).toBe(true);
    expect(existsSync(join(memDir, 'project.md'))).toBe(true);
  });

  it('creates defaults that load cleanly via loadMemoryBlocks', async () => {
    await ensureDefaultMemoryBlocks(workspaceRoot);
    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks.map((b) => b.label)).toEqual(['human', 'persona', 'project']);
    for (const b of blocks) {
      expect(b.description.length).toBeGreaterThan(0);
    }
  });

  it('is a no-op when memory/ already exists (does not overwrite user edits)', async () => {
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);
    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: custom\n---\nUser-customized persona.\n',
    );

    await ensureDefaultMemoryBlocks(workspaceRoot);

    const content = readFileSync(join(memDir, 'persona.md'), 'utf-8');
    expect(content).toContain('User-customized persona.');
    expect(existsSync(join(memDir, 'human.md'))).toBe(false); // still not created
  });

  it('does not throw if dir creation fails (logs, returns)', async () => {
    // Give a guaranteed-unwritable path (root-owned) — but to keep the test
    // portable, just pass a path inside a file (which makes mkdir fail):
    const blocker = join(workspaceRoot, 'blocker');
    writeFileSync(blocker, 'not a dir');
    // Now passing `blocker` as the workspace makes `{blocker}/memory/` unreachable
    await expect(ensureDefaultMemoryBlocks(blocker)).resolves.toBeUndefined();
  });
});
