import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendToBlock } from '../appendToBlock.ts';

function setupBlock(ws: string, label: string, fullContent: string): string {
  const memDir = join(ws, 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir);
  const path = join(memDir, `${label}.md`);
  writeFileSync(path, fullContent);
  return path;
}

describe('appendToBlock', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-append-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('appends to the end with a single \\n junction, preserving frontmatter', async () => {
    const path = setupBlock(
      workspaceRoot,
      'human',
      '---\nlabel: human\ndescription: about user\n---\nexisting line.\n',
    );
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'human',
      content: 'new fact.',
    });
    expect(result.ok).toBe(true);
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('label: human');
    expect(after).toContain('existing line.\nnew fact.');
    expect(after).not.toContain('\n\nnew fact.'); // exactly one newline between
  });

  it('strips trailing whitespace (newlines/spaces/tabs) before inserting separator', async () => {
    const path = setupBlock(
      workspaceRoot,
      'human',
      '---\nlabel: human\ndescription: d\n---\nline\n\n\n   \t\n',
    );
    await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'human',
      content: 'added.',
    });
    const after = readFileSync(path, 'utf-8');
    const bodyStart = after.indexOf('---\n', 4) + 4;
    const body = after.slice(bodyStart);
    expect(body.trimEnd()).toBe('line\nadded.');
  });

  it('appends to an empty-body block', async () => {
    const path = setupBlock(
      workspaceRoot,
      'project',
      '---\nlabel: project\ndescription: d\n---\n',
    );
    await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'project',
      content: 'first entry.',
    });
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('first entry.');
  });

  it('appends one history entry on success', async () => {
    setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nbefore\n',
    );
    await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      content: 'added.',
    });
    const historyPath = join(workspaceRoot, 'memory', '.history.jsonl');
    expect(existsSync(historyPath)).toBe(true);
    const entry = JSON.parse(readFileSync(historyPath, 'utf-8').trim());
    expect(entry.label).toBe('persona');
    expect(entry.op).toBe('append');
    expect(entry.content).toBe('added.');
  });

  it('returns BLOCK_MISSING when file does not exist', async () => {
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'ghost',
      content: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BLOCK_MISSING');
  });

  it('returns STALE_MTIME when file is touched between read and write', async () => {
    const path = setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nbefore\n',
    );
    const { utimes } = require('fs/promises');
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      content: 'after',
      __beforeReStatForTest: async () => {
        const future = new Date(Date.now() + 10_000);
        await utimes(path, future, future);
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('STALE_MTIME');
    expect(readFileSync(path, 'utf-8')).not.toContain('after');
  });

  it('emits a size warning when the new body exceeds 16KB', async () => {
    // 16383 bytes of body — below the 16384 threshold BEFORE we append.
    const baseBody = 'x'.repeat(16_383);
    setupBlock(
      workspaceRoot,
      'big',
      `---\nlabel: big\ndescription: d\n---\n${baseBody}\n`,
    );
    // Append ~10 bytes — the stripped body (16383) + '\n' + 10 = 16394 > 16384.
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'big',
      content: 'yyyyyyyyy.',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newSize).toBeGreaterThan(16_384);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain("block 'big'");
      expect(result.warnings![0]).toContain('soft cap');
    }
  });

  it('does NOT emit a size warning when the new body stays under 16KB', async () => {
    setupBlock(
      workspaceRoot,
      'small',
      '---\nlabel: small\ndescription: d\n---\nsmall body\n',
    );
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'small',
      content: 'short add.',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toBeUndefined();
  });
});
