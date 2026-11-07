/**
 * Production-build, phone-layout device parity for the touch camera gestures.
 *
 * `/?example=self_drive_av` in the Builder is what a phone user opens on gh-pages. This spec
 * pins the two halves of the phone story:
 * 1. The scene canvas must be touchable at phone width — on a 390 px viewport the two
 *    full-height side drawers (240 px + 300 px) overlap and cover the canvas completely,
 *    which made every canvas gesture dead while the wheel strip kept working (verified:
 *    640/640 sampled canvas points hit sidebar UI before the drawer-default fix).
 * 2. The gesture pipeline itself (recognizer → orbit/pinch sinks → camera pixels) against
 *    the real `vite build` artifact via CDP multitouch (Input.dispatchTouchEvent — synthetic
 *    dispatched PointerEvents would bypass the gesture-cancellation behaviour this checks).
 *
 * Run: npx playwright test --config playwright.touch.config.ts
 */
import { test, expect, type Page } from '@playwright/test'

const EXAMPLE = 'self_drive_av'

type Probe = {
  down: number
  moveIds: number[]
  cancel: number
  containerDown: number
}

async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __touchProbe?: Probe }
    w.__touchProbe = { down: 0, moveIds: [], cancel: 0, containerDown: 0 }
    const probe = w.__touchProbe!
    const container = document.querySelector('[data-builder-scene-canvas-host]')
    container?.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') probe.containerDown++
    }, true)
    document.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') probe.down++
    }, true)
    document.addEventListener('pointermove', (e) => {
      const id = (e as PointerEvent).pointerId
      if (
        (e as PointerEvent).pointerType === 'touch' && !probe.moveIds.includes(id)
      ) {
        probe.moveIds.push(id)
      }
    }, true)
    document.addEventListener('pointercancel', () => {
      probe.cancel++
    }, true)
  })
}

async function readProbe(page: Page): Promise<Probe> {
  return (await page.evaluate(() => {
    return (window as unknown as { __touchProbe?: Probe }).__touchProbe
  })) as Probe
}

/**
 * Sample the canvas: fraction of elementFromPoint hits that reach the canvas itself.
 * Excludes the wheel strip (a deliberate touch sink) and the 24 px edge margins where the
 * collapsed drawer tab handles live.
 */
async function canvasHitFraction(page: Page): Promise<{ fraction: number; misses: string[] }> {
  return (await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { fraction: 0, misses: ['no canvas'] }
    const cr = canvas.getBoundingClientRect()
    const sink = document.querySelector('[data-touch-input-sink]')
    const sr = sink?.getBoundingClientRect()
    const margin = 24
    let hits = 0
    let total = 0
    const misses: string[] = []
    const step = 20
    for (let x = cr.left + margin; x < cr.right - margin; x += step) {
      for (let y = cr.top + margin; y < cr.bottom - margin; y += step) {
        if (sr && x >= sr.left - 8 && x <= sr.right + 8 && y >= sr.top - 8) continue
        total++
        const el = document.elementFromPoint(x, y)
        const hit = el === canvas || (el instanceof Element && canvas.contains(el))
        if (hit) hits++
        else if (misses.length < 8) {
          let bit = el instanceof Element ? el.tagName.toLowerCase() : '?'
          const tid = el instanceof Element ? el.getAttribute('data-testid') : null
          if (tid) bit += `[${tid}]`
          misses.push(`(${Math.round(x)},${Math.round(y)})->${bit}`)
        }
      }
    }
    return { fraction: total === 0 ? 0 : hits / total, misses }
  })) as { fraction: number; misses: string[] }
}

async function openPhoneWorld(page: Page, seeds: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((seedEntries) => {
    for (const [key, value] of seedEntries as [string, unknown][]) {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }, Object.entries(seeds))
  await page.goto(`/renn/?example=${EXAMPLE}`)
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(600)
}

const GESTURE = { x0: 150, y0: 300, x1: 240, y1: 300 }

test('fresh phone session keeps the scene canvas touchable (drawer default)', async ({ page }) => {
  // No drawer seeding: a phone-width fresh session must collapse the drawers (they cover
  // 100% of the canvas below 760 px, killing every canvas gesture).
  await openPhoneWorld(page, { builderShowGameHud: true })
  const { fraction, misses } = await canvasHitFraction(page)
  expect(
    fraction,
    `fresh phone session buries the scene canvas under builder UI; hits: ${fraction}; misses: ${misses.join(' ')}`,
  ).toBeGreaterThanOrEqual(0.9)
})

test('two-finger drag orbits the camera (production build, phone layout, drawer-closed)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP multitouch is Chromium-only')
  await openPhoneWorld(page, {
    builderShowGameHud: true,
    leftDrawerOpen: false,
    rightDrawerOpen: false,
  })
  await installProbe(page)
  const before = await page.locator('canvas').first().screenshot()

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: GESTURE.x0, y: GESTURE.y0, id: 0 },
      { x: GESTURE.x1, y: GESTURE.y1, id: 1 },
    ],
  })
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: GESTURE.x0 - 40 * t, y: GESTURE.y0 - 80 * t, id: 0 },
        { x: GESTURE.x1 - 40 * t, y: GESTURE.y1 - 80 * t, id: 1 },
      ],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)

  const probe = await readProbe(page)
  expect(probe.cancel, 'pointercancel: browser took over the gesture').toBe(0)
  expect(probe.moveIds.length, 'per-finger move pointers did not stream').toBeGreaterThanOrEqual(2)
  expect(probe.containerDown, 'touch pointerdown never reached the scene container').toBeGreaterThanOrEqual(2)

  const after = await page.locator('canvas').first().screenshot()
  expect(after.equals(before), 'camera did not react to the two-finger drag').toBe(false)
})

test('two-finger pinch zooms (production build, phone layout, drawer-closed)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP multitouch is Chromium-only')
  await openPhoneWorld(page, {
    builderShowGameHud: true,
    leftDrawerOpen: false,
    rightDrawerOpen: false,
  })
  await installProbe(page)
  const before = await page.locator('canvas').first().screenshot()

  const cdp = await page.context().newCDPSession(page)
  const cx = (GESTURE.x0 + GESTURE.x1) / 2
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: cx - 50, y: GESTURE.y0, id: 0 },
      { x: cx + 50, y: GESTURE.y0, id: 1 },
    ],
  })
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: cx - 50 - 5 * i, y: GESTURE.y0, id: 0 },
        { x: cx + 50 + 5 * i, y: GESTURE.y0, id: 1 },
      ],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)

  const probe = await readProbe(page)
  expect(probe.cancel, 'pointercancel: browser took over the gesture').toBe(0)
  const after = await page.locator('canvas').first().screenshot()
  expect(after.equals(before), 'camera did not react to the pinch').toBe(false)
})
