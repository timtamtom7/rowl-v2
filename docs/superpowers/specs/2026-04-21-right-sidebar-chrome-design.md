# Right Sidebar Chrome — Design Spec

**Date:** 2026-04-21
**Status:** Approved (design), pending implementation plan
**Scope:** Chrome only. No content features. Equivalent of a "working left sidebar" but on the right.

---

## 1. Problem & Intent

The right side of the app shell has latent scaffolding (`isRightSidebarVisible`
prop plumbed through `PanelStackContainer`, `rightSidebarButton` slot on
`PanelHeader`) but no actual right sidebar. Hardcoded `false` in `AppShell.tsx`
means the feature is disabled at the root.

We want a **production-quality right-sidebar chrome** — the container, toggle,
resize, responsiveness, and accessibility — without committing to any specific
feature content. Content (Memory / Context / Session activity / Attention) is
a separate future project. This spec ends at a bare empty panel with a
friendly empty state.

Shipping the chrome first means:
- Future content work is purely additive inside one slot.
- Layout, responsiveness, and focus-zone concerns are solved once, not
  re-litigated per feature.
- The UI gains a visible affordance ("there's a right panel, it's just empty
  today") rather than pretending the feature doesn't exist.

---

## 2. Architecture

### New component

- **File:** `apps/electron/src/renderer/components/app-shell/RightSidebar.tsx`
- **Purpose:** Presentational container. Renders the panel shell, a friendly
  empty state, and a resize handle on its **left** edge (mirror of left
  sidebar's right edge).
- **Props:** `width: number`, `onResize: (w: number) => void`, `children?:
  React.ReactNode` (for future content injection — unused in v0).

### State ownership

All state lives in `AppShell.tsx` and persists to localStorage via the
existing `storage.KEYS` pattern:

| State | Default | Storage key | Scope |
|---|---|---|---|
| `rightSidebarWidth` | `360` | `storage.KEYS.rightSidebarWidth` | Global |
| `rightSidebarVisible` | `false` | `storage.KEYS.rightSidebarVisible` | Global |

**Width bounds:** clamp to `[280, 600]` on every change.

**Scoping rationale:** the chrome itself is global (same shape in every
workspace) — matches how left sidebar width/session-list width are stored
today (plain global keys, not workspace-scoped). When content lands later,
the *content* will be workspace-aware; the chrome's shape and visibility
preference is a user-level preference.

### Integration points (additive edits only)

- **`AppShell.tsx`**
  - Introduce the two new state atoms + localStorage hydration.
  - Replace hardcoded `isRightSidebarVisible={false}` with the new signal.
  - Pass `rightSidebarSlot={<RightSidebar .../>}` and `rightSidebarWidth`
    into `PanelStackContainer`.
  - Wire `useAction('app.toggleRightSidebar', ...)` keyboard shortcut.
  - Honor `isAutoCompact` signal: auto-hide when true, restore prior
    visibility when false.

- **`PanelStackContainer.tsx`**
  - Accept new props: `rightSidebarSlot?: React.ReactNode`,
    `rightSidebarWidth?: number`.
  - Render the slot after the panel stack, with the correct width.
  - Keep existing `isAtRightEdge` logic — right-most panel is only at the
    right edge when the sidebar is hidden (already the case today).

- **`ChatPage.tsx`** (or wherever `PanelHeader` is constructed with buttons)
  - Build a toggle button node (lucide `PanelRightOpen` / `PanelRightClose`,
    swap based on `rightSidebarVisible`).
  - Pass via the existing `rightSidebarButton` slot on `PanelHeader`.

### Focus zone

Register a new zone `'right-sidebar'` in the focus zone system. Navigation:

- Appended to `ZONE_ORDER` so `Tab` / `Shift+Tab` cycles into it when visible.
- Dedicated shortcut `Cmd+4` via `nav.focusRightSidebar` action (opens the
  sidebar first if it's hidden, then focuses the zone).
- When sidebar hides (manually or via auto-compact), focus returns to the
  last active non-sidebar zone.
- Arrow-key inter-zone navigation is deferred — no existing zone uses arrow
  keys for this, so matching the existing pattern (Tab + Cmd+N) is more
  consistent than introducing a one-off.

---

## 3. Behaviors

### Toggle

- **Button:** rendered in the panel header via `rightSidebarButton` slot.
  Uses lucide `PanelRightOpen` when closed, `PanelRightClose` when open.
  `aria-label` reflects current state ("Open right sidebar" / "Close right
  sidebar"). `title` attribute shows the shortcut.
- **Shortcut:** `Cmd+Shift+.` via `useAction('app.toggleRightSidebar', ...)`.
  Same action dispatched as the button click.
- **Default:** closed on first launch; persisted thereafter.

### Resize

- Drag handle on the sidebar's **left** edge (4–6px hit target, cursor
  `col-resize`).
- Live updates `rightSidebarWidth` during drag; clamp to `[280, 600]`.
- Persist to localStorage on drag end (not on every mousemove — debounced or
  on release).
- No resize while auto-compact is active.

### Responsiveness (auto-compact)

The app already emits an `isAutoCompact` signal for narrow windows. The
right sidebar honors it:

- When `isAutoCompact` flips `true`, remember the current `rightSidebarVisible`
  in a transient ref, then force-hide. Do NOT write to localStorage during
  this — auto-hide is ephemeral.
- When `isAutoCompact` flips `false`, restore the remembered value.
- If the user manually toggles during auto-compact, their choice wins and
  persists normally.

### Empty state (v0 content)

Centered block, roughly 40% from the top of the sidebar:

- Icon: lucide `Sparkles`, `h-6 w-6`, `text-muted-foreground/50`
- Copy: "Memory, context, and session activity will appear here."
- Styling: `text-sm text-muted-foreground`, `max-w-[220px]`, centered
  text-align
- No action buttons, no "learn more" links — this is a placeholder, not a
  feature page.

### Accessibility

- Outer wrapper: `<div role="region" aria-label="Right sidebar">`
- Toggle button: `aria-expanded={rightSidebarVisible}`,
  `aria-controls="right-sidebar-region"`
- Resize handle: `role="separator"`, `aria-orientation="vertical"`,
  `aria-valuenow={width}`, `aria-valuemin={280}`, `aria-valuemax={600}`

---

## 4. Testing

### Unit

- `storage.get/set` round-trip for `rightSidebarWidth` and
  `rightSidebarVisible`.
- Width clamping: values below 280 clamp to 280, values above 600 clamp to
  600.

### Component

- `RightSidebar` renders at the requested width.
- Empty state renders icon + copy.
- Resize handle is rendered on the left edge.

### Integration

- Clicking the toggle button flips visibility.
- `Cmd+Shift+.` flips visibility (same action as button).
- Dragging the resize handle updates width and persists on release.
- When `isAutoCompact` goes true → sidebar hides without touching storage.
- When `isAutoCompact` returns to false → sidebar restores prior visibility.
- User-initiated toggle during auto-compact persists and wins.
- Focus zone: `Tab` from chat cycles to sidebar zone when visible; `Cmd+4`
  opens the sidebar (if hidden) and focuses it.

### Smoke

- AppShell mounts with right sidebar closed on first run (no existing
  localStorage).
- AppShell mounts with right sidebar open when localStorage says so.

---

## 5. Explicit non-goals

These are **out of scope** and tracked separately:

- No Memory / Context / Session activity / Attention panels. Those land in a
  follow-up feature project against the chrome built here.
- No per-workspace content scoping (will be added when content lands).
- No drag-and-drop between panels.
- No collapsible sections within the sidebar.
- No settings UI for width or default visibility (user's persisted values
  are the source of truth).

---

## 6. File manifest

**New:**
- `apps/electron/src/renderer/components/app-shell/RightSidebar.tsx`
- Tests under `apps/electron/src/renderer/components/app-shell/__tests__/`
  for the new component and integration cases.

**Modified (additive):**
- `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- `apps/electron/src/renderer/components/app-shell/PanelStackContainer.tsx`
- `apps/electron/src/renderer/components/app-shell/ChatPage.tsx` (or
  equivalent, to build the toggle button node)
- Storage keys file (wherever `storage.KEYS` is defined) — add
  `rightSidebarWidth`, `rightSidebarVisible`
- Action registry — add `app.toggleRightSidebar`
- Focus zone registry — add `'right-sidebar'` zone and arrow-key transitions

---

## 7. Open questions (none blocking)

- Exact file path for the toggle-button construction (`ChatPage.tsx` vs.
  wherever `PanelHeader` is assembled) — to be confirmed during
  implementation planning.
- Whether to animate the show/hide transition. Assume no for v0; revisit if
  it feels jarring.
