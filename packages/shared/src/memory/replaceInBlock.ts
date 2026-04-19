import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import matter from 'gray-matter';
import type { MemoryEditResult } from './editTypes.ts';
import { getMemoryBlockPath } from './paths.ts';
import { writeBlockAtomic } from './writeBlockAtomic.ts';
import { appendHistory } from './appendHistory.ts';

/**
 * Replace an exact substring in the named memory block's body.
 *
 * Strict semantics:
 * - `oldContent` must appear exactly once in the body (byte-for-byte).
 *   0 matches → NOT_FOUND. 2+ matches → MULTIPLE_MATCHES.
 * - File must exist. Missing → BLOCK_MISSING.
 * - Unparseable frontmatter → PARSE_ERROR.
 * - External edit between our read and our write → STALE_MTIME.
 *
 * Frontmatter is preserved untouched. Atomic write via tmp + rename.
 * Successful writes append one entry to .history.jsonl (non-throwing).
 */
export async function replaceInBlock(params: {
  workspaceRootPath: string;
  label: string;
  oldContent: string;
  newContent: string;
  /** @internal — test hook, do not use in production. Runs between read and re-stat. */
  __beforeReStatForTest?: () => Promise<void> | void;
}): Promise<MemoryEditResult> {
  const { workspaceRootPath, label, oldContent, newContent } = params;
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
    const r = matter(raw);
    parsed = { data: r.data, content: r.content };
  } catch (err) {
    return {
      ok: false,
      code: 'PARSE_ERROR',
      message: `could not parse frontmatter in block '${label}' (${(err as Error).message})`,
    };
  }

  // Count occurrences of oldContent in body, literal byte-level.
  let count = 0;
  let idx = 0;
  while ((idx = parsed.content.indexOf(oldContent, idx)) !== -1) {
    count++;
    idx += Math.max(oldContent.length, 1);
  }
  if (count === 0) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: `substring not found in block '${label}'`,
    };
  }
  if (count > 1) {
    return {
      ok: false,
      code: 'MULTIPLE_MATCHES',
      message: `found ${count} matches in block '${label}', provide more surrounding context`,
    };
  }

  const newBody = parsed.content.replace(oldContent, newContent);

  if (params.__beforeReStatForTest) await params.__beforeReStatForTest();

  // Re-stat for STALE_MTIME check.
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
  await appendHistory(workspaceRootPath, {
    label,
    op: 'replace',
    old: oldContent,
    new: newContent,
  });

  return { ok: true, newSize: Buffer.byteLength(newBody, 'utf-8') };
}
