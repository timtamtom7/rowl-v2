/**
 * Memory block types.
 *
 * A memory block is a single markdown file in `{workspace}/memory/<label>.md`
 * with YAML frontmatter. Blocks are loaded once per agent turn and injected
 * into the user-message context (not the system prompt — keeps system prompt
 * static for Claude prompt caching).
 */

/**
 * YAML frontmatter schema for a memory block file.
 */
export interface MemoryBlockFrontmatter {
  /** Block identifier. MUST match filename minus `.md`. */
  label: string;
  /** Human-readable purpose, shown to the agent. */
  description: string;
  /** Optional soft character cap. Warned, not truncated. */
  limit?: number;
}

/**
 * A parsed, validated memory block ready for injection.
 */
export interface MemoryBlock {
  label: string;
  description: string;
  /** Markdown body with frontmatter stripped. */
  content: string;
  limit?: number;
  /** Absolute path to the source file, for error messages/logs. */
  filePath: string;
}
