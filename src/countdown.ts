const SECOND_MS = 1000

const NAIVE_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/

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

/**
 * Parse a timestamp setting. A timestamp without an explicit offset
 * (e.g. `2028-01-01T00:00:00`) is read as wall-clock time in `timeZone`,
 * so the countdown ends at the same local moment the user typed in.
 */
export function parseTimestamp(
  value: string | undefined | null,
  timeZone: string,
): Date | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const match = NAIVE_TIMESTAMP.exec(trimmed)
  if (!match) {
    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match
  const wallClock = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  if (Number.isNaN(wallClock)) return null

  // Two passes settle the offset correctly around DST transitions.
  let utc = wallClock - getTimeZoneOffset(new Date(wallClock), timeZone)
  utc = wallClock - getTimeZoneOffset(new Date(utc), timeZone)

  return new Date(utc)
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
