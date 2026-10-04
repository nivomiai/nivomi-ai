/** Wall-clock helpers for a recipient's time zone (IANA name from the Rule Set). */

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface LocalClock {
  /** `YYYY-MM-DD` in the zone. */
  readonly day: string;
  /** Minutes since local midnight. */
  readonly minutes: number;
  readonly seconds: number;
}

export function localClock(at: Date, timeZone: string): LocalClock {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    seconds: Number(parts.second),
  };
}

export function parseHhmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutes-of-day window [start, end). */
export interface MinuteWindow {
  readonly start: number;
  readonly end: number;
}

/** Intersection of windows; null when empty. */
export function intersectWindows(windows: readonly MinuteWindow[]): MinuteWindow | null {
  const start = Math.max(0, ...windows.map((w) => w.start));
  const end = Math.min(DAY_MINUTES, ...windows.map((w) => w.end));
  return start < end ? { start, end } : null;
}

/**
 * Whether `at` falls inside the window in `timeZone`; if not, the next opening. Assumes the
 * zone keeps a fixed offset across the gap (true for Asia/Kolkata, which has no DST).
 */
export function windowStatus(
  at: Date,
  timeZone: string,
  window: MinuteWindow,
): { open: true } | { open: false; opensAt: Date } {
  const clock = localClock(at, timeZone);
  if (clock.minutes >= window.start && clock.minutes < window.end) return { open: true };
  const wait =
    clock.minutes < window.start
      ? window.start - clock.minutes
      : DAY_MINUTES - clock.minutes + window.start;
  return { open: false, opensAt: startOfMinute(at, clock.seconds, wait) };
}

/** The most recent local midnight at or before `at` (the start of "today" there). */
export function startOfLocalDay(at: Date, timeZone: string): Date {
  const clock = localClock(at, timeZone);
  return startOfMinute(at, clock.seconds, -clock.minutes);
}

/** The next local midnight after `at`. */
export function nextLocalMidnight(at: Date, timeZone: string): Date {
  const clock = localClock(at, timeZone);
  return startOfMinute(at, clock.seconds, DAY_MINUTES - clock.minutes);
}

function startOfMinute(at: Date, seconds: number, plusMinutes: number): Date {
  const base = at.getTime() - seconds * 1_000 - at.getMilliseconds();
  return new Date(base + plusMinutes * MINUTE_MS);
}
