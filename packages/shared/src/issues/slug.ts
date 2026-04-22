const MAX_SLUG_LEN = 60;

/**
 * Convert an arbitrary title into a filesystem-safe slug.
 * - NFD-normalize then strip combining marks (handles accented Latin).
 * - Lowercase.
 * - Replace anything not [a-z0-9] with a dash.
 * - Collapse runs of dashes, trim edges.
 * - Truncate to 60 chars on a word boundary when possible.
 * - Empty input → 'untitled'.
 */
export function slugify(input: string): string {
  const normalized = input
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Drop apostrophes/quotes so contractions collapse ("user's" -> "users").
    .replace(/['\u2018\u2019\u02bc`"\u201c\u201d]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (normalized.length === 0) return 'untitled';

  if (normalized.length <= MAX_SLUG_LEN) return normalized;

  // Try to truncate on a dash boundary.
  const truncated = normalized.slice(0, MAX_SLUG_LEN);
  const lastDash = truncated.lastIndexOf('-');
  if (lastDash > 0 && lastDash > MAX_SLUG_LEN - 15) {
    return truncated.slice(0, lastDash);
  }
  return truncated.replace(/-$/, '');
}
