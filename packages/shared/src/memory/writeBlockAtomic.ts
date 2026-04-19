import { rename, unlink, writeFile } from 'fs/promises';

/**
 * Write content atomically by staging at `<targetPath>.tmp` and renaming
 * over the target. On rename failure, best-effort `unlink` the tmp file
 * and rethrow the original error.
 *
 * Atomicity guarantee: POSIX `rename(2)` on the same filesystem is atomic.
 * No explicit `fsync` — matches how human editors save memory files.
 */
export async function writeBlockAtomic(targetPath: string, content: string): Promise<void> {
  const tmp = `${targetPath}.tmp`;
  try {
    await writeFile(tmp, content, { encoding: 'utf-8', flag: 'w' });
    await rename(tmp, targetPath);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {
      // Best-effort cleanup. Swallow — tmp may not exist (write failed before creating it) or may be inaccessible.
    }
    throw err;
  }
}
