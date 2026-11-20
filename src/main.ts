import './css/style.css'

import {
  getLocale,
  getSettingWithDefault,
  getTimeZone,
  isLightColor,
  setupErrorHandling,
  setupSentry,
  setupTheme,
  signalReady,
} from '@screenly/edge-apps'
// Side-effect import: registers <auto-scaler> as a custom element
import '@screenly/edge-apps/components'
import {
  createCountdownState,
  getUnitLabel,
  parseTimestamp,
  type CountdownUnit,
} from './countdown'

const DEFAULT_HEADLINE = 'New Year Countdown'
const DEFAULT_END_TEXT = 'Countdown Finished!'

function formatDate(
  date: Date,
  locale: string,
  timeZone: string,
  withTime: boolean,
): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'long',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone,
  }
  try {
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', options).format(date)
  }
}

function query<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

/**
 * Fill in the text that never changes while the app runs: the headline,
 * the end message and the localized unit labels.
 */
function renderStaticText(
  units: Map<CountdownUnit, HTMLElement>,
  locale: string,
): void {
  query('[data-headline]').textContent = getSettingWithDefault<string>(
    'countdown_headline',
    DEFAULT_HEADLINE,
  )
  query('[data-finished]').textContent = getSettingWithDefault<string>(
    'countdown_end_text',
    DEFAULT_END_TEXT,
  )

  units.forEach((el, unit) => {
    const label = el.querySelector('[data-label]')
    if (label) label.textContent = getUnitLabel(unit, locale)
  })
}

async function start(): Promise<void> {
  setupSentry('countdown-timer-app')
  setupErrorHandling()

  const { primary } = setupTheme()
  document.body.classList.toggle('is-light-brand', isLightColor(primary))

  const root = query('.countdown')
  const progressFillEl = query('[data-progress-fill]')
  const startDateEl = query('[data-start-date]')
  const targetDateEl = query('[data-target-date]')

  const units = new Map<CountdownUnit, HTMLElement>()
  document.querySelectorAll<HTMLElement>('[data-unit]').forEach((el) => {
    units.set(el.dataset.unit as CountdownUnit, el)
  })

  const timezone = await getTimeZone()
  const locale = await getLocale()

  renderStaticText(units, locale)

  const target = parseTimestamp(
    getSettingWithDefault<string>('target_timestamp', ''),
    timezone,
  )
  const startDate = parseTimestamp(
    getSettingWithDefault<string>('starting_timestamp', ''),
    timezone,
  )

  if (!target) {
    console.error('Invalid or missing target_timestamp setting')
    root.classList.add('is-invalid')
    signalReady()
    return
  }

  targetDateEl.textContent = formatDate(target, locale, timezone, true)

  const setValue = (unit: CountdownUnit, value: string) => {
    const el = units.get(unit)?.querySelector('[data-value]')
    if (el && el.textContent !== value) el.textContent = value
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  const render = () => {
    const now = new Date()
    const state = createCountdownState(now, target, startDate)

    setValue('day', String(state.days))
    setValue('hour', state.hours)
    setValue('minute', state.minutes)
    setValue('second', state.seconds)

    root.classList.toggle('is-finished', state.finished)
    root.classList.toggle('has-progress', state.progress !== null)
    if (state.progress !== null) {
      progressFillEl.style.width = `${(state.progress * 100).toFixed(3)}%`
    }

    // Align ticks to the second boundary so digits never skip or stall
    clearTimeout(timer)
    if (!state.finished) {
      timer = setTimeout(render, 1000 - (now.getTime() % 1000) + 10)
    }
  }

  if (startDate && startDate < target) {
    startDateEl.textContent = formatDate(startDate, locale, timezone, false)
  }

  render()
  signalReady()
}

document.addEventListener('DOMContentLoaded', () => {
  start().catch((error) => {
    console.error('Failed to initialize countdown:', error)
    signalReady()
  })
})
