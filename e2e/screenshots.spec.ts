import { test } from '@playwright/test'
import {
  createMockScreenlyForScreenshots,
  getScreenshotsDir,
  RESOLUTIONS,
  setupClockMock,
  setupScreenlyJsMock,
} from '@screenly/edge-apps/test/screenshots'
import path from 'path'

const { screenlyJsContent } = createMockScreenlyForScreenshots(
  {},
  {
    countdown_headline: 'New Year Countdown',
    countdown_end_text: 'Happy New Year!',
    target_timestamp: '2026-01-01T00:00:00',
    starting_timestamp: '2025-01-01T00:00:00',
    override_locale: 'en',
    override_timezone: 'America/New_York',
    display_errors: 'false',
  },
)

for (const { width, height } of RESOLUTIONS) {
  test(`screenshot ${width}x${height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()

    await setupClockMock(page)
    await setupScreenlyJsMock(page, screenlyJsContent)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.screenshot({
      path: path.join(getScreenshotsDir(), `${width}x${height}.png`),
      fullPage: false,
    })

    await context.close()
  })
}
