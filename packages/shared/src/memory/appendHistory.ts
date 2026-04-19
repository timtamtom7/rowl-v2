import { mkdir, appendFile } from 'fs/promises';
import { join } from 'path';
import { getMemoryDir } from './paths.ts';

/**
 * Entry recorded for a successful memory edit. String fields longer
 * than 500 chars are truncated with a trailing "…" before serialization.
 */
export type MemoryHistoryEntry =
  | { label: string; op: 'replace'; old: string; new: string }
  | { label: string; op: 'append'; content: string };

const MAX_FIELD_LEN = 500;

function truncate(s: string): string {
  return s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) + '…' : s;
}

function shrink(entry: MemoryHistoryEntry): MemoryHistoryEntry {
  if (entry.op === 'replace') {
    return { ...entry, old: truncate(entry.old), new: truncate(entry.new) };
  }
  return { ...entry, content: truncate(entry.content) };
}

/**
 * Append one JSONL entry to `{workspaceRootPath}/memory/.history.jsonl`.
 * Never throws — on any I/O error, logs a warning and returns.
 * A failing audit-log write must NEVER fail the user-facing tool call.
 */
export async function appendHistory(
  workspaceRootPath: string,
  entry: MemoryHistoryEntry,
): Promise<void> {
  const memDir = getMemoryDir(workspaceRootPath);
  const path = join(memDir, '.history.jsonl');
  const payload = { ts: new Date().toISOString(), ...shrink(entry) };
  const line = JSON.stringify(payload) + '\n';

  try {
    // mkdir recursive is idempotent; covers the (unlikely) case that the
    // memory/ dir was removed between ensureDefault and this call.
    await mkdir(memDir, { recursive: true });
    await appendFile(path, line, { encoding: 'utf-8', flag: 'a' });
  } catch (err) {
    console.warn(
      `[memory] Failed to append history entry at ${path}: ${(err as Error).message}`,
    );
  }
}
