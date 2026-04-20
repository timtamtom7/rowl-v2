import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { BreadcrumbChipRow } from '../BreadcrumbChipRow';
import {
  panelStackByWorkspaceAtom,
  focusedPanelIdByWorkspaceAtom,
  type PanelStackEntry,
} from '../../../../atoms/panel-stack';
import { windowWorkspaceIdAtom } from '../../../../atoms/sessions';
import { allSessionsDropdownModeByWorkspaceAtom } from '../../../../hooks/useAllSessionsDropdownMode';

function mk(id: string, route: string): PanelStackEntry {
  return { id, route: route as PanelStackEntry['route'], proportion: 1, panelType: 'session', laneId: 'main' };
}

describe('BreadcrumbChipRow', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
    store.set(panelStackByWorkspaceAtom, {
      'ws-a': [mk('p0', '/'), mk('p1', '/session/s1')],
    });
    store.set(focusedPanelIdByWorkspaceAtom, { 'ws-a': 'p1' });
  });

  it('renders one chip per panel with separators between them', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    expect(container.querySelectorAll('button[data-panel-id]').length).toBe(2);
    expect(container.querySelectorAll('[data-role="separator"]').length).toBe(1);
  });

  it('focused chip has bg-accent class', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    const focused = container.querySelector('button[data-panel-id="p1"]')!;
    expect(focused.className).toContain('bg-accent');
  });

  it('first chip renders as trigger variant when dropdown mode active', () => {
    store.set(allSessionsDropdownModeByWorkspaceAtom, { 'ws-a': 'dropdown' });
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    const first = container.querySelector('button[data-panel-id="p0"]')!;
    expect(first.getAttribute('data-chip-variant')).toBe('trigger');
  });

  it('first chip is not closable', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    const first = container.querySelector('button[data-panel-id="p0"]')!;
    expect(first.querySelector('[aria-label="Close panel"]')).toBeNull();
  });

  it('clicking a non-focused chip updates focus', () => {
    const { container } = render(
      <Provider store={store}>
        <BreadcrumbChipRow labelFor={() => 'X'} />
      </Provider>
    );
    fireEvent.click(container.querySelector('button[data-panel-id="p0"]')!);
    expect(store.get(focusedPanelIdByWorkspaceAtom)['ws-a']).toBe('p0');
  });
});
