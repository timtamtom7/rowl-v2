import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PromptBuilder } from '../../agent/core/prompt-builder.ts';

function makeBuilder(workspaceRoot: string) {
  return new PromptBuilder({
    workspace: {
      rootPath: workspaceRoot,
      id: 'test-ws',
      name: 'Test',
    } as any,
    session: { id: 'test-session' } as any,
  });
}

describe('PromptBuilder.buildContextParts — memory integration', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-pb-mem-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('prepends <memory_blocks> as the first context-part when blocks exist', () => {
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);
    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: who Rowl is\n---\nI am Rowl.\n',
    );

    const builder = makeBuilder(workspaceRoot);
    const parts = builder.buildContextParts({});
    expect(parts[0]).toContain('<memory_blocks>');
    expect(parts[0]).toContain('<memory_block label="persona"');
    expect(parts[0]).toContain('I am Rowl.');
  });

  it('omits <memory_blocks> entirely when memory/ is missing', () => {
    const builder = makeBuilder(workspaceRoot);
    const parts = builder.buildContextParts({});
    for (const p of parts) {
      expect(p).not.toContain('<memory_blocks>');
    }
  });

  it('omits <memory_blocks> when memory/ exists but has no valid blocks', () => {
    mkdirSync(join(workspaceRoot, 'memory'));
    const builder = makeBuilder(workspaceRoot);
    const parts = builder.buildContextParts({});
    for (const p of parts) {
      expect(p).not.toContain('<memory_blocks>');
    }
  });

  it('reflects file edits on next call (no caching)', () => {
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);
    const file = join(memDir, 'persona.md');

    writeFileSync(file, '---\nlabel: persona\ndescription: d\n---\nversion 1\n');
    const builder = makeBuilder(workspaceRoot);
    expect(builder.buildContextParts({})[0]).toContain('version 1');

    writeFileSync(file, '---\nlabel: persona\ndescription: d\n---\nversion 2\n');
    expect(builder.buildContextParts({})[0]).toContain('version 2');
  });
});
