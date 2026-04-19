import { describe, it, expect } from 'bun:test';
import type { UserPreferences } from '../preferences';

describe('UserPreferences.workspaceRailOrder', () => {
  it('accepts a string array in the type', () => {
    const prefs: UserPreferences = {
      workspaceRailOrder: ['ws-1', 'ws-2', 'ws-3'],
    };
    expect(prefs.workspaceRailOrder).toEqual(['ws-1', 'ws-2', 'ws-3']);
  });

  it('is optional (omission is valid)', () => {
    const prefs: UserPreferences = {};
    expect(prefs.workspaceRailOrder).toBeUndefined();
  });

  it('round-trips through JSON.stringify/parse', () => {
    const prefs: UserPreferences = { workspaceRailOrder: ['a', 'b'] };
    const json = JSON.stringify(prefs);
    const parsed = JSON.parse(json) as UserPreferences;
    expect(parsed.workspaceRailOrder).toEqual(['a', 'b']);
  });
});
