import { describe, expect, it } from 'bun:test';
import { sanitizeBranchFragment, resolveBranchName } from './branch-naming.ts';

describe('sanitizeBranchFragment', () => {
  it('lowercases + collapses separators', () => {
    expect(sanitizeBranchFragment('Add Dark Mode')).toBe('add-dark-mode');
  });

  it('strips quotes and leading/trailing separators', () => {
    expect(sanitizeBranchFragment(' "Fix login bug!" ')).toBe('fix-login-bug');
  });

  it('preserves a single slash separator', () => {
    expect(sanitizeBranchFragment('auth/retry logic')).toBe('auth/retry-logic');
  });

  it('collapses multiple slashes', () => {
    expect(sanitizeBranchFragment('a//b///c')).toBe('a/b/c');
  });

  it('replaces non-ascii with dashes', () => {
    expect(sanitizeBranchFragment('résumé update')).toBe('r-sum-update');
  });

  it('caps at 64 chars', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeBranchFragment(long).length).toBeLessThanOrEqual(64);
  });

  it('returns a fallback for empty input', () => {
    expect(sanitizeBranchFragment('')).toBe('update');
    expect(sanitizeBranchFragment('   ')).toBe('update');
    expect(sanitizeBranchFragment('!!!')).toBe('update');
  });
});

describe('resolveBranchName', () => {
  it('combines type + sanitized slug', () => {
    expect(resolveBranchName({ type: 'feat', title: 'Add dark mode' }, [])).toBe('feat/add-dark-mode');
    expect(resolveBranchName({ type: 'fix', title: 'Login loops forever' }, [])).toBe('fix/login-loops-forever');
  });

  it('returns the base name when no collision', () => {
    expect(resolveBranchName({ type: 'feat', title: 'Cleanup deps' }, ['main', 'chore/other'])).toBe('feat/cleanup-deps');
  });

  it('auto-suffixes -2, -3 on collision', () => {
    const existing = ['feat/add-dark-mode', 'feat/add-dark-mode-2'];
    expect(resolveBranchName({ type: 'feat', title: 'Add dark mode' }, existing)).toBe('feat/add-dark-mode-3');
  });

  it('is case-insensitive when checking collisions', () => {
    const existing = ['FEAT/add-dark-mode'];
    expect(resolveBranchName({ type: 'feat', title: 'Add dark mode' }, existing)).toBe('feat/add-dark-mode-2');
  });

  it('defaults to feat/update when title sanitizes to empty', () => {
    expect(resolveBranchName({ type: 'feat', title: '!!!' }, [])).toBe('feat/update');
  });
});
