/**
 * Device-parity repro for the mobile camera touch gestures (two-finger orbit / pinch zoom).
 *
 * Sends REAL multitouch input through CDP `Input.dispatchTouchEvent` (honors touch-action,
 * like a phone browser does — synthetic dispatched PointerEvents would bypass the gesture
 * cancellation this spec exists to catch) and asserts:
 * - touch pointer events stream (moves) and never pointercancel on the canvas,
 * - the camera reacts (canvas pixels change).
 */
import { test, expect } from '@playwright/test'

const EXAMPLE = 'self_drive_av'

test.use({ hasTouch: true, viewport: { width: 800, height: 400 } })

async function canvasSnapshot(page: import('@playwright/test').Page): Promise<string> {
  return page.locator('canvas').first().screenshot()
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/?example=${EXAMPLE}`)
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 })
  // Let the first render frames pass so pixel diffs only measure camera motion.
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { down: number; move: number; cancel: number; ts: number; tc: number }>
    w.__touchProbe = { down: 0, move: 0, cancel: 0, ts: 0, tc: 0 }
    document.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') w.__touchProbe!.down++
    }, true)
    document.addEventListener('pointermove', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') w.__touchProbe!.move++
    }, true)
    document.addEventListener('pointercancel', () => {
      w.__touchProbe!.cancel++
    }, true)
    document.addEventListener('touchstart', () => {
      w.__touchProbe.ts++
    }, true)
    document.addEventListener('touchend', () => {
      w.__touchProbe.tc++
    }, true)
  })
})

type Probe = { down: number; move: number; cancel: number }
async function probe(page: import('@playwright/test').Page): Promise<Probe> {
  const w = (await page.evaluate(() => {
    const rec = (window as unknown as { __touchProbe: Probe }).__touchProbe
    return { down: rec.down, move: rec.move, cancel: rec.cancel }
  })) as Probe
  return w
}

async function muliTouchDrag(
  cdp: import('@playwright/test').CDPSession,
  x0: number, y0: number, x1: number, y1: number, steps = 12,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x0, y: y0, id: 0 },
      { x: x1, y: y1, id: 1 },
    ],
  })
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x0 + (x0 - 100) * 0, y: y0 - 80 * t, id: 0 },
        { x: x1 + 80 * t, y: y1 - 80 * t, id: 1 },
      ],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('two-finger drag streams touch pointer moves, never pointercancels, orbits the camera', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  const before = await canvasSnapshot(page)

  await muliTouchDrag(cdp, 300, 200, 500, 200)
  await page.waitForTimeout(400)

  const p = await probe(page)
  expect(p.cancel, 'iOS-style pointercancel: browser took over the gesture (touch-action)').toBe(0)
  expect(p.move, 'no touch pointermove streamed from the canvas').toBeGreaterThan(16)

  const after = await canvasSnapshot(page)
  expect(after.equals(before), 'camera did not react to the two-finger drag').toBe(false)
})

test('pinch zoom reacts (canvas pixels change in both directions)', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  const before = await canvasSnapshot(page)

  // Spread: 200 -> 100 px apart around a fixed midpoint.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 350, y: 200, id: 0 },
      { x: 350 + 200, y: 200, id: 1 },
    ],
  })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 350 - 10 * i, y: 200, id: 0 },
        { x: 350 + 200 + 10 * i, y: 200, id: 1 },
      ],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)

  const close = await canvasSnapshot(page)
  expect(close.equals(before), 'spread pinch did not zoom').toBe(false)

  // Close again: back toward (not past) the initial zoom.
  const spread = await canvasSnapshot(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 250, y: 200, id: 0 },
      { x: 550, y: 200, id: 1 },
    ],
  })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 250 + 15 * i, y: 200, id: 0 },
        { x: 550 - 15 * i, y: 200, id: 1 },
      ],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
  expect((await canvasSnapshot(page)).equals(spread), 'closing pinch did not zoom back').toBe(false)
})
