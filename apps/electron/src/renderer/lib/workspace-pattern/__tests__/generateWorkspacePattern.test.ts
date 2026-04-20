import { describe, it, expect, beforeAll } from 'bun:test';

// Canvas isn't available under bun:test — we polyfill a minimal stub so the
// generator can exercise its color math path; toDataURL returns a stable
// string derived from fill calls so determinism can be asserted.
beforeAll(() => {
  class FakeCtx {
    private calls: string[] = [];
    fillStyle = '';
    fillRect(x: number, y: number, w: number, h: number) {
      this.calls.push(`rect:${this.fillStyle}:${x},${y},${w},${h}`);
    }
    beginPath() { this.calls.push(`bp`); }
    arc(cx: number, cy: number, r: number) {
      this.calls.push(`arc:${this.fillStyle}:${cx.toFixed(2)},${cy.toFixed(2)},${r.toFixed(2)}`);
    }
    fill() { this.calls.push(`fill`); }
    snapshot() { return this.calls.join('|'); }
  }
  class FakeCanvas {
    width = 0; height = 0;
    private ctx = new FakeCtx();
    getContext() { return this.ctx; }
    toDataURL() {
      // stable hash of call log — deterministic if inputs deterministic
      return `data:image/png;fake;${(this.ctx as any).snapshot()}`;
    }
  }
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return new FakeCanvas();
      throw new Error(`unexpected tag ${tag}`);
    },
  };
});

import { generateWorkspacePattern } from '../generateWorkspacePattern';

describe('generateWorkspacePattern', () => {
  it('returns identical data URL for identical inputs (determinism)', () => {
    const a = generateWorkspacePattern('workspace-abc', '#7c3aed');
    const b = generateWorkspacePattern('workspace-abc', '#7c3aed');
    expect(a).toBe(b);
  });

  it('returns different outputs for different ids (no collision across 50 ids)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(generateWorkspacePattern(`ws-${i}`, '#7c3aed'));
    }
    expect(seen.size).toBe(50);
  });

  it('returns different outputs for same id with different color', () => {
    const a = generateWorkspacePattern('workspace-abc', '#7c3aed');
    const b = generateWorkspacePattern('workspace-abc', '#22c55e');
    expect(a).not.toBe(b);
  });

  it('returns non-empty string for valid inputs', () => {
    const out = generateWorkspacePattern('ws-xyz', '#0ea5e9');
    expect(out.startsWith('data:image/png;')).toBe(true);
    expect(out.length).toBeGreaterThan(32);
  });
});
