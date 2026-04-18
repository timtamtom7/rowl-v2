import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadMemoryBlocks } from '../loadMemoryBlocks.ts';

describe('loadMemoryBlocks', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-memory-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns [] when memory/ directory does not exist', () => {
    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toEqual([]);
  });

  it('loads 3 valid blocks sorted alphabetically by label', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: who Rowl is\n---\nI am Rowl.\n',
    );
    writeFileSync(
      join(memDir, 'human.md'),
      '---\nlabel: human\ndescription: what Rowl knows about the user\n---\nName: Mario.\n',
    );
    writeFileSync(
      join(memDir, 'project.md'),
      '---\nlabel: project\ndescription: what this workspace is about\nlimit: 500\n---\nRowl itself.\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);

    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.label)).toEqual(['human', 'persona', 'project']);
    const [human, , project] = blocks;
    expect(human).toMatchObject({
      label: 'human',
      description: 'what Rowl knows about the user',
      content: 'Name: Mario.\n',
    });
    expect(project!.limit).toBe(500);
    expect(human!.filePath).toBe(join(memDir, 'human.md'));
  });

  it('skips file with malformed YAML, loads the rest', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'good.md'),
      '---\nlabel: good\ndescription: ok\n---\nbody\n',
    );
    writeFileSync(
      join(memDir, 'bad.md'),
      '---\nlabel: bad\ndescription: [unclosed\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.label).toBe('good');
  });

  it('skips file with missing label', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'nolabel.md'),
      '---\ndescription: oops\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(0);
  });

  it('skips file with missing description', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'nodesc.md'),
      '---\nlabel: nodesc\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(0);
  });

  it("skips file where frontmatter label doesn't match filename", () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: something_else\ndescription: ok\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(0);
  });

  it('ignores non-.md files', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(join(memDir, 'README.txt'), 'not a block');
    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: ok\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.label).toBe('persona');
  });

  it('includes block exceeding limit (does not truncate)', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    const body = 'x'.repeat(200);
    writeFileSync(
      join(memDir, 'big.md'),
      `---\nlabel: big\ndescription: over cap\nlimit: 50\n---\n${body}\n`,
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    const [big] = blocks;
    expect(big!.content.length).toBeGreaterThan(50);
    expect(big!.limit).toBe(50);
  });

  it('handles empty content (frontmatter only)', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'empty.md'),
      '---\nlabel: empty\ndescription: nothing here yet\n---\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.content).toBe('');
  });
});
