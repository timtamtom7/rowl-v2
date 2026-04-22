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
    const { container } = renderInFocusProvider(<RightSidebar width={360} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toBe('Right sidebar');
    expect(region?.getAttribute('id')).toBe('right-sidebar-region');
  });

  it('stamps the container with data-focus-zone="right-sidebar" for zone detection', () => {
    const { container } = renderInFocusProvider(<RightSidebar width={360} />);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute('data-focus-zone')).toBe('right-sidebar');
  });

  it('renders the empty-state copy when no children are provided', () => {
    const { getByText } = renderInFocusProvider(<RightSidebar width={360} />);
    expect(getByText(/Memory, context, and session activity will appear here\./)).toBeTruthy();
  });

  it('renders children instead of empty state when provided', () => {
    const { getByText, queryByText } = renderInFocusProvider(
      <RightSidebar width={360}>
        <div>Real content</div>
      </RightSidebar>
    );
    expect(getByText('Real content')).toBeTruthy();
    expect(queryByText(/Memory, context, and session activity/)).toBeNull();
  });

  it('applies the requested width to the inner element', () => {
    const { container } = renderInFocusProvider(<RightSidebar width={420} />);
    const inner = container.querySelector('[data-right-sidebar-inner]') as HTMLElement | null;
    expect(inner).toBeTruthy();
    expect(inner!.style.width).toBe('420px');
  });
});
