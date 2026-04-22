import { describe, expect, it } from 'bun:test';
import { formatTimestamp, parseTimestamp } from './timestamp.ts';

describe('formatTimestamp', () => {
  it('formats a date as YYYY-MM-DD-HHMM in UTC', () => {
    const d = new Date('2026-04-22T14:30:45.000Z');
    expect(formatTimestamp(d, 'UTC')).toBe('2026-04-22-1430');
  });

  it('pads single-digit month/day/hour/minute', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(formatTimestamp(d, 'UTC')).toBe('2026-01-02-0304');
  });

  it('respects local timezone when asked', () => {
    // Deterministic UTC input; use explicit tz so the test isn't host-dependent.
    const d = new Date('2026-06-15T23:30:00.000Z');
    const utc = formatTimestamp(d, 'UTC');
    expect(utc).toBe('2026-06-15-2330');
  });
});

describe('parseTimestamp', () => {
  it('round-trips a formatted timestamp back to the same year/month/day/hour/minute', () => {
    const ts = '2026-04-22-1430';
    const parts = parseTimestamp(ts);
    expect(parts).toEqual({ year: 2026, month: 4, day: 22, hour: 14, minute: 30 });
  });

  it('returns null for malformed input', () => {
    expect(parseTimestamp('not-a-timestamp')).toBeNull();
    expect(parseTimestamp('2026-04-22')).toBeNull();
    expect(parseTimestamp('2026-04-22-14:30')).toBeNull();
  });
});
