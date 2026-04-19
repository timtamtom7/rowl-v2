import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendHistory } from '../appendHistory.ts';

describe('appendHistory', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-hist-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('writes a single JSONL line terminated with \\n', async () => {
    await appendHistory(workspaceRoot, {
      label: 'persona',
      op: 'append',
      content: 'hello',
    });
    const path = join(workspaceRoot, 'memory', '.history.jsonl');
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    const entry = JSON.parse(raw.trim());
    expect(entry.label).toBe('persona');
    expect(entry.op).toBe('append');
    expect(entry.content).toBe('hello');
    expect(typeof entry.ts).toBe('string');
  });

  it('two sequential calls produce two valid lines', async () => {
    await appendHistory(workspaceRoot, { label: 'a', op: 'append', content: '1' });
    await appendHistory(workspaceRoot, { label: 'b', op: 'append', content: '2' });
    const path = join(workspaceRoot, 'memory', '.history.jsonl');
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).label).toBe('a');
    expect(JSON.parse(lines[1]!).label).toBe('b');
  });

  it('truncates string fields longer than 500 chars', async () => {
    const long = 'x'.repeat(600);
    await appendHistory(workspaceRoot, { label: 'big', op: 'append', content: long });
    const raw = readFileSync(join(workspaceRoot, 'memory', '.history.jsonl'), 'utf-8');
    const entry = JSON.parse(raw.trim());
    expect(entry.content.length).toBe(501); // 500 chars + "…"
    expect(entry.content.endsWith('…')).toBe(true);
  });

  it('does not throw when the target directory is unwritable (logs warn, returns)', async () => {
    // Make memory/ path resolve to inside a file → mkdir fails.
    const blocker = join(workspaceRoot, 'blocker');
    writeFileSync(blocker, 'not a dir');
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(
        appendHistory(blocker, { label: 'x', op: 'append', content: 'y' }),
      ).resolves.toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
