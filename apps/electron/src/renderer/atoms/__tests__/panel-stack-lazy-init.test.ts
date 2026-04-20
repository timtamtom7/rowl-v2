import { describe, it, expect, beforeEach } from 'bun:test';
import { createStore } from 'jotai';
import {
  panelStackAtom,
  ensureWorkspacePanelStackAtom,
  panelStackByWorkspaceAtom,
} from '../panel-stack';
import { windowWorkspaceIdAtom } from '../sessions';

describe('panel-stack lazy init', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => { store = createStore(); });

  it('ensureWorkspacePanelStack initializes an empty workspace with All Sessions', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(ensureWorkspacePanelStackAtom);
    const stack = store.get(panelStackAtom);
    expect(stack).toHaveLength(1);
    expect(stack[0].panelType).toBe('session');
  });

  it('ensureWorkspacePanelStack is a no-op when stack already populated', () => {
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [{ id: 'p1', route: '/session/s1', proportion: 1, panelType: 'session', laneId: 'main' }],
    });
    store.set(ensureWorkspacePanelStackAtom);
    expect(store.get(panelStackAtom)).toHaveLength(1);
    expect(store.get(panelStackAtom)[0].id).toBe('p1');
  });

  it('ensureWorkspacePanelStack is a no-op without active workspace', () => {
    store.set(windowWorkspaceIdAtom, null);
    store.set(ensureWorkspacePanelStackAtom);
    expect(store.get(panelStackByWorkspaceAtom)).toEqual({});
  });
});
