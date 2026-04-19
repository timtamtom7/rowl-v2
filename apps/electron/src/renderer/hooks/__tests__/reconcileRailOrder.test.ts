import { describe, it, expect } from 'bun:test';
import { reconcileRailOrder } from '../useWorkspaceRailOrder';

describe('reconcileRailOrder', () => {
  it('returns workspaces in declared order when order is empty', () => {
    const result = reconcileRailOrder([], ['x', 'y', 'z']);
    expect(result).toEqual(['x', 'y', 'z']);
  });

  it('drops ids that no longer exist in workspaces', () => {
    const result = reconcileRailOrder(['a', 'b', 'c'], ['a', 'c']);
    expect(result).toEqual(['a', 'c']);
  });

  it('appends workspaces not in the order (new workspace case)', () => {
    const result = reconcileRailOrder(['a', 'b'], ['a', 'b', 'c', 'd']);
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  it('combines drop + append: [a,b,c] + [a,c,d] = [a,c,d]', () => {
    const result = reconcileRailOrder(['a', 'b', 'c'], ['a', 'c', 'd']);
    expect(result).toEqual(['a', 'c', 'd']);
  });

  it('handles full wipe (no workspaces)', () => {
    const result = reconcileRailOrder(['a', 'b', 'c'], []);
    expect(result).toEqual([]);
  });

  it('preserves user-defined order when all ids match', () => {
    const result = reconcileRailOrder(['c', 'a', 'b'], ['a', 'b', 'c']);
    expect(result).toEqual(['c', 'a', 'b']);
  });
});
