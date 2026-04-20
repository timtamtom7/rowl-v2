import { describe, it, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import { BreadcrumbChip } from '../BreadcrumbChip';
import { MessageSquare } from 'lucide-react';

describe('BreadcrumbChip', () => {
  it('renders label', () => {
    const { getByText } = render(
      <BreadcrumbChip id="a" label="Sessions" focused={false} closable={false} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    expect(getByText('Sessions')).toBeTruthy();
  });

  it('applies focused styling when focused', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="A" focused={true} closable={true} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('bg-accent');
  });

  it('calls onClick when clicked', () => {
    const onClick = mock(() => {});
    const { container } = render(
      <BreadcrumbChip id="a" label="A" focused={false} closable={false} variant="chip" maxWidth={140} onClick={onClick} />
    );
    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows × only when closable and focused or hovered', () => {
    const onClose = mock(() => {});
    const { container } = render(
      <BreadcrumbChip id="a" label="A" focused={true} closable={true} variant="chip" maxWidth={140} onClick={() => {}} onClose={onClose} />
    );
    const closeBtn = container.querySelector('[aria-label="Close panel"]');
    expect(closeBtn).toBeTruthy();
  });

  it('does not render × when closable is false', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="Sessions" focused={true} closable={false} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    expect(container.querySelector('[aria-label="Close panel"]')).toBeNull();
  });

  it('renders chevron when variant is trigger', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="Sessions" focused={false} closable={false} variant="trigger" maxWidth={140} onClick={() => {}} />
    );
    expect(container.querySelector('[data-chip-variant="trigger"]')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    const { container } = render(
      <BreadcrumbChip id="a" label="A" icon={MessageSquare} focused={false} closable={false} variant="chip" maxWidth={140} onClick={() => {}} />
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
