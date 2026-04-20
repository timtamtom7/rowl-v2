/**
 * Integration smoke coverage for the breadcrumb surface.
 *
 * These tests render <WorkspaceBreadcrumb/> inside a real Jotai Provider and
 * exercise two multi-decision behaviors end-to-end:
 *   1. closing a middle panel slides focus to the adjacent chip
 *   2. per-workspace panel stacks are preserved across workspace switches
 *
 * Narrow unit coverage for the individual atoms + chip subcomponents already
 * lives next to each of them — this file is the seam that proves the pieces
 * wire together correctly.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { WorkspaceBreadcrumb } from '../../WorkspaceBreadcrumb';
import {
  panelStackByWorkspaceAtom,
  focusedPanelIdByWorkspaceAtom,
  ALL_SESSIONS_ROUTE,
  type PanelStackEntry,
} from '../../../../atoms/panel-stack';
import { windowWorkspaceIdAtom } from '../../../../atoms/sessions';
import { routes } from '../../../../../shared/routes';
import type { Workspace } from '../../../../../shared/types';

function mk(
  id: string,
  route: PanelStackEntry['route'],
  panelType: PanelStackEntry['panelType'] = 'session',
): PanelStackEntry {
  return { id, route, proportion: 1, panelType, laneId: 'main' };
}

const wsA: Workspace = { id: 'ws-a', name: 'Test A' } as Workspace;

describe('Breadcrumbs integration', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
  });

  it('close middle panel → focus slides to the adjacent chip', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [
        mk('p0', ALL_SESSIONS_ROUTE, 'other'),
        mk('p1', routes.view.allSessions('s1')),
        mk('p2', routes.view.allSessions('s2')),
      ],
    });
    store.set(focusedPanelIdByWorkspaceAtom, { 'ws-a': 'p1' });

    const { container } = render(
      <Provider store={store}>
        <WorkspaceBreadcrumb workspace={wsA} labelFor={() => 'X'} />
      </Provider>,
    );

    const closeBtn = container.querySelector(
      'button[data-panel-id="p1"] [aria-label="Close panel"]',
    ) as HTMLElement | null;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);

    const stack = store.get(panelStackByWorkspaceAtom)['ws-a'];
    expect(stack.map((p) => p.id)).toEqual(['p0', 'p2']);
    // closePanelAtom uses Math.min(idx, remaining.length - 1) → closing the
    // middle panel of three lands focus on what was the "next" chip (p2),
    // matching the tab-close convention of sliding forward when possible.
    expect(store.get(focusedPanelIdByWorkspaceAtom)['ws-a']).toBe('p2');
  });

  it('workspace switch preserves per-workspace panel stacks', () => {
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [
        mk('p0', ALL_SESSIONS_ROUTE, 'other'),
        mk('p1', routes.view.allSessions('s1')),
      ],
      'ws-b': [mk('q0', ALL_SESSIONS_ROUTE, 'other')],
    });

    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(2);

    store.set(windowWorkspaceIdAtom, 'ws-b');
    expect(store.get(panelStackByWorkspaceAtom)['ws-b']).toHaveLength(1);

    store.set(windowWorkspaceIdAtom, 'ws-a');
    expect(store.get(panelStackByWorkspaceAtom)['ws-a']).toHaveLength(2);
    expect(store.get(panelStackByWorkspaceAtom)['ws-a'].map((p) => p.id)).toEqual(['p0', 'p1']);
  });
});
