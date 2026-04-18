import { existsSync } from 'fs';
import type { MemoryBlock } from './types.ts';
import { getMemoryDir } from './paths.ts';

/**
 * Load all memory blocks from `{workspaceRootPath}/memory/`.
 *
 * Synchronous by design: called on every agent turn from a synchronous
 * code path (`PromptBuilder.buildContextParts`). Payload is small
 * (a handful of tiny markdown files on local disk).
 *
 * Errors are logged to `console.warn` and the offending file is skipped;
 * memory loading must never fail the turn.
 */
export function loadMemoryBlocks(workspaceRootPath: string): MemoryBlock[] {
  const dir = getMemoryDir(workspaceRootPath);
  if (!existsSync(dir)) {
    return [];
  }
  // Full implementation in Task 4.
  return [];
}
