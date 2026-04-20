import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { AllSessionsDropdownPanel } from '../AllSessionsDropdownPanel';
import { windowWorkspaceIdAtom } from '../../../../atoms/sessions';

describe('AllSessionsDropdownPanel', () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore();
    store.set(windowWorkspaceIdAtom, 'ws-a');
  });
  // Radix Popover portals content into document.body, which persists across
  // @testing-library/react renders unless explicitly cleaned up. Without this,
  // later tests (in this file and others) see stale "Sessions" text from the
  // previous mount, producing multiple-element errors.
  afterEach(() => {
    cleanup();
  });

  it('renders no popover content when open is false', () => {
    render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={false} onOpenChange={() => {}} onToggleToPanelMode={() => {}} anchor={<button>Anchor</button>} />
      </Provider>
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders popover content when open is true', () => {
    render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={true} onOpenChange={() => {}} onToggleToPanelMode={() => {}} anchor={<button>Anchor</button>} />
      </Provider>
    );
    // Content is portalled to document.body
    expect(document.body.textContent).toContain('Sessions');
  });

  it('clicking the Columns3 toggle button fires onToggleToPanelMode', () => {
    const onToggle = mock(() => {});
    render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={true} onOpenChange={() => {}} onToggleToPanelMode={onToggle} anchor={<button>Anchor</button>} />
      </Provider>
    );
    const btn = document.querySelector('[aria-label="Expand to panel"]') as HTMLElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('auto-closes when active workspace changes', async () => {
    const onOpenChange = mock((_open: boolean) => {});
    render(
      <Provider store={store}>
        <AllSessionsDropdownPanel open={true} onOpenChange={onOpenChange} onToggleToPanelMode={() => {}} anchor={<button>Anchor</button>} />
      </Provider>
    );
    await act(async () => {
      store.set(windowWorkspaceIdAtom, 'ws-b');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
