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
});
