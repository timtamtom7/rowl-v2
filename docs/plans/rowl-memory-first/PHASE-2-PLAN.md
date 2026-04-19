# Sub-project #1 — Memory-First Agent — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/plans/rowl-memory-first/PHASE-2-SPEC.md`
**Phase 1:** SHIPPED 2026-04-18 (on `main`). Plan lives at `docs/plans/rowl-memory-first/PHASE-1-PLAN.md`.

**Goal:** Ship two agent-callable tools — `core_memory_replace` and `core_memory_append` — that let the agent edit the same markdown files humans edit under `{workspace}/memory/`, with atomic writes, mtime-guarded concurrency, and an append-only audit log. Tool creation / deletion / rewrite are explicitly out of scope.

**Architecture:** Pure write functions (`replaceInBlock`, `appendToBlock`) land in `packages/shared/src/memory/` alongside Phase 1's read-side. They share a `writeBlockAtomic` helper (tmp + rename) and an `appendHistory` helper (non-throwing JSONL writer). Thin tool handlers in `packages/session-tools-core/src/handlers/` define Zod schemas, pull `workingDirectory` from `SessionToolContext` (same pattern as `handleSkillValidate`), call the shared functions, and format the `MemoryEditResult` for the agent. Both tools register as `executionMode: 'registry'` entries in `SESSION_TOOL_DEFS` so Claude + Pi backends pick them up automatically.

**Tech stack:** TypeScript 5, Bun 1.3.11 (test runner = `bun test`), Node `fs` + `fs/promises`, Zod, `gray-matter` (Phase 1 dep, reused). No new npm packages.

---

## Deviations from spec

**1. Handler directory name.** The spec refers to `packages/session-tools-core/src/tools/`. The actual repo convention (verified at `/Users/mauriello/Dev/rowl-v2/packages/session-tools-core/src/handlers/`) uses `handlers/` and the `handle*` naming prefix. Plan uses the real path.

**2. Workspace-context source for the handler.** The spec says handlers "pull `workspaceRootPath` from the session context." `SessionToolContext` has no field called `workspaceRootPath` — the equivalent (project root) is `ctx.workingDirectory`, with a fallback via `resolveSessionWorkingDirectory(ctx.workspacePath, ctx.sessionId)` from `source-helpers.ts`. This is the exact pattern `handleSkillValidate` already uses. Plan adopts it.

**3. Write functions are async.** Phase 1 made `loadMemoryBlocks` sync because `PromptBuilder.buildContextParts` is sync. Phase 2's write path is inside async tool handlers — no reason to be sync. All new write functions use `fs/promises`.

No other spec deviations.

---

## File structure

**New files under `packages/shared/src/memory/`:**

| File | Responsibility |
|---|---|
| `editTypes.ts` | `MemoryEditResult`, `MemoryEditErrorCode` TypeScript types. No logic. |
| `writeBlockAtomic.ts` | `writeBlockAtomic(targetPath, content)` — tmp + rename, best-effort cleanup on failure. |
| `appendHistory.ts` | `appendHistory(workspaceRootPath, entry)` — non-throwing JSONL append with 500-char field truncation. |
| `replaceInBlock.ts` | Pure `replaceInBlock({workspaceRootPath, label, oldContent, newContent})` — async. |
| `appendToBlock.ts` | Pure `appendToBlock({workspaceRootPath, label, content})` — async. |
| `__tests__/writeBlockAtomic.test.ts` | 3 tests: success, leaves target untouched on rename fail, cleans up tmp. |
| `__tests__/appendHistory.test.ts` | 4 tests: single line, long-field truncation, multi-line, non-throwing on I/O error. |
| `__tests__/replaceInBlock.test.ts` | 8 tests: happy, BLOCK_MISSING, NOT_FOUND, MULTIPLE_MATCHES, STALE_MTIME, PARSE_ERROR, empty-new (delete), history written. |
| `__tests__/appendToBlock.test.ts` | 7 tests: happy, junction normalization, empty body append, STALE_MTIME, BLOCK_MISSING, 16KB warning (below/above), history written. |

**New files under `packages/session-tools-core/src/handlers/`:**

| File | Responsibility |
|---|---|
| `core-memory-replace.ts` | `handleCoreMemoryReplace(ctx, args)` adapter. |
| `core-memory-append.ts` | `handleCoreMemoryAppend(ctx, args)` adapter. |
| `__tests__/core-memory-tools.integration.test.ts` | Integration tests via handler + real filesystem. |

**Modified files:**

| File | Change |
|---|---|
| `packages/shared/src/memory/index.ts` | Re-export `replaceInBlock`, `appendToBlock`, `MemoryEditResult`, `MemoryEditErrorCode`. |
| `packages/session-tools-core/src/tool-defs.ts` | Add `CoreMemoryReplaceSchema`, `CoreMemoryAppendSchema`, `TOOL_DESCRIPTIONS.core_memory_replace`, `TOOL_DESCRIPTIONS.core_memory_append`, handler imports, and two entries in `SESSION_TOOL_DEFS`. |
| `docs/STATE.md` | Flip focus/map to "Phase 2 shipped" after smoke. |

---

## Task-by-task plan

Each task is TDD-shaped: write the failing test, verify it fails, implement, verify green, commit.

---

### Task 1: Scaffold edit types + `writeBlockAtomic` helper

**Files:**
- Create: `packages/shared/src/memory/editTypes.ts`
- Create: `packages/shared/src/memory/writeBlockAtomic.ts`
- Create: `packages/shared/src/memory/__tests__/writeBlockAtomic.test.ts`
- Modify: `packages/shared/src/memory/index.ts`

- [ ] **Step 1: Create `editTypes.ts`**

```typescript
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
```

- [ ] **Step 2: Write failing tests for `writeBlockAtomic`**

Create `packages/shared/src/memory/__tests__/writeBlockAtomic.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeBlockAtomic } from '../writeBlockAtomic.ts';

describe('writeBlockAtomic', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rowl-atomic-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes content to target and leaves no tmp file behind', async () => {
    const target = join(dir, 'out.md');
    await writeBlockAtomic(target, 'hello\n');
    expect(readFileSync(target, 'utf-8')).toBe('hello\n');
    expect(existsSync(target + '.tmp')).toBe(false);
  });

  it('overwrites an existing file', async () => {
    const target = join(dir, 'out.md');
    writeFileSync(target, 'old\n');
    await writeBlockAtomic(target, 'new\n');
    expect(readFileSync(target, 'utf-8')).toBe('new\n');
  });

  it('cleans up tmp file and rethrows when rename fails', async () => {
    // Pass a path whose parent is a file, so tmp write itself fails.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a dir');
    const bogusTarget = join(blocker, 'nested', 'out.md');
    await expect(writeBlockAtomic(bogusTarget, 'x')).rejects.toThrow();
    expect(existsSync(bogusTarget + '.tmp')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/writeBlockAtomic.test.ts`
Expected: FAIL — "Cannot find module '../writeBlockAtomic.ts'".

- [ ] **Step 4: Create `writeBlockAtomic.ts`**

```typescript
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
      // Best-effort cleanup. Swallow — tmp may already be gone.
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run tests — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/writeBlockAtomic.test.ts`
Expected: 3 pass, 0 fail.

- [ ] **Step 6: Update barrel export**

Edit `packages/shared/src/memory/index.ts`, add:

```typescript
export { writeBlockAtomic } from './writeBlockAtomic.ts';
export type { MemoryEditResult, MemoryEditErrorCode } from './editTypes.ts';
```

- [ ] **Step 7: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit 2>&1 | grep -E 'src/memory' || echo "clean"`
Expected: `clean`.

- [ ] **Step 8: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/editTypes.ts packages/shared/src/memory/writeBlockAtomic.ts packages/shared/src/memory/__tests__/writeBlockAtomic.test.ts packages/shared/src/memory/index.ts
git commit -m "feat(memory): edit result types + writeBlockAtomic helper"
```

---

### Task 2: `appendHistory` — JSONL audit log writer

**Files:**
- Create: `packages/shared/src/memory/appendHistory.ts`
- Create: `packages/shared/src/memory/__tests__/appendHistory.test.ts`
- Modify: `packages/shared/src/memory/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/memory/__tests__/appendHistory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendHistory } from '../appendHistory.ts';

describe('appendHistory', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-hist-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('writes a single JSONL line terminated with \\n', async () => {
    await appendHistory(workspaceRoot, {
      label: 'persona',
      op: 'append',
      content: 'hello',
    });
    const path = join(workspaceRoot, 'memory', '.history.jsonl');
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    const entry = JSON.parse(raw.trim());
    expect(entry.label).toBe('persona');
    expect(entry.op).toBe('append');
    expect(entry.content).toBe('hello');
    expect(typeof entry.ts).toBe('string');
  });

  it('two sequential calls produce two valid lines', async () => {
    await appendHistory(workspaceRoot, { label: 'a', op: 'append', content: '1' });
    await appendHistory(workspaceRoot, { label: 'b', op: 'append', content: '2' });
    const path = join(workspaceRoot, 'memory', '.history.jsonl');
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).label).toBe('a');
    expect(JSON.parse(lines[1]).label).toBe('b');
  });

  it('truncates string fields longer than 500 chars', async () => {
    const long = 'x'.repeat(600);
    await appendHistory(workspaceRoot, { label: 'big', op: 'append', content: long });
    const raw = readFileSync(join(workspaceRoot, 'memory', '.history.jsonl'), 'utf-8');
    const entry = JSON.parse(raw.trim());
    expect(entry.content.length).toBe(501); // 500 chars + "…"
    expect(entry.content.endsWith('…')).toBe(true);
  });

  it('does not throw when the target directory is unwritable (logs warn, returns)', async () => {
    // Make memory/ path resolve to inside a file → mkdir fails.
    const blocker = join(workspaceRoot, 'blocker');
    writeFileSync(blocker, 'not a dir');
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(
        appendHistory(blocker, { label: 'x', op: 'append', content: 'y' }),
      ).resolves.toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/appendHistory.test.ts`
Expected: module not found.

- [ ] **Step 3: Create `appendHistory.ts`**

```typescript
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
```

- [ ] **Step 4: Export from barrel**

Edit `packages/shared/src/memory/index.ts`, add:

```typescript
export { appendHistory } from './appendHistory.ts';
export type { MemoryHistoryEntry } from './appendHistory.ts';
```

- [ ] **Step 5: Run tests — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/appendHistory.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/appendHistory.ts packages/shared/src/memory/__tests__/appendHistory.test.ts packages/shared/src/memory/index.ts
git commit -m "feat(memory): appendHistory JSONL writer (non-throwing, truncated)"
```

---

### Task 3: `replaceInBlock` — missing-block + happy path (red → green)

**Files:**
- Create: `packages/shared/src/memory/replaceInBlock.ts`
- Create: `packages/shared/src/memory/__tests__/replaceInBlock.test.ts`
- Modify: `packages/shared/src/memory/index.ts`

- [ ] **Step 1: Write failing tests (2 cases to start)**

Create `packages/shared/src/memory/__tests__/replaceInBlock.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { replaceInBlock } from '../replaceInBlock.ts';

function setupBlock(ws: string, label: string, frontmatterAndBody: string): string {
  const memDir = join(ws, 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir);
  const path = join(memDir, `${label}.md`);
  writeFileSync(path, frontmatterAndBody);
  return path;
}

describe('replaceInBlock', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-replace-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns BLOCK_MISSING when file does not exist', async () => {
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'nope',
      oldContent: 'a',
      newContent: 'b',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('BLOCK_MISSING');
      expect(result.message).toContain("no block with label 'nope'");
    }
  });

  it('replaces the unique occurrence and preserves frontmatter', async () => {
    const path = setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: who Rowl is\n---\nI reply in prose.\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      oldContent: 'I reply in prose.',
      newContent: 'I reply in bullets.',
    });
    expect(result.ok).toBe(true);
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('label: persona');
    expect(after).toContain('description: who Rowl is');
    expect(after).toContain('I reply in bullets.');
    expect(after).not.toContain('I reply in prose.');
    if (result.ok) expect(result.newSize).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/replaceInBlock.test.ts`
Expected: module not found.

- [ ] **Step 3: Create `replaceInBlock.ts`**

```typescript
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
```

- [ ] **Step 4: Export from barrel**

Edit `packages/shared/src/memory/index.ts`, add:

```typescript
export { replaceInBlock } from './replaceInBlock.ts';
```

- [ ] **Step 5: Run tests — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/replaceInBlock.test.ts`
Expected: 2 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/replaceInBlock.ts packages/shared/src/memory/__tests__/replaceInBlock.test.ts packages/shared/src/memory/index.ts
git commit -m "feat(memory): replaceInBlock — missing + happy path"
```

---

### Task 4: `replaceInBlock` — match-count errors + PARSE_ERROR + empty-new + history

**Files:**
- Modify: `packages/shared/src/memory/__tests__/replaceInBlock.test.ts`

- [ ] **Step 1: Add 5 failing tests**

Append inside the existing `describe` block:

```typescript
  it('returns NOT_FOUND when old_content does not appear in body', async () => {
    setupBlock(
      workspaceRoot,
      'human',
      '---\nlabel: human\ndescription: about the user\n---\nName: Mario.\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'human',
      oldContent: 'Luigi',
      newContent: 'Yoshi',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toContain("substring not found in block 'human'");
    }
  });

  it('returns MULTIPLE_MATCHES when old_content appears more than once', async () => {
    setupBlock(
      workspaceRoot,
      'project',
      '---\nlabel: project\ndescription: x\n---\nfoo bar foo baz foo\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'project',
      oldContent: 'foo',
      newContent: 'FOO',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MULTIPLE_MATCHES');
      expect(result.message).toContain('found 3 matches');
    }
  });

  it('returns PARSE_ERROR when frontmatter is malformed', async () => {
    setupBlock(
      workspaceRoot,
      'bad',
      '---\nlabel: bad\ndescription: [unclosed\n---\nbody\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'bad',
      oldContent: 'body',
      newContent: 'new',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PARSE_ERROR');
      expect(result.message).toContain("could not parse frontmatter in block 'bad'");
    }
  });

  it('treats empty new_content as deletion', async () => {
    const path = setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nkeep this\nremove this line\ndone\n',
    );
    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      oldContent: 'remove this line\n',
      newContent: '',
    });
    expect(result.ok).toBe(true);
    const after = readFileSync(path, 'utf-8');
    expect(after).not.toContain('remove this line');
    expect(after).toContain('keep this');
    expect(after).toContain('done');
  });

  it('appends one history entry on success', async () => {
    setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nbefore\n',
    );
    await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      oldContent: 'before',
      newContent: 'after',
    });
    const historyPath = join(workspaceRoot, 'memory', '.history.jsonl');
    expect(existsSync(historyPath)).toBe(true);
    const entry = JSON.parse(readFileSync(historyPath, 'utf-8').trim());
    expect(entry.label).toBe('persona');
    expect(entry.op).toBe('replace');
    expect(entry.old).toBe('before');
    expect(entry.new).toBe('after');
  });
```

- [ ] **Step 2: Run — expect all green (Task 3 implementation already covers these)**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/replaceInBlock.test.ts`
Expected: 7 pass, 0 fail. If any red, fix `replaceInBlock.ts` inline before proceeding.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/__tests__/replaceInBlock.test.ts
git commit -m "test(memory): replaceInBlock — NOT_FOUND/MULTIPLE_MATCHES/PARSE_ERROR/delete/history"
```

---

### Task 5: `replaceInBlock` — STALE_MTIME (deterministic race simulation)

**Files:**
- Modify: `packages/shared/src/memory/__tests__/replaceInBlock.test.ts`
- Modify: `packages/shared/src/memory/replaceInBlock.ts`

The naive `stat` → `readFile` → `stat` flow may not race-detect reliably because the second `stat` will match the first if no one touched the file between them. To make the test deterministic we need an injection seam. Add an **optional test-only hook** `__beforeWriteForTest` that runs between the read and the mtime re-check.

- [ ] **Step 1: Add test-only injection seam to `replaceInBlock.ts`**

Edit `packages/shared/src/memory/replaceInBlock.ts`. Change the parameter type and insert the hook call just before the re-stat:

```typescript
export async function replaceInBlock(params: {
  workspaceRootPath: string;
  label: string;
  oldContent: string;
  newContent: string;
  /** @internal — test hook, do not use in production. Runs between read and re-stat. */
  __beforeReStatForTest?: () => Promise<void> | void;
}): Promise<MemoryEditResult> {
```

And call it just before `const currentMtime = ...`:

```typescript
  if (params.__beforeReStatForTest) await params.__beforeReStatForTest();

  // Re-stat for STALE_MTIME check.
  const currentMtime = (await stat(path)).mtimeMs;
```

- [ ] **Step 2: Add STALE_MTIME test**

Append inside `replaceInBlock.test.ts`:

```typescript
  it('returns STALE_MTIME when file is touched between read and write', async () => {
    const path = setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\noriginal\n',
    );
    const { utimes } = require('fs/promises');

    const result = await replaceInBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      oldContent: 'original',
      newContent: 'updated',
      __beforeReStatForTest: async () => {
        // Bump mtime by 10 seconds to simulate external edit.
        const future = new Date(Date.now() + 10_000);
        await utimes(path, future, future);
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('STALE_MTIME');
      expect(result.message).toContain("block 'persona' was modified externally");
    }
    // Confirm the file was NOT written.
    expect(readFileSync(path, 'utf-8')).toContain('original');
    expect(readFileSync(path, 'utf-8')).not.toContain('updated');
  });
```

- [ ] **Step 3: Run tests — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/replaceInBlock.test.ts`
Expected: 8 pass, 0 fail.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/replaceInBlock.ts packages/shared/src/memory/__tests__/replaceInBlock.test.ts
git commit -m "feat(memory): replaceInBlock STALE_MTIME check with deterministic test"
```

---

### Task 6: `appendToBlock` — happy path + junction normalization + history

**Files:**
- Create: `packages/shared/src/memory/appendToBlock.ts`
- Create: `packages/shared/src/memory/__tests__/appendToBlock.test.ts`
- Modify: `packages/shared/src/memory/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/memory/__tests__/appendToBlock.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendToBlock } from '../appendToBlock.ts';

function setupBlock(ws: string, label: string, fullContent: string): string {
  const memDir = join(ws, 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir);
  const path = join(memDir, `${label}.md`);
  writeFileSync(path, fullContent);
  return path;
}

describe('appendToBlock', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-append-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('appends to the end with a single \\n junction, preserving frontmatter', async () => {
    const path = setupBlock(
      workspaceRoot,
      'human',
      '---\nlabel: human\ndescription: about user\n---\nexisting line.\n',
    );
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'human',
      content: 'new fact.',
    });
    expect(result.ok).toBe(true);
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('label: human');
    expect(after).toContain('existing line.\nnew fact.');
    expect(after).not.toContain('\n\nnew fact.'); // exactly one newline between
  });

  it('strips trailing whitespace (newlines/spaces/tabs) before inserting separator', async () => {
    const path = setupBlock(
      workspaceRoot,
      'human',
      '---\nlabel: human\ndescription: d\n---\nline\n\n\n   \t\n',
    );
    await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'human',
      content: 'added.',
    });
    const after = readFileSync(path, 'utf-8');
    // Body should now end with "line\nadded.\n" (stringify adds trailing \n).
    const bodyStart = after.indexOf('---\n', 4) + 4; // past second fence
    const body = after.slice(bodyStart);
    expect(body.trimEnd()).toBe('line\nadded.');
  });

  it('appends to an empty-body block', async () => {
    const path = setupBlock(
      workspaceRoot,
      'project',
      '---\nlabel: project\ndescription: d\n---\n',
    );
    await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'project',
      content: 'first entry.',
    });
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('first entry.');
  });

  it('appends one history entry on success', async () => {
    setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nbefore\n',
    );
    await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      content: 'added.',
    });
    const historyPath = join(workspaceRoot, 'memory', '.history.jsonl');
    expect(existsSync(historyPath)).toBe(true);
    const entry = JSON.parse(readFileSync(historyPath, 'utf-8').trim());
    expect(entry.label).toBe('persona');
    expect(entry.op).toBe('append');
    expect(entry.content).toBe('added.');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/appendToBlock.test.ts`
Expected: module not found.

- [ ] **Step 3: Create `appendToBlock.ts`**

```typescript
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
    const r = matter(raw);
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
```

- [ ] **Step 4: Export from barrel**

Edit `packages/shared/src/memory/index.ts`, add:

```typescript
export { appendToBlock } from './appendToBlock.ts';
```

- [ ] **Step 5: Run tests — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/appendToBlock.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/appendToBlock.ts packages/shared/src/memory/__tests__/appendToBlock.test.ts packages/shared/src/memory/index.ts
git commit -m "feat(memory): appendToBlock — happy path, junction normalization, history"
```

---

### Task 7: `appendToBlock` — BLOCK_MISSING + STALE_MTIME + 16KB warning boundary

**Files:**
- Modify: `packages/shared/src/memory/__tests__/appendToBlock.test.ts`

- [ ] **Step 1: Add 3 tests**

Append inside the existing `describe` block:

```typescript
  it('returns BLOCK_MISSING when file does not exist', async () => {
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'ghost',
      content: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BLOCK_MISSING');
  });

  it('returns STALE_MTIME when file is touched between read and write', async () => {
    const path = setupBlock(
      workspaceRoot,
      'persona',
      '---\nlabel: persona\ndescription: d\n---\nbefore\n',
    );
    const { utimes } = require('fs/promises');
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'persona',
      content: 'after',
      __beforeReStatForTest: async () => {
        const future = new Date(Date.now() + 10_000);
        await utimes(path, future, future);
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('STALE_MTIME');
    expect(readFileSync(path, 'utf-8')).not.toContain('after');
  });

  it('emits a size warning when the new body exceeds 16KB', async () => {
    // 16383 bytes of body — below the 16384 threshold BEFORE we append.
    const baseBody = 'x'.repeat(16_383);
    setupBlock(
      workspaceRoot,
      'big',
      `---\nlabel: big\ndescription: d\n---\n${baseBody}\n`,
    );
    // Append ~10 bytes — the stripped body (16383) + '\n' + 10 = 16394 > 16384.
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'big',
      content: 'yyyyyyyyy.',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newSize).toBeGreaterThan(16_384);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain("block 'big'");
      expect(result.warnings![0]).toContain('soft cap');
    }
  });

  it('does NOT emit a size warning when the new body stays under 16KB', async () => {
    setupBlock(
      workspaceRoot,
      'small',
      '---\nlabel: small\ndescription: d\n---\nsmall body\n',
    );
    const result = await appendToBlock({
      workspaceRootPath: workspaceRoot,
      label: 'small',
      content: 'short add.',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toBeUndefined();
  });
```

- [ ] **Step 2: Run — expect all green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/appendToBlock.test.ts`
Expected: 8 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/__tests__/appendToBlock.test.ts
git commit -m "test(memory): appendToBlock — BLOCK_MISSING, STALE_MTIME, 16KB boundary"
```

---

### Task 8: Zod schemas + tool descriptions in `tool-defs.ts`

**Files:**
- Modify: `packages/session-tools-core/src/tool-defs.ts`

- [ ] **Step 1: Add Zod schemas after `SendAgentMessageSchema`**

Open `packages/session-tools-core/src/tool-defs.ts`. Scan for the last schema declaration (use Grep to find `Schema = z.object` and use the last one before `TOOL_DESCRIPTIONS` at line ~211). After that final schema block, insert:

```typescript
export const CoreMemoryReplaceSchema = z.object({
  label: z.string().min(1).describe("Block name (e.g. 'persona', 'human', 'project') — no .md suffix"),
  old_content: z.string().min(1).describe('Exact substring to replace. Must appear in the block body exactly once.'),
  new_content: z.string().describe('Replacement text. Use an empty string to delete the substring.'),
});

export const CoreMemoryAppendSchema = z.object({
  label: z.string().min(1).describe("Block name (e.g. 'persona', 'human', 'project') — no .md suffix"),
  content: z.string().min(1).describe('Text to append to the end of the block body. A newline separator is inserted automatically — do not include a leading newline.'),
});
```

- [ ] **Step 2: Add tool descriptions inside `TOOL_DESCRIPTIONS`**

Locate `export const TOOL_DESCRIPTIONS = {` at line ~211 of the same file. Before the closing `};` of that object, insert:

```typescript
  core_memory_replace: `Replace an exact substring in one of your memory blocks.

Memory blocks are named markdown files under the workspace's \`memory/\` directory (e.g. \`persona\`, \`human\`, \`project\`) that are automatically injected into every turn. Use this to correct, update, or refine facts you've previously written.

The \`old_content\` must appear exactly once in the named block's body. If it doesn't match, or matches multiple times, you'll get an error — retry with more surrounding context. Set \`new_content\` to an empty string to delete the substring.

Frontmatter is never modified. Edits are atomic and recorded in \`memory/.history.jsonl\`.`,

  core_memory_append: `Add new content to the end of one of your memory blocks.

Memory blocks are named markdown files under the workspace's \`memory/\` directory (e.g. \`persona\`, \`human\`, \`project\`) that are automatically injected into every turn. Use this to record new facts, preferences, or decisions you want to remember across turns.

A newline is inserted automatically between the existing body and your new content — do not include a leading newline yourself.

Frontmatter is never modified. Edits are atomic and recorded in \`memory/.history.jsonl\`.`,
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/session-tools-core && bun run tsc --noEmit 2>&1 | grep -E 'tool-defs.ts' || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/session-tools-core/src/tool-defs.ts
git commit -m "feat(memory): core_memory_replace/append Zod schemas + tool descriptions"
```

---

### Task 9: `handleCoreMemoryReplace` adapter

**Files:**
- Create: `packages/session-tools-core/src/handlers/core-memory-replace.ts`
- Modify: `packages/session-tools-core/src/tool-defs.ts`

- [ ] **Step 1: Create the handler**

Create `packages/session-tools-core/src/handlers/core-memory-replace.ts`:

```typescript
import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { resolveSessionWorkingDirectory } from '../source-helpers.ts';
import { replaceInBlock } from '@craft-agent/shared/memory';

export interface CoreMemoryReplaceArgs {
  label: string;
  old_content: string;
  new_content: string;
}

/**
 * Handle core_memory_replace.
 *
 * Resolves the project root via ctx.workingDirectory (falling back to session
 * header resolution — same pattern as handleSkillValidate), then delegates to
 * the shared replaceInBlock. Formats the MemoryEditResult as text for the agent.
 */
export async function handleCoreMemoryReplace(
  ctx: SessionToolContext,
  args: CoreMemoryReplaceArgs,
): Promise<ToolResult> {
  const workingDirectory =
    ctx.workingDirectory
    ?? resolveSessionWorkingDirectory(ctx.workspacePath, ctx.sessionId);

  if (!workingDirectory) {
    return {
      content: [
        {
          type: 'text',
          text: 'error: no workspace working directory — memory tools require a project root',
        },
      ],
      isError: true,
    };
  }

  const result = await replaceInBlock({
    workspaceRootPath: workingDirectory,
    label: args.label,
    oldContent: args.old_content,
    newContent: args.new_content,
  });

  if (result.ok) {
    const lines = [`ok (new size: ${result.newSize} bytes)`];
    if (result.warnings) lines.push(...result.warnings.map((w) => `warning: ${w}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
  return {
    content: [{ type: 'text', text: `error: ${result.message}` }],
    isError: true,
  };
}
```

- [ ] **Step 2: Register the handler in `tool-defs.ts`**

Edit `packages/session-tools-core/src/tool-defs.ts`.

**2a.** Add an import (grouped with the other `handlers/` imports near the top, around line 42):

```typescript
import { handleCoreMemoryReplace } from './handlers/core-memory-replace.ts';
```

**2b.** Add a registry entry inside `SESSION_TOOL_DEFS` (around line 500-528). Place it right after `send_agent_message` and before the closing `]`:

```typescript
  // Core memory editing (Phase 2 of memory-first agent)
  { name: 'core_memory_replace', description: TOOL_DESCRIPTIONS.core_memory_replace, inputSchema: CoreMemoryReplaceSchema, executionMode: 'registry', safeMode: 'allow', handler: handleCoreMemoryReplace },
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/session-tools-core && bun run tsc --noEmit 2>&1 | head -30`
Expected: no errors related to `core-memory-replace.ts` or the new registry entry.

- [ ] **Step 4: Sanity-check tool registration**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2/packages/session-tools-core && bun -e "import('./src/tool-defs.ts').then(m => console.log(m.SESSION_TOOL_DEFS.find(d => d.name === 'core_memory_replace') ? 'REGISTERED' : 'MISSING'))"
```
Expected: `REGISTERED`.

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/session-tools-core/src/handlers/core-memory-replace.ts packages/session-tools-core/src/tool-defs.ts
git commit -m "feat(memory): register core_memory_replace tool + handler"
```

---

### Task 10: `handleCoreMemoryAppend` adapter

**Files:**
- Create: `packages/session-tools-core/src/handlers/core-memory-append.ts`
- Modify: `packages/session-tools-core/src/tool-defs.ts`

- [ ] **Step 1: Create the handler**

Create `packages/session-tools-core/src/handlers/core-memory-append.ts`:

```typescript
import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { resolveSessionWorkingDirectory } from '../source-helpers.ts';
import { appendToBlock } from '@craft-agent/shared/memory';

export interface CoreMemoryAppendArgs {
  label: string;
  content: string;
}

/**
 * Handle core_memory_append.
 *
 * Resolves the project root via ctx.workingDirectory (falling back to session
 * header resolution), then delegates to the shared appendToBlock. Formats the
 * MemoryEditResult as text for the agent.
 */
export async function handleCoreMemoryAppend(
  ctx: SessionToolContext,
  args: CoreMemoryAppendArgs,
): Promise<ToolResult> {
  const workingDirectory =
    ctx.workingDirectory
    ?? resolveSessionWorkingDirectory(ctx.workspacePath, ctx.sessionId);

  if (!workingDirectory) {
    return {
      content: [
        {
          type: 'text',
          text: 'error: no workspace working directory — memory tools require a project root',
        },
      ],
      isError: true,
    };
  }

  const result = await appendToBlock({
    workspaceRootPath: workingDirectory,
    label: args.label,
    content: args.content,
  });

  if (result.ok) {
    const lines = [`ok (new size: ${result.newSize} bytes)`];
    if (result.warnings) lines.push(...result.warnings.map((w) => `warning: ${w}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
  return {
    content: [{ type: 'text', text: `error: ${result.message}` }],
    isError: true,
  };
}
```

- [ ] **Step 2: Register the handler**

Edit `packages/session-tools-core/src/tool-defs.ts`.

**2a.** Add import (grouped with the other Phase 2 handler import):

```typescript
import { handleCoreMemoryAppend } from './handlers/core-memory-append.ts';
```

**2b.** Add registry entry right after `core_memory_replace`:

```typescript
  { name: 'core_memory_append', description: TOOL_DESCRIPTIONS.core_memory_append, inputSchema: CoreMemoryAppendSchema, executionMode: 'registry', safeMode: 'allow', handler: handleCoreMemoryAppend },
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/session-tools-core && bun run tsc --noEmit 2>&1 | head -30`
Expected: no new errors.

- [ ] **Step 4: Sanity-check tool registration**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2/packages/session-tools-core && bun -e "import('./src/tool-defs.ts').then(m => { const names = m.SESSION_TOOL_DEFS.map(d => d.name); console.log(names.includes('core_memory_replace') && names.includes('core_memory_append') ? 'BOTH REGISTERED' : 'MISSING'); })"
```
Expected: `BOTH REGISTERED`.

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/session-tools-core/src/handlers/core-memory-append.ts packages/session-tools-core/src/tool-defs.ts
git commit -m "feat(memory): register core_memory_append tool + handler"
```

---

### Task 11: Handler integration tests (end-to-end via handlers + filesystem)

**Files:**
- Create: `packages/session-tools-core/src/handlers/__tests__/core-memory-tools.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/session-tools-core/src/handlers/__tests__/core-memory-tools.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleCoreMemoryReplace } from '../core-memory-replace.ts';
import { handleCoreMemoryAppend } from '../core-memory-append.ts';
import {
  CoreMemoryReplaceSchema,
  CoreMemoryAppendSchema,
  SESSION_TOOL_DEFS,
} from '../../tool-defs.ts';
import type { SessionToolContext } from '../../context.ts';

function makeCtx(workingDirectory: string): SessionToolContext {
  return {
    sessionId: 'test-session',
    workspacePath: '/fake/cra-workspace',
    get sourcesPath() { return '/fake/sources'; },
    get skillsPath() { return '/fake/skills'; },
    plansFolderPath: '/fake/plans',
    workingDirectory,
    callbacks: {
      onPlanSubmitted: () => {},
      onAuthRequest: () => {},
    },
    fs: {
      exists: () => false,
      readFile: () => '',
      readFileBuffer: () => Buffer.alloc(0),
      writeFile: () => {},
      isDirectory: () => false,
      readdir: () => [],
      stat: () => ({ size: 0, isDirectory: () => false }),
    },
    loadSourceConfig: () => null,
  } as SessionToolContext;
}

describe('core-memory-tools integration', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-integration-'));
    mkdirSync(join(workspaceRoot, 'memory'));
    writeFileSync(
      join(workspaceRoot, 'memory', 'persona.md'),
      '---\nlabel: persona\ndescription: d\n---\nI reply in prose.\n',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('registers both tools in SESSION_TOOL_DEFS', () => {
    const names = SESSION_TOOL_DEFS.map((d) => d.name);
    expect(names).toContain('core_memory_replace');
    expect(names).toContain('core_memory_append');
  });

  it('Zod rejects empty label', () => {
    expect(() =>
      CoreMemoryReplaceSchema.parse({ label: '', old_content: 'a', new_content: 'b' }),
    ).toThrow();
    expect(() => CoreMemoryAppendSchema.parse({ label: '', content: 'a' })).toThrow();
  });

  it('Zod rejects empty old_content / content', () => {
    expect(() =>
      CoreMemoryReplaceSchema.parse({ label: 'x', old_content: '', new_content: 'b' }),
    ).toThrow();
    expect(() => CoreMemoryAppendSchema.parse({ label: 'x', content: '' })).toThrow();
  });

  it('handleCoreMemoryReplace — happy path returns "ok (new size: N bytes)"', async () => {
    const ctx = makeCtx(workspaceRoot);
    const result = await handleCoreMemoryReplace(ctx, {
      label: 'persona',
      old_content: 'I reply in prose.',
      new_content: 'I reply in bullets.',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe('text');
    if (result.content[0].type === 'text') {
      expect(result.content[0].text).toMatch(/^ok \(new size: \d+ bytes\)$/);
    }
    const after = readFileSync(join(workspaceRoot, 'memory', 'persona.md'), 'utf-8');
    expect(after).toContain('I reply in bullets.');
  });

  it('handleCoreMemoryReplace — BLOCK_MISSING surfaces as "error: no block…"', async () => {
    const ctx = makeCtx(workspaceRoot);
    const result = await handleCoreMemoryReplace(ctx, {
      label: 'ghost',
      old_content: 'a',
      new_content: 'b',
    });
    expect(result.isError).toBe(true);
    if (result.content[0].type === 'text') {
      expect(result.content[0].text).toBe("error: no block with label 'ghost'");
    }
  });

  it('handleCoreMemoryAppend — happy path writes + history', async () => {
    const ctx = makeCtx(workspaceRoot);
    const result = await handleCoreMemoryAppend(ctx, {
      label: 'persona',
      content: 'And I prefer concise replies.',
    });
    expect(result.isError).toBeUndefined();
    const after = readFileSync(join(workspaceRoot, 'memory', 'persona.md'), 'utf-8');
    expect(after).toContain('And I prefer concise replies.');
    expect(existsSync(join(workspaceRoot, 'memory', '.history.jsonl'))).toBe(true);
  });

  it('handler returns error when workingDirectory cannot be resolved', async () => {
    // Make a context where workingDirectory is undefined AND workspacePath has no session header to fall back to.
    const ctx = {
      ...makeCtx(workspaceRoot),
      workingDirectory: undefined,
      workspacePath: '/nonexistent/cra-workspace',
      sessionId: 'nonexistent-session',
    } as SessionToolContext;
    const result = await handleCoreMemoryReplace(ctx, {
      label: 'persona',
      old_content: 'x',
      new_content: 'y',
    });
    expect(result.isError).toBe(true);
    if (result.content[0].type === 'text') {
      expect(result.content[0].text).toContain('no workspace working directory');
    }
  });
});
```

- [ ] **Step 2: Run — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/session-tools-core && bun test src/handlers/__tests__/core-memory-tools.integration.test.ts`
Expected: 7 pass, 0 fail.

If the `makeCtx` stub is missing a field the types require, add the missing field inline — do not add logic, only shape-satisfiers.

- [ ] **Step 3: Full shared + session-tools-core test run (regression guard)**

Run these in sequence:
```bash
cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test 2>&1 | tail -10
cd /Users/mauriello/Dev/rowl-v2/packages/session-tools-core && bun test 2>&1 | tail -10
```
Expected: all memory tests green (Phase 1's 27 still green + Phase 2's new ~27 = ~54), Phase 2 integration test green, no unrelated regressions.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/session-tools-core/src/handlers/__tests__/core-memory-tools.integration.test.ts
git commit -m "test(memory): integration — core_memory_replace/append handlers end-to-end"
```

---

### Task 12: Electron build + manual UI smoke + STATE update

**Files:** verification + docs/STATE.md + persistent memory.

- [ ] **Step 1: Build the Electron app**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run electron:build 2>&1 | tail -20`
Expected: exits 0.

- [ ] **Step 2: Confirm Craft Agents.app is NOT running**

Run: `ls -la ~/.craft-agent/.server.lock 2>/dev/null && echo "LOCK EXISTS" || echo "no lock"`
If "LOCK EXISTS", quit Craft Agents.app and re-check.

- [ ] **Step 3: Start Rowl dev Electron**

Run in a separate terminal or background:
```bash
cd /Users/mauriello/Dev/rowl-v2 && ./node_modules/.bin/electron apps/electron
```
Expected: Rowl window opens.

- [ ] **Step 4: Create a fresh smoke workspace**

In the Rowl UI, create a workspace pointing at a fresh directory (e.g. `/tmp/rowl-memory-phase2-$(date +%s)`). Start a session.

- [ ] **Step 5: Confirm Phase 1 defaults materialized**

Run: `ls /tmp/rowl-memory-phase2-*/memory/`
Expected: `persona.md`, `human.md`, `project.md`.

- [ ] **Step 6: Smoke-test `core_memory_append` via agent**

In the session, send:
> My name is Mario. I prefer bullet-list replies. Please remember this about me.

Expected: the agent calls `core_memory_append` on the `human` block. Verify:
```bash
cat /tmp/rowl-memory-phase2-*/memory/human.md
```
Expected: the file now contains a line mentioning Mario and bullets, appended after the default scaffold.

Also:
```bash
cat /tmp/rowl-memory-phase2-*/memory/.history.jsonl
```
Expected: one JSONL entry with `"op":"append"`, `"label":"human"`, a truncated `content` containing the fact, and a current `ts`.

- [ ] **Step 7: Smoke-test `core_memory_replace` via agent**

In the same session, send:
> Actually I prefer concise prose, not bullets. Update my memory.

Expected: agent calls `core_memory_replace` on the `human` block, swapping the bullets phrasing for the new preference. Verify:
```bash
cat /tmp/rowl-memory-phase2-*/memory/human.md
```
Expected: reflects concise-prose preference; no bullets-preference remnant.

Verify `.history.jsonl` now has 2 entries (one `append`, one `replace`).

- [ ] **Step 8: Smoke-test STALE_MTIME defense**

In a second terminal, open `/tmp/rowl-memory-phase2-*/memory/persona.md` in an external editor, add a new line somewhere, save.

Immediately in Rowl, ask the agent:
> Edit your persona to say you always reply concisely.

If the agent's tool call happens while the file's mtime is newer than the agent's snapshot, the tool returns `STALE_MTIME` and the agent should retry on the next turn (by re-reading via Phase 1's injection path). The user-facing experience: the edit eventually lands, and the external edit is preserved. Confirm by `cat`-ing the file — both the external edit AND the agent's update should be present.

This test is opportunistic (it depends on timing); the important acceptance is the `.history.jsonl` showing eventual success and the external edit not being wiped.

- [ ] **Step 9: Update `docs/STATE.md`**

Edit `docs/STATE.md`:
- Header line `Last updated` → today's date.
- `Current focus` → "Sub-project #1 Phase 2 — SHIPPED. Ready to scope Phase 3 (reminder engine) or pivot to sub-project #2."
- `Where we are right now` block → "Phase 2: shipped {date}."
- Multi-initiative map → mark row for #1 Phase 2 as `shipped`.
- Append a new entry to `Locked decisions` with today's date noting Phase 2 ship and the locked tool surface (2 tools, strict-match replace, mtime concurrency, silent + audit log).

- [ ] **Step 10: Final commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add docs/STATE.md
git commit -m "docs(state): sub-project #1 Phase 2 shipped"
```

- [ ] **Step 11: Update persistent memory**

Edit `~/.claude/projects/-Users-mauriello-Dev/memory/project_rowl_v2.md`:
- Change `Sub-project #1 Phase 1 shipped modules` section → add a `Phase 2 shipped modules` block listing `replaceInBlock.ts`, `appendToBlock.ts`, `writeBlockAtomic.ts`, `appendHistory.ts`, `editTypes.ts`, the two handlers, and the tool-defs additions.
- Update arc summary: "Phase 2 SHIPPED {date} — agent can self-edit memory via 2 tools."

(Not committed to the repo — lives outside the repo in Claude Code's user-memory.)

---

## Acceptance checklist (run after all tasks)

- [ ] `bun test` in `packages/shared` green; Phase 1 tests still pass; Phase 2 adds ~22 new tests across 4 new `__tests__` files (writeBlockAtomic: 3, appendHistory: 4, replaceInBlock: 8, appendToBlock: 7).
- [ ] `bun test` in `packages/session-tools-core` green; integration test adds ~7 tests.
- [ ] `bun run tsc --noEmit` green in both `packages/shared` and `packages/session-tools-core` (no new errors from Phase 2 files).
- [ ] `bun run electron:build` green.
- [ ] Both tools visible in `SESSION_TOOL_DEFS` (verified by the integration-test tool-registration check).
- [ ] Fresh-workspace smoke: agent successfully calls `core_memory_append` to record a user fact; block file reflects the change.
- [ ] Fresh-workspace smoke: agent successfully calls `core_memory_replace` to update a prior fact; block file reflects the change.
- [ ] `memory/.history.jsonl` accumulates one valid JSONL entry per successful tool call.
- [ ] External-edit during tool call surfaces `STALE_MTIME` to the agent and does not clobber the external edit.
- [ ] `docs/STATE.md` updated; persistent memory updated.

---

## Risks & mitigations (reminder during execution)

| Risk | Mitigation baked into the plan |
|---|---|
| `ctx.workingDirectory` undefined in some execution contexts | Task 9/10 handlers use the `ctx.workingDirectory ?? resolveSessionWorkingDirectory(...)` pattern, exactly as `handleSkillValidate` does. Integration test covers the unresolved-directory error path. |
| Deterministic testing of STALE_MTIME race | Tasks 5 and 7 add a test-only `__beforeReStatForTest` hook so mtime can be bumped synchronously between the read and the re-stat. Hook is typed as `@internal` to discourage prod use. |
| Gray-matter's `stringify` reorders YAML keys on round-trip | Accepted risk — frontmatter is authored by humans and stable. If it becomes a visible problem, drop in a verbatim frontmatter preserver (split on leading fences, rewrite body only) in a follow-up — no API change needed. |
| `appendFile` atomicity for audit log | JSONL lines stay under the POSIX `PIPE_BUF` atomic-append bound because string fields truncate at 500 chars. |
| Zod schema shape drift breaking tool registration | Integration test in Task 11 asserts both tools are registered by name in `SESSION_TOOL_DEFS` on every test run. |
| Electron lock collision with installed Craft Agents.app | Task 12 Step 2 checks the lock explicitly before launch (same guard Phase 1 used). |
| Agent pattern doesn't use the tools at all (descriptions too weak) | Task 8 locks tool descriptions mirroring Letta; Task 12 Step 6/7 tests that a natural-language prompt actually triggers tool calls. If it doesn't, iterate on the description and re-smoke before closing. |

---

## Self-review notes (done before handoff)

- **Spec coverage.** Walked every section of `PHASE-2-SPEC.md`:
  - Tool surface & match semantics → Tasks 3-8
  - Result shape (all 5 error codes: BLOCK_MISSING, PARSE_ERROR, NOT_FOUND, MULTIPLE_MATCHES, STALE_MTIME) → tests in Tasks 3/4/5/6/7
  - Concurrency (mtime check) → Tasks 5 and 7 with deterministic test hook
  - Atomic writes → Task 1
  - Audit log (JSONL, 500-char truncation, non-throwing) → Task 2
  - Tool descriptions → Task 8 (text locked verbatim from spec)
  - File structure → Tasks 1, 2, 3, 6 (shared); Tasks 9, 10, 11 (session-tools-core)
  - Testing strategy at ~30 tests across 5 files → covered
  - Success criteria → Task 12 smoke matches spec's success criteria §
- **Placeholders.** None — every code block is complete, every shell command is exact.
- **Type consistency.**
  - `MemoryEditResult`, `MemoryEditErrorCode` defined in T1; used in T3 (`replaceInBlock`), T6 (`appendToBlock`), T9 and T10 (handlers).
  - `MemoryHistoryEntry` defined in T2; used in T3 (`replaceInBlock` calls `appendHistory`) and T6 (`appendToBlock` calls `appendHistory`).
  - Handler arg shapes (`CoreMemoryReplaceArgs`, `CoreMemoryAppendArgs`) match the Zod schemas in T8 exactly: `label`/`old_content`/`new_content` and `label`/`content` (snake_case in Zod, camelCase in handler internals — translated at the boundary).
  - `replaceInBlock`/`appendToBlock` function signatures stable across declarations (Tasks 3, 5, 6) including the `__beforeReStatForTest` hook added in T5.
- **Ambiguities flagged.** All three open items from the spec self-review are resolved by this plan:
  - Parse-error code: locked as distinct `PARSE_ERROR` (spec updated pre-plan; Task 1 types + Task 4 test).
  - Tool description text: locked in spec (Task 8 uses the locked text verbatim).
  - Workspace-context plumbing: confirmed `ctx.workingDirectory` via `handleSkillValidate` pattern (deviation §2, Tasks 9/10).
