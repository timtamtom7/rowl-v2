/**
 * Per-workspace scroll anchor for the All Sessions view.
 *
 * Used to preserve the session-row the user was looking at when toggling
 * between the panel mount and the dropdown popover mount of the sessions
 * list. The "anchor" is the id of the topmost visible row. When the view
 * remounts in a different variant (e.g. user toggled panel → dropdown),
 * it can read this id and scroll that row back into view.
 *
 * This atom is intentionally separate from the panel-stack atoms — a mode
 * toggle is cheap and local to the breadcrumb, it doesn't need to live
 * in the heavier panel-stack state.
 */

import { atom } from 'jotai'
import { windowWorkspaceIdAtom } from './sessions'

/**
 * Per-workspace anchor storage. The value is the id of the session row
 * nearest the top of the scroll area, or null when no anchor has been
 * captured yet for that workspace.
 */
export const allSessionsScrollAnchorByWorkspaceAtom = atom<Record<string, string | null>>({})

/**
 * Derived read for the active workspace's anchor. Returns null when there
 * is no active workspace or no anchor recorded for it.
 */
export const activeAllSessionsScrollAnchorAtom = atom<string | null>((get) => {
  const wsId = get(windowWorkspaceIdAtom)
  if (!wsId) return null
  return get(allSessionsScrollAnchorByWorkspaceAtom)[wsId] ?? null
})

/**
 * Setter for the active workspace's anchor. No-op when there's no active
 * workspace (a captured anchor from a pre-workspace state would have no
 * place to go). Pass null to clear the anchor for the active workspace.
 */
export const setAllSessionsScrollAnchorAtom = atom(
  null,
  (get, set, anchorId: string | null) => {
    const wsId = get(windowWorkspaceIdAtom)
    if (!wsId) return
    const map = get(allSessionsScrollAnchorByWorkspaceAtom)
    set(allSessionsScrollAnchorByWorkspaceAtom, { ...map, [wsId]: anchorId })
  },
)
