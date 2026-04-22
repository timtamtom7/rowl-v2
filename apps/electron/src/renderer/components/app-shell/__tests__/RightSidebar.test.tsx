import { describe, it, expect } from 'bun:test';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { FocusProvider } from '@/context/FocusContext';
import { RightSidebar } from '../RightSidebar';

// RightSidebar registers itself as a focus zone via useFocusZone, which
// requires a FocusProvider in the tree.
function renderInFocusProvider(ui: ReactNode) {
  return render(<FocusProvider>{ui}</FocusProvider>);
}

describe('RightSidebar', () => {
  it('renders a region landmark labelled "Right sidebar" with id for aria-controls', () => {
    const { container } = renderInFocusProvider(<RightSidebar width={360} visible />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toBe('Right sidebar');
    expect(region?.getAttribute('id')).toBe('right-sidebar-region');
  });

  it('stamps the container with data-focus-zone="right-sidebar" for zone detection when visible', () => {
    const { container } = renderInFocusProvider(<RightSidebar width={360} visible />);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute('data-focus-zone')).toBe('right-sidebar');
  });

  it('does NOT stamp data-focus-zone when hidden (zone unregistered mid-animation)', () => {
    const { container } = renderInFocusProvider(<RightSidebar width={360} visible={false} />);
    const region = container.querySelector('[role="region"]');
    // When hidden, useFocusZone runs its disabled branch which skips the
    // setAttribute call. Tab cycling must skip the right sidebar while it's
    // visually collapsed.
    expect(region?.getAttribute('data-focus-zone')).toBeNull();
  });

  it('renders the empty-state copy when no children are provided', () => {
    const { getByText } = renderInFocusProvider(<RightSidebar width={360} visible />);
    expect(getByText(/Memory, context, and session activity will appear here\./)).toBeTruthy();
  });

  it('renders children instead of empty state when provided', () => {
    const { getByText, queryByText } = renderInFocusProvider(
      <RightSidebar width={360} visible>
        <div>Real content</div>
      </RightSidebar>
    );
    expect(getByText('Real content')).toBeTruthy();
    expect(queryByText(/Memory, context, and session activity/)).toBeNull();
  });

  it('applies the requested width to the inner element', () => {
    const { container } = renderInFocusProvider(<RightSidebar width={420} visible />);
    const inner = container.querySelector('[data-right-sidebar-inner]') as HTMLElement | null;
    expect(inner).toBeTruthy();
    expect(inner!.style.width).toBe('420px');
  });
});
