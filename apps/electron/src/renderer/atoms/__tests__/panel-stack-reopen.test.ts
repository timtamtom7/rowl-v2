/**
 * Tests for the LIFO "reopen last closed panel" stack (Cmd+Shift+T).
 *
 * Covers:
 * - closePanelAtom pushes the removed route onto a per-workspace LIFO
 * - reopenLastClosedPanelAtom pops and re-opens the most recent one
 * - Root (All Sessions) is pinned: closePanelAtom is a no-op and the route
 *   is never pushed onto the LIFO
 * - Reopen is a no-op when the LIFO is empty
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { createStore } from 'jotai'
import {
  panelStackByWorkspaceAtom,
  closePanelAtom,
  reopenLastClosedPanelAtom,
  closedPanelRoutesByWorkspaceAtom,
  ALL_SESSIONS_ROUTE,
  type PanelStackEntry,
} from '../panel-stack'
import { windowWorkspaceIdAtom } from '../sessions'
import { routes } from '../../../shared/routes'

// Sessions are always addressed under a view context; allSessions is fine for tests.
const sessionRoute = (id: string) => routes.view.allSessions(id)

function entry(id: string, route: PanelStackEntry['route'], proportion = 0.5): PanelStackEntry {
  return { id, route, proportion, panelType: 'session', laneId: 'main' }
}

describe('reopen last-closed panel', () => {
  let store: ReturnType<typeof createStore>
  beforeEach(() => {
    store = createStore()
    store.set(windowWorkspaceIdAtom, 'ws-a')
  })

  it('reopens the last closed non-root panel', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [
        entry('p0', ALL_SESSIONS_ROUTE, 0.5),
        entry('p1', sessionRoute('s1'), 0.5),
      ],
    })
    store.set(closePanelAtom, 'p1')
    // After close, the LIFO should contain the closed route.
    expect(store.get(closedPanelRoutesByWorkspaceAtom)['ws-a']).toEqual([sessionRoute('s1')])

    store.set(reopenLastClosedPanelAtom)
    const stack = store.get(panelStackByWorkspaceAtom)['ws-a']
    expect(stack.some((p) => p.route === sessionRoute('s1'))).toBe(true)
    // LIFO should be empty after reopen
    expect(store.get(closedPanelRoutesByWorkspaceAtom)['ws-a']).toEqual([])
  })

  it('closing the root (All Sessions) panel is a no-op', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [entry('p0', ALL_SESSIONS_ROUTE, 1)],
    })
    store.set(closePanelAtom, 'p0')
    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(1)
    // Root route must never land on the reopen LIFO.
    expect(store.get(closedPanelRoutesByWorkspaceAtom)['ws-a'] ?? []).toEqual([])
  })

  it('reopen is a no-op when no panels have been closed', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [entry('p0', ALL_SESSIONS_ROUTE, 1)],
    })
    store.set(reopenLastClosedPanelAtom)
    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(1)
  })

  it('LIFO order: most recently closed reopens first', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [
        entry('p0', ALL_SESSIONS_ROUTE, 0.33),
        entry('p1', sessionRoute('s1'), 0.33),
        entry('p2', sessionRoute('s2'), 0.34),
      ],
    })
    store.set(closePanelAtom, 'p1')
    store.set(closePanelAtom, 'p2')

    // Reopen once: should bring back s2 (closed more recently)
    store.set(reopenLastClosedPanelAtom)
    let stack = store.get(panelStackByWorkspaceAtom)['ws-a']
    expect(stack.map((p) => p.route)).toContain(sessionRoute('s2'))
    expect(stack.map((p) => p.route)).not.toContain(sessionRoute('s1'))

    // Reopen again: brings back s1
    store.set(reopenLastClosedPanelAtom)
    stack = store.get(panelStackByWorkspaceAtom)['ws-a']
    expect(stack.map((p) => p.route)).toContain(sessionRoute('s1'))
  })

  it('per-workspace isolation: reopen only touches the active workspace', () => {
    // Workspace A: close a panel
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [
        entry('p0', ALL_SESSIONS_ROUTE, 0.5),
        entry('p1', sessionRoute('s1'), 0.5),
      ],
      'ws-b': [entry('q0', ALL_SESSIONS_ROUTE, 1)],
    })
    store.set(closePanelAtom, 'p1')
    expect(store.get(closedPanelRoutesByWorkspaceAtom)['ws-a']).toEqual([sessionRoute('s1')])

    // Switch to ws-b and try to reopen — should be no-op for ws-b
    store.set(windowWorkspaceIdAtom, 'ws-b')
    store.set(reopenLastClosedPanelAtom)
    expect(store.get(panelStackByWorkspaceAtom)['ws-b']).toHaveLength(1)
    // ws-a's LIFO is preserved
    expect(store.get(closedPanelRoutesByWorkspaceAtom)['ws-a']).toEqual([sessionRoute('s1')])
  })
})
