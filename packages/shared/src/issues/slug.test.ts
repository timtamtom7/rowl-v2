import { describe, expect, it } from 'bun:test';
import { slugify } from './slug.ts';

describe('slugify', () => {
  it('lowercases and joins ASCII words with dashes', () => {
    expect(slugify('Add Letta memory sync')).toBe('add-letta-memory-sync');
  });

  it('strips punctuation', () => {
    expect(slugify("Fix user's login (bug!)")).toBe('fix-users-login-bug');
  });

  it('collapses multiple spaces and dashes', () => {
    expect(slugify('hello   world --  foo')).toBe('hello-world-foo');
  });

  it('transliterates common unicode to ASCII-ish forms', () => {
    expect(slugify('Déjà vu café')).toBe('deja-vu-cafe');
  });

  it('falls back to "untitled" when input is empty or all-punctuation', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
  });

  it('truncates to 60 chars without cutting words mid-token when possible', () => {
    const long = 'a '.repeat(100).trim(); // ~200 chars of "a a a a ..."
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('removes leading and trailing dashes', () => {
    expect(slugify('---foo---')).toBe('foo');
  });
});
