/**
 * Plans Module — Node-only exports.
 *
 * Re-exports the fs-touching helpers for plan lifecycle work done in the
 * Electron main process. Renderer code must import from
 * `@craft-agent/shared/plans` (renderer-safe barrel) instead.
 *
 * NOTE: as of this task the frontmatter + changelog helpers are pure string
 * functions (no fs). The barrel exists so future additions that DO touch fs
 * have a ready home without renderer bundling risk.
 */

export * from './frontmatter.ts';
export * from './changelog.ts';
