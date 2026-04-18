import { join } from 'path';

/**
 * Returns the absolute path of the memory directory for a workspace.
 * Used by loader, initializer, and any future memory-editing tool.
 */
export function getMemoryDir(workspaceRootPath: string): string {
  return join(workspaceRootPath, 'memory');
}

/**
 * Returns the absolute path for a specific memory block file.
 */
export function getMemoryBlockPath(workspaceRootPath: string, label: string): string {
  return join(getMemoryDir(workspaceRootPath), `${label}.md`);
}
