import { describe, it, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { OverflowMenu } from '../OverflowMenu';
import type { PanelStackEntry } from '../../../../atoms/panel-stack';

function mk(id: string): PanelStackEntry {
  return { id, route: `/session/${id}` as PanelStackEntry['route'], proportion: 1, panelType: 'session', laneId: 'main' };
}

describe('OverflowMenu', () => {
  it('renders nothing when no hidden panels', () => {
    const { container } = render(<OverflowMenu hiddenPanels={[]} labelFor={() => ''} onFocusPanel={() => {}} onClosePanel={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a trigger button when there are hidden panels', () => {
    const { container } = render(
      <OverflowMenu hiddenPanels={[mk('a')]} labelFor={() => 'A'} onFocusPanel={() => {}} onClosePanel={() => {}} />
    );
    expect(container.querySelector('button[aria-label="More panels"]')).toBeTruthy();
  });

  it('opens on click and lists panels by label', () => {
    const { container, findByText } = render(
      <OverflowMenu
        hiddenPanels={[mk('a'), mk('b')]}
        labelFor={(p) => (p.id === 'a' ? 'Refactor' : 'Debug')}
        onFocusPanel={() => {}}
        onClosePanel={() => {}}
      />
    );
    const trigger = container.querySelector('button[aria-label="More panels"]')!;
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);
    return Promise.all([findByText('Refactor'), findByText('Debug')]).then(([a, b]) => {
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
    });
  });

  it('click on menu item fires onFocusPanel with correct id', async () => {
    const onFocus = mock((_id: string) => {});
    const { container, findByText } = render(
      <OverflowMenu
        hiddenPanels={[mk('a')]}
        labelFor={() => 'Refactor'}
        onFocusPanel={onFocus}
        onClosePanel={() => {}}
      />
    );
    const trigger = container.querySelector('button[aria-label="More panels"]')!;
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);
    const item = await findByText('Refactor');
    fireEvent.click(item);
    expect(onFocus).toHaveBeenCalledWith('a');
  });
});
