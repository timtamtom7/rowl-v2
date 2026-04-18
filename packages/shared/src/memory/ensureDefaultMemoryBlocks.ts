import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { getMemoryDir, getMemoryBlockPath } from './paths.ts';

const DEFAULT_PERSONA = `---
label: persona
description: who Rowl is, how it behaves
---
You are Rowl, a memory-first coding agent. You remember context across sessions via the memory blocks shown above and below. Edit this file to define your personality, voice, and working style.
`;

const DEFAULT_HUMAN = `---
label: human
description: what Rowl knows about the user
---
(Empty — edit this file to tell Rowl about yourself: your name, role, preferences, how you like to work.)
`;

const DEFAULT_PROJECT = `---
label: project
description: what this workspace is about
---
(Empty — edit this file to describe the project: goals, constraints, stack, key decisions.)
`;

const DEFAULTS: Array<{ label: string; content: string }> = [
  { label: 'persona', content: DEFAULT_PERSONA },
  { label: 'human', content: DEFAULT_HUMAN },
  { label: 'project', content: DEFAULT_PROJECT },
];

/**
 * If `{workspaceRootPath}/memory/` does not exist, create it and write the
 * three default block files. If it exists (even empty, even missing some
 * defaults), do nothing — we never overwrite user state.
 *
 * Never throws. Logs and returns on failure so session init can continue.
 *
 * Concurrency: two parallel `createSession` calls on the same fresh workspace
 * can both pass the `existsSync` check. The atomic non-recursive `mkdir`
 * closes that race — the loser gets `EEXIST` and silently returns, deferring
 * to the winner's writes. Each `writeFile` uses `flag: 'wx'` as a belt-and-
 * suspenders check so a concurrent writer can't clobber a default file.
 */
export async function ensureDefaultMemoryBlocks(workspaceRootPath: string): Promise<void> {
  const dir = getMemoryDir(workspaceRootPath);
  if (existsSync(dir)) return;

  try {
    // Atomic "create directory or fail EEXIST". Non-recursive intentionally:
    // we want EEXIST if a concurrent caller beat us to it.
    await mkdir(dir);
    for (const { label, content } of DEFAULTS) {
      try {
        await writeFile(
          getMemoryBlockPath(workspaceRootPath, label),
          content,
          { encoding: 'utf-8', flag: 'wx' },
        );
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        // EEXIST: concurrent winner already wrote this default — leave it alone.
        if (code === 'EEXIST') continue;
        throw err;
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // We lost the mkdir race or the dir materialized between existsSync and
    // mkdir — both benign, leave the winner's state alone.
    if (code === 'EEXIST') return;
    console.warn(
      `[memory] Failed to initialize default blocks at ${dir}: ${(err as Error).message}`,
    );
  }
}
