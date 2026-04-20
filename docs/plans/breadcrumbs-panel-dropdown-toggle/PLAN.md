# Multi-Panel Breadcrumbs + All Sessions Panel↔Dropdown Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the topbar breadcrumb into a multi-panel chip row (`Workspace › [Sessions] · [A] · [B]`) and let each workspace collapse its All Sessions panel into a topbar-anchored dropdown, with per-workspace persistence.

**Architecture:** Convert `panelStackAtom` and `focusedPanelIdAtom` into derived façades over new per-workspace storage atoms (`panelStackByWorkspaceAtom`, `focusedPanelIdByWorkspaceAtom`) so every existing read site keeps working untouched. Add an `allSessionsDropdownModeByWorkspaceAtom` persisted via the existing `preferences.json` (same pattern as `workspaceRailOrder`). Refactor `WorkspaceBreadcrumb.tsx` into four small modules (`BreadcrumbChipRow`, `BreadcrumbChip`, `OverflowMenu`, `useBreadcrumbOverflow`), plus a new `AllSessionsDropdownPanel` Radix Popover that mounts the existing All Sessions content in dropdown mode.

**Tech Stack:** React 18 + TypeScript, Jotai atoms, Tailwind, Radix UI (`Popover`, `DropdownMenu`, `Tooltip`, `ContextMenu`), `lucide-react`, `bun:test`.

**Spec:** [SPEC.md](./SPEC.md)

**Branch:** `breadcrumbs-panel-dropdown-toggle` (to be created from `main`)

---

## Pre-flight

- [ ] **Create branch from main**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2
git checkout main
git pull --ff-only
git checkout -b breadcrumbs-panel-dropdown-toggle
```

Expected: branch created, `git status` clean, HEAD matches `origin/main`.

- [ ] **Confirm baseline tests pass**

Run: `bun test apps/electron/src/renderer`
Expected: same ~2 pre-existing failures as documented in `docs/STATE.md` ("known baseline" section). No new failures. Record the exact count so we can compare after each task.

- [ ] **Confirm Radix Popover + ContextMenu packages are present**

Run: `grep -E '"@radix-ui/(react-popover|react-context-menu|react-dropdown-menu|react-tooltip)"' apps/electron/package.json`
Expected: all four listed. If any missing, install with `bun add <pkg> --filter apps/electron` and commit that single change before Task 1.

---

## Phase 1: Data model (invisible — no behavior change)

### Task 1: Per-workspace panel stack storage atom

**Files:**
- Modify: `apps/electron/src/renderer/atoms/panel-stack.ts`
- Create: `apps/electron/src/renderer/atoms/__tests__/panel-stack-per-workspace.test.ts`

Goal: introduce `panelStackByWorkspaceAtom: Record<string, PanelStackEntry[]>` and `focusedPanelIdByWorkspaceAtom: Record<string, string | null>`. Convert `panelStackAtom` and `focusedPanelIdAtom` into read/write derived atoms backed by those maps, keyed by `windowWorkspaceIdAtom` from `atoms/sessions.ts`. Every existing read site continues to use `panelStackAtom` unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/atoms/__tests__/panel-stack-per-workspace.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createStore } from 'jotai';
import {
  panelStackAtom,
  focusedPanelIdAtom,
  panelStackByWorkspaceAtom,
  focusedPanelIdByWorkspaceAtom,
  pushPanelAtom,
  type PanelStackEntry,
} from '../panel-stack';
import { windowWorkspaceIdAtom } from '../sessions';

describe('panel-stack per-workspace', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it('panelStackAtom reads from active workspace slice', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    const entryA: PanelStackEntry = {
      id: 'p1', route: '/session/s1', proportion: 1,
      panelType: 'session', laneId: 'main',
    };
    store.set(panelStackByWorkspaceAtom, { 'ws-a': [entryA] });
    expect(store.get(panelStackAtom)).toEqual([entryA]);
  });

  it('returns empty array when no workspace is active', () => {
    store.set(windowWorkspaceIdAtom, null);
    store.set(panelStackByWorkspaceAtom, { 'ws-a': [] as PanelStackEntry[] });
    expect(store.get(panelStackAtom)).toEqual([]);
  });

  it('writes scope to active workspace only', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(pushPanelAtom, { route: '/session/s1' });
    const afterA = store.get(panelStackByWorkspaceAtom);
    expect(afterA['ws-a']).toHaveLength(1);
    expect(afterA['ws-b']).toBeUndefined();

    store.set(windowWorkspaceIdAtom, 'ws-b');
    store.set(pushPanelAtom, { route: '/session/s2' });
    const afterB = store.get(panelStackByWorkspaceAtom);
    expect(afterB['ws-a']).toHaveLength(1);
    expect(afterB['ws-b']).toHaveLength(1);
  });

  it('workspace switch surfaces the other workspace slice', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(pushPanelAtom, { route: '/session/s1' });
    store.set(windowWorkspaceIdAtom, 'ws-b');
    expect(store.get(panelStackAtom)).toEqual([]);
    store.set(windowWorkspaceIdAtom, 'ws-a');
    expect(store.get(panelStackAtom)).toHaveLength(1);
  });

  it('focusedPanelIdAtom is per-workspace', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(pushPanelAtom, { route: '/session/s1' });
    const focusA = store.get(focusedPanelIdAtom);
    store.set(windowWorkspaceIdAtom, 'ws-b');
    expect(store.get(focusedPanelIdAtom)).toBeNull();
    store.set(windowWorkspaceIdAtom, 'ws-a');
    expect(store.get(focusedPanelIdAtom)).toBe(focusA);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-per-workspace.test.ts`
Expected: FAIL — `panelStackByWorkspaceAtom` / `focusedPanelIdByWorkspaceAtom` are not exported.

- [ ] **Step 3: Add storage atoms + convert façades**

Modify `apps/electron/src/renderer/atoms/panel-stack.ts`:

- Add at top of file, after the existing imports:

```ts
import { windowWorkspaceIdAtom } from './sessions'
```

- Replace the two lines:

```ts
export const panelStackAtom = atom<PanelStackEntry[]>([])
export const focusedPanelIdAtom = atom<string | null>(null)
```

with:

```ts
// Storage: per-workspace panel stacks. Key is workspace id.
export const panelStackByWorkspaceAtom = atom<Record<string, PanelStackEntry[]>>({})
export const focusedPanelIdByWorkspaceAtom = atom<Record<string, string | null>>({})

/**
 * Derived façade over `panelStackByWorkspaceAtom`. Reads/writes the slice for
 * the active workspace (`windowWorkspaceIdAtom`). When no workspace is active,
 * reads return `[]` and writes are no-ops — this matches "nothing to render".
 */
export const panelStackAtom = atom<PanelStackEntry[], [PanelStackEntry[]], void>(
  (get) => {
    const wsId = get(windowWorkspaceIdAtom)
    if (!wsId) return []
    return get(panelStackByWorkspaceAtom)[wsId] ?? []
  },
  (get, set, next) => {
    const wsId = get(windowWorkspaceIdAtom)
    if (!wsId) return
    const map = get(panelStackByWorkspaceAtom)
    set(panelStackByWorkspaceAtom, { ...map, [wsId]: next })
  },
)

/** Derived façade for the focused panel id in the active workspace. */
export const focusedPanelIdAtom = atom<string | null, [string | null], void>(
  (get) => {
    const wsId = get(windowWorkspaceIdAtom)
    if (!wsId) return null
    return get(focusedPanelIdByWorkspaceAtom)[wsId] ?? null
  },
  (get, set, next) => {
    const wsId = get(windowWorkspaceIdAtom)
    if (!wsId) return
    const map = get(focusedPanelIdByWorkspaceAtom)
    set(focusedPanelIdByWorkspaceAtom, { ...map, [wsId]: next })
  },
)
```

No other change in this file. Every existing `set(panelStackAtom, …)` / `set(focusedPanelIdAtom, …)` / `get(panelStackAtom)` / `get(focusedPanelIdAtom)` in `pushPanelAtom`, `closePanelAtom`, `reconcilePanelStackAtom`, `resizePanelsAtom`, `updateFocusedPanelRouteAtom`, `focusNextPanelAtom`, `focusPrevPanelAtom`, `panelCountAtom`, `focusedPanelIndexAtom`, `focusedPanelRouteAtom` continues to work — they all go through the derived façades.

- [ ] **Step 4: Run new test to verify it passes**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-per-workspace.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Run the existing panel-stack test suite to verify no regressions**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-lanes.test.ts`
Expected: same result as pre-flight. If any new failure appears, the façade has a bug — fix before proceeding.

- [ ] **Step 6: Run the full renderer suite to catch broader regressions**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline failure count as pre-flight. No new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/atoms/panel-stack.ts \
        apps/electron/src/renderer/atoms/__tests__/panel-stack-per-workspace.test.ts
git commit -m "feat(panel-stack): partition storage by workspace via derived façade"
```

---

### Task 2: Dropdown-mode preference atom + persistence hook

**Files:**
- Create: `apps/electron/src/renderer/hooks/useAllSessionsDropdownMode.ts`
- Create: `apps/electron/src/renderer/hooks/__tests__/useAllSessionsDropdownMode.test.ts`

Goal: mirror the `useWorkspaceRailOrder` pattern. Hold a `Record<workspaceId, 'panel' | 'dropdown'>` in a Jotai atom, seed it once from `preferences.json` (new field `allSessionsDropdownModeByWorkspace`), expose a hook that returns the active workspace's mode plus a setter that flips and persists.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/hooks/__tests__/useAllSessionsDropdownMode.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createStore } from 'jotai';
import {
  allSessionsDropdownModeByWorkspaceAtom,
  activeWorkspaceAllSessionsModeAtom,
  toggleAllSessionsModeAtom,
} from '../useAllSessionsDropdownMode';
import { windowWorkspaceIdAtom } from '../../atoms/sessions';

describe('useAllSessionsDropdownMode atoms', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
  });

  it('defaults to panel mode when workspace has no preference', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    expect(store.get(activeWorkspaceAllSessionsModeAtom)).toBe('panel');
  });

  it('reads mode from map for active workspace', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(allSessionsDropdownModeByWorkspaceAtom, { 'ws-a': 'dropdown' });
    expect(store.get(activeWorkspaceAllSessionsModeAtom)).toBe('dropdown');
  });

  it('toggle flips active workspace only', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(allSessionsDropdownModeByWorkspaceAtom, { 'ws-b': 'dropdown' });
    store.set(toggleAllSessionsModeAtom);
    const map = store.get(allSessionsDropdownModeByWorkspaceAtom);
    expect(map['ws-a']).toBe('dropdown');
    expect(map['ws-b']).toBe('dropdown');
  });

  it('toggle from dropdown back to panel', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(allSessionsDropdownModeByWorkspaceAtom, { 'ws-a': 'dropdown' });
    store.set(toggleAllSessionsModeAtom);
    expect(store.get(allSessionsDropdownModeByWorkspaceAtom)['ws-a']).toBe('panel');
  });

  it('toggle is no-op without active workspace', () => {
    store.set(windowWorkspaceIdAtom, null);
    store.set(toggleAllSessionsModeAtom);
    expect(store.get(allSessionsDropdownModeByWorkspaceAtom)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/useAllSessionsDropdownMode.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement atoms + hook**

Create `apps/electron/src/renderer/hooks/useAllSessionsDropdownMode.ts`:

```ts
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { windowWorkspaceIdAtom } from '../atoms/sessions';

export type AllSessionsMode = 'panel' | 'dropdown';

/** Storage: per-workspace All Sessions mode. Persisted to preferences.json. */
export const allSessionsDropdownModeByWorkspaceAtom =
  atom<Record<string, AllSessionsMode>>({});

/** Derived read: mode for the active workspace (default 'panel'). */
export const activeWorkspaceAllSessionsModeAtom = atom<AllSessionsMode>((get) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return 'panel';
  return get(allSessionsDropdownModeByWorkspaceAtom)[wsId] ?? 'panel';
});

/** Write atom: toggle active workspace mode. Persistence runs as side-effect
 *  via the hook (useEffect watches map changes), keeping this atom pure. */
export const toggleAllSessionsModeAtom = atom(null, (get, set) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return;
  const map = get(allSessionsDropdownModeByWorkspaceAtom);
  const current = map[wsId] ?? 'panel';
  const next: AllSessionsMode = current === 'panel' ? 'dropdown' : 'panel';
  set(allSessionsDropdownModeByWorkspaceAtom, { ...map, [wsId]: next });
});

// Module-scope seed guard — mirrors useWorkspaceRailOrder.
let seeded = false;

/**
 * Hook: seeds the map from preferences.json on first mount (process-wide),
 * and persists subsequent writes back. Returns nothing — consumers read the
 * derived atom and dispatch the toggle atom directly.
 */
export function useAllSessionsDropdownModePersistence(): void {
  const [map, setMap] = useAtom(allSessionsDropdownModeByWorkspaceAtom);

  useEffect(() => {
    if (seeded) return;
    seeded = true;
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<{ json?: string } | null>;
    };
    if (!api?.readPreferences) return;
    void api
      .readPreferences()
      .then((raw) => {
        const json = raw?.json;
        if (typeof json !== 'string') return;
        try {
          const parsed = JSON.parse(json) as {
            allSessionsDropdownModeByWorkspace?: Record<string, AllSessionsMode>;
          };
          if (parsed.allSessionsDropdownModeByWorkspace) {
            setMap(parsed.allSessionsDropdownModeByWorkspace);
          }
        } catch {
          // ignore malformed
        }
      })
      .catch(() => undefined);
  }, [setMap]);

  // Write-through: fires when `map` changes (but not on the initial seed,
  // because seed uses the same setMap and we re-enter this effect with the
  // seeded value; we compare against a stable ref via a second effect below
  // if needed). Simple approach: always write-through; the write is idempotent
  // and fire-and-forget.
  useEffect(() => {
    if (!seeded) return;
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<{ json?: string } | null>;
      writePreferences?: (json: string) => Promise<{ ok?: boolean }>;
    };
    if (!api?.readPreferences || !api?.writePreferences) return;
    void (async () => {
      try {
        const current = await api.readPreferences!();
        const currentJson = current?.json ?? '{}';
        const parsed: Record<string, unknown> = (() => {
          try {
            return JSON.parse(currentJson) as Record<string, unknown>;
          } catch {
            return {};
          }
        })();
        parsed.allSessionsDropdownModeByWorkspace = map;
        await api.writePreferences!(JSON.stringify(parsed, null, 2));
      } catch (err) {
        console.warn('[breadcrumbs] failed to persist dropdown mode', err);
      }
    })();
  }, [map]);
}

/** Convenience read hook for components that only need to know the mode. */
export function useActiveWorkspaceAllSessionsMode(): AllSessionsMode {
  return useAtomValue(activeWorkspaceAllSessionsModeAtom);
}

/** Convenience setter hook for components that only need to toggle. */
export function useToggleAllSessionsMode(): () => void {
  const toggle = useSetAtom(toggleAllSessionsModeAtom);
  return toggle;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/useAllSessionsDropdownMode.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the persistence hook at app shell root**

Modify `apps/electron/src/renderer/components/app-shell/AppShell.tsx`: find the other persistence hook invocations (e.g. `useWorkspaceRailOrder(…)` near the top of the `AppShell` component body) and add one call:

```ts
useAllSessionsDropdownModePersistence();
```

Import it alongside the existing hooks:

```ts
import { useAllSessionsDropdownModePersistence } from '../../hooks/useAllSessionsDropdownMode';
```

- [ ] **Step 6: Run the full renderer suite**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline failure count as pre-flight. No new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/hooks/useAllSessionsDropdownMode.ts \
        apps/electron/src/renderer/hooks/__tests__/useAllSessionsDropdownMode.test.ts \
        apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat(breadcrumbs): per-workspace All Sessions dropdown-mode preference"
```

---

### Task 3: Lazy-init All Sessions entry for empty workspaces

**Files:**
- Modify: `apps/electron/src/renderer/atoms/panel-stack.ts`
- Create: `apps/electron/src/renderer/atoms/__tests__/panel-stack-lazy-init.test.ts`

Goal: when a workspace has no entry in `panelStackByWorkspaceAtom` yet, the first read should initialize it with a single All Sessions panel. Matches today's "there's always a focused view" behavior (SPEC §Open Q4 resolved).

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/atoms/__tests__/panel-stack-lazy-init.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createStore } from 'jotai';
import {
  panelStackAtom,
  ensureWorkspacePanelStackAtom,
  panelStackByWorkspaceAtom,
} from '../panel-stack';
import { windowWorkspaceIdAtom } from '../sessions';

describe('panel-stack lazy init', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => { store = createStore(); });

  it('ensureWorkspacePanelStack initializes an empty workspace with All Sessions', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(ensureWorkspacePanelStackAtom);
    const stack = store.get(panelStackAtom);
    expect(stack).toHaveLength(1);
    expect(stack[0].panelType).toBe('session');
  });

  it('ensureWorkspacePanelStack is a no-op when stack already populated', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [{ id: 'p1', route: '/session/s1', proportion: 1, panelType: 'session', laneId: 'main' }],
    });
    store.set(ensureWorkspacePanelStackAtom);
    expect(store.get(panelStackAtom)).toHaveLength(1);
    expect(store.get(panelStackAtom)[0].id).toBe('p1');
  });

  it('ensureWorkspacePanelStack is a no-op without active workspace', () => {
    store.set(windowWorkspaceIdAtom, null);
    store.set(ensureWorkspacePanelStackAtom);
    expect(store.get(panelStackByWorkspaceAtom)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-lazy-init.test.ts`
Expected: FAIL — `ensureWorkspacePanelStackAtom` not exported.

- [ ] **Step 3: Add the init atom**

Append to `apps/electron/src/renderer/atoms/panel-stack.ts`:

```ts
/** Root route for the All Sessions panel — the implicit singleton per workspace. */
export const ALL_SESSIONS_ROUTE: ViewRoute = '/' as ViewRoute;

/**
 * Initialize the active workspace's panel stack if it's empty, by opening
 * a single All Sessions entry. No-op otherwise. Idempotent.
 */
export const ensureWorkspacePanelStackAtom = atom(null, (get, set) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return;
  const map = get(panelStackByWorkspaceAtom);
  const existing = map[wsId];
  if (existing && existing.length > 0) return;
  const entry = createEntry(ALL_SESSIONS_ROUTE, 1);
  set(panelStackByWorkspaceAtom, { ...map, [wsId]: [entry] });
  const focusMap = get(focusedPanelIdByWorkspaceAtom);
  set(focusedPanelIdByWorkspaceAtom, { ...focusMap, [wsId]: entry.id });
});
```

(If `ALL_SESSIONS_ROUTE` conflicts with a route constant already defined elsewhere, import that existing constant instead and delete this declaration.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-lazy-init.test.ts`
Expected: PASS.

- [ ] **Step 5: Call the init on workspace switch**

Modify `apps/electron/src/renderer/components/app-shell/AppShell.tsx`: find where `windowWorkspaceIdAtom` is subscribed (likely via `useAtomValue(windowWorkspaceIdAtom)` near the top of `AppShell`), then add an effect just below it:

```ts
const ensureStack = useSetAtom(ensureWorkspacePanelStackAtom);
useEffect(() => {
  ensureStack();
}, [activeWorkspaceId, ensureStack]);
```

where `activeWorkspaceId` is the existing local from `useAtomValue(windowWorkspaceIdAtom)`. Add imports:

```ts
import { useSetAtom } from 'jotai';
import { ensureWorkspacePanelStackAtom } from '../../atoms/panel-stack';
```

- [ ] **Step 6: Run the full renderer suite**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline failure count. No new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/atoms/panel-stack.ts \
        apps/electron/src/renderer/atoms/__tests__/panel-stack-lazy-init.test.ts \
        apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat(panel-stack): lazy-init empty workspaces with All Sessions panel"
```

---

**End of Phase 1.** Data model is now per-workspace with persisted dropdown-mode preference. No UI change yet.

---

## Phase 2: Breadcrumb UI (chip row, overflow, focused styling)

### Task 4: `useBreadcrumbOverflow` hook

**Files:**
- Create: `apps/electron/src/renderer/hooks/useBreadcrumbOverflow.ts`
- Create: `apps/electron/src/renderer/hooks/__tests__/useBreadcrumbOverflow.test.ts`

Pure layout math: given the container width, panels, focused id, and per-chip measured widths, decide which chips are visible, which go to overflow, and what `chipMaxWidth` to apply. We expose the pure function plus a thin React wrapper that measures via `ResizeObserver`.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/hooks/__tests__/useBreadcrumbOverflow.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { computeBreadcrumbOverflow } from '../useBreadcrumbOverflow';
import type { PanelStackEntry } from '../../atoms/panel-stack';

function mkPanel(id: string, type: PanelStackEntry['panelType'] = 'session'): PanelStackEntry {
  return { id, route: `/session/${id}` as PanelStackEntry['route'], proportion: 1, panelType: type, laneId: 'main' };
}

describe('computeBreadcrumbOverflow', () => {
  it('all chips visible when they fit at max width', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'a', containerWidth: 1000,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.hiddenPanels).toEqual([]);
    expect(out.visibleIds).toEqual(new Set(['a', 'b', 'c']));
    expect(out.chipMaxWidth).toBe(140);
  });

  it('shrinks before overflowing', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'a', containerWidth: 600,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.hiddenPanels).toEqual([]);
    expect(out.chipMaxWidth).toBeLessThan(140);
    expect(out.chipMaxWidth).toBeGreaterThanOrEqual(80);
  });

  it('overflows oldest non-focused chips first once min width reached', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e'), mkPanel('f'), mkPanel('g')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'g', containerWidth: 300,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.visibleIds.has('g')).toBe(true);
    expect(out.hiddenPanels.length).toBeGreaterThan(0);
    expect(out.hiddenPanels[0].id).toBe('a');
  });

  it('focused chip is never hidden even if oldest', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e'), mkPanel('f'), mkPanel('g')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'a', containerWidth: 250,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.visibleIds.has('a')).toBe(true);
    expect(out.hiddenPanels.find((p) => p.id === 'a')).toBeUndefined();
  });

  it('hiddenPanels preserves original positional order', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e'), mkPanel('f')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'f', containerWidth: 260,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    const ids = out.hiddenPanels.map((p) => p.id);
    expect(ids).toEqual([...ids].sort((x, y) => panels.findIndex((p) => p.id === x) - panels.findIndex((p) => p.id === y)));
  });

  it('empty panels → no work', () => {
    const out = computeBreadcrumbOverflow({
      panels: [], focusedId: null, containerWidth: 1000,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.visibleIds.size).toBe(0);
    expect(out.hiddenPanels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/useBreadcrumbOverflow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure function + React hook**

Create `apps/electron/src/renderer/hooks/useBreadcrumbOverflow.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import type { PanelStackEntry } from '../atoms/panel-stack';

export interface OverflowInput {
  panels: PanelStackEntry[];
  focusedId: string | null;
  containerWidth: number;
  maxChipWidth: number;
  minChipWidth: number;
  separatorWidth: number;
  overflowMenuWidth: number;
}

export interface OverflowResult {
  visibleIds: Set<string>;
  hiddenPanels: PanelStackEntry[];
  chipMaxWidth: number;
}

/** Pure layout decision. Exported for unit tests. */
export function computeBreadcrumbOverflow(input: OverflowInput): OverflowResult {
  const { panels, focusedId, containerWidth, maxChipWidth, minChipWidth, separatorWidth, overflowMenuWidth } = input;
  if (panels.length === 0) {
    return { visibleIds: new Set(), hiddenPanels: [], chipMaxWidth: maxChipWidth };
  }

  const totalWidthAt = (chipWidth: number, count: number): number => {
    const chips = chipWidth * count;
    const separators = Math.max(0, count - 1) * separatorWidth;
    return chips + separators;
  };

  // Attempt 1: all visible at max width.
  if (totalWidthAt(maxChipWidth, panels.length) <= containerWidth) {
    return {
      visibleIds: new Set(panels.map((p) => p.id)),
      hiddenPanels: [],
      chipMaxWidth: maxChipWidth,
    };
  }

  // Attempt 2: shrink chip width down to minChipWidth in 10px steps.
  for (let w = maxChipWidth - 10; w >= minChipWidth; w -= 10) {
    if (totalWidthAt(w, panels.length) <= containerWidth) {
      return {
        visibleIds: new Set(panels.map((p) => p.id)),
        hiddenPanels: [],
        chipMaxWidth: w,
      };
    }
  }

  // Attempt 3: fixed minChipWidth, push oldest non-focused chips to overflow
  // until the remaining set (plus the overflow menu button) fits.
  const isFocused = (p: PanelStackEntry) => p.id === focusedId;
  const visible = [...panels];
  const hidden: PanelStackEntry[] = [];

  const budgetWithMenu = containerWidth - overflowMenuWidth - separatorWidth;

  while (visible.length > 1 && totalWidthAt(minChipWidth, visible.length) > budgetWithMenu) {
    // Find the oldest non-focused chip in visible order.
    const idx = visible.findIndex((p) => !isFocused(p));
    if (idx === -1) break; // only focused chip left — stop
    hidden.push(visible[idx]);
    visible.splice(idx, 1);
  }

  // Preserve original positional order in hidden list.
  hidden.sort((x, y) =>
    panels.findIndex((p) => p.id === x.id) - panels.findIndex((p) => p.id === y.id),
  );

  return {
    visibleIds: new Set(visible.map((p) => p.id)),
    hiddenPanels: hidden,
    chipMaxWidth: minChipWidth,
  };
}

/**
 * React wrapper: observes container width via ResizeObserver, memoizes the
 * layout decision. Consumers pass the panels, focused id, and a ref.
 */
export function useBreadcrumbOverflow(
  panels: PanelStackEntry[],
  focusedId: string | null,
  containerRef: React.RefObject<HTMLElement | null>,
  opts?: Partial<Omit<OverflowInput, 'panels' | 'focusedId' | 'containerWidth'>>,
): OverflowResult {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [containerRef]);

  return useMemo(
    () =>
      computeBreadcrumbOverflow({
        panels,
        focusedId,
        containerWidth: width,
        maxChipWidth: opts?.maxChipWidth ?? 140,
        minChipWidth: opts?.minChipWidth ?? 80,
        separatorWidth: opts?.separatorWidth ?? 14,
        overflowMenuWidth: opts?.overflowMenuWidth ?? 32,
      }),
    [panels, focusedId, width, opts?.maxChipWidth, opts?.minChipWidth, opts?.separatorWidth, opts?.overflowMenuWidth],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/useBreadcrumbOverflow.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/hooks/useBreadcrumbOverflow.ts \
        apps/electron/src/renderer/hooks/__tests__/useBreadcrumbOverflow.test.ts
git commit -m "feat(breadcrumbs): overflow calculation hook with shrink-then-hide"
```

---

### Task 5: `BreadcrumbChip` component

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChip.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChip.test.tsx`

One button rendering icon + label + trailing `×` or chevron. Focused variant = filled pill; unfocused = muted.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChip.test.tsx`:

```tsx
import { describe, it, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { BreadcrumbChip } from '../BreadcrumbChip';
import { MessageSquare } from 'lucide-react';

describe('BreadcrumbChip', () => {
  it('renders label', () => {
    const { getByText } = render(
      <BreadcrumbChip id="a" label="Sessions" focused={false} closable={false} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    expect(getByText('Sessions')).toBeTruthy();
  });

  it('applies focused styling when focused', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="A" focused={true} closable={true} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('bg-accent');
  });

  it('calls onClick when clicked', () => {
    const onClick = mock(() => {});
    const { container } = render(
      <BreadcrumbChip id="a" label="A" focused={false} closable={false} variant="chip" maxWidth={140} onClick={onClick} />
    );
    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows × only when closable and focused or hovered', () => {
    const onClose = mock(() => {});
    const { container } = render(
      <BreadcrumbChip id="a" label="A" focused={true} closable={true} variant="chip" maxWidth={140} onClick={() => {}} onClose={onClose} />
    );
    const closeBtn = container.querySelector('[aria-label="Close panel"]');
    expect(closeBtn).toBeTruthy();
  });

  it('does not render × when closable is false', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="Sessions" focused={true} closable={false} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    expect(container.querySelector('[aria-label="Close panel"]')).toBeNull();
  });

  it('renders chevron when variant is trigger', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="Sessions" focused={false} closable={false} variant="trigger" maxWidth={140} onClick={() => {}} />
    );
    expect(container.querySelector('[data-chip-variant="trigger"]')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="A" icon={MessageSquare} focused={false} closable={false} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChip.tsx`:

```tsx
import * as React from 'react';
import { ChevronDown, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbChipProps {
  id: string;
  label: string;
  icon?: LucideIcon;
  focused: boolean;
  closable: boolean;
  variant: 'chip' | 'trigger';
  maxWidth: number;
  onClick: () => void;
  onClose?: () => void;
}

export function BreadcrumbChip({
  id,
  label,
  icon: Icon,
  focused,
  closable,
  variant,
  maxWidth,
  onClick,
  onClose,
}: BreadcrumbChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      data-panel-id={id}
      data-chip-variant={variant}
      style={{ maxWidth }}
      className={cn(
        'group inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm shrink min-w-0',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'transition-colors',
        focused
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="truncate min-w-0">{label}</span>
      {variant === 'trigger' ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : closable ? (
        <span
          role="button"
          aria-label="Close panel"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className={cn(
            'ml-0.5 shrink-0 inline-flex items-center justify-center rounded-sm',
            'h-4 w-4 hover:bg-foreground/10',
            focused ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:opacity-100',
            'transition-opacity',
          )}
        >
          <X className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChip.test.tsx`
Expected: PASS (all seven cases).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChip.tsx \
        apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChip.test.tsx
git commit -m "feat(breadcrumbs): chip component with focused pill + close/chevron variants"
```

---

### Task 6: `OverflowMenu` component

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/OverflowMenu.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/OverflowMenu.test.tsx`

A single `…` button (Radix DropdownMenu) listing hidden panels with click-to-focus and close action.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/OverflowMenu.test.tsx`:

```tsx
import { describe, it, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { OverflowMenu } from '../OverflowMenu';
import type { PanelStackEntry } from '../../../../atoms/panel-stack';

function mk(id: string): PanelStackEntry {
  return { id, route: `/session/${id}` as PanelStackEntry['route'], proportion: 1, panelType: 'session', laneId: 'main' };
}

describe('OverflowMenu', () => {
  it('renders nothing when no hidden panels', () => {
    const { container } = render(<OverflowMenu hiddenPanels={[]} labelFor={() => ''} onFocusPanel={() => {}} onClosePanel={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a trigger button when there are hidden panels', () => {
    const { container } = render(
      <OverflowMenu hiddenPanels={[mk('a')]} labelFor={() => 'A'} onFocusPanel={() => {}} onClosePanel={() => {}} />
    );
    expect(container.querySelector('button[aria-label="More panels"]')).toBeTruthy();
  });

  it('opens on click and lists panels by label', () => {
    const { container, findByText } = render(
      <OverflowMenu
        hiddenPanels={[mk('a'), mk('b')]}
        labelFor={(p) => (p.id === 'a' ? 'Refactor' : 'Debug')}
        onFocusPanel={() => {}}
        onClosePanel={() => {}}
      />
    );
    fireEvent.click(container.querySelector('button[aria-label="More panels"]')!);
    return Promise.all([findByText('Refactor'), findByText('Debug')]).then(([a, b]) => {
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
    });
  });

  it('click on menu item fires onFocusPanel with correct id', async () => {
    const onFocus = mock((_id: string) => {});
    const { container, findByText } = render(
      <OverflowMenu
        hiddenPanels={[mk('a')]}
        labelFor={() => 'Refactor'}
        onFocusPanel={onFocus}
        onClosePanel={() => {}}
      />
    );
    fireEvent.click(container.querySelector('button[aria-label="More panels"]')!);
    const item = await findByText('Refactor');
    fireEvent.click(item);
    expect(onFocus).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/OverflowMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/electron/src/renderer/components/app-shell/breadcrumb/OverflowMenu.tsx`:

```tsx
import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PanelStackEntry } from '../../../atoms/panel-stack';

export interface OverflowMenuProps {
  hiddenPanels: PanelStackEntry[];
  labelFor: (panel: PanelStackEntry) => string;
  onFocusPanel: (id: string) => void;
  onClosePanel: (id: string) => void;
}

export function OverflowMenu({ hiddenPanels, labelFor, onFocusPanel, onClosePanel }: OverflowMenuProps) {
  if (hiddenPanels.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="More panels"
          className={cn(
            'inline-flex items-center justify-center h-7 w-7 rounded-md shrink-0',
            'text-muted-foreground hover:text-foreground hover:bg-accent/40',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="min-w-[220px] max-w-[320px] rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {hiddenPanels.map((p) => (
            <DropdownMenu.Item
              key={p.id}
              onSelect={() => onFocusPanel(p.id)}
              className={cn(
                'group flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-sm outline-none',
                'data-[highlighted]:bg-accent data-[highlighted]:text-foreground',
                'text-muted-foreground',
              )}
            >
              <span className="truncate min-w-0">{labelFor(p)}</span>
              <button
                type="button"
                aria-label="Close panel"
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePanel(p.id);
                }}
                className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-sm opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/OverflowMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/breadcrumb/OverflowMenu.tsx \
        apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/OverflowMenu.test.tsx
git commit -m "feat(breadcrumbs): overflow menu for hidden chips"
```

---

### Task 7: `BreadcrumbChipRow` — assemble chips + separators + overflow

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChipRow.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChipRow.test.tsx`

Consumes `panelStackAtom`, `focusedPanelIdAtom`, `activeWorkspaceAllSessionsModeAtom`, plus callbacks. Renders interleaved chips + `·` separators, offloads hidden panels to `OverflowMenu`, special-cases the first chip to be a chevron trigger in dropdown mode.

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChipRow.test.tsx`:

```tsx
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { BreadcrumbChipRow } from '../BreadcrumbChipRow';
import {
  panelStackByWorkspaceAtom,
  focusedPanelIdByWorkspaceAtom,
  type PanelStackEntry,
} from '../../../../atoms/panel-stack';
import { windowWorkspaceIdAtom } from '../../../../atoms/sessions';
import { allSessionsDropdownModeByWorkspaceAtom } from '../../../../hooks/useAllSessionsDropdownMode';

function mk(id: string, route: string): PanelStackEntry {
  return { id, route: route as PanelStackEntry['route'], proportion: 1, panelType: 'session', laneId: 'main' };
}

describe('BreadcrumbChipRow', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [mk('p0', '/'), mk('p1', '/session/s1')],
    });
    store.set(focusedPanelIdByWorkspaceAtom, { 'ws-a': 'p1' });
  });

  it('renders one chip per panel with separators between them', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    expect(container.querySelectorAll('button[data-panel-id]').length).toBe(2);
    expect(container.querySelectorAll('[data-role="separator"]').length).toBe(1);
  });

  it('focused chip has bg-accent class', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    const focused = container.querySelector('button[data-panel-id="p1"]')!;
    expect(focused.className).toContain('bg-accent');
  });

  it('first chip renders as trigger variant when dropdown mode active', () => {
    store.set(allSessionsDropdownModeByWorkspaceAtom, { 'ws-a': 'dropdown' });
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    const first = container.querySelector('button[data-panel-id="p0"]')!;
    expect(first.getAttribute('data-chip-variant')).toBe('trigger');
  });

  it('first chip is not closable', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    const first = container.querySelector('button[data-panel-id="p0"]')!;
    expect(first.querySelector('[aria-label="Close panel"]')).toBeNull();
  });

  it('clicking a non-focused chip updates focus', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    fireEvent.click(container.querySelector('button[data-panel-id="p0"]')!);
    expect(store.get(focusedPanelIdByWorkspaceAtom)['ws-a']).toBe('p0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChipRow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChipRow.tsx`:

```tsx
import * as React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { MessageSquare, FileText, Settings as SettingsIcon, Sparkles, Layers, type LucideIcon } from 'lucide-react';
import {
  panelStackAtom,
  focusedPanelIdAtom,
  closePanelAtom,
  type PanelStackEntry,
  type PanelType,
} from '../../../atoms/panel-stack';
import {
  activeWorkspaceAllSessionsModeAtom,
} from '../../../hooks/useAllSessionsDropdownMode';
import { useBreadcrumbOverflow } from '../../../hooks/useBreadcrumbOverflow';
import { BreadcrumbChip } from './BreadcrumbChip';
import { OverflowMenu } from './OverflowMenu';

const ICON_FOR_TYPE: Record<PanelType, LucideIcon> = {
  session: MessageSquare,
  source: FileText,
  settings: SettingsIcon,
  skills: Sparkles,
  other: Layers,
};

export interface BreadcrumbChipRowProps {
  /** Resolve a human label for a panel. Typically reads session/source registries. */
  labelFor: (panel: PanelStackEntry) => string;
  /** Optional override: called when the All Sessions chip is clicked in dropdown mode. */
  onOpenAllSessionsDropdown?: () => void;
}

export function BreadcrumbChipRow({ labelFor, onOpenAllSessionsDropdown }: BreadcrumbChipRowProps) {
  const panels = useAtomValue(panelStackAtom);
  const [focusedId, setFocusedId] = useAtom(focusedPanelIdAtom);
  const closePanel = useSetAtom(closePanelAtom);
  const mode = useAtomValue(activeWorkspaceAllSessionsModeAtom);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const { visibleIds, hiddenPanels, chipMaxWidth } = useBreadcrumbOverflow(
    panels,
    focusedId,
    containerRef,
  );

  const visiblePanels = panels.filter((p) => visibleIds.has(p.id));

  const handleChipClick = React.useCallback(
    (panel: PanelStackEntry, isFirst: boolean) => {
      if (isFirst && mode === 'dropdown') {
        onOpenAllSessionsDropdown?.();
        return;
      }
      setFocusedId(panel.id);
    },
    [mode, onOpenAllSessionsDropdown, setFocusedId],
  );

  return (
    <div ref={containerRef} className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
      {visiblePanels.map((panel, idx) => {
        const isFirst = panels.indexOf(panel) === 0;
        const label = isFirst ? 'Sessions' : labelFor(panel);
        const variant: 'chip' | 'trigger' = isFirst && mode === 'dropdown' ? 'trigger' : 'chip';
        const closable = !isFirst; // All Sessions is pinned
        return (
          <React.Fragment key={panel.id}>
            {idx > 0 && (
              <span
                aria-hidden="true"
                data-role="separator"
                className="text-muted-foreground/40 shrink-0 px-0.5 select-none"
              >
                ·
              </span>
            )}
            <BreadcrumbChip
              id={panel.id}
              label={label}
              icon={ICON_FOR_TYPE[panel.panelType]}
              focused={panel.id === focusedId}
              closable={closable}
              variant={variant}
              maxWidth={chipMaxWidth}
              onClick={() => handleChipClick(panel, isFirst)}
              onClose={closable ? () => closePanel(panel.id) : undefined}
            />
          </React.Fragment>
        );
      })}
      <OverflowMenu
        hiddenPanels={hiddenPanels}
        labelFor={labelFor}
        onFocusPanel={(id) => setFocusedId(id)}
        onClosePanel={(id) => closePanel(id)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChipRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChipRow.tsx \
        apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/BreadcrumbChipRow.test.tsx
git commit -m "feat(breadcrumbs): chip row with overflow + dropdown-mode first chip"
```

---

### Task 8: Refactor `WorkspaceBreadcrumb.tsx` to host `BreadcrumbChipRow`

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/workspaceBreadcrumbFormat.test.ts` (update only if assertions break)

Goal: the existing `{workspace} › {sessionName}` layout becomes `{workspace} › {BreadcrumbChipRow}`. The `onRenameSession` callback moves to the focused chip's `onDoubleClick` or similar (see follow-up questions). For v1, keep rename wired via right-click on the focused session chip — we'll add that in Task 11 with the context menu. Task 8 ships without rename to keep the diff small.

- [ ] **Step 1: Capture current assertions** — read the existing test file and note what it expects:

Run: `cat apps/electron/src/renderer/components/app-shell/__tests__/workspaceBreadcrumbFormat.test.ts`

Expected: the test likely calls `formatBreadcrumbText` (a pure helper) rather than rendering the component. If so, this helper is still valid and no change needed. Record that.

- [ ] **Step 2: Update `WorkspaceBreadcrumb.tsx`**

Replace the file with:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatBreadcrumbText } from './WorkspaceBreadcrumb.helpers';
import { BreadcrumbChipRow } from './breadcrumb/BreadcrumbChipRow';
import type { Workspace } from '../../../shared/types';
import type { PanelStackEntry } from '../../atoms/panel-stack';

export { formatBreadcrumbText };

export interface WorkspaceBreadcrumbProps {
  workspace: Workspace | null;
  /** Resolves a human label for a panel (session title, source name, etc.). */
  labelFor: (panel: PanelStackEntry) => string;
  /** Opens the All Sessions popover when the first chip is in dropdown-trigger mode. */
  onOpenAllSessionsDropdown?: () => void;
}

export function WorkspaceBreadcrumb({
  workspace,
  labelFor,
  onOpenAllSessionsDropdown,
}: WorkspaceBreadcrumbProps) {
  const workspaceName = workspace?.name ?? null;

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <span className={cn('max-w-[240px] px-2 py-1 text-sm font-medium truncate shrink-0')}>
        {workspaceName ?? 'No workspace'}
      </span>
      <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">›</span>
      <BreadcrumbChipRow labelFor={labelFor} onOpenAllSessionsDropdown={onOpenAllSessionsDropdown} />
    </div>
  );
}
```

- [ ] **Step 3: Update the callsite in `TopBar.tsx`**

Find `<WorkspaceBreadcrumb` in `apps/electron/src/renderer/components/app-shell/TopBar.tsx`. Previously it passed `sessionName` and `onRenameSession`; replace with `labelFor` + `onOpenAllSessionsDropdown`. The `labelFor` implementation:

```tsx
const labelFor = React.useCallback(
  (panel: PanelStackEntry): string => {
    // For session panels, look up session.title from sessionsAtom.
    // For source panels, look up source.name. For others, derive from route.
    if (panel.panelType === 'session') {
      const id = parseSessionIdFromRoute(panel.route);
      const session = id ? sessionsById[id] : null;
      return session?.title ?? 'Session';
    }
    if (panel.panelType === 'source') {
      const id = parseSourceIdFromRoute(panel.route);
      const source = id ? sourcesById[id] : null;
      return source?.name ?? 'Source';
    }
    if (panel.panelType === 'settings') return 'Settings';
    if (panel.panelType === 'skills') return 'Skills';
    return 'Panel';
  },
  [sessionsById, sourcesById],
);
```

Fill in `sessionsById`/`sourcesById`/`parseSourceIdFromRoute` via existing atoms/helpers in the file — do not invent new ones. If a helper doesn't exist, use what the current `TopBar.tsx` uses to resolve the focused session name and generalize it.

The `onOpenAllSessionsDropdown` prop is wired in Task 10 — for now pass `undefined` and the first chip in dropdown mode will simply not do anything on click. (We'll verify this is fine before Phase 3 ships to users.)

- [ ] **Step 4: Remove the sessionName/onRenameSession plumbing**

Delete any `sessionName` / `onRenameSession` arguments that only existed to feed this component. If they're used elsewhere, leave them.

- [ ] **Step 5: Run the full renderer suite**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline failure count. `workspaceBreadcrumbFormat.test.ts` still passes (it tests the pure helper). `BreadcrumbChipRow` tests still pass.

- [ ] **Step 6: Manual smoke — run the app and verify**

Run: `bun run dev` (or the repo's standard electron dev command). Open the app, create/select a workspace, open two sessions side-by-side, verify:
- Each session appears as a chip in the topbar
- Focused chip has filled background, unfocused is muted
- Middot `·` between chips
- Hover over a non-focused chip shows the `×`
- Clicking a chip focuses that panel
- Clicking `×` closes the panel; focus slides to the previous chip

If any of these fail, fix before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx \
        apps/electron/src/renderer/components/app-shell/TopBar.tsx
git commit -m "feat(breadcrumbs): multi-panel chip row in topbar"
```

---

**End of Phase 2.** Breadcrumb is now multi-chip with overflow. Dropdown mode exists as a preference but has no UI effect yet (the first chip renders as a trigger but clicking it is a no-op). Phase 3 wires the popover.

---

## Phase 3: Dropdown mode (popover + toggles + context menu)

### Task 9: Extract All Sessions content into a shared module

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/AllSessionsView.tsx` (if not already a standalone)
- Modify: `apps/electron/src/renderer/components/app-shell/PanelStackContainer.tsx` (render `AllSessionsView` where it used to render inline)

Goal: move the existing All Sessions UI (session list + filter + label tree) into a single named component that can be mounted anywhere. No behavior change — just a move. Today this content lives inside `PanelSlot` / `SessionList` / related files. We want one `AllSessionsView` component that the panel stack and the popover can both render.

- [ ] **Step 1: Inspect current mount point**

Run: `grep -n "panelType === 'session'" apps/electron/src/renderer/components/app-shell/PanelSlot.tsx`
Expected: find the branch in `PanelSlot` (or `PanelStackContainer`) that renders the All Sessions content when the focused panel is the root session list. Read ~40 lines around the match to understand the current component composition.

- [ ] **Step 2: Create `AllSessionsView.tsx`**

Create `apps/electron/src/renderer/components/app-shell/AllSessionsView.tsx` that renders exactly what the root-session panel currently renders. Props should be minimal — everything reads from Jotai atoms — so both mount sites get identical state.

```tsx
import * as React from 'react';
// Re-use existing subcomponents from this directory. Import paths are
// whatever the current inline render path uses (SessionList, SessionSearchHeader,
// LabelTree, etc.) — inspect PanelSlot or PanelStackContainer to see the exact list.
import { SessionList } from './SessionList';
import { SessionSearchHeader } from './SessionSearchHeader';
// … other imports as needed

export interface AllSessionsViewProps {
  /** Variant affects padding/height constraints only. */
  variant?: 'panel' | 'dropdown';
}

export function AllSessionsView({ variant = 'panel' }: AllSessionsViewProps) {
  return (
    <div className={variant === 'dropdown' ? 'h-full flex flex-col' : 'h-full flex flex-col'}>
      <SessionSearchHeader />
      {/* Any intermediate filters/labels that currently render */}
      <div className="flex-1 overflow-auto">
        <SessionList />
      </div>
    </div>
  );
}
```

Fill in the intermediate components by copying the current inline tree from `PanelSlot`/`PanelStackContainer` verbatim.

- [ ] **Step 3: Replace the inline render with `<AllSessionsView variant="panel" />`**

In `PanelSlot.tsx` (or wherever the branch lives), swap the inline JSX for:

```tsx
<AllSessionsView variant="panel" />
```

Add import: `import { AllSessionsView } from './AllSessionsView';`

- [ ] **Step 4: Run the full renderer suite**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline failure count. No new failures. The extraction is a pure refactor.

- [ ] **Step 5: Manual smoke**

`bun run dev`, open the app, confirm the sessions list looks identical to before. Filter, select a session, expand labels — all still work.

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AllSessionsView.tsx \
        apps/electron/src/renderer/components/app-shell/PanelSlot.tsx
git commit -m "refactor(breadcrumbs): extract AllSessionsView for dual mount"
```

---

### Task 10: `AllSessionsDropdownPanel` — Radix Popover wrapper

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/AllSessionsDropdownPanel.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/AllSessionsDropdownPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create the test file:

```tsx
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { AllSessionsDropdownPanel } from '../AllSessionsDropdownPanel';
import { windowWorkspaceIdAtom } from '../../../../atoms/sessions';

describe('AllSessionsDropdownPanel', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
  });

  it('renders no popover content when open is false', () => {
    const { queryByRole } = render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={false} onOpenChange={() => {}} onToggleToPanelMode={() => {}} anchor={<button>Anchor</button>} />
      </Provider>
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders popover content when open is true', () => {
    const { getByText } = render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={true} onOpenChange={() => {}} onToggleToPanelMode={() => {}} anchor={<button>Anchor</button>} />
      </Provider>
    );
    // The header includes "Sessions" as title.
    expect(getByText('Sessions')).toBeTruthy();
  });

  it('clicking the Columns3 toggle button fires onToggleToPanelMode', () => {
    const onToggle = mock(() => {});
    const { getByLabelText } = render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={true} onOpenChange={() => {}} onToggleToPanelMode={onToggle} anchor={<button>Anchor</button>} />
      </Provider>
    );
    fireEvent.click(getByLabelText('Expand to panel'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('auto-closes when active workspace changes', async () => {
    const onOpenChange = mock((_open: boolean) => {});
    render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={true} onOpenChange={onOpenChange} onToggleToPanelMode={() => {}} anchor={<button>Anchor</button>} />
      </Provider>
    );
    store.set(windowWorkspaceIdAtom, 'ws-b');
    // React flush the effect that watches workspace id.
    await Promise.resolve();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/AllSessionsDropdownPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the popover**

Create `apps/electron/src/renderer/components/app-shell/breadcrumb/AllSessionsDropdownPanel.tsx`:

```tsx
import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useAtomValue } from 'jotai';
import { Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AllSessionsView } from '../AllSessionsView';
import { windowWorkspaceIdAtom } from '../../../atoms/sessions';

export interface AllSessionsDropdownPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleToPanelMode: () => void;
  /** The element the popover anchors to — typically the trigger chip. */
  anchor: React.ReactElement;
  /** Popover dimensions; sensible defaults provided. */
  width?: number;
  maxHeight?: number;
}

export function AllSessionsDropdownPanel({
  open,
  onOpenChange,
  onToggleToPanelMode,
  anchor,
  width = 360,
  maxHeight = 640,
}: AllSessionsDropdownPanelProps) {
  const activeWorkspaceId = useAtomValue(windowWorkspaceIdAtom);
  const prevWorkspaceRef = React.useRef(activeWorkspaceId);

  // Auto-close on workspace switch.
  React.useEffect(() => {
    if (prevWorkspaceRef.current !== activeWorkspaceId) {
      prevWorkspaceRef.current = activeWorkspaceId;
      if (open) onOpenChange(false);
    }
  }, [activeWorkspaceId, open, onOpenChange]);

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{anchor}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          sideOffset={8}
          align="start"
          className={cn(
            'rounded-lg border border-border bg-popover shadow-lg overflow-hidden',
            'flex flex-col',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
          style={{ width, maxHeight: `min(${maxHeight}px, 70vh)` }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-sm font-medium">Sessions</span>
            <button
              type="button"
              aria-label="Expand to panel"
              onClick={onToggleToPanelMode}
              className={cn(
                'inline-flex items-center justify-center h-6 w-6 rounded-md',
                'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Body — shared view */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <AllSessionsView variant="dropdown" />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/AllSessionsDropdownPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/breadcrumb/AllSessionsDropdownPanel.tsx \
        apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/AllSessionsDropdownPanel.test.tsx
git commit -m "feat(breadcrumbs): All Sessions dropdown popover with toggle-back button"
```

---

### Task 11: Wire the popover into `WorkspaceBreadcrumb` + context menu for mode toggle

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChipRow.tsx` (wrap first chip in ContextMenu)

Goal: the `onOpenAllSessionsDropdown` prop on `BreadcrumbChipRow` now opens a real popover; the first chip gets a right-click context menu with "Collapse to dropdown" / "Expand to panel" items depending on current mode.

- [ ] **Step 1: Wrap first chip in Radix ContextMenu inside `BreadcrumbChipRow`**

Edit `BreadcrumbChipRow.tsx`. Add imports:

```tsx
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useSetAtom } from 'jotai';
import { toggleAllSessionsModeAtom } from '../../../hooks/useAllSessionsDropdownMode';
```

Inside the map, when `isFirst`, wrap the `BreadcrumbChip` in a context menu:

```tsx
const toggleMode = useSetAtom(toggleAllSessionsModeAtom);

// …inside the map…
const chipEl = (
  <BreadcrumbChip … />
);

return (
  <React.Fragment key={panel.id}>
    {idx > 0 && <span … >·</span>}
    {isFirst ? (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{chipEl}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md"
          >
            <ContextMenu.Item
              onSelect={() => toggleMode()}
              className="flex items-center px-2 py-1.5 rounded-sm text-sm outline-none data-[highlighted]:bg-accent"
            >
              {mode === 'panel' ? 'Collapse to dropdown' : 'Expand to panel'}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    ) : (
      chipEl
    )}
  </React.Fragment>
);
```

- [ ] **Step 2: Add popover state + wire in `WorkspaceBreadcrumb`**

Edit `WorkspaceBreadcrumb.tsx`:

```tsx
import * as React from 'react';
import { useSetAtom } from 'jotai';
import { cn } from '@/lib/utils';
import { formatBreadcrumbText } from './WorkspaceBreadcrumb.helpers';
import { BreadcrumbChipRow } from './breadcrumb/BreadcrumbChipRow';
import { AllSessionsDropdownPanel } from './breadcrumb/AllSessionsDropdownPanel';
import { toggleAllSessionsModeAtom } from '../../hooks/useAllSessionsDropdownMode';
import type { Workspace } from '../../../shared/types';
import type { PanelStackEntry } from '../../atoms/panel-stack';

export { formatBreadcrumbText };

export interface WorkspaceBreadcrumbProps {
  workspace: Workspace | null;
  labelFor: (panel: PanelStackEntry) => string;
}

export function WorkspaceBreadcrumb({ workspace, labelFor }: WorkspaceBreadcrumbProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const toggleMode = useSetAtom(toggleAllSessionsModeAtom);

  const handleToggleToPanel = React.useCallback(() => {
    toggleMode();
    setDropdownOpen(false);
  }, [toggleMode]);

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <span className={cn('max-w-[240px] px-2 py-1 text-sm font-medium truncate shrink-0')}>
        {workspace?.name ?? 'No workspace'}
      </span>
      <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">›</span>
      {/* The dropdown popover anchors to the first chip. We achieve this by
          rendering the popover "around" the chip row, with the anchor being
          an invisible positioner that tracks the first chip's bounding box.
          Simpler alternative: render the popover at the chip row level and
          let Radix anchor to the first chip directly via a ref. We use the
          simpler approach. */}
      <DropdownHost
        open={dropdownOpen}
        onOpenChange={setDropdownOpen}
        onToggleToPanelMode={handleToggleToPanel}
      >
        <BreadcrumbChipRow
          labelFor={labelFor}
          onOpenAllSessionsDropdown={() => setDropdownOpen((o) => !o)}
        />
      </DropdownHost>
    </div>
  );
}

/**
 * Thin wrapper: owns the popover and positions a 1×1 invisible anchor span at
 * the bottom-left of the chip row. Radix anchors its popover to that span,
 * which places the popover below the leftmost chip (where `Sessions ▾` lives
 * when in dropdown mode). If QA finds the popover misaligned, swap to
 * anchoring on a forwarded ref to `BreadcrumbChipRow`'s first chip element.
 */
function DropdownHost({
  open,
  onOpenChange,
  onToggleToPanelMode,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleToPanelMode: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-1 min-w-0 flex-1">
      {children}
      <AllSessionsDropdownPanel
        open={open}
        onOpenChange={onOpenChange}
        onToggleToPanelMode={onToggleToPanelMode}
        anchor={
          <span
            aria-hidden="true"
            className="absolute left-0 bottom-0 w-px h-px pointer-events-none"
          />
        }
      />
    </div>
  );
}
```

- [ ] **Step 3: Update the callsite in `TopBar.tsx` (remove `onOpenAllSessionsDropdown` prop — now owned by `WorkspaceBreadcrumb`)**

The prop is no longer needed at the TopBar level. Strip it.

- [ ] **Step 4: Run tests**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline. All new tests pass.

- [ ] **Step 5: Manual smoke**

`bun run dev`:
- Right-click the first chip → context menu shows "Collapse to dropdown"
- Click it → panel collapses, first chip becomes `Sessions ▾`
- Click `Sessions ▾` → popover opens with sessions list
- Click the `Columns3` icon in popover header → popover closes, panel re-expands
- Switch to another workspace, toggle there independently, switch back → each remembers its own mode

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx \
        apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChipRow.tsx \
        apps/electron/src/renderer/components/app-shell/TopBar.tsx
git commit -m "feat(breadcrumbs): wire popover + right-click toggle to dropdown mode"
```

---

### Task 12: Skip All Sessions in `PanelStackContainer` when dropdown mode

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/PanelStackContainer.tsx`

Goal: when `activeWorkspaceAllSessionsMode === 'dropdown'`, the container renders the panel stack with the first entry (All Sessions) filtered out. The panel data is still present in `panelStackByWorkspaceAtom` — only the render skips it. When the user toggles back to panel mode, the render re-includes it.

- [ ] **Step 1: Read current render loop**

Run: `grep -n "panelStackAtom\|panels.map\|stack.map" apps/electron/src/renderer/components/app-shell/PanelStackContainer.tsx`
Expected: find the `.map` that renders each `PanelSlot`. Record the variable name (likely `panels` or `stack`).

- [ ] **Step 2: Filter All Sessions when dropdown mode**

Add near the top of the component:

```tsx
import { useAtomValue } from 'jotai';
import { activeWorkspaceAllSessionsModeAtom } from '../../hooks/useAllSessionsDropdownMode';
import { ALL_SESSIONS_ROUTE } from '../../atoms/panel-stack';

const mode = useAtomValue(activeWorkspaceAllSessionsModeAtom);
const visibleStack = React.useMemo(
  () => (mode === 'dropdown' ? panels.filter((p) => p.route !== ALL_SESSIONS_ROUTE) : panels),
  [panels, mode],
);
```

Replace the existing `panels.map(...)` with `visibleStack.map(...)`. Also update any references that use the array length for proportion calculations — normalize `visibleStack` proportions locally in the render only (do NOT mutate the atom; that would fight the "preserve state on toggle" decision).

Local normalization example:

```tsx
const totalProportion = visibleStack.reduce((s, p) => s + p.proportion, 0) || 1;
const renderStack = visibleStack.map((p) => ({ ...p, proportion: p.proportion / totalProportion }));
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline.

- [ ] **Step 4: Manual smoke**

`bun run dev`: toggle All Sessions into dropdown mode. Verify the panel column disappears and other panels expand to fill the space. Toggle back: column reappears, state preserved (filter text, scroll position, selected session).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/PanelStackContainer.tsx
git commit -m "feat(breadcrumbs): hide All Sessions panel when in dropdown mode"
```

---

**End of Phase 3.** Dropdown mode is fully functional end-to-end. Per-workspace preference persists. Workspace switch auto-closes popover. Phase 4 is polish.

---

## Phase 4: Polish

### Task 13: `⌘⇧T` reopens last-closed non-root panel

**Files:**
- Modify: `apps/electron/src/renderer/atoms/panel-stack.ts` (add closed-panel LIFO + reopen atom)
- Modify: `apps/electron/src/renderer/hooks/keyboard/` (wherever keyboard shortcuts live — find the existing `⌘W` handler and add `⌘⇧T` next to it)
- Create: `apps/electron/src/renderer/atoms/__tests__/panel-stack-reopen.test.ts`

- [ ] **Step 1: Write the failing test**

Create the test:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createStore } from 'jotai';
import {
  panelStackByWorkspaceAtom,
  focusedPanelIdByWorkspaceAtom,
  closePanelAtom,
  reopenLastClosedPanelAtom,
  ensureWorkspacePanelStackAtom,
  type PanelStackEntry,
} from '../panel-stack';
import { windowWorkspaceIdAtom } from '../sessions';

describe('reopen last-closed panel', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
  });

  it('reopens the last closed non-root panel', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [
        { id: 'p0', route: '/' as PanelStackEntry['route'], proportion: 0.5, panelType: 'session', laneId: 'main' },
        { id: 'p1', route: '/session/s1' as PanelStackEntry['route'], proportion: 0.5, panelType: 'session', laneId: 'main' },
      ],
    });
    store.set(closePanelAtom, 'p1');
    store.set(reopenLastClosedPanelAtom);
    const stack = store.get(panelStackByWorkspaceAtom)['ws-a'];
    expect(stack.some((p) => p.route === '/session/s1')).toBe(true);
  });

  it('does not reopen the root panel', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [{ id: 'p0', route: '/' as PanelStackEntry['route'], proportion: 1, panelType: 'session', laneId: 'main' }],
    });
    // Simulate a close attempt on root (which is a no-op via closePanelAtom once we
    // enforce pinning — but for now verify reopen doesn't pull root from closed stack)
    store.set(reopenLastClosedPanelAtom);
    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(1);
  });

  it('is no-op when no panels have been closed', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [{ id: 'p0', route: '/' as PanelStackEntry['route'], proportion: 1, panelType: 'session', laneId: 'main' }],
    });
    store.set(reopenLastClosedPanelAtom);
    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-reopen.test.ts`
Expected: FAIL — `reopenLastClosedPanelAtom` not exported.

- [ ] **Step 3: Add closed-panels LIFO storage + reopen atom**

Append to `apps/electron/src/renderer/atoms/panel-stack.ts`:

```ts
/**
 * Per-workspace LIFO of recently closed panel routes (not persisted).
 * Capped at 10 entries per workspace.
 */
export const closedPanelRoutesByWorkspaceAtom = atom<Record<string, ViewRoute[]>>({});

const CLOSED_PANEL_CAP = 10;

/** Push a closed route onto the LIFO. No-op if route is the All Sessions root. */
function pushClosedRoute(
  map: Record<string, ViewRoute[]>,
  wsId: string,
  route: ViewRoute,
): Record<string, ViewRoute[]> {
  if (route === ALL_SESSIONS_ROUTE) return map;
  const current = map[wsId] ?? [];
  const next = [route, ...current].slice(0, CLOSED_PANEL_CAP);
  return { ...map, [wsId]: next };
}
```

Modify `closePanelAtom` so that when it removes an entry, it also pushes the route to the LIFO:

```ts
export const closePanelAtom = atom(
  null,
  (get, set, id: string) => {
    const stack = get(panelStackAtom);
    const idx = stack.findIndex(p => p.id === id);
    if (idx === -1) return;
    const removed = stack[idx];
    // No-op on root panel (pinned per Q10.1)
    if (removed.route === ALL_SESSIONS_ROUTE) return;

    const remaining = [...stack.slice(0, idx), ...stack.slice(idx + 1)];
    set(panelStackAtom, normalizeProportions(remaining));

    if (get(focusedPanelIdAtom) === id) {
      const newIdx = Math.min(idx, remaining.length - 1);
      set(focusedPanelIdAtom, remaining[newIdx]?.id ?? null);
    }

    // Record for reopen.
    const wsId = get(windowWorkspaceIdAtom);
    if (wsId) {
      const map = get(closedPanelRoutesByWorkspaceAtom);
      set(closedPanelRoutesByWorkspaceAtom, pushClosedRoute(map, wsId, removed.route));
    }
  }
);

/** Pop the most recently closed route and open it as a new panel. */
export const reopenLastClosedPanelAtom = atom(null, (get, set) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return;
  const map = get(closedPanelRoutesByWorkspaceAtom);
  const queue = map[wsId] ?? [];
  if (queue.length === 0) return;
  const [head, ...rest] = queue;
  set(closedPanelRoutesByWorkspaceAtom, { ...map, [wsId]: rest });
  set(pushPanelAtom, { route: head });
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-reopen.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the keyboard shortcut**

Find the existing `⌘W` handler. Run: `grep -rn "Cmd+W\|meta.*w\|isMacCmd\|Mod+W" apps/electron/src/renderer/hooks/keyboard apps/electron/src/renderer/components`. Add a sibling handler for `⌘⇧T`:

```ts
// where keyboard shortcuts are registered
const reopenLast = useSetAtom(reopenLastClosedPanelAtom);
// register Cmd/Ctrl + Shift + T → reopenLast()
```

Use whatever shortcut-registration API the existing handlers use (don't invent a new library). Import:

```ts
import { reopenLastClosedPanelAtom } from '../atoms/panel-stack';
```

- [ ] **Step 6: Manual smoke**

`bun run dev`: open two session panels, close one, press `⌘⇧T` → panel returns at the end of the stack. Close another, press `⌘⇧T` twice → both return (LIFO order).

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/atoms/panel-stack.ts \
        apps/electron/src/renderer/atoms/__tests__/panel-stack-reopen.test.ts \
        apps/electron/src/renderer/hooks/keyboard/
git commit -m "feat(breadcrumbs): Cmd+Shift+T reopens last closed panel (per workspace)"
```

---

### Task 14: Pinned root — `⌘W` is no-op when focused panel is All Sessions

**Files:**
- Modify: `apps/electron/src/renderer/atoms/panel-stack.ts` (already partly done in Task 13, verify)

The `closePanelAtom` change in Task 13 step 3 already enforces no-op for the root route. Verify with a test.

- [ ] **Step 1: Add a test**

Append to `panel-stack-reopen.test.ts` (or a new `panel-stack-pinned-root.test.ts`):

```ts
it('closePanelAtom is no-op when id points to root route', () => {
  store.set(panelStackByWorkspaceAtom, {
    'ws-a': [{ id: 'p0', route: '/' as PanelStackEntry['route'], proportion: 1, panelType: 'session', laneId: 'main' }],
  });
  store.set(closePanelAtom, 'p0');
  expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/panel-stack-reopen.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/atoms/__tests__/panel-stack-reopen.test.ts
git commit -m "test(panel-stack): verify root panel is non-closable"
```

---

### Task 15: Scroll-anchor preservation across mode toggle

**Files:**
- Create: `apps/electron/src/renderer/atoms/all-sessions-scroll.ts`
- Create: `apps/electron/src/renderer/atoms/__tests__/all-sessions-scroll.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/AllSessionsView.tsx` to record + restore the anchor

SPEC §"Dropdown ↔ panel toggle state preservation": the session nearest the top of the visible scroll area is the anchor; after a mode switch, scroll it into view.

- [ ] **Step 1: Write the failing test**

Create the test:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createStore } from 'jotai';
import {
  allSessionsScrollAnchorByWorkspaceAtom,
  setAllSessionsScrollAnchorAtom,
  activeAllSessionsScrollAnchorAtom,
} from '../all-sessions-scroll';
import { windowWorkspaceIdAtom } from '../sessions';

describe('all-sessions-scroll anchor', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
  });

  it('stores anchor per workspace', () => {
    store.set(setAllSessionsScrollAnchorAtom, 'session-42');
    expect(store.get(allSessionsScrollAnchorByWorkspaceAtom)['ws-a']).toBe('session-42');
  });

  it('active anchor reads from current workspace', () => {
    store.set(setAllSessionsScrollAnchorAtom, 'session-42');
    expect(store.get(activeAllSessionsScrollAnchorAtom)).toBe('session-42');
    store.set(windowWorkspaceIdAtom, 'ws-b');
    expect(store.get(activeAllSessionsScrollAnchorAtom)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/atoms/__tests__/all-sessions-scroll.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement atoms**

Create `apps/electron/src/renderer/atoms/all-sessions-scroll.ts`:

```ts
import { atom } from 'jotai';
import { windowWorkspaceIdAtom } from './sessions';

/** Per-workspace anchor: the id of the session row nearest the top of the visible scroll. */
export const allSessionsScrollAnchorByWorkspaceAtom =
  atom<Record<string, string | null>>({});

/** Derived read for active workspace's anchor. */
export const activeAllSessionsScrollAnchorAtom = atom<string | null>((get) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return null;
  return get(allSessionsScrollAnchorByWorkspaceAtom)[wsId] ?? null;
});

/** Setter for the active workspace's anchor. */
export const setAllSessionsScrollAnchorAtom = atom(null, (get, set, anchorId: string | null) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return;
  const map = get(allSessionsScrollAnchorByWorkspaceAtom);
  set(allSessionsScrollAnchorByWorkspaceAtom, { ...map, [wsId]: anchorId });
});
```

- [ ] **Step 4: Wire anchor capture + restore in `AllSessionsView`**

Edit `AllSessionsView.tsx`. Add:

```tsx
import { useAtomValue, useSetAtom } from 'jotai';
import {
  activeAllSessionsScrollAnchorAtom,
  setAllSessionsScrollAnchorAtom,
} from '../../atoms/all-sessions-scroll';

// inside component:
const anchor = useAtomValue(activeAllSessionsScrollAnchorAtom);
const setAnchor = useSetAtom(setAllSessionsScrollAnchorAtom);
const scrollRef = React.useRef<HTMLDivElement>(null);

// Capture: on scroll, record the id of the topmost visible session row.
const handleScroll = React.useCallback(() => {
  const el = scrollRef.current;
  if (!el) return;
  const rows = el.querySelectorAll<HTMLElement>('[data-session-id]');
  const top = el.getBoundingClientRect().top;
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (r.bottom >= top) {
      setAnchor(row.dataset.sessionId ?? null);
      break;
    }
  }
}, [setAnchor]);

// Restore: on mount, scroll the anchor row into view if present.
React.useEffect(() => {
  if (!anchor) return;
  const el = scrollRef.current?.querySelector<HTMLElement>(`[data-session-id="${anchor}"]`);
  el?.scrollIntoView({ block: 'start', behavior: 'auto' });
}, [anchor]);
```

Attach `ref={scrollRef}` and `onScroll={handleScroll}` to the scrollable container (the element with `overflow-auto` inside `AllSessionsView`).

Ensure `SessionItem` (or whichever row component `SessionList` renders) has `data-session-id={session.id}` on its root element. If it doesn't, add it — that's a one-line change to the existing component and is trivially compatible.

- [ ] **Step 5: Run tests**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline.

- [ ] **Step 6: Manual smoke**

`bun run dev`: scroll halfway down the session list, toggle to dropdown mode → popover opens scrolled to roughly the same session. Toggle back to panel → panel scrolls to the same session.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/atoms/all-sessions-scroll.ts \
        apps/electron/src/renderer/atoms/__tests__/all-sessions-scroll.test.ts \
        apps/electron/src/renderer/components/app-shell/AllSessionsView.tsx \
        apps/electron/src/renderer/components/app-shell/SessionItem.tsx
git commit -m "feat(breadcrumbs): preserve scroll anchor across panel↔dropdown toggle"
```

---

### Task 16: Integration smoke checks

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/integration.test.tsx`

A single integration test exercising the multi-decision behaviors end-to-end.

- [ ] **Step 1: Write the integration test**

Create the test:

```tsx
import { describe, it, expect, beforeEach } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { WorkspaceBreadcrumb } from '../../WorkspaceBreadcrumb';
import {
  panelStackByWorkspaceAtom,
  focusedPanelIdByWorkspaceAtom,
  ALL_SESSIONS_ROUTE,
  type PanelStackEntry,
} from '../../../../atoms/panel-stack';
import { windowWorkspaceIdAtom } from '../../../../atoms/sessions';

function mk(id: string, route: string, type: PanelStackEntry['panelType'] = 'session'): PanelStackEntry {
  return { id, route: route as PanelStackEntry['route'], proportion: 1, panelType: type, laneId: 'main' };
}

describe('Breadcrumbs integration', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
  });

  it('close middle panel → focus slides to previous chip', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [mk('p0', '/' ), mk('p1', '/session/s1'), mk('p2', '/session/s2')],
    });
    store.set(focusedPanelIdByWorkspaceAtom, { 'ws-a': 'p1' });

    const { container } = render(
      <Provider store={store}>
        <WorkspaceBreadcrumb workspace={{ id: 'ws-a', name: 'Test' } as any} labelFor={() => 'X'} />
      </Provider>
    );
    const closeBtn = container.querySelector('button[data-panel-id="p1"] [aria-label="Close panel"]')!;
    fireEvent.click(closeBtn);

    const stack = store.get(panelStackByWorkspaceAtom)['ws-a'];
    expect(stack.map((p) => p.id)).toEqual(['p0', 'p2']);
    expect(store.get(focusedPanelIdByWorkspaceAtom)['ws-a']).toBe('p0');
  });

  it('workspace switch preserves per-workspace panel stacks', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [mk('p0', '/' ), mk('p1', '/session/s1')],
      'ws-b': [mk('q0', '/' )],
    });
    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(2);
    store.set(windowWorkspaceIdAtom, 'ws-b');
    expect(store.get(panelStackByWorkspaceAtom)['ws-b']).toHaveLength(1);
    store.set(windowWorkspaceIdAtom, 'ws-a');
    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/integration.test.tsx`
Expected: PASS.

- [ ] **Step 3: Final full renderer run**

Run: `bun test apps/electron/src/renderer`
Expected: same baseline failure count. Everything from Phase 1–4 passes.

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/breadcrumb/__tests__/integration.test.tsx
git commit -m "test(breadcrumbs): integration coverage for close + workspace-switch"
```

---

### Task 17: Manual QA matrix + visual polish pass

**Files:** none (this is a QA task — record findings in STATE.md at the end)

- [ ] **Step 1: Run the app with these scenarios in order**

1. Single workspace, no panels yet → All Sessions auto-opens (Task 3)
2. Open 1, 3, 7, 12 session panels at window widths 800px, 1280px, 1920px → chips shrink then overflow (visible `…` menu at the narrow/many end)
3. Focused chip always visible — even if it's the oldest — at all widths
4. Rapid toggle panel↔dropdown 10× → no flicker; scroll anchor preserved each time
5. Two workspaces A (panel mode, 3 panels) and B (dropdown mode, 1 panel): switch A→B→A→B→A → each remembers its own layout
6. Very long session name (60+ chars) → chip ellipsis + `title` tooltip shows full name
7. Right-click All Sessions chip → context menu with correct label per current mode
8. `⌘⇧T` reopens last-closed in the correct workspace only
9. `⌘W` on All Sessions chip → no-op (root is pinned)

- [ ] **Step 2: Focus-ring accessibility check**

Tab through breadcrumb chips. Focus ring should be visible on all chips including the focused (filled-pill) one — `ring-offset-background` places the ring outside the pill fill.

- [ ] **Step 3: Run the `polish` and `audit` skills against the breadcrumb**

Invoke the `polish` skill scoped to `apps/electron/src/renderer/components/app-shell/breadcrumb/`. Apply its recommended visual fixes. Then invoke `audit` for accessibility pass.

- [ ] **Step 4: Update STATE.md**

Add an entry under "Last updated" and shift the breadcrumbs initiative from "queue" to "shipped" once the branch merges.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add <any files touched by polish/audit>
git commit -m "polish(breadcrumbs): visual + a11y refinements from polish/audit skills"
```

---

## Finish

Once all tasks pass locally with no new test failures, invoke `superpowers:finishing-a-development-branch` to verify and present merge options.

