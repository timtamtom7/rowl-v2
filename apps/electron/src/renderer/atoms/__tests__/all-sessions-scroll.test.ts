/**
 * Tests for the per-workspace All Sessions scroll-anchor atoms.
 *
 * The anchor records the id of the topmost visible session row in the
 * All Sessions view; when the view remounts (panel ↔ dropdown toggle) it
 * scrolls that row back into view. These atoms are the pure-data layer.
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { createStore } from 'jotai'
import {
  allSessionsScrollAnchorByWorkspaceAtom,
  setAllSessionsScrollAnchorAtom,
  activeAllSessionsScrollAnchorAtom,
} from '../all-sessions-scroll'
import { windowWorkspaceIdAtom } from '../sessions'

describe('all-sessions-scroll anchor', () => {
  let store: ReturnType<typeof createStore>
  beforeEach(() => {
    store = createStore()
    store.set(windowWorkspaceIdAtom, 'ws-a')
  })

  it('stores anchor per workspace', () => {
    store.set(setAllSessionsScrollAnchorAtom, 'session-42')
    expect(store.get(allSessionsScrollAnchorByWorkspaceAtom)['ws-a']).toBe('session-42')
  })

  it('active anchor reads from current workspace', () => {
    store.set(setAllSessionsScrollAnchorAtom, 'session-42')
    expect(store.get(activeAllSessionsScrollAnchorAtom)).toBe('session-42')

    store.set(windowWorkspaceIdAtom, 'ws-b')
    expect(store.get(activeAllSessionsScrollAnchorAtom)).toBeNull()
  })

  it('anchors are isolated per workspace', () => {
    store.set(setAllSessionsScrollAnchorAtom, 'session-42')
    store.set(windowWorkspaceIdAtom, 'ws-b')
    store.set(setAllSessionsScrollAnchorAtom, 'session-99')

    const map = store.get(allSessionsScrollAnchorByWorkspaceAtom)
    expect(map['ws-a']).toBe('session-42')
    expect(map['ws-b']).toBe('session-99')

    store.set(windowWorkspaceIdAtom, 'ws-a')
    expect(store.get(activeAllSessionsScrollAnchorAtom)).toBe('session-42')
  })

  it('setter with null clears the anchor for the active workspace', () => {
    store.set(setAllSessionsScrollAnchorAtom, 'session-42')
    store.set(setAllSessionsScrollAnchorAtom, null)
    expect(store.get(activeAllSessionsScrollAnchorAtom)).toBeNull()
    expect(store.get(allSessionsScrollAnchorByWorkspaceAtom)['ws-a']).toBeNull()
  })

  it('setter is a no-op when no workspace is active', () => {
    store.set(windowWorkspaceIdAtom, null)
    store.set(setAllSessionsScrollAnchorAtom, 'session-42')
    expect(store.get(allSessionsScrollAnchorByWorkspaceAtom)).toEqual({})
  })

  it('active anchor is null when no workspace is active', () => {
    store.set(windowWorkspaceIdAtom, null)
    expect(store.get(activeAllSessionsScrollAnchorAtom)).toBeNull()
  })
})
