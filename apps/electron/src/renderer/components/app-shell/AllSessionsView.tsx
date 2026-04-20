/**
 * AllSessionsView - Reusable "All Sessions" body for the sessions navigator.
 *
 * Structural extraction of the inline render previously in AppShell.tsx
 * (`isSessionsNavigation(navState)` branch). The visible output is byte-identical
 * to the previous inline tree — this is a pure refactor so the same component
 * tree can be mounted in both the panel stack and the breadcrumb dropdown
 * popover.
 *
 * Scroll-anchor preservation across mode toggle:
 *   AllSessionsView owns a ref to the SessionList scroll viewport and uses
 *   it to (a) capture the id of the topmost-visible session row on unmount
 *   and (b) scroll that row back into view on mount. The anchor id lives
 *   in a per-workspace Jotai atom (`all-sessions-scroll`), so the panel
 *   mount and the dropdown mount communicate through the atom rather than
 *   through any local React state. The two mounts never overlap — the
 *   dropdown body is only rendered when `allSessionsMode === 'dropdown'`,
 *   and Radix lazy-mounts the popover content only while it is open — so a
 *   single atom value cleanly survives each handoff.
 *
 * Note on composition: `SessionSearchHeader` is already rendered internally
 * by `SessionList`, so this component does not need to render it explicitly.
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { SessionList } from './SessionList'
import {
  activeAllSessionsScrollAnchorAtom,
  setAllSessionsScrollAnchorAtom,
} from '../../atoms/all-sessions-scroll'
import type { ComponentProps } from 'react'

/** Props forwarded 1:1 to the underlying SessionList. */
export type AllSessionsViewProps = ComponentProps<typeof SessionList> & {
  /**
   * Variant affects padding/height constraints only. Currently both variants
   * render identically; they diverge in later tasks (dropdown popover mount).
   */
  variant?: 'panel' | 'dropdown'
}

/**
 * Find the id of the topmost session row fully visible (or clipped at most
 * slightly) inside the given viewport. Returns null when the viewport has no
 * rows or isn't attached to the DOM. `data-session-id` is set on each
 * SessionItem row (`SessionItem.tsx:91`).
 */
function readTopmostSessionId(viewport: HTMLElement | null): string | null {
  if (!viewport) return null
  const viewportTop = viewport.getBoundingClientRect().top
  const rows = viewport.querySelectorAll<HTMLElement>('[data-session-id]')
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    // A row counts as "topmost visible" if its bottom is below the viewport
    // top — i.e. it hasn't scrolled completely above the fold yet.
    if (rect.bottom >= viewportTop) {
      return row.getAttribute('data-session-id')
    }
  }
  return null
}

export function AllSessionsView({
  variant: _variant = 'panel',
  ...sessionListProps
}: AllSessionsViewProps) {
  // variant is plumbed through for future divergence; currently unused.
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const setAnchor = useSetAtom(setAllSessionsScrollAnchorAtom)
  // Read the anchor once at mount-time only. We intentionally don't subscribe
  // to changes — the restore effect runs once after the first paint, and
  // subsequent changes come from our own capture on unmount (stale reads are
  // fine since they're only used by the next mount).
  const anchorAtMount = useAtomValue(activeAllSessionsScrollAnchorAtom)
  const anchorAtMountRef = React.useRef(anchorAtMount)

  // Restore: scroll the captured row back into view once the list has laid out.
  React.useEffect(() => {
    const anchor = anchorAtMountRef.current
    if (!anchor) return
    const viewport = viewportRef.current
    if (!viewport) return
    // rAF + queueMicrotask combo: rAF lets layout finish (SessionList renders
    // rows synchronously in the same commit, but browser scroll restoration
    // only settles after paint); the inner scrollIntoView is cheap and no-ops
    // if the row was removed (deleted session, filter change).
    const raf = requestAnimationFrame(() => {
      const target = viewport.querySelector<HTMLElement>(
        `[data-session-id="${CSS.escape(anchor)}"]`,
      )
      target?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(raf)
    // Empty deps: fire once per mount. Capture happens on unmount below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Capture: on unmount, record the current topmost-visible row id into the
  // per-workspace atom so the next mount (other variant) can restore.
  React.useEffect(() => {
    return () => {
      const id = readTopmostSessionId(viewportRef.current)
      // Intentionally set even when id is null — an explicit clear prevents a
      // stale anchor from a previous session of the same workspace.
      setAnchor(id)
    }
  }, [setAnchor])

  return <SessionList {...sessionListProps} viewportRef={viewportRef} />
}
