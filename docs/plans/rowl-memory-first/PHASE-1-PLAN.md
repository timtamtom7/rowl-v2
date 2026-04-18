# Sub-project #1 — Memory-First Agent — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/plans/rowl-memory-first/SPEC.md` (commit `79d838d`)

**Goal:** Ship always-on, workspace-scoped memory blocks that are injected into every agent turn, plus lazy-init scaffolding for three default blocks (`persona`, `human`, `project`). Agent-editable tools and reminder engine are explicitly out of scope for this phase.

**Architecture:** A new `packages/shared/src/memory/` module owns loading, rendering, and initializing markdown memory files under `{workspaceRootPath}/memory/<label>.md` with YAML frontmatter. `PromptBuilder.buildContextParts()` calls the loader once per turn and prepends a rendered `<memory_blocks>` XML wrapper as the first context-part. `SessionManager.createSession()` calls the lazy initializer to materialize defaults on first use of a workspace. Both Claude and Pi backends pick up the behavior automatically because they share `PromptBuilder`.

**Tech stack:** TypeScript 5, Bun 1.3.11 (test runner = `bun test`), Node `fs` + `fs/promises`, `gray-matter` (already root dep). No new npm packages.

---

## Deviation from spec

The spec proposes `loadMemoryBlocks(workspaceRootPath) → Promise<MemoryBlock[]>` (async). Implementation will make it **synchronous** (`loadMemoryBlocks(workspaceRootPath): MemoryBlock[]` using `fs.readdirSync` + `fs.readFileSync`). Rationale:

- `PromptBuilder.buildContextParts()` returns `string[]` synchronously today, and its callers (`ClaudeAgent.buildTextPrompt()` at `packages/shared/src/agent/claude-agent.ts:2006`, and the two other call sites in `claude-agent.ts:2016`/`2062` and `pi-agent.ts:1783`) are sync methods returning `string`. Turning the loader async would ripple `async` through `buildTextPrompt` and its callers.
- Payload is tiny: three small markdown files on a local disk per turn. Sync I/O here costs microseconds and isn't on a server hot-path — it's per agent turn, gated by an LLM round-trip measured in seconds.
- `ensureDefaultMemoryBlocks(workspaceRootPath): Promise<void>` **stays async** (uses `fs/promises`) because it's called from `SessionManager.createSession()` which is already async.

No other spec deviations.

---

## File structure

**New files (all under `packages/shared/src/memory/`):**

| File | Responsibility |
|---|---|
| `types.ts` | `MemoryBlock`, `MemoryBlockFrontmatter` TypeScript types. No logic. |
| `paths.ts` | `getMemoryDir(workspaceRootPath)` → absolute path of `memory/` dir. Single source of path truth. |
| `loadMemoryBlocks.ts` | Sync loader. Scans `memory/`, parses each `.md` with `gray-matter`, validates frontmatter, returns sorted `MemoryBlock[]`. Logs and skips on errors. |
| `ensureDefaultMemoryBlocks.ts` | Async lazy initializer. If `memory/` missing, create it + write the three default files. No-op if dir exists. |
| `renderMemoryBlocks.ts` | Pure function: `renderMemoryBlocks(blocks): string \| null` — returns `<memory_blocks>…</memory_blocks>` or `null` for empty set. |
| `index.ts` | Barrel export for the three public functions + types. |
| `__tests__/loadMemoryBlocks.test.ts` | Unit tests for loader. |
| `__tests__/ensureDefaultMemoryBlocks.test.ts` | Unit tests for initializer. |
| `__tests__/renderMemoryBlocks.test.ts` | Unit tests for renderer. |
| `__tests__/buildContextParts.memory.test.ts` | Integration test: PromptBuilder output contains rendered memory block. |

**Modified files:**

| File | Change |
|---|---|
| `packages/shared/package.json` | Add `"gray-matter": "^4.0.3"` to `dependencies` (explicit declaration; presently only at repo root + in `session-tools-core`). |
| `packages/shared/src/index.ts` (or a new subpath export in `package.json`) | Export the memory module. |
| `packages/shared/src/agent/core/prompt-builder.ts` | `buildContextParts()` prepends rendered memory-blocks string (first position). |
| `packages/server-core/src/sessions/SessionManager.ts` | `createSession()` calls `ensureDefaultMemoryBlocks(workspaceRootPath)` after resolving `workspaceRootPath` (around line 2149). |

---

## Task-by-task plan

Each task is TDD-shaped: write the failing test, verify it fails, implement, verify green, commit.

---

### Task 1: Scaffold memory package (types + paths + barrel) + add gray-matter dep

**Files:**
- Create: `packages/shared/src/memory/types.ts`
- Create: `packages/shared/src/memory/paths.ts`
- Create: `packages/shared/src/memory/index.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/index.ts` (add memory export)

- [ ] **Step 1: Add `gray-matter` to `@craft-agent/shared` dependencies**

Open `packages/shared/package.json`. In the `"dependencies"` object, alphabetically insert `"gray-matter": "^4.0.3"` after `"glob": "^13.0.0"`.

- [ ] **Step 2: Install (workspace-wide, triggers bun.lock update)**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun install`
Expected: "Done" or similar success, `bun.lock` may be updated. No errors.

- [ ] **Step 3: Create `packages/shared/src/memory/types.ts`**

```typescript
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
```

- [ ] **Step 4: Create `packages/shared/src/memory/paths.ts`**

```typescript
import { join } from 'path';

/**
 * Returns the absolute path of the memory directory for a workspace.
 * Used by loader, initializer, and any future memory-editing tool.
 */
export function getMemoryDir(workspaceRootPath: string): string {
  return join(workspaceRootPath, 'memory');
}

/**
 * Returns the absolute path for a specific memory block file.
 */
export function getMemoryBlockPath(workspaceRootPath: string, label: string): string {
  return join(getMemoryDir(workspaceRootPath), `${label}.md`);
}
```

- [ ] **Step 5: Create `packages/shared/src/memory/index.ts` (barrel — will grow as tasks land)**

```typescript
export type { MemoryBlock, MemoryBlockFrontmatter } from './types.ts';
export { getMemoryDir, getMemoryBlockPath } from './paths.ts';
```

- [ ] **Step 6: Add subpath export in `packages/shared/package.json`**

In the `"exports"` object, insert (alphabetically near `"./mcp"`):

```json
"./memory": "./src/memory/index.ts",
```

- [ ] **Step 7: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit`
Expected: no new errors from `src/memory/`. (The repo baseline `typecheck:all` is red for other reasons; just make sure we didn't introduce anything new in `packages/shared/src/memory/`.)

- [ ] **Step 8: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/package.json packages/shared/src/memory/types.ts packages/shared/src/memory/paths.ts packages/shared/src/memory/index.ts bun.lock
git commit -m "feat(memory): scaffold memory package (types, paths, barrel export)"
```

---

### Task 2: `loadMemoryBlocks` — missing-directory test (red)

**Files:**
- Create: `packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts`
- (No implementation yet — this step only writes the failing test.)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadMemoryBlocks } from '../loadMemoryBlocks.ts';

describe('loadMemoryBlocks', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-memory-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns [] when memory/ directory does not exist', () => {
    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/loadMemoryBlocks.test.ts`
Expected: FAIL with `Cannot find module '../loadMemoryBlocks.ts'` or similar.

---

### Task 3: `loadMemoryBlocks` — minimal implementation to pass missing-directory test (green)

**Files:**
- Create: `packages/shared/src/memory/loadMemoryBlocks.ts`
- Modify: `packages/shared/src/memory/index.ts`

- [ ] **Step 1: Create `loadMemoryBlocks.ts` (minimal)**

```typescript
import { existsSync } from 'fs';
import type { MemoryBlock } from './types.ts';
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
  if (!existsSync(dir)) {
    return [];
  }
  // Full implementation in Task 4.
  return [];
}
```

- [ ] **Step 2: Export from barrel**

Edit `packages/shared/src/memory/index.ts`, add:

```typescript
export { loadMemoryBlocks } from './loadMemoryBlocks.ts';
```

- [ ] **Step 3: Run test — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/loadMemoryBlocks.test.ts`
Expected: 1 pass, 0 fail.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/loadMemoryBlocks.ts packages/shared/src/memory/index.ts packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts
git commit -m "feat(memory): loadMemoryBlocks returns [] for missing directory"
```

---

### Task 4: `loadMemoryBlocks` — happy path (3 valid blocks, sorted by label)

**Files:**
- Modify: `packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts`
- Modify: `packages/shared/src/memory/loadMemoryBlocks.ts`

- [ ] **Step 1: Extend test — happy path (failing first)**

Add to `loadMemoryBlocks.test.ts` (inside the `describe` block, after the missing-directory test):

```typescript
  it('loads 3 valid blocks sorted alphabetically by label', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: who Rowl is\n---\nI am Rowl.\n',
    );
    writeFileSync(
      join(memDir, 'human.md'),
      '---\nlabel: human\ndescription: what Rowl knows about the user\n---\nName: Mario.\n',
    );
    writeFileSync(
      join(memDir, 'project.md'),
      '---\nlabel: project\ndescription: what this workspace is about\nlimit: 500\n---\nRowl itself.\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);

    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.label)).toEqual(['human', 'persona', 'project']);
    expect(blocks[0]).toMatchObject({
      label: 'human',
      description: 'what Rowl knows about the user',
      content: 'Name: Mario.\n',
    });
    expect(blocks[2].limit).toBe(500);
    expect(blocks[0].filePath).toBe(join(memDir, 'human.md'));
  });
```

- [ ] **Step 2: Run test — expect failure**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/loadMemoryBlocks.test.ts`
Expected: 1 pass (old), 1 fail (new) — "expected length 3, got 0" or similar.

- [ ] **Step 3: Implement happy path**

Replace the body of `loadMemoryBlocks.ts` with:

```typescript
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import type { MemoryBlock, MemoryBlockFrontmatter } from './types.ts';
import { getMemoryDir } from './paths.ts';

export function loadMemoryBlocks(workspaceRootPath: string): MemoryBlock[] {
  const dir = getMemoryDir(workspaceRootPath);
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir);
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
      const result = matter(raw);
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
```

- [ ] **Step 4: Run test — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/loadMemoryBlocks.test.ts`
Expected: 2 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/loadMemoryBlocks.ts packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts
git commit -m "feat(memory): loadMemoryBlocks loads + sorts valid blocks"
```

---

### Task 5: `loadMemoryBlocks` — error paths (malformed YAML, missing fields, label mismatch)

**Files:**
- Modify: `packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts`

- [ ] **Step 1: Add 4 failing-path tests**

Append inside the existing `describe` block:

```typescript
  it('skips file with malformed YAML, loads the rest', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'good.md'),
      '---\nlabel: good\ndescription: ok\n---\nbody\n',
    );
    writeFileSync(
      join(memDir, 'bad.md'),
      '---\nlabel: bad\ndescription: [unclosed\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].label).toBe('good');
  });

  it('skips file with missing label', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'nolabel.md'),
      '---\ndescription: oops\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(0);
  });

  it('skips file with missing description', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'nodesc.md'),
      '---\nlabel: nodesc\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(0);
  });

  it("skips file where frontmatter label doesn't match filename", () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: something_else\ndescription: ok\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(0);
  });

  it('ignores non-.md files', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(join(memDir, 'README.txt'), 'not a block');
    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: ok\n---\nbody\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].label).toBe('persona');
  });
```

- [ ] **Step 2: Run tests — expect all green (Task 4's impl already covers these)**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/loadMemoryBlocks.test.ts`
Expected: 7 pass, 0 fail. If any fail, the implementation in Task 4 is under-covering — fix `loadMemoryBlocks.ts` inline before proceeding.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts
git commit -m "test(memory): cover malformed/missing/mismatch + non-md files in loader"
```

---

### Task 6: `loadMemoryBlocks` — over-limit warning (content still included)

**Files:**
- Modify: `packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts`

- [ ] **Step 1: Add test**

Append inside the `describe` block:

```typescript
  it('includes block exceeding limit (does not truncate)', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    const body = 'x'.repeat(200);
    writeFileSync(
      join(memDir, 'big.md'),
      `---\nlabel: big\ndescription: over cap\nlimit: 50\n---\n${body}\n`,
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content.length).toBeGreaterThan(50);
    expect(blocks[0].limit).toBe(50);
  });

  it('handles empty content (frontmatter only)', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);

    writeFileSync(
      join(memDir, 'empty.md'),
      '---\nlabel: empty\ndescription: nothing here yet\n---\n',
    );

    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe('');
  });
```

- [ ] **Step 2: Run — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/loadMemoryBlocks.test.ts`
Expected: 9 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/__tests__/loadMemoryBlocks.test.ts
git commit -m "test(memory): over-limit and empty-content behavior for loader"
```

---

### Task 7: `renderMemoryBlocks` — XML wrapper formatter

**Files:**
- Create: `packages/shared/src/memory/__tests__/renderMemoryBlocks.test.ts`
- Create: `packages/shared/src/memory/renderMemoryBlocks.ts`
- Modify: `packages/shared/src/memory/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/memory/__tests__/renderMemoryBlocks.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { renderMemoryBlocks } from '../renderMemoryBlocks.ts';
import type { MemoryBlock } from '../types.ts';

function mk(label: string, description: string, content: string): MemoryBlock {
  return { label, description, content, filePath: `/fake/${label}.md` };
}

describe('renderMemoryBlocks', () => {
  it('returns null for empty block list', () => {
    expect(renderMemoryBlocks([])).toBeNull();
  });

  it('wraps a single block in <memory_blocks>', () => {
    const out = renderMemoryBlocks([mk('persona', 'who Rowl is', 'I am Rowl.')]);
    expect(out).toBe(
      '<memory_blocks>\n' +
      '<memory_block label="persona" description="who Rowl is">\n' +
      'I am Rowl.\n' +
      '</memory_block>\n' +
      '</memory_blocks>',
    );
  });

  it('concatenates multiple blocks in the given order', () => {
    const out = renderMemoryBlocks([
      mk('human', 'what Rowl knows', 'Mario.'),
      mk('persona', 'who Rowl is', 'Agent.'),
    ]);
    expect(out).toContain('<memory_block label="human"');
    expect(out).toContain('<memory_block label="persona"');
    // Human comes before persona in output
    const humanIdx = out!.indexOf('label="human"');
    const personaIdx = out!.indexOf('label="persona"');
    expect(humanIdx).toBeLessThan(personaIdx);
  });

  it('escapes double quotes in description attribute', () => {
    const out = renderMemoryBlocks([mk('x', 'has a "quote"', 'body')]);
    expect(out).toContain('description="has a &quot;quote&quot;"');
  });

  it('trims trailing newline from content to avoid double blank lines', () => {
    const out = renderMemoryBlocks([mk('x', 'd', 'body\n')]);
    expect(out).toBe(
      '<memory_blocks>\n' +
      '<memory_block label="x" description="d">\n' +
      'body\n' +
      '</memory_block>\n' +
      '</memory_blocks>',
    );
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/renderMemoryBlocks.test.ts`
Expected: module not found / fail.

- [ ] **Step 3: Create `renderMemoryBlocks.ts`**

```typescript
import type { MemoryBlock } from './types.ts';

/**
 * Render a set of memory blocks into an XML wrapper for injection
 * into the user message. Returns `null` for an empty list so callers
 * can skip emitting the wrapper entirely.
 */
export function renderMemoryBlocks(blocks: MemoryBlock[]): string | null {
  if (blocks.length === 0) return null;

  const inner = blocks
    .map((b) => {
      const descAttr = escapeAttr(b.description);
      const body = b.content.replace(/\n+$/, '');
      return `<memory_block label="${b.label}" description="${descAttr}">\n${body}\n</memory_block>`;
    })
    .join('\n');

  return `<memory_blocks>\n${inner}\n</memory_blocks>`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Export from barrel**

Edit `packages/shared/src/memory/index.ts`, add:

```typescript
export { renderMemoryBlocks } from './renderMemoryBlocks.ts';
```

- [ ] **Step 5: Run — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/renderMemoryBlocks.test.ts`
Expected: 5 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/renderMemoryBlocks.ts packages/shared/src/memory/__tests__/renderMemoryBlocks.test.ts packages/shared/src/memory/index.ts
git commit -m "feat(memory): renderMemoryBlocks XML wrapper + escaping"
```

---

### Task 8: `ensureDefaultMemoryBlocks` — lazy initializer

**Files:**
- Create: `packages/shared/src/memory/__tests__/ensureDefaultMemoryBlocks.test.ts`
- Create: `packages/shared/src/memory/ensureDefaultMemoryBlocks.ts`
- Modify: `packages/shared/src/memory/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/memory/__tests__/ensureDefaultMemoryBlocks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureDefaultMemoryBlocks } from '../ensureDefaultMemoryBlocks.ts';
import { loadMemoryBlocks } from '../loadMemoryBlocks.ts';

describe('ensureDefaultMemoryBlocks', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-memory-init-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('creates memory/ with 3 default files when none exist', async () => {
    await ensureDefaultMemoryBlocks(workspaceRoot);
    const memDir = join(workspaceRoot, 'memory');
    expect(existsSync(memDir)).toBe(true);
    expect(existsSync(join(memDir, 'persona.md'))).toBe(true);
    expect(existsSync(join(memDir, 'human.md'))).toBe(true);
    expect(existsSync(join(memDir, 'project.md'))).toBe(true);
  });

  it('creates defaults that load cleanly via loadMemoryBlocks', async () => {
    await ensureDefaultMemoryBlocks(workspaceRoot);
    const blocks = loadMemoryBlocks(workspaceRoot);
    expect(blocks.map((b) => b.label)).toEqual(['human', 'persona', 'project']);
    for (const b of blocks) {
      expect(b.description.length).toBeGreaterThan(0);
    }
  });

  it('is a no-op when memory/ already exists (does not overwrite user edits)', async () => {
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);
    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: custom\n---\nUser-customized persona.\n',
    );

    await ensureDefaultMemoryBlocks(workspaceRoot);

    const content = readFileSync(join(memDir, 'persona.md'), 'utf-8');
    expect(content).toContain('User-customized persona.');
    expect(existsSync(join(memDir, 'human.md'))).toBe(false); // still not created
  });

  it('does not throw if dir creation fails (logs, returns)', async () => {
    // Give a guaranteed-unwritable path (root-owned) — but to keep the test
    // portable, just pass a path inside a file (which makes mkdir fail):
    const blocker = join(workspaceRoot, 'blocker');
    writeFileSync(blocker, 'not a dir');
    // Now passing `blocker` as the workspace makes `{blocker}/memory/` unreachable
    await expect(ensureDefaultMemoryBlocks(blocker)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect failure (module missing)**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/ensureDefaultMemoryBlocks.test.ts`
Expected: module not found.

- [ ] **Step 3: Create implementation**

Create `packages/shared/src/memory/ensureDefaultMemoryBlocks.ts`:

```typescript
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
 */
export async function ensureDefaultMemoryBlocks(workspaceRootPath: string): Promise<void> {
  const dir = getMemoryDir(workspaceRootPath);
  if (existsSync(dir)) return;

  try {
    await mkdir(dir, { recursive: true });
    for (const { label, content } of DEFAULTS) {
      await writeFile(getMemoryBlockPath(workspaceRootPath, label), content, 'utf-8');
    }
  } catch (err) {
    console.warn(
      `[memory] Failed to initialize default blocks at ${dir}: ${(err as Error).message}`,
    );
  }
}
```

- [ ] **Step 4: Export from barrel**

Edit `packages/shared/src/memory/index.ts`, add:

```typescript
export { ensureDefaultMemoryBlocks } from './ensureDefaultMemoryBlocks.ts';
```

- [ ] **Step 5: Run — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/ensureDefaultMemoryBlocks.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/ensureDefaultMemoryBlocks.ts packages/shared/src/memory/__tests__/ensureDefaultMemoryBlocks.test.ts packages/shared/src/memory/index.ts
git commit -m "feat(memory): ensureDefaultMemoryBlocks lazy init with 3 scaffolded defaults"
```

---

### Task 9: Wire memory injection into `PromptBuilder.buildContextParts`

**Files:**
- Modify: `packages/shared/src/agent/core/prompt-builder.ts`

- [ ] **Step 1: Add import at top of `prompt-builder.ts`**

After the existing `import { getSessionPlansPath, ... } from '../../sessions/storage.ts';` line (around line 19), add:

```typescript
import { loadMemoryBlocks } from '../../memory/loadMemoryBlocks.ts';
import { renderMemoryBlocks } from '../../memory/renderMemoryBlocks.ts';
```

- [ ] **Step 2: Modify `buildContextParts` to prepend rendered memory blocks**

Locate `buildContextParts` (line ~66). Replace:

```typescript
    const parts: string[] = [];

    // Add date/time context first (enables prompt caching)
    parts.push(getDateTimeContext());
```

with:

```typescript
    const parts: string[] = [];

    // Memory blocks — always-on, workspace-scoped, loaded from disk per turn.
    // Rendered as a single <memory_blocks> XML wrapper. Empty set → skipped.
    // MUST be first so the agent sees memory before any per-turn state.
    if (this.workspaceRootPath) {
      const rendered = renderMemoryBlocks(loadMemoryBlocks(this.workspaceRootPath));
      if (rendered) parts.push(rendered);
    }

    // Add date/time context (enables prompt caching)
    parts.push(getDateTimeContext());
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run all existing `packages/shared` tests (make sure we didn't break anything)**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test`
Expected: same pass/fail counts as before this task (memory tests additive; nothing else regressed).

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/agent/core/prompt-builder.ts
git commit -m "feat(memory): inject memory blocks as first context-part in PromptBuilder"
```

---

### Task 10: Integration test — `PromptBuilder.buildContextParts` emits memory blocks

**Files:**
- Create: `packages/shared/src/memory/__tests__/buildContextParts.memory.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/shared/src/memory/__tests__/buildContextParts.memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PromptBuilder } from '../../agent/core/prompt-builder.ts';

function makeBuilder(workspaceRoot: string) {
  return new PromptBuilder({
    workspace: {
      rootPath: workspaceRoot,
      id: 'test-ws',
      name: 'Test',
    } as any,
    session: { id: 'test-session' } as any,
  });
}

describe('PromptBuilder.buildContextParts — memory integration', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'rowl-pb-mem-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('prepends <memory_blocks> as the first context-part when blocks exist', () => {
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);
    writeFileSync(
      join(memDir, 'persona.md'),
      '---\nlabel: persona\ndescription: who Rowl is\n---\nI am Rowl.\n',
    );

    const builder = makeBuilder(workspaceRoot);
    const parts = builder.buildContextParts({});
    expect(parts[0]).toContain('<memory_blocks>');
    expect(parts[0]).toContain('<memory_block label="persona"');
    expect(parts[0]).toContain('I am Rowl.');
  });

  it('omits <memory_blocks> entirely when memory/ is missing', () => {
    const builder = makeBuilder(workspaceRoot);
    const parts = builder.buildContextParts({});
    for (const p of parts) {
      expect(p).not.toContain('<memory_blocks>');
    }
  });

  it('omits <memory_blocks> when memory/ exists but has no valid blocks', () => {
    mkdirSync(join(workspaceRoot, 'memory'));
    const builder = makeBuilder(workspaceRoot);
    const parts = builder.buildContextParts({});
    for (const p of parts) {
      expect(p).not.toContain('<memory_blocks>');
    }
  });

  it('reflects file edits on next call (no caching)', () => {
    const memDir = join(workspaceRoot, 'memory');
    mkdirSync(memDir);
    const file = join(memDir, 'persona.md');

    writeFileSync(file, '---\nlabel: persona\ndescription: d\n---\nversion 1\n');
    const builder = makeBuilder(workspaceRoot);
    expect(builder.buildContextParts({})[0]).toContain('version 1');

    writeFileSync(file, '---\nlabel: persona\ndescription: d\n---\nversion 2\n');
    expect(builder.buildContextParts({})[0]).toContain('version 2');
  });
});
```

- [ ] **Step 2: Run — expect green**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test src/memory/__tests__/buildContextParts.memory.test.ts`
Expected: 4 pass, 0 fail.

If `PromptBuilder` requires additional required fields not supplied in `makeBuilder`, fix the cast/stub inline and re-run. Do not add features — only make the stub sufficient.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/shared/src/memory/__tests__/buildContextParts.memory.test.ts
git commit -m "test(memory): integration — PromptBuilder emits/suppresses <memory_blocks>"
```

---

### Task 11: Wire `ensureDefaultMemoryBlocks` into `SessionManager.createSession`

**Files:**
- Modify: `packages/server-core/src/sessions/SessionManager.ts`

- [ ] **Step 1: Add import at the top of `SessionManager.ts`**

Scan the imports at the top. After the existing `import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'` (or any `@craft-agent/shared/*` import block), add:

```typescript
import { ensureDefaultMemoryBlocks } from '@craft-agent/shared/memory'
```

- [ ] **Step 2: Call the initializer in `createSession`**

Locate `async createSession(workspaceId: string, options?: …)` (around line 2141). Just after the block:

```typescript
    const workspaceRootPath = workspace.rootPath
    const wsConfig = loadWorkspaceConfig(workspaceRootPath)
```

(around line 2149–2150), insert:

```typescript
    // Materialize default memory/ scaffolding on first session in a workspace.
    // No-op if memory/ already exists. Failures are logged, not thrown —
    // memory is an enhancement, not a prerequisite for sessions.
    await ensureDefaultMemoryBlocks(workspaceRootPath)
```

- [ ] **Step 3: Typecheck `server-core`**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/server-core && bun run tsc --noEmit 2>&1 | head -40`
Expected: No new errors originating from `SessionManager.ts` or the new import.

- [ ] **Step 4: Typecheck shared (regression guard)**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun run tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run fast shared tests again (regression guard)**

Run: `cd /Users/mauriello/Dev/rowl-v2/packages/shared && bun test 2>&1 | tail -20`
Expected: all memory tests green (14 total across 4 files: 9 loader + 4 init + 5 render + 4 integration), no regressions elsewhere in `packages/shared`.

- [ ] **Step 6: Commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add packages/server-core/src/sessions/SessionManager.ts
git commit -m "feat(memory): ensureDefaultMemoryBlocks on session create"
```

---

### Task 12: Electron build + manual smoke test

**Files:** none modified. Verification-only.

- [ ] **Step 1: Build the Electron app**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun run electron:build 2>&1 | tail -20`
Expected: exits 0, last lines show successful build.

- [ ] **Step 2: Confirm Craft Agents.app is NOT running (lock collision avoidance)**

Run: `ls -la ~/.craft-agent/.server.lock 2>/dev/null && echo "LOCK EXISTS" || echo "no lock"`

If "LOCK EXISTS": quit Craft Agents.app before proceeding. Re-check.

- [ ] **Step 3: Start Rowl dev Electron**

Run (in a separate terminal or background):
```bash
cd /Users/mauriello/Dev/rowl-v2 && ./node_modules/.bin/electron apps/electron
```

Expected: Rowl window opens.

- [ ] **Step 4: Create a fresh workspace in the UI**

In the Rowl UI: create a new workspace pointing at a fresh directory (e.g. `/tmp/rowl-memory-smoke-$(date +%s)`). Start a session.

- [ ] **Step 5: Verify defaults were materialized on disk**

Run: `ls -la /tmp/rowl-memory-smoke-*/memory/`
Expected: `persona.md`, `human.md`, `project.md` present with the scaffolded content.

- [ ] **Step 6: Smoke-test "memory is in every turn"**

In the session, send: `What do you know about me and what is this workspace?`

Expected: response references the scaffolded `human`/`project` descriptions ("Empty — edit this file to tell Rowl…" etc.), demonstrating the agent sees the block content.

- [ ] **Step 7: Smoke-test live edits**

Edit `/tmp/rowl-memory-smoke-*/memory/human.md` in an external editor — replace the body with: `My name is Mario. I prefer concise replies.`

Back in Rowl, send: `What's my name and how should you reply?`

Expected: the reply uses the name "Mario" and is concise. No restart required.

- [ ] **Step 8: Smoke-test malformed block doesn't break turn**

Add `/tmp/rowl-memory-smoke-*/memory/broken.md` with contents:
```
---
label: broken
description: [unclosed
---
body
```

Send any new message in the same session. Expected: response arrives normally; Electron main-process log (reachable via devtools or terminal) shows `[memory] Skipped …: invalid frontmatter (…)`.

- [ ] **Step 9: Update STATE.md**

Edit `docs/STATE.md`:
- Header line `Last updated` → today's date.
- `Current focus` → "Sub-project #1 Phase 1 — SHIPPED. Ready to scope Phase 2 (agent-editable memory tools)."
- `Where we are right now` block → "Phase 1: shipped `{date}`."
- Multi-initiative map → mark row for #1 as `Phase 1 shipped`.
- Append a new entry to `Locked decisions` with today's date noting Phase 1 ship.

- [ ] **Step 10: Final commit**

```bash
cd /Users/mauriello/Dev/rowl-v2
git add docs/STATE.md
git commit -m "docs(state): sub-project #1 Phase 1 shipped"
```

- [ ] **Step 11: Update persistent memory**

Also update `~/.claude/projects/-Users-mauriello-Dev/memory/project_rowl_v2.md`:
- Change `#1 Memory-first (Letta pattern port) — Phase 1 SPEC WRITTEN + COMMITTED …` → `#1 Memory-first (Letta pattern port) — Phase 1 SHIPPED {date}`.

(Not committed to the repo — this lives outside the repo in Claude Code's user-memory.)

---

## Acceptance checklist (run after all tasks)

- [ ] `bun test` in `packages/shared` shows memory tests green (9 + 4 + 5 + 4 = 22 new tests).
- [ ] `bun run tsc --noEmit` in `packages/shared` is green.
- [ ] `bun run electron:build` is green.
- [ ] Manual smoke in a fresh workspace creates `memory/{persona,human,project}.md`.
- [ ] Editing a block is reflected in the next turn with no restart.
- [ ] Adding `memory/foo.md` with valid frontmatter appears in the next turn.
- [ ] Deleting `memory/human.md` doesn't crash; block simply absent.
- [ ] Adding a malformed file logs a warning and does not break the turn.
- [ ] `docs/STATE.md` updated; persistent memory updated.

## Risks & mitigations (reminder during execution)

| Risk | Mitigation baked into the plan |
|---|---|
| `buildContextParts` caller chain isn't async — our sync loader sidesteps it | Task 3 uses `readFileSync`/`readdirSync`; rationale called out at top. |
| Two-level workspace setup (`SessionManager` + `storage.ts:createSession`) — picking wrong hook | Plan uses the outer `SessionManager.createSession` (line 2141) which runs once per session and has easy access to `workspaceRootPath`. |
| Breaking unrelated tests | Task 9/10 re-runs the full shared test suite after wiring. |
| `gray-matter` import shape (default vs named) differs between Node/Bun | `import matter from 'gray-matter'` (default export) is what `session-tools-core` already uses; same pattern in Task 4. |
| Electron lock collision with installed Craft Agents.app | Task 12 Step 2 checks the lock explicitly before launch. |

---

## Self-review notes (done before handoff)

- **Spec coverage:** Every spec section has tasks — loader (T2–T6), renderer (T7), initializer (T8), injection wiring (T9), integration testing (T10), session-init wiring (T11), manual smoke (T12). Error-handling table (spec §"Error handling") covered by T5 + T8-test-4 + manual smoke T12-step-8. Default-block scaffolding strings in T8 match the spec verbatim.
- **Placeholders:** None — every code block is complete.
- **Type consistency:** `MemoryBlock` and `MemoryBlockFrontmatter` defined in T1 are the same shape used in T3/T4/T7/T8. Function names stable: `loadMemoryBlocks`, `renderMemoryBlocks`, `ensureDefaultMemoryBlocks`, `getMemoryDir`, `getMemoryBlockPath`.
- **Ambiguity:** One deviation from spec (sync loader) is called out explicitly with rationale at the top.
