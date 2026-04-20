# Workspace Rail — Design Spec

**Initiative:** UI pattern port from paperclip — first discrete feature. Not part of sub-project #2 (Paperclip organizing layer) — this is a separable UI chrome change that can land independently.
**Branch:** `workspace-rail` (to be created from `main`)
**Date:** 2026-04-19
**Reference:** `/Users/mauriello/Dev/_reference/paperclip/ui/src/components/CompanyRail.tsx` and supporting modules

---

## Goal

Replace Rowl's top-bar workspace dropdown with a 72px-wide vertical rail on the far left of the app shell, matching paperclip's `CompanyRail` pattern. Workspace switching becomes zero-click and always visible. The topbar reclaims ~640px of horizontal space, which a new `Workspace › Session` breadcrumb partially consumes with far denser information.

**Success:** a Rowl user with 4+ workspaces can see and switch between them without opening a menu, every session has a visible workspace context that survives the switch, and the visual identity of each workspace (icon or auto-generated pattern) is immediately recognizable in peripheral vision.

---

## Non-goals (out of scope for v1)

- Workspace color-picker UI — color is auto-assigned from a hash of workspace id into a ~12-hue theme-friendly palette. User-editable color is a later iteration.
- Drag-icon-to-avatar shortcut for setting custom icons — right-click → "Set icon…" is enough for v1.
- Rail-to-sidebar resize drag — rail is fixed 72px; existing sidebar resize stays independent.
- Keyboard shortcut to cycle workspaces (`Cmd+1..9` etc.) — defer.
- Workspace group folders / sections / separators — paperclip hints at these but they are unnecessary below ~15 workspaces.
- Cross-machine sync of rail order — local-only (Electron user-data).
- Pulsing "live agent" indicator correctness across all agent backends — v1 may be best-effort per backend, exact per-backend wiring is a follow-up.

---

## Scope overview

```
Before                                After
┌──────────────────────────┐         ┌──────────────────────────┐
│ TopBar [Workspace ▾]     │         │ TopBar [WS › Session ▾]  │
├──────────┬───────────────┤         ├────┬─────────┬───────────┤
│ Sidebar  │               │         │Rail│ Sidebar │           │
│ (has ws  │   content     │         │72px│ (ws     │  content  │
│  switcher│               │         │    │ removed)│           │
│  at bot) │               │         │    │         │           │
└──────────┴───────────────┘         └────┴─────────┴───────────┘
```

Two components disappear, three appear:
- **Removed:** `WorkspaceSwitcher.tsx` (both topbar and sidebar variants)
- **Added:** `WorkspaceRail.tsx`, `WorkspaceAvatar.tsx`, `WorkspaceBreadcrumb.tsx`
- **Ported (mostly intact):** `generateWorkspacePattern.ts` from paperclip's `CompanyPatternIcon.tsx`

---

## Architecture

### Component tree (app shell)

```
App (existing)
 └─ AppShell (existing)
     ├─ WorkspaceRail            ← NEW (leftmost, 72px)
     │   ├─ RailLogo             (top 48px zone, non-interactive v1)
     │   ├─ SortableContext      (dnd-kit)
     │   │   └─ WorkspaceAvatar × N
     │   ├─ Separator (8px)
     │   └─ RailAddButton        (opens WorkspaceCreationScreen)
     ├─ TopBar (existing, modified)
     │   └─ WorkspaceBreadcrumb  ← NEW (replaces WorkspaceSwitcher topbar variant)
     └─ LeftSidebar (existing, modified — sidebar variant of WorkspaceSwitcher removed)
         └─ … sessions / sources / skills / labels (unchanged)
```

### Key data boundaries

- **Rail ↔ App state:** rail reads `workspaces`, `windowWorkspaceId`, `workspaceUnreadMap` from existing `AppShellContext`. It does NOT own workspace state.
- **Rail ↔ Preferences:** rail owns the `workspaceRailOrder: string[]` preference via a new Jotai atom and IPC bridge.
- **Rail ↔ Creation flow:** rail calls the existing `onCreateWorkspace()` callback (from `App.tsx`) — no new creation plumbing.
- **Avatar ↔ Pattern generator:** avatar calls `generateWorkspacePattern(id, color)` when no `iconUrl`; the generator is a pure function producing an SVG/canvas element keyed on its inputs.

---

## Components

### `WorkspaceRail.tsx`

**Location:** `apps/electron/src/renderer/components/app-shell/WorkspaceRail.tsx`

**Props:**
```ts
type WorkspaceRailProps = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  workspaceUnreadMap?: Record<string, boolean>;
  workspaceProcessingMap?: Record<string, boolean>;
  onSelect: (workspaceId: string) => void;
  onCreate: () => void;
  onContextMenu?: (workspaceId: string, e: MouseEvent) => void;
};
```

**Responsibilities:**
- Render fixed-width 72px column, full window height, right-border separator
- Host `DndContext` with `verticalListSortingStrategy` (dnd-kit)
- Consume `workspaceRailOrder` atom and reconcile against `workspaces` prop (drop missing IDs, append new IDs at the end)
- Render logo zone at top, sortable avatar list, separator, `+` button at bottom
- Delegate all workspace operations to parent via callbacks

**Layout classes (Tailwind):**
- Container: `w-[72px] h-full flex flex-col items-center bg-background border-r border-border/40`
- Logo zone: `h-12 flex items-center justify-center`
- Sortable list: `flex flex-col items-center gap-2 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-2`
- Separator: `w-8 h-px bg-border/60 my-2`
- Add button: `w-11 h-11 rounded-[14px] border border-dashed border-border hover:border-foreground/40`

### `WorkspaceAvatar.tsx`

**Location:** `apps/electron/src/renderer/components/app-shell/WorkspaceAvatar.tsx`

**Props:**
```ts
type WorkspaceAvatarProps = {
  workspace: Workspace;
  isActive: boolean;
  unread?: boolean;
  processing?: boolean;
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
};
```

**Responsibilities:**
- Render 44×44 button with rounded border (rounded-22 at rest, rounded-14 on hover/active)
- Show `iconUrl` image via existing `useWorkspaceIcons()` hook if set, else `generateWorkspacePattern(id, color)` output
- Render left-edge pill indicator (`absolute left-[-14px] w-1 rounded-r-full`) — height 0 idle, 2 (8px) hover, 5 (20px) active
- Unread dot bottom-right: `w-2 h-2 rounded-full bg-red-500` when `unread`
- Processing dot top-right: `w-2 h-2 rounded-full bg-blue-400 animate-pulse` when `processing`
- Wrap in Radix Tooltip (right-aligned, 300ms delay, content = `workspace.name`)
- Right-click → parent's `onContextMenu` handler
- Keyboard: Enter/Space activates (accessibility)

**Hover/active transitions:**
- Border-radius: `transition-[border-radius] duration-150`
- Pill height: `transition-[height] duration-150`
- Background: `transition-colors` on ring/bg changes

### `WorkspaceBreadcrumb.tsx`

**Location:** `apps/electron/src/renderer/components/app-shell/WorkspaceBreadcrumb.tsx`

**Props:**
```ts
type WorkspaceBreadcrumbProps = {
  workspace: Workspace | null;
  sessionName: string | null;
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
  onRenameSession?: () => void;
};
```

**Responsibilities:**
- Replace the ~640px-wide `WorkspaceSwitcher` topbar button with a compact `{workspaceName} › {sessionName}` text breadcrumb
- Workspace part is a dropdown trigger — shows same list as rail (mirrors for discoverability); clicking an entry fires `onSelectWorkspace`
- Session part is a button triggering rename (matches existing session-rename behavior)
- Both parts truncate with ellipsis; container width naturally fits content

### `generateWorkspacePattern.ts`

**Location:** `apps/electron/src/renderer/lib/workspace-pattern/generateWorkspacePattern.ts`

**Signature:**
```ts
export function generateWorkspacePattern(
  workspaceId: string,
  color: string,          // hex string e.g. "#7c3aed"
  size?: number,          // default 44
): string;                // returns data: URL for an <img> src
```

**Implementation notes:**
- Port from paperclip's `CompanyPatternIcon.tsx`:
  - Deterministic seed from `workspaceId` (simple string hash)
  - 8×8 grid, Bayer-matrix ordered dithering
  - Canvas render → `toDataURL("image/png")`
- Result memoized in module-scope `Map<string, string>` keyed on `` `${workspaceId}:${color}:${size}` ``
- Pure — no imports from Rowl app state

### `useWorkspaceRailOrder.ts`

**Location:** `apps/electron/src/renderer/hooks/useWorkspaceRailOrder.ts`

**Behavior:**
- Reads/writes a Jotai atom `workspaceRailOrderAtom: string[]`
- On boot: IPC call `electronAPI.getPreferences()` seeds the atom
- On change (reorder, workspace add/remove): write-through to IPC `electronAPI.savePreferences({ workspaceRailOrder })`
- Reconciles against the live workspaces array: removes stale IDs, appends new IDs at the end. Reconciliation is pure; it happens in a `useMemo` selector, not a mutation

### `useWorkspaceAutoColor.ts`

**Location:** `apps/electron/src/renderer/hooks/useWorkspaceAutoColor.ts`

**Behavior:**
- `useWorkspaceAutoColor(workspaceId): string` returns a hex color string
- Pure deterministic hash of workspace id → one of ~12 hand-picked theme-friendly hues (e.g. slate-500, amber-500, teal-500, etc.)
- Colors chosen once for contrast against both light and dark app backgrounds
- Memoized per-id

---

## State & persistence

### Existing (reused)

- `workspaces: Workspace[]` — already on `AppShellContext` (from `window.electronAPI.getWorkspaces()`)
- `windowWorkspaceId: string | null` — already a Jotai atom, per-window scoped (see `atoms/sessions.ts`)
- `workspaceUnreadMap: Record<string, boolean>` — already tracked
- `handleSelectWorkspace(id)` — already clears session, swaps permissions/credentials, re-renders

### New

- `workspaceRailOrderAtom: string[]` — Jotai atom seeded from preferences JSON on boot
- New preferences field: `workspaceRailOrder: string[]` in the existing preferences JSON file (Electron user-data)
- New optional: `workspaceProcessingMap: Record<string, boolean>` — derived in the shell from session status atoms; best-effort per backend in v1

### Persistence flow

```
User drags avatar
  ↓
dnd-kit onDragEnd fires
  ↓
arrayMove new order → workspaceRailOrderAtom (immediate UI update)
  ↓
useEffect on atom change → electronAPI.savePreferences({ workspaceRailOrder })
  ↓
main process writes preferences JSON (existing handler, new field)
```

Order is reconciled against live `workspaces` on every render via `useMemo`:
- Drop IDs not present in `workspaces` (workspace deleted externally)
- Append workspace IDs not yet in the order (new workspace created)

This means adding/removing workspaces never requires explicit preference-write; only user-initiated reorders do.

---

## Icon pipeline

```
Workspace has iconUrl?
├─ Yes → useWorkspaceIcons() resolves URL → <img src>
└─ No  → useWorkspaceAutoColor(id) → hex
          ↓
          generateWorkspacePattern(id, hex, 44) → data URL → <img src>
```

Both branches render the same `<img>` element at 44×44, so the avatar shell (border, transitions, indicators) is layout-identical.

### "Set icon" affordance

Right-click avatar → context menu item "Set icon…" → opens system file picker → user selects image → copied into workspace's `rootPath/.rowl/icon.png` (path to be finalized at plan-writing time; the target is a deterministic location under the workspace root) → existing workspace-edit IPC updates `iconUrl` → `useWorkspaceIcons()` picks it up on next render.

**v1 commitment:** the right-click "Set icon…" entry is the single icon-editing entry point. If a Workspace Settings page already exposes icon editing, we also wire it there for consistency, but v1 does NOT require new settings-page UI — the rail context menu is sufficient.

---

## Topbar changes

### Before (current `TopBar.tsx` lines ~401–410)

```tsx
<div className="flex items-center gap-1 w-[clamp(220px,42vw,640px)]">
  <WorkspaceSwitcher variant="topbar" ... />
</div>
```

### After

```tsx
<div className="flex items-center gap-2 min-w-0 flex-shrink">
  <WorkspaceBreadcrumb
    workspace={activeWorkspace}
    sessionName={activeSessionName}
    workspaces={workspaces}
    onSelectWorkspace={handleSelectWorkspace}
    onRenameSession={handleRenameSession}
  />
</div>
```

The breadcrumb is self-sizing — no `clamp()` width. The topbar reclaims the bulk of that 640px for any future topbar content (search box, etc. — not in scope here).

---

## Error handling

| Scenario | Behavior |
|---|---|
| Empty workspaces array | Rail shows logo + separator + `+` button only. No error. |
| Rail-order preference missing on boot | Atom defaults to `[]`; reconciler appends all workspace IDs in default order (likely `workspaces` array order, which is fetch order). Next reorder writes it. |
| Rail-order has IDs for deleted workspaces | Reconciler drops them in `useMemo`. No crash. |
| Preferences IPC write failure | In-memory atom still updated (UI consistent); dev console `console.warn`; next successful write reconciles. |
| Pattern generator throws | Fallback to first-letter badge on colored circle (existing CrossfadeAvatar path). Logged once per session. |
| Right-click on the only remaining workspace's "Remove" | Disabled (existing behavior from WorkspaceSwitcher — port same guard). |
| Drag-drop during a workspace creation/deletion race | `onDragEnd` filters dropped-onto-nonexistent-id cases silently. |

None of these break the turn or require user-visible error state.

---

## Testing

### Unit

- `generateWorkspacePattern` — same `(id, color, size)` tuple always returns identical data URL (deterministic).
- `generateWorkspacePattern` — different ids produce different outputs (collision check over 100 sample ids).
- `useWorkspaceAutoColor` — distribution sanity (no single hue receives > 50% of a sample of 50 uuids).
- `workspaceRailOrder` reconciler — given order `[a, b, c]` and workspaces `[a, c, d]`, returns `[a, c, d]`; order `[]` + workspaces `[x, y]` returns `[x, y]`.

### Component

- `WorkspaceAvatar` renders each indicator state: idle, hover, active, unread, processing, active+unread.
- `WorkspaceAvatar` tooltip content matches workspace name after 300ms hover.
- `WorkspaceRail` renders logo + add button even with empty workspaces.
- `WorkspaceRail` drag end persists new order (mock IPC write assertion).

### Integration

- Full rail smoke: render with 3 mock workspaces + active id → correct avatar shows pill indicator → click another avatar → `onSelect` called with new id.
- Drag avatar #3 above avatar #1 → `savePreferences` called with new order — surviving remount uses new order.
- Creation flow: click `+` → `onCreate` called → creation overlay appears (reuses existing flow).

### Manual smoke (Electron)

- Launch with 4+ existing workspaces → rail renders with avatars in correct order.
- Click each workspace → session clears and reloads correctly.
- Drag to reorder → quit app → relaunch → order preserved.
- Open second window via existing shortcut → second window's rail has independent active highlight.
- Right-click a workspace → context menu shows rename / open folder / settings / remove (remove disabled for active) — all work.
- Remove a workspace → rail updates without restart; preferences file's `workspaceRailOrder` now omits removed id.

---

## Branch & merge plan

- Create branch `workspace-rail` from `main` (post-Phase-2 merge, already done)
- Ship as a single branch with TDD-style staged commits (to be plan-authored by `superpowers:writing-plans`)
- Merge strategy: `--no-ff` for a clear merge commit, same as Phase 2
- No remote configured; local merge only

---

## Known risks

1. **Topbar breadcrumb vs existing browser-tab-strip collision.** The topbar is crowded on narrow windows. Mitigation: breadcrumb has `min-w-0 flex-shrink` so it truncates before the tab strip does. Verify at 1280px window width during smoke.
2. **dnd-kit interaction with existing `LeftSidebar` drag-sortable items.** Two DnD contexts in the same shell. Mitigation: each `DndContext` is independent by design in dnd-kit; no shared state. Still smoke-test that reordering sidebar items doesn't trigger rail drag and vice versa.
3. **`workspaceProcessingMap` per-backend correctness.** Different agent backends surface "processing" differently. Mitigation: v1 uses a conservative "any session in this workspace has status=processing" derivation; wrong-direction (show too long, not too short) is OK. Per-backend tuning deferred.
4. **Pattern generator performance on slow machines.** Canvas renders for many workspaces on boot could cause jank. Mitigation: module-scope memoization means once-per-session cost; 8×8 grid is trivial. If still an issue, defer to idle callback.

---

## Open questions (none blocking)

- Should the logo zone at the top of the rail be clickable (e.g., open "about Rowl" or return to a welcome view)? v1 is non-interactive; decision parked.
- Should `Cmd+Shift+R` or similar shortcut cycle rail focus for keyboard users? Defer; add as an accessibility follow-up if needed.
- Should we add a visible "processing" count badge (e.g. "2" for two running sessions)? v1 is the pulse only — count is a follow-up if users ask for it.

---

## References

- Paperclip source: `/Users/mauriello/Dev/_reference/paperclip/ui/src/components/CompanyRail.tsx`
- Paperclip pattern generator: `/Users/mauriello/Dev/_reference/paperclip/ui/src/components/CompanyPatternIcon.tsx`
- Rowl existing switcher: `apps/electron/src/renderer/components/app-shell/WorkspaceSwitcher.tsx`
- Rowl topbar host: `apps/electron/src/renderer/components/app-shell/TopBar.tsx`
- Rowl workspace state atoms: `apps/electron/src/renderer/atoms/sessions.ts`
- Paperclip feature catalog research (this session): see conversation history for full analysis of paperclip features beyond the rail — revisit when scoping next initiative.
