/**
 * Plans Module (renderer-safe).
 *
 * This barrel exports ONLY types + pure helpers that do NOT touch `fs`/`os`/`path`.
 * The node-only side (frontmatter read/write, changelog read/write) lives at
 * `@craft-agent/shared/plans/node` — do NOT import it from renderer code.
 */

export * from './types.ts';
export * from './branch-naming.ts';
export * from './lifecycle.ts';
