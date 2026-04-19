import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { replaceInBlock } from '../replaceInBlock.ts';

function setupBlock(ws: string, label: string, frontmatterAndBody: string): string {
  const memDir = join(ws, 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir);
  const path = join(memDir, `${label}.md`);
  writeFileSync(path, frontmatterAndBody);
  return path;
}

describe('replaceInBlock', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-replace-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns BLOCK_MISSING when file does not exist', async () => {
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'nope',
      oldContent: 'a',
      newContent: 'b',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('BLOCK_MISSING');
      expect(result.message).toContain("no block with label 'nope'");
    }
  });

  it('replaces the unique occurrence and preserves frontmatter', async () => {
    const path = setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: who Rowl is\n---\nI reply in prose.\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      oldContent: 'I reply in prose.',
      newContent: 'I reply in bullets.',
    });
    expect(result.ok).toBe(true);
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('label: persona');
    expect(after).toContain('description: who Rowl is');
    expect(after).toContain('I reply in bullets.');
    expect(after).not.toContain('I reply in prose.');
    if (result.ok) expect(result.newSize).toBeGreaterThan(0);
  });
});
