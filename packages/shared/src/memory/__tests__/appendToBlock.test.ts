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
});
