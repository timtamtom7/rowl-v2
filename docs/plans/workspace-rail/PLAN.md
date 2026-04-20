# Workspace Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Rowl's topbar workspace dropdown with a 72px always-visible left rail (paperclip-style), plus a compact `Workspace › Session` breadcrumb that takes the dropdown's former spot in the topbar.

**Architecture:** Four new renderer-side modules — a pure pattern generator (`generateWorkspacePattern`), a deterministic color hash hook (`useWorkspaceAutoColor`), a persistence-backed order hook (`useWorkspaceRailOrder`), and three new components (`WorkspaceAvatar`, `WorkspaceBreadcrumb`, `WorkspaceRail`). Order persists via the existing `preferences.json` file with one new field `workspaceRailOrder: string[]`. `WorkspaceSwitcher.tsx` is deleted once both its usage sites (TopBar.tsx and LeftSidebar.tsx) are migrated.

**Tech Stack:** React 18 + TypeScript, Jotai atoms, Tailwind, `@dnd-kit/core` + `@dnd-kit/sortable` (already in the repo per CompanyRail reference usage and `@dnd-kit/dom` dependency), Radix UI Tooltip/DropdownMenu, `bun:test` for tests.

**Spec:** [SPEC.md](./SPEC.md)

**Branch:** `workspace-rail` (already created from `main` — this plan's commits land on that branch)

---

## Pre-flight

- [ ] **Confirm baseline passes its own tests**

Run: `bun test apps/electron/src/renderer`
Expected: no new failures introduced by any subsequent task. (Three repo-wide baseline failures pre-exist per STATE.md; leave those alone.)

- [ ] **Confirm dnd-kit packages are present**

Run: `cat package.json apps/electron/package.json | grep -E "@dnd-kit"`
Expected: entries for `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` visible. If any are missing, add with `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities --filter apps/electron` inside the electron app workspace and commit that before starting Task 1.

---

## Task 1: Pattern generator (pure function)

**Files:**
- Create: `apps/electron/src/renderer/lib/workspace-pattern/generateWorkspacePattern.ts`
- Create: `apps/electron/src/renderer/lib/workspace-pattern/__tests__/generateWorkspacePattern.test.ts`

This is a port of paperclip's `makeCompanyPatternDataUrl` helper (from `/Users/mauriello/Dev/_reference/paperclip/ui/src/components/CompanyPatternIcon.tsx`), lifted to a standalone module. Pure function; no React; memoized by input tuple.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/lib/workspace-pattern/__tests__/generateWorkspacePattern.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'bun:test';

// Canvas isn't available under bun:test — we polyfill a minimal stub so the
// generator can exercise its color math path; toDataURL returns a stable
// string derived from fill calls so determinism can be asserted.
beforeAll(() => {
  class FakeCtx {
    private calls: string[] = [];
    fillStyle = '';
    fillRect(x: number, y: number, w: number, h: number) {
      this.calls.push(`rect:${this.fillStyle}:${x},${y},${w},${h}`);
    }
    beginPath() { this.calls.push(`bp`); }
    arc(cx: number, cy: number, r: number) {
      this.calls.push(`arc:${this.fillStyle}:${cx.toFixed(2)},${cy.toFixed(2)},${r.toFixed(2)}`);
    }
    fill() { this.calls.push(`fill`); }
    snapshot() { return this.calls.join('|'); }
  }
  class FakeCanvas {
    width = 0; height = 0;
    private ctx = new FakeCtx();
    getContext() { return this.ctx; }
    toDataURL() {
      // stable hash of call log — deterministic if inputs deterministic
      return `data:image/png;fake;${(this.ctx as any).snapshot()}`;
    }
  }
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return new FakeCanvas();
      throw new Error(`unexpected tag ${tag}`);
    },
  };
});

import { generateWorkspacePattern } from '../generateWorkspacePattern';

describe('generateWorkspacePattern', () => {
  it('returns identical data URL for identical inputs (determinism)', () => {
    const a = generateWorkspacePattern('workspace-abc', '#7c3aed');
    const b = generateWorkspacePattern('workspace-abc', '#7c3aed');
    expect(a).toBe(b);
  });

  it('returns different outputs for different ids (no collision across 50 ids)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(generateWorkspacePattern(`ws-${i}`, '#7c3aed'));
    }
    expect(seen.size).toBe(50);
  });

  it('returns different outputs for same id with different color', () => {
    const a = generateWorkspacePattern('workspace-abc', '#7c3aed');
    const b = generateWorkspacePattern('workspace-abc', '#22c55e');
    expect(a).not.toBe(b);
  });

  it('returns non-empty string for valid inputs', () => {
    const out = generateWorkspacePattern('ws-xyz', '#0ea5e9');
    expect(out.startsWith('data:image/png;')).toBe(true);
    expect(out.length).toBeGreaterThan(32);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/lib/workspace-pattern/__tests__/generateWorkspacePattern.test.ts`
Expected: FAIL with "Cannot find module '../generateWorkspacePattern'" (or equivalent).

- [ ] **Step 3: Implement the generator**

Create `apps/electron/src/renderer/lib/workspace-pattern/generateWorkspacePattern.ts`:

```ts
/**
 * Workspace pattern generator.
 *
 * Deterministic Bayer-matrix ordered-dither pattern keyed on workspaceId + color.
 * Ported from paperclip's CompanyPatternIcon.tsx. Pure — no React, no app state.
 *
 * Output: data:image/png URL suitable for <img src=...>.
 * Memoized at module scope by `${workspaceId}:${color}:${size}` tuple.
 */

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

const memo = new Map<string, string>();

export function generateWorkspacePattern(
  workspaceId: string,
  color: string,
  size: number = 44,
): string {
  const key = `${workspaceId}:${color}:${size}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const result = makePatternDataUrl(workspaceId.toLowerCase(), color, size);
  memo.set(key, result);
  return result;
}

function makePatternDataUrl(seed: string, brandColor: string, pxSize: number): string {
  if (typeof document === 'undefined') return '';

  const logicalSize = 22;
  const cellSize = Math.max(1, Math.round(pxSize / logicalSize));

  const canvas = document.createElement('canvas');
  canvas.width = logicalSize * cellSize;
  canvas.height = logicalSize * cellSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const rand = mulberry32(hashString(seed));
  const hue = hexToHue(brandColor);
  const [offR, offG, offB] = hslToRgb(
    hue,
    54 + Math.floor(rand() * 14),
    36 + Math.floor(rand() * 12),
  );
  const [onR, onG, onB] = hslToRgb(
    hue + (rand() > 0.5 ? 10 : -10),
    86 + Math.floor(rand() * 10),
    82 + Math.floor(rand() * 10),
  );

  const center = (logicalSize - 1) / 2;
  const half = Math.max(center, 1);
  const gradientAngle = rand() * Math.PI * 2;
  const gradientDirX = Math.cos(gradientAngle);
  const gradientDirY = Math.sin(gradientAngle);
  const maxProjection = Math.abs(gradientDirX * half) + Math.abs(gradientDirY * half);
  const diagonalFrequency = 0.34 + rand() * 0.12;
  const antiDiagonalFrequency = 0.33 + rand() * 0.12;
  const diagonalPhase = rand() * Math.PI * 2;
  const antiDiagonalPhase = rand() * Math.PI * 2;

  ctx.fillStyle = `rgb(${offR} ${offG} ${offB})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = `rgb(${onR} ${onG} ${onB})`;
  const dotRadius = cellSize * 0.46;

  for (let y = 0; y < logicalSize; y++) {
    const dy = y - center;
    for (let x = 0; x < logicalSize; x++) {
      const dx = x - center;
      const projection = dx * gradientDirX + dy * gradientDirY;
      const gradient = (projection / maxProjection + 1) * 0.5;
      const diagonal = Math.sin((dx + dy) * diagonalFrequency + diagonalPhase) * 0.5 + 0.5;
      const antiDiagonal = Math.sin((dx - dy) * antiDiagonalFrequency + antiDiagonalPhase) * 0.5 + 0.5;
      const hatch = diagonal * 0.5 + antiDiagonal * 0.5;
      const signal = Math.max(0, Math.min(1, gradient + (hatch - 0.5) * 0.22));
      const level = Math.max(0, Math.min(15, Math.floor(signal * 16)));
      const thresholdIndex = BAYER_4X4[y & 3]![x & 3]!;
      if (level <= thresholdIndex) continue;
      const cx = x * cellSize + cellSize / 2;
      const cy = y * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toDataURL('image/png');
}

/** Test helper — clears the module memo so deterministic tests aren't polluted. */
export function __resetPatternMemoForTests(): void {
  memo.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/lib/workspace-pattern/__tests__/generateWorkspacePattern.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/lib/workspace-pattern/
git commit -m "feat(workspace-rail): add deterministic pattern generator"
```

---

## Task 2: `useWorkspaceAutoColor` hook

**Files:**
- Create: `apps/electron/src/renderer/hooks/useWorkspaceAutoColor.ts`
- Create: `apps/electron/src/renderer/hooks/__tests__/useWorkspaceAutoColor.test.ts`

Pure hook that takes a workspace id and returns a hex string from a fixed 12-hue palette. Deterministic (same id → same color). Exports the underlying pure helper `workspaceColorFromId` to keep tests free of React rendering.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/hooks/__tests__/useWorkspaceAutoColor.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { workspaceColorFromId, WORKSPACE_COLOR_PALETTE } from '../useWorkspaceAutoColor';

describe('workspaceColorFromId', () => {
  it('is deterministic: same id returns same color', () => {
    const a = workspaceColorFromId('workspace-abc');
    const b = workspaceColorFromId('workspace-abc');
    expect(a).toBe(b);
  });

  it('returns a value that is in the palette', () => {
    const color = workspaceColorFromId('whatever');
    expect(WORKSPACE_COLOR_PALETTE).toContain(color);
  });

  it('distributes reasonably across 50 sample ids (no single hue > 50%)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 50; i++) {
      const c = workspaceColorFromId(`ws-${i}`);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const max = Math.max(...counts.values());
    expect(max).toBeLessThanOrEqual(25); // < 50% of 50
  });

  it('empty string returns first palette entry (deterministic fallback)', () => {
    expect(workspaceColorFromId('')).toBe(WORKSPACE_COLOR_PALETTE[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/useWorkspaceAutoColor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/electron/src/renderer/hooks/useWorkspaceAutoColor.ts`:

```ts
import { useMemo } from 'react';

/**
 * 12-hue palette — hand-picked for contrast against both light and dark app backgrounds.
 * Tailwind `-500` hex values.
 */
export const WORKSPACE_COLOR_PALETTE = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#f59e0b', // amber-500
  '#eab308', // yellow-500
  '#84cc16', // lime-500
  '#22c55e', // green-500
  '#14b8a6', // teal-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#6366f1', // indigo-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
] as const;

function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Pure deterministic: hashes id to one of WORKSPACE_COLOR_PALETTE entries.
 * Empty string always returns the first palette entry.
 */
export function workspaceColorFromId(id: string): string {
  if (id.length === 0) return WORKSPACE_COLOR_PALETTE[0]!;
  const idx = fnv1a(id) % WORKSPACE_COLOR_PALETTE.length;
  return WORKSPACE_COLOR_PALETTE[idx]!;
}

/** React hook wrapper — memoized per id. */
export function useWorkspaceAutoColor(workspaceId: string): string {
  return useMemo(() => workspaceColorFromId(workspaceId), [workspaceId]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/useWorkspaceAutoColor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/hooks/useWorkspaceAutoColor.ts apps/electron/src/renderer/hooks/__tests__/useWorkspaceAutoColor.test.ts
git commit -m "feat(workspace-rail): add deterministic color hash hook"
```

---

## Task 3: Preferences schema — add `workspaceRailOrder`

**Files:**
- Modify: `packages/shared/src/config/preferences.ts` (interface + round-trip test)
- Create: `packages/shared/src/config/__tests__/workspace-rail-order.test.ts`

Add a single optional field to `UserPreferences` so the main process's existing read/write path automatically supports it — no new IPC.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/config/__tests__/workspace-rail-order.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import type { UserPreferences } from '../preferences';

describe('UserPreferences.workspaceRailOrder', () => {
  it('accepts a string array in the type', () => {
    const prefs: UserPreferences = {
      workspaceRailOrder: ['ws-1', 'ws-2', 'ws-3'],
    };
    expect(prefs.workspaceRailOrder).toEqual(['ws-1', 'ws-2', 'ws-3']);
  });

  it('is optional (omission is valid)', () => {
    const prefs: UserPreferences = {};
    expect(prefs.workspaceRailOrder).toBeUndefined();
  });

  it('round-trips through JSON.stringify/parse', () => {
    const prefs: UserPreferences = { workspaceRailOrder: ['a', 'b'] };
    const json = JSON.stringify(prefs);
    const parsed = JSON.parse(json) as UserPreferences;
    expect(parsed.workspaceRailOrder).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test src/config/__tests__/workspace-rail-order.test.ts`
Expected: FAIL — type error on `workspaceRailOrder` property (unknown key).

- [ ] **Step 3: Add the field to UserPreferences**

Edit `packages/shared/src/config/preferences.ts`. Locate the `UserPreferences` interface (starts around line 26) and add `workspaceRailOrder` after `includeCoAuthoredBy`:

```ts
export interface UserPreferences {
  name?: string;
  timezone?: string;
  location?: UserLocation;
  language?: string;
  notes?: string;
  diffViewer?: DiffViewerPreferences;
  includeCoAuthoredBy?: boolean;
  /** Ordered list of workspace IDs for the left rail (set by drag-reorder in the UI). */
  workspaceRailOrder?: string[];
  updatedAt?: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test src/config/__tests__/workspace-rail-order.test.ts`
Expected: PASS (3 tests).

Also run: `cd packages/shared && bun run tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config/preferences.ts packages/shared/src/config/__tests__/workspace-rail-order.test.ts
git commit -m "feat(workspace-rail): add workspaceRailOrder to UserPreferences"
```

---

## Task 4: `useWorkspaceRailOrder` hook — reconciler

**Files:**
- Create: `apps/electron/src/renderer/hooks/useWorkspaceRailOrder.ts`
- Create: `apps/electron/src/renderer/hooks/__tests__/reconcileRailOrder.test.ts`

The hook owns a Jotai atom plus a pure reconciler. Split the reconciler into an exported pure function `reconcileRailOrder` so bun:test can test it without a React renderer or electronAPI stub. The hook itself (IPC wiring) gets smoke-tested at integration time in Task 8.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/hooks/__tests__/reconcileRailOrder.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { reconcileRailOrder } from '../useWorkspaceRailOrder';

describe('reconcileRailOrder', () => {
  it('returns workspaces in declared order when order is empty', () => {
    const result = reconcileRailOrder([], ['x', 'y', 'z']);
    expect(result).toEqual(['x', 'y', 'z']);
  });

  it('drops ids that no longer exist in workspaces', () => {
    const result = reconcileRailOrder(['a', 'b', 'c'], ['a', 'c']);
    expect(result).toEqual(['a', 'c']);
  });

  it('appends workspaces not in the order (new workspace case)', () => {
    const result = reconcileRailOrder(['a', 'b'], ['a', 'b', 'c', 'd']);
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  it('combines drop + append: [a,b,c] + [a,c,d] = [a,c,d]', () => {
    const result = reconcileRailOrder(['a', 'b', 'c'], ['a', 'c', 'd']);
    expect(result).toEqual(['a', 'c', 'd']);
  });

  it('handles full wipe (no workspaces)', () => {
    const result = reconcileRailOrder(['a', 'b', 'c'], []);
    expect(result).toEqual([]);
  });

  it('preserves user-defined order when all ids match', () => {
    const result = reconcileRailOrder(['c', 'a', 'b'], ['a', 'b', 'c']);
    expect(result).toEqual(['c', 'a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/reconcileRailOrder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/electron/src/renderer/hooks/useWorkspaceRailOrder.ts`:

```ts
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo, useRef } from 'react';

/**
 * Pure reconciler — exported for unit tests.
 *
 * Given a persisted order and a live list of workspace ids, returns a new
 * ordered id list:
 *   - drops ids that are no longer present in `workspaceIds`
 *   - appends ids present in `workspaceIds` but missing from the order
 *
 * Pure — no React, no I/O.
 */
export function reconcileRailOrder(order: string[], workspaceIds: string[]): string[] {
  const liveSet = new Set(workspaceIds);
  const kept = order.filter((id) => liveSet.has(id));
  const keptSet = new Set(kept);
  const appended = workspaceIds.filter((id) => !keptSet.has(id));
  return [...kept, ...appended];
}

/**
 * Jotai atom — persisted order. Seeded on boot from preferences.json
 * via the hook effect below. Writes are fire-and-forget IPC.
 */
export const workspaceRailOrderAtom = atom<string[]>([]);

/**
 * React hook: returns the reconciled-against-live order and a setter that
 * persists changes. Seeds the atom from `electronAPI.readPreferences()` on
 * first mount. Writes through on every setter call.
 */
export function useWorkspaceRailOrder(workspaceIds: string[]): {
  order: string[];
  setOrder: (next: string[]) => void;
} {
  const [rawOrder, setRawOrder] = useAtom(workspaceRailOrderAtom);
  const seededRef = useRef(false);

  // Seed from preferences on first mount.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<unknown>;
    };
    if (!api?.readPreferences) return;
    void api.readPreferences().then((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const json = (raw as { json?: string }).json;
      if (typeof json !== 'string') return;
      try {
        const parsed = JSON.parse(json) as { workspaceRailOrder?: string[] };
        if (Array.isArray(parsed.workspaceRailOrder)) {
          setRawOrder(parsed.workspaceRailOrder);
        }
      } catch {
        // ignore malformed JSON
      }
    }).catch(() => undefined);
  }, [setRawOrder]);

  // Reconciled view — cheap, no I/O.
  const order = useMemo(
    () => reconcileRailOrder(rawOrder, workspaceIds),
    [rawOrder, workspaceIds],
  );

  const setOrder = (next: string[]): void => {
    setRawOrder(next);
    // Fire-and-forget write-through.
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<{ json?: string } | null>;
      writePreferences?: (json: string) => Promise<{ ok?: boolean; error?: string }>;
    };
    if (!api?.readPreferences || !api?.writePreferences) return;
    void (async () => {
      try {
        const current = await api.readPreferences!();
        const currentJson = current?.json ?? '{}';
        const parsed = (() => {
          try { return JSON.parse(currentJson) as Record<string, unknown>; }
          catch { return {}; }
        })();
        parsed.workspaceRailOrder = next;
        await api.writePreferences!(JSON.stringify(parsed, null, 2));
      } catch (err) {
        console.warn('[workspace-rail] failed to persist order', err);
      }
    })();
  };

  return { order, setOrder };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/reconcileRailOrder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/hooks/useWorkspaceRailOrder.ts apps/electron/src/renderer/hooks/__tests__/reconcileRailOrder.test.ts
git commit -m "feat(workspace-rail): add rail-order reconciler hook"
```

---

## Task 5: `WorkspaceAvatar` component

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/WorkspaceAvatar.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/workspaceAvatarStyles.test.ts`

To keep in line with the Rowl renderer test style (pure logic tests, no RTL), extract `workspaceAvatarClasses(isActive, isDragging)` as an exported helper and unit-test it. The visual component itself gets exercised at integration time (Task 8 manual smoke).

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/components/app-shell/__tests__/workspaceAvatarStyles.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { workspaceAvatarClasses, railPillClasses } from '../WorkspaceAvatar';

describe('workspaceAvatarClasses', () => {
  it('uses rounded-[14px] when active', () => {
    expect(workspaceAvatarClasses({ isActive: true, isDragging: false }))
      .toContain('rounded-[14px]');
  });

  it('uses rounded-[22px] when idle', () => {
    const cls = workspaceAvatarClasses({ isActive: false, isDragging: false });
    expect(cls).toContain('rounded-[22px]');
    expect(cls).toContain('group-hover:rounded-[14px]');
  });

  it('adds shadow-lg when dragging', () => {
    expect(workspaceAvatarClasses({ isActive: false, isDragging: true }))
      .toContain('shadow-lg');
  });
});

describe('railPillClasses', () => {
  it('active pill is tall (h-5)', () => {
    expect(railPillClasses(true)).toContain('h-5');
  });

  it('idle pill is hidden (h-0) and grows on hover', () => {
    const cls = railPillClasses(false);
    expect(cls).toContain('h-0');
    expect(cls).toContain('group-hover:h-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/workspaceAvatarStyles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/electron/src/renderer/components/app-shell/WorkspaceAvatar.tsx`:

```tsx
import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { generateWorkspacePattern } from '@/lib/workspace-pattern/generateWorkspacePattern';
import { useWorkspaceAutoColor } from '@/hooks/useWorkspaceAutoColor';
import type { Workspace } from '../../../shared/types';

interface WorkspaceAvatarProps {
  workspace: Workspace;
  /** Resolved icon URL from useWorkspaceIcons (may be undefined if not set). */
  iconUrl?: string;
  isActive: boolean;
  isDragging?: boolean;
  unread?: boolean;
  processing?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/** Exported for unit tests — returns the avatar shell classNames. */
export function workspaceAvatarClasses({
  isActive,
  isDragging,
}: { isActive: boolean; isDragging: boolean }): string {
  return cn(
    'transition-[border-radius,box-shadow] duration-150 overflow-hidden w-11 h-11',
    isActive ? 'rounded-[14px]' : 'rounded-[22px] group-hover:rounded-[14px]',
    isDragging && 'shadow-lg',
  );
}

/** Exported for unit tests — returns the left-edge pill classNames. */
export function railPillClasses(isActive: boolean): string {
  return cn(
    'absolute left-[-14px] top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-foreground',
    'transition-[height] duration-150',
    isActive ? 'h-5' : 'h-0 group-hover:h-2',
  );
}

export function WorkspaceAvatar({
  workspace,
  iconUrl,
  isActive,
  isDragging = false,
  unread = false,
  processing = false,
  onClick,
  onContextMenu,
}: WorkspaceAvatarProps) {
  const autoColor = useWorkspaceAutoColor(workspace.id);
  const fallbackPattern = React.useMemo(
    () => (iconUrl ? null : generateWorkspacePattern(workspace.id, autoColor, 44)),
    [iconUrl, workspace.id, autoColor],
  );
  const displayUrl = iconUrl ?? fallbackPattern ?? '';
  const initial = workspace.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          onContextMenu={onContextMenu}
          aria-label={workspace.name}
          aria-current={isActive ? 'true' : undefined}
          className="relative flex items-center justify-center group overflow-visible bg-transparent border-0 p-0 cursor-pointer"
        >
          <span className={railPillClasses(isActive)} aria-hidden="true" />
          <span className={workspaceAvatarClasses({ isActive, isDragging })}>
            {displayUrl ? (
              <img
                src={displayUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
                style={iconUrl ? undefined : { imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-muted text-sm font-semibold text-foreground">
                {initial}
              </span>
            )}
            {processing && (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 z-10">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-80" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-background" />
                </span>
              </span>
            )}
            {unread && (
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
            )}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {workspace.name}
      </TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/workspaceAvatarStyles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/WorkspaceAvatar.tsx apps/electron/src/renderer/components/app-shell/__tests__/workspaceAvatarStyles.test.ts
git commit -m "feat(workspace-rail): add WorkspaceAvatar component"
```

---

## Task 6: `WorkspaceRail` component

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/WorkspaceRail.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/workspaceRailDnd.test.ts`

The rail orchestrates the sortable list + the + button. The `onDragEnd` handler computes the new order; extract it as `computeOrderAfterDrag(currentIds, activeId, overId)` and unit-test it to get coverage of the reorder math without rendering.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/components/app-shell/__tests__/workspaceRailDnd.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { computeOrderAfterDrag } from '../WorkspaceRail';

describe('computeOrderAfterDrag', () => {
  it('returns null when active and over are the same', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'b', 'b')).toBeNull();
  });

  it('returns null when over is undefined (dropped outside)', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'b', null)).toBeNull();
  });

  it('moves "a" between "b" and "c"', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('moves "c" to the front when dropped on "a"', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('returns null when active id is not in list (stale drag)', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'x', 'a')).toBeNull();
  });

  it('returns null when over id is not in list (dropped on unknown target)', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'a', 'x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/workspaceRailDnd.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rail**

Create `apps/electron/src/renderer/components/app-shell/WorkspaceRail.tsx`:

```tsx
import * as React from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceIcons } from '@/hooks/useWorkspaceIcon';
import { useWorkspaceRailOrder } from '@/hooks/useWorkspaceRailOrder';
import { cn } from '@/lib/utils';
import { WorkspaceAvatar } from './WorkspaceAvatar';
import type { Workspace } from '../../../shared/types';

export interface WorkspaceRailProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  workspaceUnreadMap?: Record<string, boolean>;
  workspaceProcessingMap?: Record<string, boolean>;
  onSelect: (workspaceId: string) => void;
  onCreate: () => void;
  onContextMenu?: (workspaceId: string, e: React.MouseEvent) => void;
}

/**
 * Exported for unit tests. Given the current ordered id list and a dnd-kit
 * dragEnd event's active/over ids, returns the new order or null if no move
 * should be persisted.
 */
export function computeOrderAfterDrag(
  currentIds: string[],
  activeId: string,
  overId: string | null,
): string[] | null {
  if (overId === null || activeId === overId) return null;
  const oldIndex = currentIds.indexOf(activeId);
  const newIndex = currentIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) return null;
  return arrayMove(currentIds, oldIndex, newIndex);
}

function SortableAvatar({
  workspace,
  iconUrl,
  isActive,
  unread,
  processing,
  onClick,
  onContextMenu,
}: {
  workspace: Workspace;
  iconUrl?: string;
  isActive: boolean;
  unread: boolean;
  processing: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: workspace.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WorkspaceAvatar
        workspace={workspace}
        iconUrl={iconUrl}
        isActive={isActive}
        isDragging={isDragging}
        unread={unread}
        processing={processing}
        onClick={(e?: unknown) => {
          // dnd-kit applies drag listeners; suppress click if a drag happened.
          if (isDragging) return;
          onClick();
          void e;
        }}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}

export function WorkspaceRail({
  workspaces,
  activeWorkspaceId,
  workspaceUnreadMap,
  workspaceProcessingMap,
  onSelect,
  onCreate,
  onContextMenu,
}: WorkspaceRailProps) {
  const workspaceIds = React.useMemo(() => workspaces.map((w) => w.id), [workspaces]);
  const { order, setOrder } = useWorkspaceRailOrder(workspaceIds);
  const byId = React.useMemo(() => {
    const m = new Map<string, Workspace>();
    for (const w of workspaces) m.set(w.id, w);
    return m;
  }, [workspaces]);
  const ordered = React.useMemo(
    () => order.map((id) => byId.get(id)).filter((w): w is Workspace => Boolean(w)),
    [order, byId],
  );

  const iconMap = useWorkspaceIcons(ordered);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      const next = computeOrderAfterDrag(order, activeId, overId);
      if (next) setOrder(next);
    },
    [order, setOrder],
  );

  return (
    <div
      data-testid="workspace-rail"
      className={cn(
        'flex flex-col items-center w-[72px] shrink-0 h-full',
        'bg-background border-r border-border/40',
      )}
    >
      {/* Logo zone — non-interactive in v1 */}
      <div className="flex items-center justify-center h-12 w-full shrink-0" />

      {/* Sortable avatar list */}
      <div className="flex-1 flex flex-col items-center gap-2 py-2 w-full overflow-y-auto overflow-x-hidden scrollbar-none">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {ordered.map((w) => (
              <SortableAvatar
                key={w.id}
                workspace={w}
                iconUrl={iconMap.get(w.id)}
                isActive={w.id === activeWorkspaceId}
                unread={Boolean(workspaceUnreadMap?.[w.id])}
                processing={Boolean(workspaceProcessingMap?.[w.id])}
                onClick={() => onSelect(w.id)}
                onContextMenu={(e) => onContextMenu?.(w.id, e)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Separator + add button */}
      <div className="w-8 h-px bg-border/60 mx-auto shrink-0" aria-hidden="true" />
      <div className="flex items-center justify-center py-2 shrink-0">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCreate}
              aria-label="Add workspace"
              className={cn(
                'flex items-center justify-center w-11 h-11',
                'rounded-[22px] hover:rounded-[14px]',
                'border-2 border-dashed border-border text-muted-foreground',
                'hover:border-foreground/40 hover:text-foreground',
                'transition-[border-color,color,border-radius] duration-150',
              )}
            >
              <Plus className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Add workspace
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/workspaceRailDnd.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/WorkspaceRail.tsx apps/electron/src/renderer/components/app-shell/__tests__/workspaceRailDnd.test.ts
git commit -m "feat(workspace-rail): add WorkspaceRail component"
```

---

## Task 7: `WorkspaceBreadcrumb` component

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/workspaceBreadcrumbFormat.test.ts`

Compact replacement for the topbar's `WorkspaceSwitcher`. Renders `{workspaceName} › {sessionName}`. Workspace part is a dropdown (same workspace list). Session part is a button. Pure formatter `formatBreadcrumbText({ workspaceName, sessionName })` is exported and unit-tested.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/components/app-shell/__tests__/workspaceBreadcrumbFormat.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { formatBreadcrumbText } from '../WorkspaceBreadcrumb';

describe('formatBreadcrumbText', () => {
  it('formats workspace + session with separator', () => {
    expect(formatBreadcrumbText({ workspaceName: 'Acme', sessionName: 'bugfix' }))
      .toBe('Acme › bugfix');
  });

  it('falls back to workspace only when session is null', () => {
    expect(formatBreadcrumbText({ workspaceName: 'Acme', sessionName: null }))
      .toBe('Acme');
  });

  it('renders "No workspace" when workspace is null', () => {
    expect(formatBreadcrumbText({ workspaceName: null, sessionName: 'x' }))
      .toBe('No workspace');
  });

  it('renders "No workspace" when both null', () => {
    expect(formatBreadcrumbText({ workspaceName: null, sessionName: null }))
      .toBe('No workspace');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/workspaceBreadcrumbFormat.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the breadcrumb**

Create `apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx`:

```tsx
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown';
import { cn } from '@/lib/utils';
import type { Workspace } from '../../../shared/types';

export interface WorkspaceBreadcrumbProps {
  workspace: Workspace | null;
  sessionName: string | null;
  workspaces: Workspace[];
  onSelectWorkspace: (workspaceId: string) => void | Promise<void>;
  onRenameSession?: () => void;
}

/** Pure formatter — exported for unit tests. */
export function formatBreadcrumbText({
  workspaceName,
  sessionName,
}: {
  workspaceName: string | null;
  sessionName: string | null;
}): string {
  if (!workspaceName) return 'No workspace';
  if (!sessionName) return workspaceName;
  return `${workspaceName} › ${sessionName}`;
}

export function WorkspaceBreadcrumb({
  workspace,
  sessionName,
  workspaces,
  onSelectWorkspace,
  onRenameSession,
}: WorkspaceBreadcrumbProps) {
  const workspaceName = workspace?.name ?? null;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex items-center gap-1 max-w-[240px] px-2 py-1 rounded-md',
            'text-sm font-medium truncate hover:bg-accent',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          aria-label="Switch workspace"
        >
          <span className="truncate">{workspaceName ?? 'No workspace'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent align="start" minWidth="min-w-56">
          {workspaces.map((w) => (
            <StyledDropdownMenuItem
              key={w.id}
              onClick={() => {
                void onSelectWorkspace(w.id);
              }}
            >
              {w.name}
            </StyledDropdownMenuItem>
          ))}
        </StyledDropdownMenuContent>
      </DropdownMenu>

      {sessionName && (
        <>
          <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">›</span>
          <button
            type="button"
            onClick={onRenameSession}
            className={cn(
              'max-w-[320px] px-2 py-1 rounded-md text-sm truncate hover:bg-accent',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Rename session"
          >
            {sessionName}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/workspaceBreadcrumbFormat.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx apps/electron/src/renderer/components/app-shell/__tests__/workspaceBreadcrumbFormat.test.ts
git commit -m "feat(workspace-rail): add WorkspaceBreadcrumb component"
```

---

## Task 8: Wire up into AppShell + TopBar

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx` (around lines 2170–2200)
- Modify: `apps/electron/src/renderer/components/app-shell/TopBar.tsx` (around lines 400–410)

No test changes — this is integration wiring. The unit tests from Tasks 1–7 cover the logic; manual smoke in Task 10 covers the end-to-end.

- [ ] **Step 1: Add rail to the AppShell layout**

Locate the return JSX in `AppShell.tsx` (around line 2171). Current structure is `<AppShellProvider>` → `<TopBar>` → `<div ref={shellRef}>`. Wrap the TopBar + shell div in a new flex container so the rail occupies the left edge, full height.

Open `apps/electron/src/renderer/components/app-shell/AppShell.tsx` and locate:

```tsx
  return (
    <AppShellProvider value={appShellContextValue}>
        {/* === TOP BAR === */}
        <TopBar
          workspaces={workspaces}
```

Replace with (keeping all existing TopBar + shell div props intact):

```tsx
  return (
    <AppShellProvider value={appShellContextValue}>
        {/* === LEFT RAIL === */}
        <div className="flex h-full w-full">
          <WorkspaceRail
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            workspaceUnreadMap={workspaceUnreadMap}
            onSelect={(id) => { void onSelectWorkspace(id) }}
            onCreate={() => setShowWorkspaceCreation(true)}
            onContextMenu={(id, e) => handleWorkspaceRailContextMenu(id, e)}
          />
          <div className="flex flex-col flex-1 min-w-0">
            {/* === TOP BAR === */}
            <TopBar
              workspaces={workspaces}
```

And at the end of the shell, before `</AppShellProvider>`, close the wrapper:

```tsx
          </div>{/* /flex col main column */}
        </div>{/* /flex row rail+main */}
    </AppShellProvider>
```

Add the import at the top of the file with the other local imports:

```tsx
import { WorkspaceRail } from './WorkspaceRail';
```

**Note:** `setShowWorkspaceCreation` and `handleWorkspaceRailContextMenu` are introduced in the next step — you will get a TS error until then. That's expected.

- [ ] **Step 2: Add creation dialog trigger + context-menu handler**

Still in `AppShell.tsx`, add state + handler near the existing workspace handlers. Search for `useAutomations(activeWorkspaceId)` around line 838 to find the right region. Add after the existing workspace handlers:

```tsx
const [showWorkspaceCreation, setShowWorkspaceCreation] = React.useState(false);

const handleWorkspaceRailContextMenu = React.useCallback(
  (_workspaceId: string, e: React.MouseEvent) => {
    e.preventDefault();
    // v1: context menu UI will be added later — for now, open settings as a stand-in.
    // TODO(next): wire up the full context menu (rename / open folder / set icon / remove).
    // Track as open work item in STATE.md.
  },
  [],
);
```

**Important:** do NOT leave the TODO forever — add an item to Task 10 Smoke Checklist to verify this or, if a full context menu is required for v1 acceptance, add it in Task 9 before removing WorkspaceSwitcher. For this plan's v1 shipping bar, left-click to select is the load-bearing feature; right-click is a follow-up.

Then find where `WorkspaceCreationScreen` is already used (it's imported in `WorkspaceSwitcher` today — check if AppShell already imports it; if not, add the import):

```tsx
import { WorkspaceCreationScreen } from '@/components/workspace';
```

Add render site near other overlays (e.g. next to `SendToWorkspaceDialog` around line 3511):

```tsx
<AnimatePresence>
  {showWorkspaceCreation && (
    <WorkspaceCreationScreen
      onClose={() => setShowWorkspaceCreation(false)}
      onWorkspaceCreated={(ws) => {
        setShowWorkspaceCreation(false);
        onRefreshWorkspaces?.();
        void onSelectWorkspace(ws.id);
      }}
    />
  )}
</AnimatePresence>
```

Make sure `AnimatePresence` is already imported from `motion/react` — it should be; otherwise add it.

- [ ] **Step 3: Replace TopBar WorkspaceSwitcher with Breadcrumb**

Edit `apps/electron/src/renderer/components/app-shell/TopBar.tsx` around line 400. Locate:

```tsx
<div className="min-w-0 flex-1">
  <WorkspaceSwitcher
    variant="topbar"
    workspaces={workspaces}
    activeWorkspaceId={activeWorkspaceId}
    onSelect={onSelectWorkspace}
    onWorkspaceCreated={onWorkspaceCreated}
    onWorkspaceRemoved={onWorkspaceRemoved}
    workspaceUnreadMap={workspaceUnreadMap}
  />
</div>
```

Replace with:

```tsx
<div className="min-w-0 shrink">
  <WorkspaceBreadcrumb
    workspace={workspaces.find((w) => w.id === activeWorkspaceId) ?? null}
    sessionName={null /* TODO: thread active session title through TopBar props */}
    workspaces={workspaces}
    onSelectWorkspace={onSelectWorkspace}
    onRenameSession={undefined}
  />
</div>
```

Update the import at the top of TopBar.tsx — remove `WorkspaceSwitcher`, add `WorkspaceBreadcrumb`:

```tsx
import { WorkspaceBreadcrumb } from './WorkspaceBreadcrumb';
```

**Note about sessionName:** threading the active session title into TopBar props requires a small prop plumbing change on the TopBar call site in AppShell. For v1, passing `null` means the breadcrumb just shows the workspace name — acceptable. Thread it through in Task 9 step 2 below.

- [ ] **Step 4: Thread active session title into TopBar**

In `AppShell.tsx`, find where `activeSessionId={effectiveSessionId}` is passed to `<TopBar>` (around line 2181). Add an `activeSessionName` prop:

```tsx
activeSessionId={effectiveSessionId}
activeSessionName={activeSessionMetas.find(s => s.id === effectiveSessionId)?.displayName ?? null}
```

In `TopBar.tsx`, add to the component's props interface (search for `activeSessionId?:`):

```ts
activeSessionName?: string | null;
```

And destructure + pass through:

```tsx
activeSessionName = null,
```

Update the breadcrumb JSX:

```tsx
sessionName={activeSessionName ?? null}
```

- [ ] **Step 5: Typecheck the changes**

Run: `cd apps/electron && bun run typecheck`
Expected: no errors.

Run: `bun test apps/electron/src/renderer/components/app-shell/`
Expected: all tests (both existing and new) PASS; no new failures.

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AppShell.tsx apps/electron/src/renderer/components/app-shell/TopBar.tsx
git commit -m "feat(workspace-rail): mount rail in AppShell and breadcrumb in TopBar"
```

---

## Task 9: Remove `WorkspaceSwitcher` from sidebar use and delete file

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` (remove sidebar variant if present)
- Delete: `apps/electron/src/renderer/components/app-shell/WorkspaceSwitcher.tsx`
- Modify: anywhere else that imports WorkspaceSwitcher (found via grep in Step 1)

- [ ] **Step 1: Find remaining usages**

Run: `grep -rn "WorkspaceSwitcher" apps/electron/src/renderer --include="*.tsx" --include="*.ts"`
Expected: only the definition file + test files (if any). Every import site should be gone after Task 8.

If any imports remain (e.g. a `variant="sidebar"` usage in LeftSidebar.tsx), remove them. The sidebar no longer needs a workspace switcher since the rail is always visible.

- [ ] **Step 2: Delete WorkspaceSwitcher.tsx**

Run: `git rm apps/electron/src/renderer/components/app-shell/WorkspaceSwitcher.tsx`

- [ ] **Step 3: Typecheck + test**

Run: `cd apps/electron && bun run typecheck`
Expected: no errors.

Run: `bun test apps/electron/src/renderer`
Expected: no new failures.

- [ ] **Step 4: Commit**

```bash
git add -A apps/electron/src/renderer/
git commit -m "chore(workspace-rail): remove obsolete WorkspaceSwitcher component"
```

---

## Task 10: Manual smoke test + STATE.md update

**Files:**
- Modify: `docs/STATE.md`

- [ ] **Step 1: Build + launch dev Electron**

Run: `bun run server:dev` (in one terminal) and `cd apps/electron && bun run dev` (in another), following the repo's usual dev flow. If a single `dev` script orchestrates both, use that.

- [ ] **Step 2: Walk the smoke checklist from SPEC.md**

Execute each item — mark PASS / FAIL inline below. If any fail, stop and fix the underlying code (loop back to the relevant task), then re-test.

- [ ] Launch with 4+ existing workspaces → rail renders with avatars in correct order.
- [ ] Click each workspace → session clears and reloads correctly.
- [ ] Drag to reorder → quit app → relaunch → order preserved.
- [ ] Open second window via existing shortcut → second window's rail has independent active highlight.
- [ ] New-workspace flow: click `+` in rail → creation screen appears → create → workspace shows up at end of rail without restart → is auto-selected.
- [ ] Breadcrumb shows `WorkspaceName › SessionName` when a session is active; just `WorkspaceName` when not.
- [ ] Breadcrumb dropdown lists all workspaces; clicking one switches.
- [ ] Unread indicator (red dot bottom-right) appears on avatars with unread sessions.
- [ ] Remove a workspace (via existing settings path) → rail updates; preferences file's `workspaceRailOrder` no longer contains removed id.

- [ ] **Step 3: Inspect preferences.json on disk**

Run: `cat ~/.craft-agent/preferences.json` (or whatever the current Rowl app-data path is — check `apps/electron/src/main` for the precise location if unsure).
Expected: a `workspaceRailOrder` array field whose contents match the rail order you dragged in step 2.

- [ ] **Step 4: Update STATE.md**

Edit `docs/STATE.md` — add to the "In progress" → "Shipped" section:

```markdown
### Workspace Rail (sub-project #2 feature #1) — SHIPPED

**What shipped:**
- 72px always-visible left rail replaces the topbar workspace dropdown
- Hybrid icons: real `iconUrl` if set, else deterministic Bayer-matrix pattern
- Auto-assigned colors from 12-hue palette, hashed by workspace id
- Drag-to-reorder persists to `preferences.json#workspaceRailOrder`
- Compact `Workspace › Session` breadcrumb in topbar replaces the old dropdown

**Live smoke passed:**
- [paste dates/observations from Task 10 Step 2]

**Follow-ups (not blocking v1):**
- Full right-click context menu on rail avatars (rename/open-folder/set-icon/remove)
- Keyboard shortcut to cycle workspaces (Cmd+Shift+[ etc.)
- Live-agent processing pulse wiring per backend
- Logo zone click action (about/home)
```

- [ ] **Step 5: Commit**

```bash
git add docs/STATE.md
git commit -m "docs(state): workspace rail SHIPPED with live smoke verified"
```

---

## Self-review results

After writing the full plan above, I checked it against the spec:

- **Spec coverage:** every requirement mapped to a task.
  - Rail 72px + 44px avatars → Task 6 (rail) + Task 5 (avatar)
  - Hybrid icon pipeline → Tasks 1, 2, 5
  - Auto-color → Task 2
  - Drag-to-reorder + persistence → Tasks 3 (schema), 4 (hook), 6 (rail)
  - Breadcrumb replaces dropdown → Task 7 (breadcrumb), Task 8 (wiring)
  - Reconciler behavior (add/remove workspaces without explicit writes) → Task 4 tests
  - Empty-workspaces edge case → Task 6 rail renders logo + add button without error
  - Multi-window independent active highlight → Task 10 smoke (uses existing per-window `windowWorkspaceId` atom — no new code)
  - Error handling matrix → Task 4 (silent drop on drag-to-nonexistent-id), Task 6 (missing-id filter), Task 10 smoke
- **Placeholders:** one intentional TODO in Task 8 Step 2 (right-click context menu) — clearly labeled as "follow-up not blocking v1" matching the spec's own "no user-visible context menu required for v1" stance. The sessionName-threading TODO in Task 8 Step 3 is closed by Step 4.
- **Type consistency:** `WorkspaceRailProps`, `WorkspaceAvatarProps`, `WorkspaceBreadcrumbProps` are defined once and referenced consistently. `reconcileRailOrder(order, workspaceIds)` parameter order matches across definition and call site.
- **Scope:** single feature, one branch, one merge. All tasks land independently testable commits.

No revisions needed.

---

## Plan complete

Plan saved to [docs/plans/workspace-rail/PLAN.md](docs/plans/workspace-rail/PLAN.md). Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
