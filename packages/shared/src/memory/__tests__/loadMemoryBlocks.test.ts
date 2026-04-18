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
    expect(blocks[0]).toMatchObject({
      label: 'human',
      description: 'what Rowl knows about the user',
      content: 'Name: Mario.\n',
    });
    expect(blocks[2].limit).toBe(500);
    expect(blocks[0].filePath).toBe(join(memDir, 'human.md'));
  });
});
