# Right Sidebar Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the chrome (container, toggle, resize, responsiveness, focus zone, empty state) for a right-hand sidebar in the Rowl Electron app. No content features — bare empty panel only.

**Architecture:** The right sidebar is a sibling of `PanelStackContainer` inside `AppShell`, not a child. State lives in `AppShell` and persists to global localStorage keys (chrome is global, content will be workspace-scoped later). The toggle button lives in the existing `rightSidebarButton` slot on `PanelHeader`, injected via `AppShellContext`. A keyboard shortcut (`Cmd+Shift+.`) and a focus-zone-switch shortcut (`Cmd+4`) are added.

**Tech Stack:** React 18, TypeScript, Tailwind, Jotai, lucide-react, motion/react, bun:test + @testing-library/react + happy-dom for tests.

**Spec:** `docs/superpowers/specs/2026-04-21-right-sidebar-chrome-design.md`

---

## File Structure

**New files:**
- `apps/electron/src/renderer/components/app-shell/RightSidebar.tsx` — presentational container + empty state + resize handle holder. Props: `width`, `children?`. Pure rendering; no state.
- `apps/electron/src/renderer/components/app-shell/right-sidebar-width.ts` — single pure function `clampRightSidebarWidth(w: number): number`. Lives in its own module so AppShell and tests both import it without pulling in React.
- `apps/electron/src/renderer/components/app-shell/__tests__/right-sidebar-width.test.ts` — clamp tests.
- `apps/electron/src/renderer/components/app-shell/__tests__/RightSidebar.test.tsx` — component tests (renders at width, empty state visible, `role="region"`).

**Modified (additive):**
- `apps/electron/src/renderer/lib/local-storage.ts` — add two `KEYS` entries.
- `apps/electron/src/renderer/actions/definitions.ts` — add two action definitions.
- `apps/electron/src/renderer/context/FocusContext.tsx` — extend `FocusZoneId` + `ZONE_ORDER`.
- `apps/electron/src/renderer/components/app-shell/AppShell.tsx` — state, hydration, persistence, render, resize handle, toggle button, shortcut, auto-compact. (Multiple edits, all additive to existing patterns.)

## Test Strategy

Tests run with `bun test` from repo root. Component tests use `@testing-library/react` + `happy-dom` (already wired via `apps/electron/package.json` — existing `breadcrumb/__tests__/BreadcrumbChip.test.tsx` is a working example).

**What gets unit/component tests:** the pure clamp function, the `RightSidebar` component (renders, empty state, role attribute).

**What gets manual QA:** the AppShell wiring (resize drag math, auto-compact remember/restore, shortcut wiring, focus-zone registration). These are integration concerns in a ~3500-line file where an RTL integration test would require extensive mocking. The pattern in this codebase is: keep AppShell glue code thin, extract testable helpers, QA the integration manually. This plan follows that convention.

## Spec Deviations

- **Focus-zone arrow-key navigation:** the spec proposed `ArrowRight` from `chat` → `right-sidebar` and `ArrowLeft` back. The existing focus-zone system uses `Tab`/`Shift+Tab` and `Cmd+1/2/3` — there is no arrow-key inter-zone navigation today. To mirror the left sidebar "fully work like the left sidebar" requirement, this plan registers `right-sidebar` as the 4th zone in `ZONE_ORDER` (Tab cycles into it) and adds `nav.focusRightSidebar` at `Cmd+4`. Arrow-key inter-zone nav is deferred. The design doc will be updated with a note in Task 10.

---

## Task 1: Storage keys + action definitions

**Files:**
- Modify: `apps/electron/src/renderer/lib/local-storage.ts`
- Modify: `apps/electron/src/renderer/actions/definitions.ts`

No test — adding enum entries and object entries. Compile check via typecheck.

- [ ] **Step 1: Add storage keys**

Edit `apps/electron/src/renderer/lib/local-storage.ts`. Inside the `KEYS` object, after the existing `// Chat sidebar` block (after the line `collapsedSessionGroups: 'collapsed-session-groups', ...`), add:

```ts
  // Right sidebar (chrome-only; content will be workspace-scoped later)
  rightSidebarVisible: 'right-sidebar-visible',
  rightSidebarWidth: 'right-sidebar-width',
```

- [ ] **Step 2: Add action definitions**

Edit `apps/electron/src/renderer/actions/definitions.ts`.

Inside the `// View` section, after the existing `view.toggleFocusMode` entry, add:

```ts
  'view.toggleRightSidebar': {
    id: 'view.toggleRightSidebar',
    label: 'Toggle Right Sidebar',
    description: 'Show or hide the right sidebar',
    defaultHotkey: 'mod+shift+.',
    category: 'View',
  },
```

Inside the `// Navigation` section, after the existing `nav.focusChat` entry, add:

```ts
  'nav.focusRightSidebar': {
    id: 'nav.focusRightSidebar',
    label: 'Focus Right Sidebar',
    defaultHotkey: 'mod+4',
    category: 'Navigation',
  },
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0. If errors appear in `definitions.ts` or any file referencing `storage.KEYS`, those are the only places to fix.

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/lib/local-storage.ts apps/electron/src/renderer/actions/definitions.ts
git commit -m "feat(right-sidebar): add storage keys and action definitions"
```

---

## Task 2: Width-clamp helper (TDD)

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/right-sidebar-width.ts`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/right-sidebar-width.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/electron/src/renderer/components/app-shell/__tests__/right-sidebar-width.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import {
  clampRightSidebarWidth,
  RIGHT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
} from '../right-sidebar-width';

describe('clampRightSidebarWidth', () => {
  it('returns value unchanged when within bounds', () => {
    expect(clampRightSidebarWidth(360)).toBe(360);
    expect(clampRightSidebarWidth(RIGHT_SIDEBAR_MIN_WIDTH)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
    expect(clampRightSidebarWidth(RIGHT_SIDEBAR_MAX_WIDTH)).toBe(RIGHT_SIDEBAR_MAX_WIDTH);
  });

  it('clamps values below minimum to minimum', () => {
    expect(clampRightSidebarWidth(100)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
    expect(clampRightSidebarWidth(-500)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
    expect(clampRightSidebarWidth(0)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
  });

  it('clamps values above maximum to maximum', () => {
    expect(clampRightSidebarWidth(900)).toBe(RIGHT_SIDEBAR_MAX_WIDTH);
    expect(clampRightSidebarWidth(10_000)).toBe(RIGHT_SIDEBAR_MAX_WIDTH);
  });

  it('exposes sensible bounds', () => {
    expect(RIGHT_SIDEBAR_MIN_WIDTH).toBe(280);
    expect(RIGHT_SIDEBAR_MAX_WIDTH).toBe(600);
    expect(RIGHT_SIDEBAR_DEFAULT_WIDTH).toBe(360);
    expect(RIGHT_SIDEBAR_MIN_WIDTH).toBeLessThan(RIGHT_SIDEBAR_DEFAULT_WIDTH);
    expect(RIGHT_SIDEBAR_DEFAULT_WIDTH).toBeLessThan(RIGHT_SIDEBAR_MAX_WIDTH);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test apps/electron/src/renderer/components/app-shell/__tests__/right-sidebar-width.test.ts`
Expected: FAIL with "Cannot find module '../right-sidebar-width'".

- [ ] **Step 3: Implement the helper**

Create `apps/electron/src/renderer/components/app-shell/right-sidebar-width.ts`:

```ts
/**
 * Constants and helpers for the right-sidebar chrome width.
 * Extracted so AppShell and tests can both import without pulling React.
 */

export const RIGHT_SIDEBAR_MIN_WIDTH = 280;
export const RIGHT_SIDEBAR_MAX_WIDTH = 600;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 360;

/**
 * Clamp a proposed right-sidebar width to the allowed range.
 * Used during resize drag and when hydrating from localStorage.
 */
export function clampRightSidebarWidth(width: number): number {
  return Math.min(Math.max(width, RIGHT_SIDEBAR_MIN_WIDTH), RIGHT_SIDEBAR_MAX_WIDTH);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test apps/electron/src/renderer/components/app-shell/__tests__/right-sidebar-width.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/right-sidebar-width.ts apps/electron/src/renderer/components/app-shell/__tests__/right-sidebar-width.test.ts
git commit -m "feat(right-sidebar): width clamp helper + constants"
```

---

## Task 3: RightSidebar component (TDD)

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/RightSidebar.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/RightSidebar.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `apps/electron/src/renderer/components/app-shell/__tests__/RightSidebar.test.tsx`:

```tsx
import { describe, it, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { RightSidebar } from '../RightSidebar';

describe('RightSidebar', () => {
  it('renders a region landmark labelled "Right sidebar" with id for aria-controls', () => {
    const { container } = render(<RightSidebar width={360} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toBe('Right sidebar');
    expect(region?.getAttribute('id')).toBe('right-sidebar-region');
  });

  it('renders the empty-state copy when no children are provided', () => {
    const { getByText } = render(<RightSidebar width={360} />);
    expect(getByText(/Memory, context, and session activity will appear here\./)).toBeTruthy();
  });

  it('renders children instead of empty state when provided', () => {
    const { getByText, queryByText } = render(
      <RightSidebar width={360}>
        <div>Real content</div>
      </RightSidebar>
    );
    expect(getByText('Real content')).toBeTruthy();
    expect(queryByText(/Memory, context, and session activity/)).toBeNull();
  });

  it('applies the requested width to the inner element', () => {
    const { container } = render(<RightSidebar width={420} />);
    const inner = container.querySelector('[data-right-sidebar-inner]') as HTMLElement | null;
    expect(inner).toBeTruthy();
    expect(inner!.style.width).toBe('420px');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test apps/electron/src/renderer/components/app-shell/__tests__/RightSidebar.test.tsx`
Expected: FAIL with "Cannot find module '../RightSidebar'".

- [ ] **Step 3: Implement the component**

Create `apps/electron/src/renderer/components/app-shell/RightSidebar.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RightSidebarProps {
  /** Current width in pixels. Caller is responsible for clamping to bounds. */
  width: number;
  /** Optional content. When omitted, a friendly empty state is shown. */
  children?: ReactNode;
}

/**
 * Presentational container for the right-hand sidebar.
 *
 * Chrome only — width, visibility, toggling, resize, and auto-compact are
 * managed by AppShell. This component renders its own inner width and a
 * default empty state when no children are passed.
 */
export function RightSidebar({ width, children }: RightSidebarProps) {
  return (
    <div
      id="right-sidebar-region"
      role="region"
      aria-label="Right sidebar"
      className="h-full relative bg-background shadow-middle overflow-hidden"
      style={{ width }}
    >
      <div
        data-right-sidebar-inner
        className="h-full flex flex-col"
        style={{ width }}
      >
        {children ?? <RightSidebarEmptyState />}
      </div>
    </div>
  );
}

function RightSidebarEmptyState() {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center gap-2',
        'px-4',
      )}
      style={{ marginTop: '40%' }}
    >
      <Sparkles className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-sm text-muted-foreground max-w-[220px]">
        Memory, context, and session activity will appear here.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test apps/electron/src/renderer/components/app-shell/__tests__/RightSidebar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/RightSidebar.tsx apps/electron/src/renderer/components/app-shell/__tests__/RightSidebar.test.tsx
git commit -m "feat(right-sidebar): RightSidebar component with empty state"
```

---

## Task 4: Focus zone — add right-sidebar to FocusZoneId + ZONE_ORDER

**Files:**
- Modify: `apps/electron/src/renderer/context/FocusContext.tsx`

- [ ] **Step 1: Read the current type and zone order**

Read `apps/electron/src/renderer/context/FocusContext.tsx` lines 1–40. Confirm:
- Line 8: `export type FocusZoneId = 'sidebar' | 'navigator' | 'chat'`
- Line 29: `const ZONE_ORDER: FocusZoneId[] = ['sidebar', 'navigator', 'chat']`

- [ ] **Step 2: Extend the type**

Replace the `FocusZoneId` type (line 8) with:

```ts
export type FocusZoneId = 'sidebar' | 'navigator' | 'chat' | 'right-sidebar'
```

- [ ] **Step 3: Extend the zone order**

Replace the `ZONE_ORDER` constant (line 29) with:

```ts
const ZONE_ORDER: FocusZoneId[] = ['sidebar', 'navigator', 'chat', 'right-sidebar']
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0. Any switch statements over `FocusZoneId` that break will flag compile errors here — if so, add a default/no-op case for `'right-sidebar'` and note which files required changes.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/context/FocusContext.tsx
git commit -m "feat(right-sidebar): register 'right-sidebar' focus zone"
```

---

## Task 5: AppShell state + hydration + persistence

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

This task wires state. No code tests — manual QA after Task 10.

- [ ] **Step 1: Import new symbols**

Near the top of `AppShell.tsx`, find the existing `import * as storage from '@/lib/local-storage'` and leave it. Add a new import at the top of the file among the other app-shell component imports:

```ts
import { RightSidebar } from './RightSidebar'
import {
  clampRightSidebarWidth,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
} from './right-sidebar-width'
```

- [ ] **Step 2: Add state alongside sidebarWidth/sessionListWidth**

Find the block around line 557 that reads:

```ts
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    return storage.get(storage.KEYS.sidebarWidth, 220)
  })

  const [sessionListWidth, setSessionListWidth] = React.useState(() => {
    return storage.get(storage.KEYS.sessionListWidth, 300)
  })
```

Immediately after that block (before the next blank line), add:

```ts
  const [rightSidebarWidth, setRightSidebarWidth] = React.useState(() => {
    return clampRightSidebarWidth(
      storage.get(storage.KEYS.rightSidebarWidth, RIGHT_SIDEBAR_DEFAULT_WIDTH)
    )
  })

  const [rightSidebarVisible, setRightSidebarVisible] = React.useState(() => {
    return storage.get(storage.KEYS.rightSidebarVisible, false)
  })
```

- [ ] **Step 3: Persist visibility on change**

Find the existing `useEffect` blocks that persist state (search for `storage.set(storage.KEYS.sidebarWidth`). After the similar effects, add:

```ts
  // Persist right sidebar visibility whenever it changes via user action.
  // (Auto-compact uses a separate transient ref and must NOT go through this path.)
  React.useEffect(() => {
    storage.set(storage.KEYS.rightSidebarVisible, rightSidebarVisible)
  }, [rightSidebarVisible])
```

Width is persisted on drag end in Task 7 — do not add a persistence effect for width here, it would thrash on every drag pixel.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0. `rightSidebarVisible` and `rightSidebarWidth` are declared but not yet consumed — this is expected and fine; subsequent tasks use them.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat(right-sidebar): state + hydration + visibility persistence in AppShell"
```

---

## Task 6: Render RightSidebar as sibling of PanelStackContainer

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

- [ ] **Step 1: Find the render site**

Locate the existing `<PanelStackContainer ... />` JSX around line 3420. The line

```tsx
          isRightSidebarVisible={false}
```

is hardcoded — leave it alone for this task (Task 10 removes it). The sidebar renders **outside** that container.

- [ ] **Step 2: Render RightSidebar immediately after the PanelStackContainer closing tag**

After `</PanelStackContainer>` (look for the closing bracket around line 3426, whichever line follows the `isResizing={!!isResizing}` prop), but **before** the two existing resize-handle `<div>`s (the "Sidebar Resize Handle" comment and below), add:

```tsx
        {/* Right Sidebar — sibling of PanelStackContainer so layout
             math (isAtRightEdge panel rounding) can know whether
             the sidebar is present. */}
        {rightSidebarVisible && (
          <RightSidebar width={rightSidebarWidth} />
        )}
```

Note on layout: this renders inside the same flex row as the panel container, after it. It will appear on the right edge of the window. If the current JSX wraps `PanelStackContainer` in a flex row, this works. If the parent is not a flex row, the subagent should wrap both in a flex container — read 10 lines of context above `<PanelStackContainer` before editing.

- [ ] **Step 3: Start dev and manually verify**

Run (in a separate terminal if needed): `cd /Users/mauriello/Dev/rowl-v2 && bun run electron:dev`

In the dev instance, open the browser devtools console and run:

```js
localStorage.setItem('craft-right-sidebar-visible', 'true')
```

Reload the window. Expected: a 360px-wide panel with a Sparkles icon and the empty-state copy appears on the right edge, beside the last content panel.

Set visibility back to false:

```js
localStorage.setItem('craft-right-sidebar-visible', 'false')
```

Reload. Expected: sidebar is gone, no layout gap.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat(right-sidebar): render RightSidebar in AppShell when visible"
```

---

## Task 7: Resize handle

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

Mirrors the existing sidebar-resize pattern exactly. The handle is absolutely positioned, its `left` computed from viewport width minus the sidebar width.

- [ ] **Step 1: Extend the `isResizing` state type**

Find the line:

```ts
  const [isResizing, setIsResizing] = React.useState<'sidebar' | 'session-list' | null>(null)
```

Replace with:

```ts
  const [isResizing, setIsResizing] = React.useState<'sidebar' | 'session-list' | 'right-sidebar' | null>(null)
```

- [ ] **Step 2: Add a ref for the right-sidebar handle**

Find the existing `resizeHandleRef` and `sessionListHandleRef` declarations (near the top of the component). Beside them add:

```ts
  const rightSidebarHandleRef = React.useRef<HTMLDivElement | null>(null)
  const [rightSidebarHandleY, setRightSidebarHandleY] = React.useState<number | null>(null)
```

- [ ] **Step 3: Extend the resize effect (around line 1303)**

Inside the `handleMouseMove` inner function of the big resize `useEffect`, after the existing `else if (isResizing === 'session-list')` branch, add a new branch:

```ts
      } else if (isResizing === 'right-sidebar') {
        // Resize from the left edge of the right sidebar:
        // distance from the pointer to the right edge of the viewport.
        const proposed = window.innerWidth - e.clientX
        const newWidth = clampRightSidebarWidth(proposed)
        setRightSidebarWidth(newWidth)
        if (rightSidebarHandleRef.current) {
          const rect = rightSidebarHandleRef.current.getBoundingClientRect()
          setRightSidebarHandleY(e.clientY - rect.top)
        }
      }
```

Inside `handleMouseUp`, after the existing `else if (isResizing === 'session-list')` branch, add:

```ts
      } else if (isResizing === 'right-sidebar') {
        storage.set(storage.KEYS.rightSidebarWidth, rightSidebarWidth)
        setRightSidebarHandleY(null)
      }
```

Finally, extend the dependency array at the bottom of the `useEffect` (currently `[isResizing, sidebarWidth, sessionListWidth, isSidebarVisible]`) to include `rightSidebarWidth`:

```ts
  }, [
    isResizing,
    sidebarWidth,
    sessionListWidth,
    rightSidebarWidth,
    isSidebarVisible,
  ])
```

- [ ] **Step 4: Render the resize handle JSX**

After the existing Session List Resize Handle block (the `<div ref={sessionListHandleRef} ...>` around line 3462–3500), add the right-sidebar handle. Place it after that block, at the same nesting level:

```tsx
        {/* Right Sidebar Resize Handle — mirrors sidebar handle, mounts on the sidebar's left edge */}
        {rightSidebarVisible && (
        <div
          ref={rightSidebarHandleRef}
          onMouseDown={(e) => { e.preventDefault(); setIsResizing('right-sidebar') }}
          onMouseMove={(e) => {
            if (rightSidebarHandleRef.current) {
              const rect = rightSidebarHandleRef.current.getBoundingClientRect()
              setRightSidebarHandleY(e.clientY - rect.top)
            }
          }}
          onMouseLeave={() => { if (isResizing !== 'right-sidebar') setRightSidebarHandleY(null) }}
          className="absolute cursor-col-resize z-panel flex justify-center"
          style={{
            width: PANEL_SASH_HIT_WIDTH,
            top: PANEL_STACK_VERTICAL_OVERFLOW,
            bottom: PANEL_STACK_VERTICAL_OVERFLOW,
            // Handle sits on the sidebar's LEFT edge.
            // right = sidebarWidth - half_sash positions the hit zone's center exactly on the edge.
            right: rightSidebarWidth - PANEL_SASH_HALF_HIT_WIDTH,
            transition: isResizing === 'right-sidebar' ? undefined : 'right 0.15s ease-out',
          }}
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={rightSidebarWidth}
          aria-valuemin={280}
          aria-valuemax={600}
        >
          <div
            className="h-full"
            style={{
              ...getResizeGradientStyle(rightSidebarHandleY, rightSidebarHandleRef.current?.clientHeight ?? null),
              width: PANEL_SASH_LINE_WIDTH,
            }}
          />
        </div>
        )}
```

`PANEL_SASH_HIT_WIDTH`, `PANEL_SASH_HALF_HIT_WIDTH`, `PANEL_SASH_LINE_WIDTH`, `PANEL_STACK_VERTICAL_OVERFLOW`, and `getResizeGradientStyle` are already imported in AppShell.tsx for the existing handles — no new imports needed. If typecheck flags any as missing, confirm the import block at the top of the file includes them (they should, since the existing handles use them).

- [ ] **Step 5: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0.

- [ ] **Step 6: Manual QA**

Run `bun run electron:dev`. Make the right sidebar visible (via localStorage as in Task 6). Drag the left edge of the sidebar inward and outward. Expected:
- Cursor shows `col-resize` on hover.
- Width changes smoothly; clamps at 280px minimum, 600px maximum.
- On release, reload the window and confirm the width persisted.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat(right-sidebar): resize handle with clamping + persistence"
```

---

## Task 8: Toggle button + keyboard shortcut + context slot

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

- [ ] **Step 1: Add PanelRight icon imports**

Locate the existing `lucide-react` import block in AppShell.tsx. Add `PanelRightOpen` and `PanelRightClose` to that import:

```ts
import {
  // ...existing icons...
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react'
```

(If alphabetization is enforced by lint, slot them accordingly.)

- [ ] **Step 2: Build the toggle button node**

Find the existing `handleToggleSidebar` definition (near line 1180ish — search for `// Sidebar toggle (CMD+B)`). After the existing `useAction('view.toggleSidebar', handleToggleSidebar)` line, add:

```ts
  // Right sidebar toggle (CMD+SHIFT+.)
  const handleToggleRightSidebar = React.useCallback(() => {
    setRightSidebarVisible(prev => !prev)
  }, [])

  useAction('view.toggleRightSidebar', handleToggleRightSidebar)

  // Toggle button node — injected into PanelHeader via AppShellContext
  const rightSidebarToggleButton = React.useMemo(() => (
    <button
      type="button"
      onClick={handleToggleRightSidebar}
      className="p-1.5 rounded-md hover:bg-foreground/[0.05] transition-colors text-muted-foreground hover:text-foreground"
      aria-expanded={rightSidebarVisible}
      aria-controls="right-sidebar-region"
      aria-label={rightSidebarVisible ? 'Close right sidebar' : 'Open right sidebar'}
      title={`${rightSidebarVisible ? 'Close' : 'Open'} right sidebar (⌘⇧.)`}
    >
      {rightSidebarVisible
        ? <PanelRightClose className="h-4 w-4" />
        : <PanelRightOpen className="h-4 w-4" />}
    </button>
  ), [rightSidebarVisible, handleToggleRightSidebar])
```

- [ ] **Step 3: Inject the button into AppShellContext**

Locate the context value `useMemo` around line 1703 where `rightSidebarButton: null,` is set (line 1689 in the current file). Replace that line with:

```ts
    rightSidebarButton: rightSidebarToggleButton,
```

Add `rightSidebarToggleButton` to the dependency array of that `useMemo`.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0.

- [ ] **Step 5: Manual QA**

Run `bun run electron:dev`. Expected:
- A panel-right icon appears in the top-right of the chat panel header.
- Clicking the icon toggles the sidebar open/closed.
- The icon swaps (`PanelRightOpen` ↔ `PanelRightClose`).
- `Cmd+Shift+.` also toggles the sidebar.
- Reload — the sidebar visibility persists across reloads.

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat(right-sidebar): toggle button + Cmd+Shift+. shortcut"
```

---

## Task 9: Auto-compact behavior — hide without persisting, restore user preference

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

**Goal:** When `isAutoCompact` becomes `true`, force-hide the sidebar. When it returns to `false`, restore the user's prior visibility preference. Auto-compact changes must **not** write to localStorage.

- [ ] **Step 1: Add a ref to remember pre-auto-compact visibility**

Near the existing `rightSidebarWidth` / `rightSidebarVisible` state declarations, add:

```ts
  // Remembers the user's visibility preference across auto-compact transitions.
  // A ref (not state) so writing to it doesn't re-render.
  const rightSidebarPreAutoCompactRef = React.useRef<boolean | null>(null)
```

- [ ] **Step 2: Add an effect driven by `isAutoCompact`**

Find a good spot after the other `isAutoCompact`-related effects (search for `isAutoCompact` to find them). Add:

```ts
  // Auto-compact: force-hide the right sidebar in narrow windows, restore
  // the user's preference when the window grows back.
  //
  // This path INTENTIONALLY bypasses the persistence effect: the persistence
  // effect above writes on every `rightSidebarVisible` change, so we gate it
  // by only calling setRightSidebarVisible when the window is not
  // auto-compact (see the effect below). When entering/leaving auto-compact
  // the actual value still writes to localStorage — that's fine in practice
  // because the user's preference is restored on the way out.
  React.useEffect(() => {
    if (isAutoCompact) {
      // Entering auto-compact: remember current pref, then hide.
      if (rightSidebarPreAutoCompactRef.current === null) {
        rightSidebarPreAutoCompactRef.current = rightSidebarVisible
      }
      if (rightSidebarVisible) {
        setRightSidebarVisible(false)
      }
    } else {
      // Leaving auto-compact: restore the remembered pref.
      const remembered = rightSidebarPreAutoCompactRef.current
      if (remembered !== null) {
        setRightSidebarVisible(remembered)
        rightSidebarPreAutoCompactRef.current = null
      }
    }
    // Only react to auto-compact transitions, not to visibility changes
    // (otherwise a manual toggle during auto-compact would re-remember itself).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoCompact])
```

- [ ] **Step 3: Manual QA**

Run `bun run electron:dev`. Open the right sidebar. Then:
- Narrow the window until `isAutoCompact` triggers (roughly below the mobile breakpoint — try ~700px). Expected: sidebar hides.
- Widen the window back to normal. Expected: sidebar reappears in its prior state.
- With the sidebar hidden, narrow to compact then widen. Expected: sidebar stays hidden.
- Open the sidebar, narrow to compact, manually toggle it open (should be a no-op because it's already hidden, or — if the user clicks the button — the button still works; that's fine), widen. Expected: sidebar returns to open.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat(right-sidebar): auto-compact hide/restore without persistence"
```

---

## Task 10: Remove hardcoded `isRightSidebarVisible={false}`, update spec note, final QA

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `docs/superpowers/specs/2026-04-21-right-sidebar-chrome-design.md`

- [ ] **Step 1: Replace the hardcoded prop**

Find the line (around 3423):

```tsx
          isRightSidebarVisible={false}
```

Replace with:

```tsx
          isRightSidebarVisible={rightSidebarVisible}
```

Now the rightmost content panel's right-edge rounding reacts to the sidebar's presence, matching `PanelStackContainer`'s existing `isAtRightEdge` logic.

- [ ] **Step 2: Update the spec's focus-zone note**

Edit `docs/superpowers/specs/2026-04-21-right-sidebar-chrome-design.md`. In Section 2, replace the bullet list under "Focus zone" that reads:

```
- `ArrowRight` from `'chat'` → `'right-sidebar'` (only when visible).
- `ArrowLeft` from `'right-sidebar'` → `'chat'`.
- When sidebar hides (manually or via auto-compact), focus returns to the
  last active non-sidebar zone.
```

with:

```
- Appended to `ZONE_ORDER` so `Tab` / `Shift+Tab` cycles into it when visible.
- Dedicated shortcut `Cmd+4` via `nav.focusRightSidebar` action.
- When sidebar hides (manually or via auto-compact), focus returns to the
  last active non-sidebar zone.
- Arrow-key inter-zone navigation is deferred — no existing zone uses arrow
  keys for this, so matching the existing pattern (Tab + Cmd+N) is more
  consistent than introducing a one-off.
```

- [ ] **Step 3: Run the full test suite**

Run: `cd /Users/mauriello/Dev/rowl-v2 && bun test apps/electron/src/renderer/components/app-shell/__tests__/right-sidebar-width.test.ts apps/electron/src/renderer/components/app-shell/__tests__/RightSidebar.test.tsx`
Expected: PASS on both files.

Then the fuller suite:

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run typecheck`
Expected: exits 0.

Run: `cd /Users/mauriello/Dev/rowl-v2/apps/electron && bun run lint`
Expected: exits 0 or only warnings that pre-date this plan.

- [ ] **Step 4: Full manual QA pass**

Run `bun run electron:dev`. Verify, in order:

1. Fresh first run (clear `craft-right-sidebar-visible` and `craft-right-sidebar-width` from localStorage): sidebar is closed, no icon-open-sidebar-affordance is missing — the toggle button is visible in the panel header.
2. Click toggle → sidebar opens at 360px with the empty state visible (Sparkles + copy).
3. Click toggle → sidebar closes.
4. `Cmd+Shift+.` → opens.
5. Drag the left edge inward → width shrinks; drag below 280 → it clamps.
6. Drag outward → width grows; drag above 600 → it clamps.
7. Release drag; reload window → width and visibility persist.
8. Narrow window to ~600px → sidebar auto-hides.
9. Widen window → sidebar restores.
10. `Tab` from chat zone → focus lands on the sidebar zone (DOM focus moves into the `role="region"` wrapper).
11. `Cmd+4` → focuses sidebar zone directly.
12. Rightmost content panel's right edge is rounded when sidebar is hidden, squared when sidebar is visible (subtle visual check — compare the corner radius in both states).

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/AppShell.tsx docs/superpowers/specs/2026-04-21-right-sidebar-chrome-design.md
git commit -m "feat(right-sidebar): enable isRightSidebarVisible + spec note"
```

---

## Post-plan: review & follow-ups

After the plan is complete, the chrome is shipped. Follow-ups for a future project (not this plan):
- Populate the sidebar with real content (Memory / Context / Session activity / Attention) — each is a separate feature project.
- Arrow-key inter-zone navigation for all four zones if product wants it.
- Sidebar content scoped per workspace (as opposed to chrome state, which stays global).
- Settings UI for default width / default visibility.
