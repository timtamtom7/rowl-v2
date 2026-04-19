/**
 * Result and error types for memory-block edit operations
 * (replaceInBlock, appendToBlock).
 *
 * The `ok: false` branch carries a stable `code` so programmatic consumers
 * (logs, audit, UI) can branch without pattern-matching `message`.
 * The agent-visible text is produced in the tool adapter layer, not here.
 */

export type MemoryEditErrorCode =
  | 'BLOCK_MISSING'      // file doesn't exist for this label
  | 'PARSE_ERROR'        // file exists but gray-matter can't parse frontmatter
  | 'NOT_FOUND'          // old_content didn't match (replace only)
  | 'MULTIPLE_MATCHES'   // old_content matched 2+ times (replace only)
  | 'STALE_MTIME';       // file was modified between our read and our write

export type MemoryEditResult =
  | { ok: true; newSize: number; warnings?: string[] }
  | { ok: false; code: MemoryEditErrorCode; message: string };
