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
