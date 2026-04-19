import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleCoreMemoryReplace } from '../core-memory-replace.ts';
import { handleCoreMemoryAppend } from '../core-memory-append.ts';
import {
  CoreMemoryReplaceSchema,
  CoreMemoryAppendSchema,
  SESSION_TOOL_DEFS,
} from '../../tool-defs.ts';
import type { SessionToolContext } from '../../context.ts';

function makeCtx(workingDirectory: string): SessionToolContext {
  return {
    sessionId: 'test-session',
    workspacePath: '/fake/cra-workspace',
    get sourcesPath() { return '/fake/sources'; },
    get skillsPath() { return '/fake/skills'; },
    plansFolderPath: '/fake/plans',
    workingDirectory,
    callbacks: {
      onPlanSubmitted: () => {},
      onAuthRequest: () => {},
    },
    fs: {
      exists: () => false,
      readFile: () => '',
      readFileBuffer: () => Buffer.alloc(0),
      writeFile: () => {},
      isDirectory: () => false,
      readdir: () => [],
      stat: () => ({ size: 0, isDirectory: () => false }),
    },
    loadSourceConfig: () => null,
  } as SessionToolContext;
}

describe('core-memory-tools integration', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-integration-'));
    mkdirSync(join(workspaceRoot, 'memory'));
    writeFileSync(
      join(workspaceRoot, 'memory', 'persona.md'),
      '---\nlabel: persona\ndescription: d\n---\nI reply in prose.\n',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('registers both tools in SESSION_TOOL_DEFS', () => {
    const names = SESSION_TOOL_DEFS.map((d) => d.name);
    expect(names).toContain('core_memory_replace');
    expect(names).toContain('core_memory_append');
  });

  it('Zod rejects empty label', () => {
    expect(() =>
      CoreMemoryReplaceSchema.parse({ label: '', old_content: 'a', new_content: 'b' }),
    ).toThrow();
    expect(() => CoreMemoryAppendSchema.parse({ label: '', content: 'a' })).toThrow();
  });

  it('Zod rejects empty old_content / content', () => {
    expect(() =>
      CoreMemoryReplaceSchema.parse({ label: 'x', old_content: '', new_content: 'b' }),
    ).toThrow();
    expect(() => CoreMemoryAppendSchema.parse({ label: 'x', content: '' })).toThrow();
  });

  it('handleCoreMemoryReplace — happy path returns "ok (new size: N bytes)"', async () => {
    const ctx = makeCtx(workspaceRoot);
    const result = await handleCoreMemoryReplace(ctx, {
      label: 'persona',
      old_content: 'I reply in prose.',
      new_content: 'I reply in bullets.',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe('text');
    if (result.content[0].type === 'text') {
      expect(result.content[0].text).toMatch(/^ok \(new size: \d+ bytes\)$/);
    }
    const after = readFileSync(join(workspaceRoot, 'memory', 'persona.md'), 'utf-8');
    expect(after).toContain('I reply in bullets.');
  });

  it('handleCoreMemoryReplace — BLOCK_MISSING surfaces as "error: no block…"', async () => {
    const ctx = makeCtx(workspaceRoot);
    const result = await handleCoreMemoryReplace(ctx, {
      label: 'ghost',
      old_content: 'a',
      new_content: 'b',
    });
    expect(result.isError).toBe(true);
    if (result.content[0].type === 'text') {
      expect(result.content[0].text).toBe("error: no block with label 'ghost'");
    }
  });

  it('handleCoreMemoryAppend — happy path writes + history', async () => {
    const ctx = makeCtx(workspaceRoot);
    const result = await handleCoreMemoryAppend(ctx, {
      label: 'persona',
      content: 'And I prefer concise replies.',
    });
    expect(result.isError).toBeUndefined();
    const after = readFileSync(join(workspaceRoot, 'memory', 'persona.md'), 'utf-8');
    expect(after).toContain('And I prefer concise replies.');
    expect(existsSync(join(workspaceRoot, 'memory', '.history.jsonl'))).toBe(true);
  });

  it('handler returns error when workingDirectory cannot be resolved', async () => {
    const ctx = {
      ...makeCtx(workspaceRoot),
      workingDirectory: undefined,
      workspacePath: '/nonexistent/cra-workspace',
      sessionId: 'nonexistent-session',
    } as SessionToolContext;
    const result = await handleCoreMemoryReplace(ctx, {
      label: 'persona',
      old_content: 'x',
      new_content: 'y',
    });
    expect(result.isError).toBe(true);
    if (result.content[0].type === 'text') {
      expect(result.content[0].text).toContain('no workspace working directory');
    }
  });
});
