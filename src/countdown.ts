const SECOND_MS = 1000

// YYYY-MM-DD, optional [T ]HH:MM[:SS[.fff]], optional Z / ±HH:MM / ±HHMM
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))?)?$/i

export interface CountdownState {
  remainingMs: number
  days: number
  hours: string
  minutes: string
  seconds: string
  /** 0 → 1 share of the start → target span that has elapsed, or null when there is no valid span */
  progress: number | null
  finished: boolean
}

export function padTwo(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/**
 * Offset (in ms) between UTC and the wall clock of `timeZone` at `date`.
 */
export function getTimeZoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )

  return asUtc - Math.floor(date.getTime() / SECOND_MS) * SECOND_MS
}

const DAY_MS = 24 * 60 * 60 * SECOND_MS

/**
 * Convert a wall-clock time (expressed as if it were UTC) in `timeZone` to
 * a real instant. DST transitions follow the same policy as Temporal's
 * `compatible` disambiguation:
 * - a time repeated by a fall-back transition resolves to the earlier one
 * - a time skipped by a spring-forward gap moves forward by the gap length
 *   (e.g. 02:30 on a 02:00 → 03:00 night becomes 03:30)
 */
export function wallClockToInstant(
  wallClock: number,
  timeZone: string,
): number {
  const offsetBefore = getTimeZoneOffset(new Date(wallClock - DAY_MS), timeZone)
  const offsetAfter = getTimeZoneOffset(new Date(wallClock + DAY_MS), timeZone)

  const candidates = [offsetBefore, offsetAfter]
    .map((offset) => wallClock - offset)
    .filter(
      (instant) =>
        wallClock - getTimeZoneOffset(new Date(instant), timeZone) === instant,
    )

  if (candidates.length > 0) return Math.min(...candidates)

  // Nonexistent local time: read it with the pre-transition offset, which
  // lands the same distance past the transition as the gap skipped.
  return wallClock - offsetBefore
}

/**
 * Parse an ISO 8601 timestamp setting. A timestamp without an explicit
 * offset (e.g. `2028-01-01T00:00:00`) is read as wall-clock time in
 * `timeZone`, so the countdown ends at the same local moment the user typed
 * in; `Z` or `±HH:MM` pins it to an exact instant. Anything else, including
 * out-of-range values such as `2028-02-31`, `25:00` or `+24:00`, returns null.
 */
export function parseTimestamp(
  value: string | undefined | null,
  timeZone: string,
): Date | null {
  const match = ISO_TIMESTAMP.exec(value?.trim() ?? '')
  if (!match) return null

  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map((part) => Number(part ?? 0))
  const [
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    fraction,
    utcDesignator,
    sign,
    offsetHours,
    offsetMinutes,
  ] = match
  // Keep millisecond precision; anything finer is below what Date can hold
  const ms = fraction ? Number(fraction.slice(0, 3).padEnd(3, '0')) : 0
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second, ms)

  // Date.UTC rolls over out-of-range fields (Feb 31 → Mar 2), so make sure
  // every component survived unchanged.
  const check = new Date(wallClock)
  const isValid =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day &&
    check.getUTCHours() === hour &&
    check.getUTCMinutes() === minute &&
    check.getUTCSeconds() === second
  if (!isValid) return null

  if (utcDesignator) return new Date(wallClock)

  if (sign) {
    const h = Number(offsetHours)
    const m = Number(offsetMinutes)
    if (h > 23 || m > 59) return null
    const offset = (sign === '-' ? -1 : 1) * (h * 60 + m) * 60 * SECOND_MS
    return new Date(wallClock - offset)
  }

  return new Date(wallClockToInstant(wallClock, timeZone))
}

export function createCountdownState(
  now: Date,
  target: Date,
  start: Date | null = null,
): CountdownState {
  const remainingMs = Math.max(0, target.getTime() - now.getTime())
  // Round up so the display reaches 00:00:00 at the exact target moment
  const totalSeconds = Math.ceil(remainingMs / SECOND_MS)
  const finished = remainingMs <= 0

  let progress: number | null = null
  if (start && start.getTime() < target.getTime()) {
    const span = target.getTime() - start.getTime()
    const elapsed = now.getTime() - start.getTime()
    progress = Math.min(1, Math.max(0, elapsed / span))
  }

  return {
    remainingMs,
    days: Math.floor(totalSeconds / 86400),
    hours: padTwo(Math.floor((totalSeconds % 86400) / 3600)),
    minutes: padTwo(Math.floor((totalSeconds % 3600) / 60)),
    seconds: padTwo(totalSeconds % 60),
    progress,
    finished,
  }
}

export type CountdownUnit = 'day' | 'hour' | 'minute' | 'second'

const FALLBACK_LABELS: Record<CountdownUnit, string> = {
  day: 'days',
  hour: 'hours',
  minute: 'minutes',
  second: 'seconds',
}

/**
 * Localized plural unit names ("days", "jours", "Tage", …) taken from
 * Intl.NumberFormat so no translation tables are needed.
 */
export function getUnitLabel(unit: CountdownUnit, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'long',
    }).formatToParts(10)
    const label = parts
      .filter((p) => p.type === 'unit')
      .map((p) => p.value)
      .join(' ')
      .trim()
    return label || FALLBACK_LABELS[unit]
  } catch {
    return FALLBACK_LABELS[unit]
  }
}
