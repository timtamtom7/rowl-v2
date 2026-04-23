import type { PlanType } from './types.ts';

/**
 * Sanitize a free-form string into a git-safe branch fragment.
 *
 * Ported from `/Users/mauriello/Dev/_reference/t3code/packages/shared/src/git.ts`
 * (`sanitizeBranchFragment`), adapted to remove the Effect dependency. Output is
 * lowercase, ASCII-safe, ≤64 chars, with separators collapsed. Empty input
 * returns the literal fallback 'update'.
 */
export function sanitizeBranchFragment(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/^[./\s_-]+|[./\s_-]+$/g, '');

  const fragment = normalized
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/-+/g, '-')
    .replace(/^[./_-]+|[./_-]+$/g, '')
    .slice(0, 64)
    .replace(/[./_-]+$/g, '');

  return fragment.length > 0 ? fragment : 'update';
}

export interface ResolveBranchNameInput {
  /** The plan's type — becomes the branch prefix. */
  type: PlanType;
  /** The plan title (or issue title) — sanitized into the branch slug. */
  title: string;
}

/**
 * Build a full `{type}/{slug}` branch name that does not collide with any
 * existing branch. Falls back to auto-suffix `-2`, `-3`, …  as needed.
 *
 * Matching is case-insensitive because git ref names are case-insensitive on
 * macOS by default and we never want to produce a "new" branch that only
 * differs by case.
 */
export function resolveBranchName(
  input: ResolveBranchNameInput,
  existingBranchNames: readonly string[],
): string {
  const slug = sanitizeBranchFragment(input.title);
  const base = `${input.type}/${slug}`;
  const existingLower = new Set(existingBranchNames.map((b) => b.toLowerCase()));

  if (!existingLower.has(base.toLowerCase())) {
    return base;
  }

  let suffix = 2;
  while (existingLower.has(`${base}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}
