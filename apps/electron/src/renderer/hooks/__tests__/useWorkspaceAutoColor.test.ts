import { describe, it, expect } from 'bun:test';
import { workspaceColorFromId, WORKSPACE_COLOR_PALETTE } from '../useWorkspaceAutoColor';

describe('workspaceColorFromId', () => {
  it('is deterministic: same id returns same color', () => {
    const a = workspaceColorFromId('workspace-abc');
    const b = workspaceColorFromId('workspace-abc');
    expect(a).toBe(b);
  });

  it('returns a value that is in the palette', () => {
    const color = workspaceColorFromId('whatever');
    expect(WORKSPACE_COLOR_PALETTE).toContain(color);
  });

  it('distributes reasonably across 50 sample ids (no single hue > 50%)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 50; i++) {
      const c = workspaceColorFromId(`ws-${i}`);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const max = Math.max(...counts.values());
    expect(max).toBeLessThanOrEqual(25); // < 50% of 50
  });

  it('empty string returns first palette entry (deterministic fallback)', () => {
    expect(workspaceColorFromId('')).toBe(WORKSPACE_COLOR_PALETTE[0]);
  });
});
