# Multi-Panel Breadcrumbs + All Sessions Panel↔Dropdown Toggle — Design Spec

**Initiative:** Second UI polish feature following `workspace-rail` (shipped 2026-04-20). Independent from sub-project #2 (Paperclip organizing layer) and sub-project #3 (planner/executor). Separable UI chrome change that can land on its own.
**Branch:** `breadcrumbs-panel-dropdown-toggle` (to be created from `main`)
**Date:** 2026-04-20
**Builds on:** `WorkspaceBreadcrumb.tsx`, `panelStackAtom`, `PanelStackContainer.tsx` (all landed in workspace-rail)

---

## Goal

Extend the topbar breadcrumb from its current single-session form (`{Workspace} › {Session}`) to a full multi-panel view (`{Workspace} › {Panel A} · {Panel B} · {Panel C} …`), and let the user collapse the All Sessions panel into a dropdown anchored in the topbar so it stops consuming horizontal shell real estate when it's not needed.

**Success:**
- A user with four panels open (All Sessions + two sessions + a source, say) can see all four in the topbar at a glance, click any chip to focus that panel, and tell which is currently focused without moving their eyes to the shell.
- A user who prefers a minimal layout for a given workspace can collapse the All Sessions panel into a topbar chevron trigger and reclaim ~220px of shell width. Their preference persists per workspace.
- Toggling between panel and dropdown modes preserves state (scroll position, filter text, selected-session highlight, expanded label groups) so the two modes feel like two views of the same thing.

---

## Non-goals (out of scope for v1)

- Drag-to-reorder chips in the breadcrumb row. Panel order follows creation/insertion order as it does today; reordering is a separate ergonomics improvement.
- Detaching other panels (sources, settings, skills) into dropdown mode. Only All Sessions gets the panel↔dropdown toggle in v1 — it's the obvious root/navigator. If the pattern works we can generalize later.
- "Recently closed panels" history surface. A simple `⌘⇧T` reopens last-closed is enough; no dedicated list in v1.
- Cross-machine sync of the per-workspace dropdown preference. Local-only via `preferences.json`.
- Animations between panel ↔ dropdown toggle (fade, slide, size-morph). v1 uses a simple crossfade via existing motion primitives; bespoke choreography is v2.
- Splitting the topbar into rows when chips overflow. We do shrink-then-`…`-menu instead (see Q6 decision).
- Customizing the chevron glyph or chip icon set. Use `lucide-react` defaults.

---

## Scope overview

```
Before (today, workspace-rail merged)                 After (v1 of this spec)
┌────────────────────────────────────────────┐       ┌────────────────────────────────────────────┐
│ TopBar [Rowl] WS › Session                 │       │ TopBar [Rowl] WS › [📄 Sessions][💬 A][💬 B] │
├────┬───────────┬────────────────┬──────────┤       ├────┬───────────┬────────────────┬──────────┤
│Rail│AllSessions│  Focused panel │ Sidebar  │       │Rail│AllSessions│ Focused  Other │ Sidebar  │
│    │  (panel)  │                │          │       │    │  (panel)  │  panel   panel │          │
│    │           │                │          │       │    │    OR     │                │          │
│    │           │                │          │       │    │ [Sess ▾]  │ ← collapsed    │          │
└────┴───────────┴────────────────┴──────────┘       └────┴───────────┴────────────────┴──────────┘
```

Nothing gets removed; one component grows considerably and one new module appears:

- **Modified (heavy):** `WorkspaceBreadcrumb.tsx` — grows from ~51 lines into a chip row with overflow handling
- **Modified (light):** `panelStackAtom` — gains per-workspace partitioning; adds `allSessionsDropdownModeByWorkspaceAtom`
- **Added:** `AllSessionsDropdownPanel.tsx` — renders the All Sessions content inside a topbar-anchored popover
- **Added:** `useBreadcrumbOverflow.ts` — measures chip widths and computes which get hidden into the `…` menu
- **Added:** preferences bridge field `allSessionsDropdownModeByWorkspace: Record<string, 'panel' | 'dropdown'>`

---

## Decisions locked during brainstorm (2026-04-20)

| # | Decision | Chosen option |
|---|---|---|
| Q1 | Breadcrumb visual | Named chips separated by `·` middot |
| Q2 | Dropdown location | Topbar-anchored (trigger lives in the chip row) |
| Q3 | Trigger shape | The All Sessions chip itself becomes a chevron trigger (`Sessions ▾`) when in dropdown mode |
| Q4 | State on toggle | Preserve scroll, filter text, selected-session highlight, expanded label groups. Scroll adapts to keep focused/selected row visible across the viewport-size change. |
| Q5 | Persistence scope of dropdown preference | Per workspace |
| Q6 | Overflow behavior | Hybrid: first shrink chip max-width (140px → 80px), then collapse oldest non-focused chips into a `…` menu. Focused chip always visible. |
| Q7 | Icons in chips | Icon + name, using `lucide-react` glyphs per `panelType`. (Provisional — can be dropped at implementation time if visually crowded.) |
| Q8.1 | Keyboard shortcut to toggle panel↔dropdown | None dedicated (UI only) |
| Q8.2 | Focus behavior on chip close | Focus slides to the previous chip (standard tab-close behavior) |
| Q9 | Workspace switching | Per-workspace panel stacks (`{[workspaceId]: PanelStackEntry[]}`). Dropdown auto-closes on workspace switch. |
| Q10.1 | Closable root chip | No — All Sessions is pinned. `⌘W` on it is a no-op. |
| Q10.2 | Root chip position in dropdown mode | First (leftmost) in the chip row, same as panel mode |
| Q11.1 | Chip `×` visibility | Hover/focus only |
| Q11.2 | Focused vs unfocused styling | Focused = filled pill (`bg-accent text-foreground`); unfocused = transparent + `text-muted-foreground` |
| Q11.3 | Chip separator | Middot `·` |
| Q11.4 | Reopen closed panel | `⌘⇧T` opens last-closed non-root panel; no dedicated "recently closed" UI |

---

## Architecture

### Data model changes

Today `panelStackAtom: PanelStackEntry[]` is a single global array. It needs to become per-workspace to support Q9 (each workspace remembers its own open panels).

Two approaches considered:

1. **Inline in the existing atom** — change the atom's value type to `Record<workspaceId, PanelStackEntry[]>` and update every read/write call-site.
2. **Derived pattern** — keep `panelStackAtom` as the "active workspace's stack" façade, back it with a `panelStackByWorkspaceAtom: Record<workspaceId, PanelStackEntry[]>` storage atom, and swap the active slice on workspace switch.

Approach **2** wins. It keeps the ~20 existing read sites (`panelCountAtom`, `focusedPanelIndexAtom`, `focusedPanelRouteAtom`, etc.) untouched — they still read `panelStackAtom` as a flat array. Only the setters and the workspace-switch effect need to be aware of the map.

```ts
// New storage atom
export const panelStackByWorkspaceAtom = atom<Record<string, PanelStackEntry[]>>({})
export const focusedPanelIdByWorkspaceAtom = atom<Record<string, string | null>>({})

// panelStackAtom becomes derived read / write
export const panelStackAtom = atom(
  (get) => {
    const wsId = get(activeWorkspaceIdAtom)
    return wsId ? (get(panelStackByWorkspaceAtom)[wsId] ?? []) : []
  },
  (get, set, next: PanelStackEntry[]) => {
    const wsId = get(activeWorkspaceIdAtom)
    if (!wsId) return
    const map = get(panelStackByWorkspaceAtom)
    set(panelStackByWorkspaceAtom, { ...map, [wsId]: next })
  },
)

// focusedPanelIdAtom becomes derived similarly
```

Trade-off: the `activeWorkspaceIdAtom` dependency means every panel-stack read re-runs when workspace changes. That's desired — it's the whole point of Q9 — and Jotai handles it cheaply via its dependency graph.

### Dropdown mode storage

```ts
// New atom, persisted via preferences.json
export const allSessionsDropdownModeByWorkspaceAtom = atom<Record<string, 'panel' | 'dropdown'>>({})

// Derived: mode for the active workspace (default 'panel')
export const activeWorkspaceAllSessionsModeAtom = atom(
  (get) => {
    const wsId = get(activeWorkspaceIdAtom)
    if (!wsId) return 'panel' as const
    return get(allSessionsDropdownModeByWorkspaceAtom)[wsId] ?? 'panel'
  },
)
```

Persistence: extend the existing `preferences.json` schema with a new optional field:

```ts
interface AppPreferences {
  // existing fields …
  workspaceRailOrder?: string[]
  allSessionsDropdownModeByWorkspace?: Record<string, 'panel' | 'dropdown'>
}
```

IPC hydration on boot, write-through on toggle — same pattern as `workspaceRailOrder`.

### Component tree

```
AppShell (existing)
 ├─ TopBar (existing, mostly unchanged)
 │   └─ WorkspaceBreadcrumb (existing, heavily refactored)
 │       ├─ WorkspaceLabel            ← existing {workspace.name} span
 │       ├─ ChevronDivider            ← existing `›` between workspace and panel chips
 │       ├─ BreadcrumbChipRow         ← NEW — overflow-aware chip container
 │       │   ├─ BreadcrumbChip × N    ← NEW — one per panel; first (All Sessions) may be chevron-trigger
 │       │   │   └─ (on click of trigger variant) AllSessionsDropdownPanel (popover)
 │       │   └─ OverflowMenu          ← NEW — `…` dropdown with the chips that don't fit
 │       └─ AllSessionsDropdownPanel  ← NEW — renders in a Radix Popover; only mounted when dropdown mode + open
 └─ PanelStackContainer (existing)
     └─ (when dropdown mode is active, the All Sessions entry is skipped during render)
```

### Data boundaries

- **Breadcrumb ↔ panel stack:** breadcrumb reads `panelStackAtom` (now derived per-workspace) and `focusedPanelIdAtom` (also derived). Dispatches `setFocusedPanelIdAtom(id)` on chip click. Dispatches `closePanelAtom(id)` on `×` click.
- **Breadcrumb ↔ dropdown mode:** breadcrumb reads `activeWorkspaceAllSessionsModeAtom` to decide how to render the first chip. Dispatches a new `toggleAllSessionsModeAtom` when the user triggers a toggle from within the dropdown's header.
- **Breadcrumb ↔ workspace switch:** an effect listens to `activeWorkspaceIdAtom` and (a) closes any open dropdown, (b) the derived panel-stack atom automatically swaps the active slice.
- **PanelStackContainer ↔ dropdown mode:** the container filters out the All Sessions entry from its render pass when mode is `dropdown`. No changes to the container's resize/scroll behavior — it just has one fewer panel to render.

---

## Components

### `BreadcrumbChipRow.tsx`

**Location:** `apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChipRow.tsx`

**Props:**
```ts
type BreadcrumbChipRowProps = {
  panels: PanelStackEntry[]
  focusedPanelId: string | null
  dropdownMode: 'panel' | 'dropdown'
  onFocusPanel: (id: string) => void
  onClosePanel: (id: string) => void
  onOpenAllSessionsDropdown: () => void
}
```

**Responsibilities:**
- Render one `BreadcrumbChip` per entry in `panels`, interleaved with `·` separator spans.
- Delegate overflow calculation to `useBreadcrumbOverflow(panels, focusedPanelId)` — returns `{ visibleIds: Set<string>, hiddenPanels: PanelStackEntry[], chipMaxWidth: number }`.
- Render visible chips with `chipMaxWidth` (dynamic per overflow state), hidden panels into an `OverflowMenu` rendered after the last visible chip.
- The first chip (All Sessions, `panelType === 'session'` with root-route) is special: if `dropdownMode === 'dropdown'`, render it as a chevron trigger button (`Sessions ▾`) that invokes `onOpenAllSessionsDropdown`; otherwise render it as a normal chip that focuses the panel on click.

**Layout classes (Tailwind):**
- Row: `flex items-center gap-1 min-w-0 flex-1`
- Separator span: `text-muted-foreground/40 shrink-0 px-0.5` content `·`

### `BreadcrumbChip.tsx`

**Location:** `apps/electron/src/renderer/components/app-shell/breadcrumb/BreadcrumbChip.tsx`

**Props:**
```ts
type BreadcrumbChipProps = {
  id: string
  label: string
  icon?: LucideIcon
  focused: boolean
  closable: boolean              // false for All Sessions (pinned)
  variant: 'chip' | 'trigger'    // 'trigger' = chevron-ending, used in dropdown mode
  maxWidth: number               // px — comes from overflow hook
  onClick: () => void
  onClose?: () => void
}
```

**Responsibilities:**
- Render a rounded button with optional leading icon + label + optional trailing `×` (visible on hover/focus only when `closable && !focused`, or always when `focused`).
- `variant === 'trigger'` swaps the trailing element from `×` to a `ChevronDown` glyph and makes the click handler a toggle for the popover.
- Truncate label with ellipsis when it exceeds `maxWidth`; provide `title` tooltip with full label.
- Keyboard: Enter/Space = click; `Backspace` or `Delete` when focused = close (if closable).

**Layout classes:**
- Base: `inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm shrink min-w-0`
- Focused: `bg-accent text-foreground font-medium`
- Unfocused: `text-muted-foreground hover:text-foreground hover:bg-accent/40`
- Trigger-variant trailing chevron: `h-3.5 w-3.5 text-muted-foreground`

### `OverflowMenu.tsx`

**Location:** `apps/electron/src/renderer/components/app-shell/breadcrumb/OverflowMenu.tsx`

**Props:**
```ts
type OverflowMenuProps = {
  hiddenPanels: PanelStackEntry[]
  onFocusPanel: (id: string) => void
  onClosePanel: (id: string) => void
}
```

**Responsibilities:**
- Render a single `…` button (Radix DropdownMenu trigger).
- In the menu, list hidden panels with icon + label + trailing `×`. Click = focus (which implicitly auto-scrolls the chip back into visible range). `×` = close.

### `AllSessionsDropdownPanel.tsx`

**Location:** `apps/electron/src/renderer/components/app-shell/breadcrumb/AllSessionsDropdownPanel.tsx`

**Props:**
```ts
type AllSessionsDropdownPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchorRef: React.RefObject<HTMLElement>
  onToggleToPanelMode: () => void
}
```

**Responsibilities:**
- Radix `Popover` or `Dialog` (popover preferred — click-outside-closes is built in) anchored to the `Sessions ▾` trigger in the chip row.
- Content: the existing All Sessions component tree, pulled into a shared module so both the PanelStackContainer and this popover render the same UI with the same state atoms (no duplicated filter/scroll state).
- Header bar inside the popover: small toolbar with title "Sessions" on the left, `Columns3` icon button on the right — clicking it calls `onToggleToPanelMode` (which dispatches `toggleAllSessionsModeAtom` → flips mode to `panel`, closes the popover).
- Fixed max-height (e.g. `min(640px, 70vh)`), fixed width (e.g. 360px, matching the LeftSidebar's old width), internal scroll.
- Close-on-workspace-switch: a small effect watching `activeWorkspaceIdAtom` closes the popover.

### `useBreadcrumbOverflow.ts`

**Location:** `apps/electron/src/renderer/hooks/useBreadcrumbOverflow.ts`

**Signature:**
```ts
export function useBreadcrumbOverflow(
  panels: PanelStackEntry[],
  focusedPanelId: string | null,
  containerRef: React.RefObject<HTMLElement>,
): {
  visibleIds: Set<string>
  hiddenPanels: PanelStackEntry[]
  chipMaxWidth: number
}
```

**Behavior:**
- Uses `ResizeObserver` on `containerRef` to recompute on width changes.
- Strategy (implements Q6 hybrid):
  1. Start with `chipMaxWidth = 140`, try fitting all chips.
  2. If they don't fit, shrink `chipMaxWidth` in 10px steps down to `80`.
  3. If still don't fit at `80`, start pushing oldest non-focused chips into `hiddenPanels` one at a time until the rest fit at 80px.
  4. Focused chip must always be in `visibleIds` (never pushed to overflow).
- Memoized: returns the same object shape between renders when inputs are unchanged.

### `toggleAllSessionsModeAtom`

**Location:** add to `apps/electron/src/renderer/atoms/panel-stack.ts` (or a new `breadcrumb-mode.ts`)

```ts
export const toggleAllSessionsModeAtom = atom(null, (get, set) => {
  const wsId = get(activeWorkspaceIdAtom)
  if (!wsId) return
  const map = get(allSessionsDropdownModeByWorkspaceAtom)
  const current = map[wsId] ?? 'panel'
  const next = current === 'panel' ? 'dropdown' : 'panel'
  set(allSessionsDropdownModeByWorkspaceAtom, { ...map, [wsId]: next })
  // Side-effect: write through to preferences
  window.electronAPI.savePreferences({ allSessionsDropdownModeByWorkspace: { ...map, [wsId]: next } })
})
```

---

## Interaction specifics

### Focus on chip click
- Single click on any chip dispatches `setFocusedPanelIdAtom(chip.id)`.
- Single click on the All Sessions chip:
  - If mode = `panel` → focus the All Sessions panel (same as any chip).
  - If mode = `dropdown` → toggle the popover open/closed.

### Close via `×`
- `×` appears on hover/focus when the chip is closable (`id !== allSessionsPanelId`).
- Click dispatches `closePanelAtom(id)`. The existing atom already focuses the next-lower index when the focused panel is closed (see `closePanelAtom` lines 150–165 of `panel-stack.ts`). Our Q8 answer matches the existing behavior.

### Keyboard
- `⌘W` — close focused panel (existing behavior, unchanged). No-op when focused panel is All Sessions.
- `⌘[ / ⌘]` — focus previous / next panel (existing behavior, unchanged).
- `⌘⇧T` — **new** — reopen last-closed non-root panel. Implementation stores a bounded LIFO queue of closed routes in a session-scoped atom (not persisted).
- No dedicated shortcut for panel↔dropdown toggle (Q8).

### Workspace switch
- `activeWorkspaceIdAtom` change triggers:
  1. Derived `panelStackAtom` automatically re-reads the new workspace's slice from `panelStackByWorkspaceAtom`.
  2. Derived `focusedPanelIdAtom` re-reads from `focusedPanelIdByWorkspaceAtom`.
  3. `allSessionsDropdownModeByWorkspaceAtom` re-reads for the new workspace's mode.
  4. A small effect explicitly closes any open dropdown popover (via internal open-state setter).
- No chips from the previous workspace bleed over.

### Dropdown ↔ panel toggle state preservation
All Sessions state (filter text, selected session, expanded labels, scroll position) already lives in atoms scoped to the All Sessions component tree, not in the DOM. Rendering the same tree into a different container (popover vs. panel column) preserves it automatically — both mount points subscribe to the same atoms.

The only caveat is scroll: a panel is ~400–600px tall, a dropdown is ~640px max with a narrower viewport. When switching modes, the scroll position in raw pixels may not map cleanly. We handle this by:
- Storing `allSessionsScrollAnchorAtom` — the id of the session row nearest the top of the visible scroll area.
- After mode toggle, the new mount scrolls that anchor row into view on mount (not strict pixel preservation, but visually "you're looking at the same thing").

---

## Visual language

### Breadcrumb row
```
[Rowl logo]  Workspace ›  [📄 All Sessions]  ·  [💬 Refactor X]  ·  [💬 Debug Y]  ·  [📚 README]
                          ^^^ filled pill (focused)   ^^^ muted text        ^^^ muted text       ^^^ muted text
```

### Dropdown-mode row (All Sessions collapsed)
```
[Rowl logo]  Workspace ›  [📄 Sessions ▾]  ·  [💬 Refactor X]  ·  [💬 Debug Y]
                          ^^^ chevron trigger in chip slot
                          (click opens popover below)
```

### Popover (anchored under the `Sessions ▾` trigger)
```
┌─ Sessions ──────────────────── [▤] ← Columns3 icon, click to re-expand as panel
│  [search sessions…           ]
│  ───────────
│  ▸ Focus: [label tree]
│  ▸ Session A
│  ▸ Session B    ← selected
│  ▸ Session C
│  …
└──────────────────────────────────
```

### Overflow menu (`…` button after the visible chips)
```
[… menu open:]
┌─ Older panels ───────────
│  💬 Refactor older file X  ×
│  💬 Debug something         ×
│  📚 Some doc                ×
└──────────────────────────
```

### Colors & sizing

- Chip height: 28px (matches current topbar button height)
- Chip padding: `px-2 py-1`, `rounded-md`
- Focused pill background: `bg-accent` (same token used throughout app)
- Unfocused text: `text-muted-foreground`; hover: `text-foreground hover:bg-accent/40`
- Middot separator: `text-muted-foreground/40`, `px-0.5`
- Icon size: 14px (matches `h-3.5 w-3.5` in existing topbar icons)
- Chip `maxWidth`: starts at 140px, shrinks to 80px under pressure, then chips start moving to overflow menu

---

## Testing

Follow TDD per `superpowers:test-driven-development`. Bun test runner.

### Unit tests

- `useBreadcrumbOverflow.test.ts`
  - 1 panel at 1000px → all visible at 140px
  - 8 panels at 1000px → some hidden to overflow menu, focused always visible
  - Focused is the oldest chip → focused stays, newer chips hide before it
  - Container shrinks 1000px → 400px → chips shrink first, then overflow
  - Focused chip changes mid-computation → recomputes so new focused is visible
- `panelStackByWorkspaceAtom` tests
  - Reads from active workspace's slice
  - Workspace switch → reads from the new slice
  - Writes route through active workspace's slice, doesn't mutate others
- `toggleAllSessionsModeAtom` tests
  - Flips panel → dropdown for active workspace only
  - Writes through to `window.electronAPI.savePreferences` (mocked)
  - Default value is `panel`
- `WorkspaceBreadcrumb.test.tsx`
  - Renders one chip per panel entry
  - Focused chip has `bg-accent`, others don't
  - Clicking non-focused chip dispatches focus change
  - Clicking `×` on closable chip dispatches close
  - All Sessions chip in dropdown mode renders `ChevronDown` and opens popover on click
  - All Sessions chip never renders `×`
- `AllSessionsDropdownPanel.test.tsx`
  - Mounts All Sessions content
  - Close-on-outside-click
  - `Columns3` icon click → dispatches `toggleAllSessionsModeAtom`
  - Workspace switch → popover auto-closes

### Integration tests

- Open 3 panels, close the middle one → focus slides to chip at previous index (Q8.2)
- Open All Sessions panel, toggle to dropdown mode → All Sessions no longer renders in PanelStackContainer, chip in breadcrumb becomes `Sessions ▾`
- Toggle to dropdown mode, apply filter in dropdown, toggle back to panel → filter is preserved
- Open dropdown, switch workspace → dropdown auto-closes, breadcrumb shows new workspace's panels
- `⌘⇧T` after closing a session panel → session reopens at end of panel stack (not middle)

### Manual smoke checks

- 7+ panels open on a 1280px-wide window → shrink activates, then overflow `…` appears gracefully
- Rapid toggle panel↔dropdown 10× → no flicker, state fully preserved each time
- Two workspaces A and B: A in panel mode with 3 panels, B in dropdown mode with 1 panel. Switch A↔B↔A several times → each remembers its own layout
- Very long session name → chip truncates with ellipsis, `title` tooltip shows full name

---

## Rollout plan

1. **Phase 1 — data model** (behind no flag; safe, additive)
   - Add `panelStackByWorkspaceAtom`, `focusedPanelIdByWorkspaceAtom`, `allSessionsDropdownModeByWorkspaceAtom`.
   - Convert `panelStackAtom` and `focusedPanelIdAtom` to derived atoms.
   - Migrate existing behavior: on boot, seed the map's active workspace slice from current single-stack state if present.
   - All existing tests should still pass with zero behavior change.

2. **Phase 2 — breadcrumb UI**
   - Refactor `WorkspaceBreadcrumb.tsx` into `BreadcrumbChipRow` + `BreadcrumbChip` + `OverflowMenu` + supporting hook.
   - Initial render is still `workspace › {single focused session name}` to avoid behavior change on merge — the multi-chip rendering is gated behind reading `panelStackAtom` (which will only have >1 entries once there are real side-by-side panels).
   - At this point the breadcrumb visually upgrades: even with one panel, the chip has the new pill/icon treatment.

3. **Phase 3 — dropdown mode**
   - Add `AllSessionsDropdownPanel`.
   - Wire `toggleAllSessionsModeAtom`, persistence, the popover trigger.
   - Default: all workspaces start in `panel` mode. Feature is discoverable via the dropdown's `Columns3` header button (for going back) and via a right-click context menu on the All Sessions chip (for going into dropdown mode). No new keyboard shortcut.

4. **Phase 4 — polish**
   - `⌘⇧T` last-closed reopen
   - Focused-row scroll-anchor preservation during toggle
   - Final visual QA with 1, 3, 7, 12 panels at 800, 1280, 1920 widths

Each phase is a cohesive commit series. Phase 1 can land and soak without any UI change; phases 2–4 ship the visible work.

---

## Open questions resolved during self-review

1. **All Sessions chip label** → **"Sessions"** in both panel and dropdown mode. Shorter, consistent, reads well as `Sessions ▾`. Per-workspace scope is implied.
2. **Discovering the panel→dropdown toggle** → right-click context menu on the All Sessions chip only, menu item "Collapse to dropdown." No visible button in panel mode for v1 (keeps the chip row uncluttered). The reverse (dropdown→panel) has a visible `Columns3` button in the dropdown header, so the feature is recoverable once discovered. Revisit if users report missing it.
3. **Overflow menu order** → original positional order (oldest-to-newest panel creation order), so the `…` menu reads as "the rest of the row that didn't fit."
4. **Empty-workspace default** → when a workspace has no entry in `panelStackByWorkspaceAtom`, lazily initialize with a single All Sessions panel entry on first render. Matches today's "there's always a focused view" behavior.
5. **Focus ring vs filled pill** → flagged for QA under the `audit` / `polish` skills in Phase 4. Chips use `focus-visible:ring-1 focus-visible:ring-ring` with 2px offset; filled-pill focused chip gets `focus-visible:ring-offset-background` so the ring sits outside the pill fill.

---

## References

- `docs/plans/workspace-rail/SPEC.md` — prior feature that landed the single-session breadcrumb, the rail, and `PanelStackContainer`.
- `apps/electron/src/renderer/atoms/panel-stack.ts` — current single-lane panel model.
- `apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx` — current 51-line breadcrumb component.
- `apps/electron/src/renderer/components/app-shell/PanelStackContainer.tsx` — renders the panel columns; will skip All Sessions when mode is `dropdown`.
- `apps/electron/src/renderer/components/app-shell/panel-constants.ts` — `RADIUS_EDGE`, `RADIUS_INNER`, `PANEL_GAP`, `PANEL_EDGE_INSET`.
