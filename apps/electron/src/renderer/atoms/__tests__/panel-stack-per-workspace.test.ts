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
