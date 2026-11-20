import '@screenly/edge-apps/test'
import { describe, test, expect } from 'bun:test'
import {
  createCountdownState,
  getTimeZoneOffset,
  getUnitLabel,
  padTwo,
  parseTimestamp,
} from './countdown'

describe('padTwo', () => {
  test('pads single digits only', () => {
    expect(padTwo(0)).toBe('00')
    expect(padTwo(9)).toBe('09')
    expect(padTwo(10)).toBe('10')
  })
})

describe('getTimeZoneOffset', () => {
  test('UTC has no offset', () => {
    expect(getTimeZoneOffset(new Date('2028-01-01T00:00:00Z'), 'UTC')).toBe(0)
  })

  test('handles standard and daylight time', () => {
    const winter = new Date('2028-01-15T12:00:00Z')
    const summer = new Date('2028-07-15T12:00:00Z')
    expect(getTimeZoneOffset(winter, 'America/New_York')).toBe(-5 * 3600000)
    expect(getTimeZoneOffset(summer, 'America/New_York')).toBe(-4 * 3600000)
    expect(getTimeZoneOffset(winter, 'Asia/Kolkata')).toBe(5.5 * 3600000)
  })
})

describe('parseTimestamp', () => {
  test('reads naive timestamps as wall-clock time in the timezone', () => {
    expect(
      parseTimestamp('2028-01-01T00:00:00', 'America/New_York')?.toISOString(),
    ).toBe('2028-01-01T05:00:00.000Z')
    expect(
      parseTimestamp('2028-07-01T09:30', 'Europe/London')?.toISOString(),
    ).toBe('2028-07-01T08:30:00.000Z')
  })

  test('accepts a date without a time', () => {
    expect(parseTimestamp('2028-01-01', 'UTC')?.toISOString()).toBe(
      '2028-01-01T00:00:00.000Z',
    )
  })

  test('respects an explicit offset', () => {
    expect(
      parseTimestamp('2028-01-01T00:00:00Z', 'Asia/Tokyo')?.toISOString(),
    ).toBe('2028-01-01T00:00:00.000Z')
    expect(
      parseTimestamp('2028-01-01T00:00:00+02:00', 'UTC')?.toISOString(),
    ).toBe('2027-12-31T22:00:00.000Z')
  })

  test('rejects out-of-range calendar and time components', () => {
    expect(parseTimestamp('2028-02-31T00:00:00', 'UTC')).toBeNull()
    expect(parseTimestamp('2027-02-29', 'UTC')).toBeNull()
    expect(parseTimestamp('2028-13-01', 'UTC')).toBeNull()
    expect(parseTimestamp('2028-01-01T24:00:00', 'UTC')).toBeNull()
    expect(parseTimestamp('2028-01-01T10:60', 'UTC')).toBeNull()
    expect(parseTimestamp('2028-02-29', 'UTC')?.toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    )
  })
})

describe('parseTimestamp across DST transitions', () => {
  test('moves times in a spring-forward gap past the transition', () => {
    // 2028-03-12 02:00 → 03:00 in New York; 02:30 does not exist
    expect(
      parseTimestamp('2028-03-12T02:30:00', 'America/New_York')?.toISOString(),
    ).toBe('2028-03-12T07:30:00.000Z') // 03:30 EDT
    expect(
      parseTimestamp('2028-03-12T03:30:00', 'America/New_York')?.toISOString(),
    ).toBe('2028-03-12T07:30:00.000Z')
    expect(
      parseTimestamp('2028-03-12T01:30:00', 'America/New_York')?.toISOString(),
    ).toBe('2028-03-12T06:30:00.000Z') // 01:30 EST
  })

  test('resolves repeated fall-back times to the earlier instant', () => {
    // 2028-11-05 02:00 → 01:00 in New York; 01:30 happens twice
    expect(
      parseTimestamp('2028-11-05T01:30:00', 'America/New_York')?.toISOString(),
    ).toBe('2028-11-05T05:30:00.000Z') // 01:30 EDT
  })

  test('handles DST in the southern hemisphere', () => {
    // 2028-10-01 02:00 → 03:00 in Sydney
    expect(
      parseTimestamp('2028-10-01T02:30:00', 'Australia/Sydney')?.toISOString(),
    ).toBe('2028-09-30T16:30:00.000Z') // 03:30 AEDT
  })
})

describe('parseTimestamp offsets and validation', () => {
  test('rejects out-of-range values in offset timestamps', () => {
    expect(parseTimestamp('2028-02-31T00:00:00Z', 'UTC')).toBeNull()
    expect(parseTimestamp('2028-01-01T25:00:00+02:00', 'UTC')).toBeNull()
    expect(parseTimestamp('2028-01-01T00:00:00+24:00', 'UTC')).toBeNull()
    expect(parseTimestamp('2028-01-01T00:00:00+05:60', 'UTC')).toBeNull()
  })

  test('accepts fractional seconds and compact offsets', () => {
    expect(
      parseTimestamp('2028-01-01T00:00:00.000z', 'Asia/Tokyo')?.toISOString(),
    ).toBe('2028-01-01T00:00:00.000Z')
    expect(
      parseTimestamp('2028-01-01T00:00:00-0530', 'UTC')?.toISOString(),
    ).toBe('2028-01-01T05:30:00.000Z')
  })

  test('returns null for empty or invalid values', () => {
    expect(parseTimestamp('', 'UTC')).toBeNull()
    expect(parseTimestamp(undefined, 'UTC')).toBeNull()
    expect(parseTimestamp('not a date', 'UTC')).toBeNull()
    expect(parseTimestamp('January 1, 2028', 'UTC')).toBeNull()
  })
})

describe('createCountdownState', () => {
  const target = new Date('2028-01-01T00:00:00Z')

  test('splits remaining time into units', () => {
    const now = new Date('2027-12-30T21:58:57Z')
    const state = createCountdownState(now, target)
    expect(state.days).toBe(1)
    expect(state.hours).toBe('02')
    expect(state.minutes).toBe('01')
    expect(state.seconds).toBe('03')
    expect(state.finished).toBe(false)
    expect(state.progress).toBeNull()
  })

  test('rounds partial seconds up', () => {
    const now = new Date(target.getTime() - 1500)
    expect(createCountdownState(now, target).seconds).toBe('02')
  })

  test('finishes at and after the target', () => {
    for (const offset of [0, 5000]) {
      const state = createCountdownState(
        new Date(target.getTime() + offset),
        target,
      )
      expect(state.finished).toBe(true)
      expect(state.remainingMs).toBe(0)
      expect(state.days).toBe(0)
      expect(state.seconds).toBe('00')
    }
  })

  test('reports progress between start and target', () => {
    const start = new Date('2027-12-31T00:00:00Z')
    const now = new Date('2027-12-31T06:00:00Z')
    expect(createCountdownState(now, target, start).progress).toBe(0.25)
    expect(createCountdownState(target, target, start).progress).toBe(1)
    expect(
      createCountdownState(new Date('2027-01-01'), target, start).progress,
    ).toBe(0)
  })

  test('has no progress when start is not before target', () => {
    expect(createCountdownState(new Date(), target, target).progress).toBeNull()
  })
})

describe('getUnitLabel', () => {
  test('returns localized plural unit names', () => {
    expect(getUnitLabel('day', 'en')).toBe('days')
    expect(getUnitLabel('second', 'en')).toBe('seconds')
    expect(getUnitLabel('hour', 'de')).toBe('Stunden')
  })

  test('falls back to English for an invalid locale', () => {
    expect(getUnitLabel('minute', '!!')).toBe('minutes')
  })
})
