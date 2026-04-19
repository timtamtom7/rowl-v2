import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import matter from 'gray-matter';
import type { MemoryEditResult } from './editTypes.ts';
import { getMemoryBlockPath } from './paths.ts';
import { writeBlockAtomic } from './writeBlockAtomic.ts';
import { appendHistory } from './appendHistory.ts';

const SIZE_WARN_BYTES = 16 * 1024; // 16 KB

/**
 * Append `content` to the end of the named block's body.
 *
 * Junction rule: strip trailing whitespace on the existing body, then insert
 * exactly one `\n`, then append `content` verbatim (no transformation).
 *
 * Errors mirror replaceInBlock's shape: BLOCK_MISSING, PARSE_ERROR, STALE_MTIME.
 * Success may carry a warning if the new body exceeds SIZE_WARN_BYTES.
 *
 * Frontmatter is preserved. Atomic write via tmp + rename. History appended.
 */
export async function appendToBlock(params: {
  workspaceRootPath: string;
  label: string;
  content: string;
  /** @internal — test hook */
  __beforeReStatForTest?: () => Promise<void> | void;
}): Promise<MemoryEditResult> {
  const { workspaceRootPath, label, content } = params;
  const path = getMemoryBlockPath(workspaceRootPath, label);

  if (!existsSync(path)) {
    return { ok: false, code: 'BLOCK_MISSING', message: `no block with label '${label}'` };
  }

  let mtimeMs: number;
  try {
    mtimeMs = (await stat(path)).mtimeMs;
  } catch (err) {
    return {
      ok: false,
      code: 'BLOCK_MISSING',
      message: `no block with label '${label}' (${(err as Error).message})`,
    };
  }

  const raw = await readFile(path, 'utf-8');
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    // Pass an empty options object to bypass gray-matter's module-level cache.
    // The cache can cause malformed-YAML errors to be silently swallowed on
    // subsequent reads of the same input string.
    const r = matter(raw, {});
    parsed = { data: r.data, content: r.content };
  } catch (err) {
    return {
      ok: false,
      code: 'PARSE_ERROR',
      message: `could not parse frontmatter in block '${label}' (${(err as Error).message})`,
    };
  }

  const stripped = parsed.content.replace(/\s+$/, '');
  const newBody = stripped.length === 0 ? content : stripped + '\n' + content;

  if (params.__beforeReStatForTest) await params.__beforeReStatForTest();

  const currentMtime = (await stat(path)).mtimeMs;
  if (currentMtime !== mtimeMs) {
    return {
      ok: false,
      code: 'STALE_MTIME',
      message: `block '${label}' was modified externally, retry`,
    };
  }

  const full = matter.stringify(newBody, parsed.data);
  await writeBlockAtomic(path, full);
  await appendHistory(workspaceRootPath, { label, op: 'append', content });

  const newSize = Buffer.byteLength(newBody, 'utf-8');
  if (newSize > SIZE_WARN_BYTES) {
    return {
      ok: true,
      newSize,
      warnings: [`block '${label}' is now ${newSize}B (soft cap ${SIZE_WARN_BYTES}B)`],
    };
  }
  return { ok: true, newSize };
}
