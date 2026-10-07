import { beforeEach, describe, expect, test } from 'vitest'
import {
  WHEEL_GESTURE_GAP_MS,
  WHEEL_NOTCH_PX,
  isWholeDevicePixels,
  WheelClassifier,
  getWheelBehavior,
  normalizeWheelDeltaPx,
  setWheelBehavior,
  type WheelLikeEvent,
} from './wheelGesture'

const ev = (deltaY: number, extra: Partial<WheelLikeEvent> = {}): WheelLikeEvent => ({
  ctrlKey: false,
  deltaX: 0,
  deltaY,
  deltaMode: 0,
  ...extra,
})

describe('normalizeWheelDeltaPx', () => {
  test('pixel mode passes through', () => {
    expect(normalizeWheelDeltaPx(100, 0)).toBe(100)
    expect(normalizeWheelDeltaPx(-3.5, 0)).toBe(-3.5)
  })
  test('Firefox line mode: 3 lines = one notch', () => {
    expect(normalizeWheelDeltaPx(3, 1)).toBeCloseTo(WHEEL_NOTCH_PX)
    expect(normalizeWheelDeltaPx(-3, 1)).toBeCloseTo(-WHEEL_NOTCH_PX)
  })
  test('page mode scales by the page height', () => {
    expect(normalizeWheelDeltaPx(1, 2, 600)).toBe(600)
  })
})

describe('WheelClassifier — device streams', () => {
  let c: WheelClassifier
  beforeEach(() => {
    c = new WheelClassifier()
  })

  test('Chrome/Windows mouse: isolated ±100 notches are mouse, however many', () => {
    let t = 1000
    for (let i = 0; i < 12; i++) {
      expect(c.classify(ev(i % 2 ? 100 : -100), t)).toBe('mouse')
      t += 400
    }
  })

  test('Windows display scaling (±120 / ±150 per notch) is still mouse', () => {
    expect(c.classify(ev(120), 0)).toBe('mouse')
    expect(c.classify(ev(-150), 500)).toBe('mouse')
  })

  test('fractional notches on scaled displays / browser zoom are still mouse (regression: wheel orbited instead of zooming)', () => {
    // Chrome reports CSS px: a 100-device-px notch at DPR 1.33 is 75.19, at DPR 1.5 it is 66.67, at DPR 1.75 it is 57.14
    expect(c.classify(ev(-75.19), 0, 'auto', 1.33)).toBe('mouse')
    expect(c.classify(ev(66.6667), 500, 'auto', 1.5)).toBe('mouse')
    expect(c.classify(ev(-57.1429), 1000, 'auto', 1.75)).toBe('mouse')
    // same fractional value at DPR 1 does not line up with the device grid → still a trackpad
    expect(new WheelClassifier().classify(ev(-75.19), 0, 'auto', 1)).toBe('trackpad')
    expect(isWholeDevicePixels(41.37, 1.33)).toBe(false)
  })

  test('Firefox line mode is always mouse', () => {
    expect(c.classify(ev(3, { deltaMode: 1 }), 0)).toBe('mouse')
    expect(c.classify(ev(-3, { deltaMode: 1 }), 20)).toBe('mouse')
  })

  test('a quickly spun wheel stays mouse for the whole gesture', () => {
    expect(c.classify(ev(100), 0)).toBe('mouse')
    // follow-up events within the gesture gap keep the kind, even when single deltas get small
    expect(c.classify(ev(20), 16)).toBe('mouse')
    expect(c.classify(ev(8), 32)).toBe('mouse')
  })

  test('trackpad two-finger swipe (small fractional deltas + momentum tail) is trackpad', () => {
    let t = 0
    for (const dy of [1.5, 3.25, 7.75, 14.5, 26.25, 41.5 /* big but within the gesture */, 55.25, 38, 21.5, 9.25, 3.75, 1.5]) {
      expect(c.classify(ev(dy), t)).toBe('trackpad')
      t += 12
    }
  })

  test('a vertical trackpad swipe starting with a big integer delta does not flip mid-gesture', () => {
    expect(c.classify(ev(2), 0)).toBe('trackpad')
    expect(c.classify(ev(60), 12)).toBe('trackpad') // continuing gesture: keeps the first event's kind
    expect(c.classify(ev(120), 24)).toBe('trackpad')
  })

  test('sideways component only comes from trackpads', () => {
    expect(c.classify(ev(100, { deltaX: 12 }), 0)).toBe('trackpad')
  })

  test('ctrl+wheel is pinch (trackpad pinch and ctrl+mouse-wheel zoom)', () => {
    expect(c.classify(ev(-4.5, { ctrlKey: true }), 0)).toBe('pinch')
    expect(c.classify(ev(100, { ctrlKey: true }), 400)).toBe('pinch')
  })

  test('a pause ends the gesture: trackpad swipe, then a wheel notch is mouse', () => {
    expect(c.classify(ev(3), 0)).toBe('trackpad')
    expect(c.classify(ev(100), WHEEL_GESTURE_GAP_MS + 50)).toBe('mouse')
  })

  test('Mac mouse wheel with small accelerated steps is ambiguous: auto picks trackpad, the override fixes it', () => {
    expect(c.classify(ev(4), 0)).toBe('trackpad')
    expect(c.classify(ev(4), 1000, 'zoom')).toBe('mouse')
    expect(c.classify(ev(150), 2000, 'orbit')).toBe('trackpad')
  })
})

describe('wheel behavior preference', () => {
  test('defaults to auto and round-trips', () => {
    setWheelBehavior('auto')
    expect(getWheelBehavior()).toBe('auto')
    setWheelBehavior('zoom')
    expect(getWheelBehavior()).toBe('zoom')
    setWheelBehavior('auto')
  })
})
