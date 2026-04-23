import { describe, expect, it } from 'bun:test';
import {
  CHANGELOG_TEMPLATE,
  prependChangelogEntry,
  subsectionForType,
} from './changelog.ts';

describe('subsectionForType', () => {
  it('maps each PlanType', () => {
    expect(subsectionForType('feat')).toBe('Added');
    expect(subsectionForType('fix')).toBe('Fixed');
    expect(subsectionForType('chore')).toBe('Changed');
    expect(subsectionForType('refactor')).toBe('Changed');
    expect(subsectionForType('test')).toBe('Changed');
    expect(subsectionForType('docs')).toBe('Documentation');
  });
});

describe('prependChangelogEntry', () => {
  it('creates the template when input is empty', () => {
    const out = prependChangelogEntry('', {
      type: 'feat',
      title: 'Add dark mode',
      sha: 'a1b2c3d',
    });
    expect(out).toContain('## [Unreleased]');
    expect(out).toContain('### Added');
    expect(out).toContain('- Add dark mode (a1b2c3d)');
  });

  it('prepends the bullet under an existing subsection', () => {
    const initial = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- Earlier thing (deadbeef)',
      '',
    ].join('\n');
    const out = prependChangelogEntry(initial, {
      type: 'feat',
      title: 'Newer thing',
      sha: 'cafebabe',
    });
    const idxNew = out.indexOf('- Newer thing (cafebabe)');
    const idxOld = out.indexOf('- Earlier thing (deadbeef)');
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxOld).toBeGreaterThan(idxNew);
  });

  it('creates a missing subsection in the standard order', () => {
    const initial = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Changed',
      '',
      '- Some refactor (abc1234)',
      '',
    ].join('\n');
    const out = prependChangelogEntry(initial, {
      type: 'feat',
      title: 'Brand new feature',
      sha: 'deadbee',
    });
    // Added should appear BEFORE Changed under Unreleased.
    const addedIdx = out.indexOf('### Added');
    const changedIdx = out.indexOf('### Changed');
    expect(addedIdx).toBeGreaterThan(-1);
    expect(changedIdx).toBeGreaterThan(addedIdx);
    expect(out).toContain('- Brand new feature (deadbee)');
  });

  it('inserts a fresh [Unreleased] block when none exists (malformed)', () => {
    const malformed = [
      '# Changelog',
      '',
      '## [1.0.0] - 2026-01-01',
      '',
      '### Added',
      '- Something (xxxxxxx)',
    ].join('\n');
    const out = prependChangelogEntry(malformed, {
      type: 'fix',
      title: 'Regression',
      sha: 'reg1234',
    });
    const unreleasedIdx = out.indexOf('## [Unreleased]');
    const firstReleaseIdx = out.indexOf('## [1.0.0]');
    expect(unreleasedIdx).toBeGreaterThan(-1);
    expect(unreleasedIdx).toBeLessThan(firstReleaseIdx);
    expect(out.indexOf('### Fixed')).toBeGreaterThan(unreleasedIdx);
    expect(out.indexOf('### Fixed')).toBeLessThan(firstReleaseIdx);
    expect(out).toContain('- Regression (reg1234)');
  });
});
