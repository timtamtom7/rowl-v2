/**
 * Issues Module — Node-only exports
 *
 * These functions touch the filesystem (fs/path/os) and MUST NOT be imported
 * from renderer code. Main-process IPC handlers import from here; renderer
 * code imports from `@craft-agent/shared/issues` (the renderer-safe barrel).
 */

export * from './copy-plan-forward.ts';
export * from './issues-storage.ts';
