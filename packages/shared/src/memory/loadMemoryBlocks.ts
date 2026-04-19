import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import type { MemoryBlock, MemoryBlockFrontmatter } from './types.ts';
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

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    console.warn(`[memory] Skipped directory ${dir}: read failed (${(err as Error).message})`);
    return [];
  }

  const blocks: MemoryBlock[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;

    const filePath = join(dir, entry);
    const filenameLabel = entry.slice(0, -'.md'.length);

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.warn(`[memory] Skipped ${filePath}: read failed (${(err as Error).message})`);
      continue;
    }

    let parsed: { data: Record<string, unknown>; content: string };
    try {
      // Pass an empty options object to bypass gray-matter's content-keyed
      // cache. The cache is populated before parseMatter runs, so on a second
      // call with identical malformed YAML it returns the cached (partially-
      // mutated) file without re-throwing — silently swallowing the parse
      // error. See the matching fix in replaceInBlock.ts / appendToBlock.ts.
      const result = matter(raw, {});
      parsed = { data: result.data, content: result.content };
    } catch (err) {
      console.warn(`[memory] Skipped ${filePath}: invalid frontmatter (${(err as Error).message})`);
      continue;
    }

    const fm = parsed.data as Partial<MemoryBlockFrontmatter>;
    if (typeof fm.label !== 'string' || fm.label.length === 0) {
      console.warn(`[memory] Skipped ${filePath}: missing label`);
      continue;
    }
    if (typeof fm.description !== 'string' || fm.description.length === 0) {
      console.warn(`[memory] Skipped ${filePath}: missing description`);
      continue;
    }
    if (fm.label !== filenameLabel) {
      console.warn(
        `[memory] Skipped ${filePath}: label '${fm.label}' doesn't match filename '${filenameLabel}'`,
      );
      continue;
    }

    const limit = typeof fm.limit === 'number' ? fm.limit : undefined;
    if (limit !== undefined && parsed.content.length > limit) {
      console.warn(
        `[memory] Block '${fm.label}' exceeds limit (${parsed.content.length}/${limit})`,
      );
    }

    blocks.push({
      label: fm.label,
      description: fm.description,
      content: parsed.content,
      limit,
      filePath,
    });
  }

  blocks.sort((a, b) => a.label.localeCompare(b.label));
  return blocks;
}
