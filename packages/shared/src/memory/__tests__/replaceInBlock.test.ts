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

  it('returns NOT_FOUND when old_content does not appear in body', async () => {
    setupBlock(
      workspaceRoot,
      'human',
      '---\nlabel: human\ndescription: about the user\n---\nName: Mario.\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'human',
      oldContent: 'Luigi',
      newContent: 'Yoshi',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toContain("substring not found in block 'human'");
    }
  });

  it('returns MULTIPLE_MATCHES when old_content appears more than once', async () => {
    setupBlock(
      workspaceRoot,
      'project',
      '---\nlabel: project\ndescription: x\n---\nfoo bar foo baz foo\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'project',
      oldContent: 'foo',
      newContent: 'FOO',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MULTIPLE_MATCHES');
      expect(result.message).toContain('found 3 matches');
    }
  });

  it('returns PARSE_ERROR when frontmatter is malformed', async () => {
    setupBlock(
      workspaceRoot,
      'bad',
      '---\nlabel: bad\ndescription: [unclosed\n---\nbody\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'bad',
      oldContent: 'body',
      newContent: 'new',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PARSE_ERROR');
      expect(result.message).toContain("could not parse frontmatter in block 'bad'");
    }
  });

  it('treats empty new_content as deletion', async () => {
    const path = setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nkeep this\nremove this line\ndone\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      oldContent: 'remove this line\n',
      newContent: '',
    });
    expect(result.ok).toBe(true);
    const after = readFileSync(path, 'utf-8');
    expect(after).not.toContain('remove this line');
    expect(after).toContain('keep this');
    expect(after).toContain('done');
  });

  it('appends one history entry on success', async () => {
    setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nbefore\n',
    );
    await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      oldContent: 'before',
      newContent: 'after',
    });
    const historyPath = join(workspaceRoot, 'memory', '.history.jsonl');
    expect(existsSync(historyPath)).toBe(true);
    const entry = JSON.parse(readFileSync(historyPath, 'utf-8').trim());
    expect(entry.label).toBe('persona');
    expect(entry.op).toBe('replace');
    expect(entry.old).toBe('before');
    expect(entry.new).toBe('after');
  });
});
