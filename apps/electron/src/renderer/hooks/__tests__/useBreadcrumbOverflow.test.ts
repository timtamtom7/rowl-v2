import { describe, it, expect } from 'bun:test';
import { computeBreadcrumbOverflow } from '../useBreadcrumbOverflow';
import type { PanelStackEntry } from '../../atoms/panel-stack';

function mkPanel(id: string, type: PanelStackEntry['panelType'] = 'session'): PanelStackEntry {
  return { id, route: `/session/${id}` as PanelStackEntry['route'], proportion: 1, panelType: type, laneId: 'main' };
}

describe('computeBreadcrumbOverflow', () => {
  it('all chips visible when they fit at max width', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'a', containerWidth: 1000,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.hiddenPanels).toEqual([]);
    expect(out.visibleIds).toEqual(new Set(['a', 'b', 'c']));
    expect(out.chipMaxWidth).toBe(140);
  });

  it('shrinks before overflowing', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'a', containerWidth: 600,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.hiddenPanels).toEqual([]);
    expect(out.chipMaxWidth).toBeLessThan(140);
    expect(out.chipMaxWidth).toBeGreaterThanOrEqual(80);
  });

  it('overflows oldest non-focused chips first once min width reached', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e'), mkPanel('f'), mkPanel('g')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'g', containerWidth: 300,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.visibleIds.has('g')).toBe(true);
    expect(out.hiddenPanels.length).toBeGreaterThan(0);
    expect(out.hiddenPanels[0].id).toBe('a');
  });

  it('focused chip is never hidden even if oldest', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e'), mkPanel('f'), mkPanel('g')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'a', containerWidth: 250,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.visibleIds.has('a')).toBe(true);
    expect(out.hiddenPanels.find((p) => p.id === 'a')).toBeUndefined();
  });

  it('hiddenPanels preserves original positional order', () => {
    const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c'), mkPanel('d'), mkPanel('e'), mkPanel('f')];
    const out = computeBreadcrumbOverflow({
      panels, focusedId: 'f', containerWidth: 260,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    const ids = out.hiddenPanels.map((p) => p.id);
    expect(ids).toEqual([...ids].sort((x, y) => panels.findIndex((p) => p.id === x) - panels.findIndex((p) => p.id === y)));
  });

  it('empty panels → no work', () => {
    const out = computeBreadcrumbOverflow({
      panels: [], focusedId: null, containerWidth: 1000,
      maxChipWidth: 140, minChipWidth: 80, separatorWidth: 14, overflowMenuWidth: 32,
    });
    expect(out.visibleIds.size).toBe(0);
    expect(out.hiddenPanels).toEqual([]);
  });
});
