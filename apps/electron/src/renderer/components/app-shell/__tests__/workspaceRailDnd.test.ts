import { describe, it, expect } from 'bun:test';
import { computeOrderAfterDrag } from '../WorkspaceRail';

describe('computeOrderAfterDrag', () => {
  it('returns null when active and over are the same', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'b', 'b')).toBeNull();
  });

  it('returns null when over is undefined (dropped outside)', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'b', null)).toBeNull();
  });

  it('moves "a" between "b" and "c"', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('moves "c" to the front when dropped on "a"', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('returns null when active id is not in list (stale drag)', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'x', 'a')).toBeNull();
  });

  it('returns null when over id is not in list (dropped on unknown target)', () => {
    expect(computeOrderAfterDrag(['a', 'b', 'c'], 'a', 'x')).toBeNull();
  });
});
