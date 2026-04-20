import { useEffect, useMemo, useState } from 'react';
import type { PanelStackEntry } from '../atoms/panel-stack';

export interface OverflowInput {
  panels: PanelStackEntry[];
  focusedId: string | null;
  containerWidth: number;
  maxChipWidth: number;
  minChipWidth: number;
  separatorWidth: number;
  overflowMenuWidth: number;
}

export interface OverflowResult {
  visibleIds: Set<string>;
  hiddenPanels: PanelStackEntry[];
  chipMaxWidth: number;
}

/** Pure layout decision. Exported for unit tests. */
export function computeBreadcrumbOverflow(input: OverflowInput): OverflowResult {
  const { panels, focusedId, containerWidth, maxChipWidth, minChipWidth, separatorWidth, overflowMenuWidth } = input;
  if (panels.length === 0) {
    return { visibleIds: new Set(), hiddenPanels: [], chipMaxWidth: maxChipWidth };
  }

  const totalWidthAt = (chipWidth: number, count: number): number => {
    const chips = chipWidth * count;
    const separators = Math.max(0, count - 1) * separatorWidth;
    return chips + separators;
  };

  // Attempt 1: all visible at max width.
  if (totalWidthAt(maxChipWidth, panels.length) <= containerWidth) {
    return {
      visibleIds: new Set(panels.map((p) => p.id)),
      hiddenPanels: [],
      chipMaxWidth: maxChipWidth,
    };
  }

  // Attempt 2: shrink chip width down to minChipWidth in 10px steps.
  for (let w = maxChipWidth - 10; w >= minChipWidth; w -= 10) {
    if (totalWidthAt(w, panels.length) <= containerWidth) {
      return {
        visibleIds: new Set(panels.map((p) => p.id)),
        hiddenPanels: [],
        chipMaxWidth: w,
      };
    }
  }

  // Attempt 3: fixed minChipWidth, push oldest non-focused chips to overflow
  // until the remaining set (plus the overflow menu button) fits.
  const isFocused = (p: PanelStackEntry) => p.id === focusedId;
  const visible = [...panels];
  const hidden: PanelStackEntry[] = [];

  const budgetWithMenu = containerWidth - overflowMenuWidth - separatorWidth;

  while (visible.length > 1 && totalWidthAt(minChipWidth, visible.length) > budgetWithMenu) {
    // Find the oldest non-focused chip in visible order.
    const idx = visible.findIndex((p) => !isFocused(p));
    if (idx === -1) break; // only focused chip left — stop
    hidden.push(visible[idx]);
    visible.splice(idx, 1);
  }

  // Preserve original positional order in hidden list.
  hidden.sort((x, y) =>
    panels.findIndex((p) => p.id === x.id) - panels.findIndex((p) => p.id === y.id),
  );

  return {
    visibleIds: new Set(visible.map((p) => p.id)),
    hiddenPanels: hidden,
    chipMaxWidth: minChipWidth,
  };
}

/**
 * React wrapper: observes container width via ResizeObserver, memoizes the
 * layout decision. Consumers pass the panels, focused id, and a ref.
 */
export function useBreadcrumbOverflow(
  panels: PanelStackEntry[],
  focusedId: string | null,
  containerRef: React.RefObject<HTMLElement | null>,
  opts?: Partial<Omit<OverflowInput, 'panels' | 'focusedId' | 'containerWidth'>>,
): OverflowResult {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [containerRef]);

  return useMemo(
    () =>
      computeBreadcrumbOverflow({
        panels,
        focusedId,
        containerWidth: width,
        maxChipWidth: opts?.maxChipWidth ?? 140,
        minChipWidth: opts?.minChipWidth ?? 80,
        separatorWidth: opts?.separatorWidth ?? 14,
        overflowMenuWidth: opts?.overflowMenuWidth ?? 32,
      }),
    [panels, focusedId, width, opts?.maxChipWidth, opts?.minChipWidth, opts?.separatorWidth, opts?.overflowMenuWidth],
  );
}
