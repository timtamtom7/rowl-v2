import { describe, it, expect } from 'bun:test';
import {
  clampRightSidebarWidth,
  RIGHT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
} from '../right-sidebar-width';

describe('clampRightSidebarWidth', () => {
  it('returns value unchanged when within bounds', () => {
    expect(clampRightSidebarWidth(360)).toBe(360);
    expect(clampRightSidebarWidth(RIGHT_SIDEBAR_MIN_WIDTH)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
    expect(clampRightSidebarWidth(RIGHT_SIDEBAR_MAX_WIDTH)).toBe(RIGHT_SIDEBAR_MAX_WIDTH);
  });

  it('clamps values below minimum to minimum', () => {
    expect(clampRightSidebarWidth(100)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
    expect(clampRightSidebarWidth(-500)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
    expect(clampRightSidebarWidth(0)).toBe(RIGHT_SIDEBAR_MIN_WIDTH);
  });

  it('clamps values above maximum to maximum', () => {
    expect(clampRightSidebarWidth(900)).toBe(RIGHT_SIDEBAR_MAX_WIDTH);
    expect(clampRightSidebarWidth(10_000)).toBe(RIGHT_SIDEBAR_MAX_WIDTH);
  });

  it('exposes sensible bounds', () => {
    expect(RIGHT_SIDEBAR_MIN_WIDTH).toBe(280);
    expect(RIGHT_SIDEBAR_MAX_WIDTH).toBe(900);
    expect(RIGHT_SIDEBAR_DEFAULT_WIDTH).toBe(360);
    expect(RIGHT_SIDEBAR_MIN_WIDTH).toBeLessThan(RIGHT_SIDEBAR_DEFAULT_WIDTH);
    expect(RIGHT_SIDEBAR_DEFAULT_WIDTH).toBeLessThan(RIGHT_SIDEBAR_MAX_WIDTH);
  });
});
