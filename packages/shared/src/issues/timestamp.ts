/**
 * Format a date as YYYY-MM-DD-HHMM. Used for plan filenames.
 * @param date
 * @param tz 'UTC' to always use UTC, undefined (or 'local') to use local time.
 */
export function formatTimestamp(date: Date, tz: 'UTC' | 'local' = 'local'): string {
  const useUtc = tz === 'UTC';
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = useUtc ? date.getUTCMonth() : date.getMonth();
  const day = useUtc ? date.getUTCDate() : date.getDate();
  const hour = useUtc ? date.getUTCHours() : date.getHours();
  const minute = useUtc ? date.getUTCMinutes() : date.getMinutes();

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${mi}`;
}

export function parseTimestamp(ts: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/.exec(ts);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}
