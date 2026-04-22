import { describe, it, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { RightSidebar } from '../RightSidebar';

describe('RightSidebar', () => {
  it('renders a region landmark labelled "Right sidebar" with id for aria-controls', () => {
    const { container } = render(<RightSidebar width={360} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toBe('Right sidebar');
    expect(region?.getAttribute('id')).toBe('right-sidebar-region');
  });

  it('renders the empty-state copy when no children are provided', () => {
    const { getByText } = render(<RightSidebar width={360} />);
    expect(getByText(/Memory, context, and session activity will appear here\./)).toBeTruthy();
  });

  it('renders children instead of empty state when provided', () => {
    const { getByText, queryByText } = render(
      <RightSidebar width={360}>
        <div>Real content</div>
      </RightSidebar>
    );
    expect(getByText('Real content')).toBeTruthy();
    expect(queryByText(/Memory, context, and session activity/)).toBeNull();
  });

  it('applies the requested width to the inner element', () => {
    const { container } = render(<RightSidebar width={420} />);
    const inner = container.querySelector('[data-right-sidebar-inner]') as HTMLElement | null;
    expect(inner).toBeTruthy();
    expect(inner!.style.width).toBe('420px');
  });
});
