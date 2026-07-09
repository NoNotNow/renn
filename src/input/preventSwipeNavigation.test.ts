import { describe, expect, test, vi } from 'vitest'
import { BUILDER_SCENE_CANVAS_HOST_ATTR } from '@/config/constants'
import {
  elementIsHorizontallyScrollable,
  installPreventTrackpadSwipeNavigation,
  isHorizontalTrackpadSwipe,
  isInsideSceneCanvasHost,
} from './preventSwipeNavigation'

describe('isHorizontalTrackpadSwipe', () => {
  test('detects horizontal-dominant wheel deltas', () => {
    expect(isHorizontalTrackpadSwipe(new WheelEvent('wheel', { deltaX: 5, deltaY: 1 }))).toBe(true)
    expect(isHorizontalTrackpadSwipe(new WheelEvent('wheel', { deltaX: -8, deltaY: 2 }))).toBe(true)
  })

  test('ignores vertical-dominant wheel deltas', () => {
    expect(isHorizontalTrackpadSwipe(new WheelEvent('wheel', { deltaX: 1, deltaY: 8 }))).toBe(false)
    expect(isHorizontalTrackpadSwipe(new WheelEvent('wheel', { deltaX: 0, deltaY: 0 }))).toBe(false)
  })
})

describe('isInsideSceneCanvasHost', () => {
  test('returns true for descendants of the scene host', () => {
    const host = document.createElement('div')
    host.setAttribute(BUILDER_SCENE_CANVAS_HOST_ATTR, 'true')
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    document.body.appendChild(host)
    expect(isInsideSceneCanvasHost(canvas)).toBe(true)
    document.body.removeChild(host)
  })
})

describe('elementIsHorizontallyScrollable', () => {
  test('returns false for non-scrollable elements', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    expect(elementIsHorizontallyScrollable(div)).toBe(false)
    document.body.removeChild(div)
  })
})

describe('installPreventTrackpadSwipeNavigation', () => {
  test('calls preventDefault on horizontal wheel events', () => {
    installPreventTrackpadSwipeNavigation()
    const ev = new WheelEvent('wheel', { deltaX: 12, deltaY: 0, bubbles: true, cancelable: true })
    const spy = vi.spyOn(ev, 'preventDefault')
    document.dispatchEvent(ev)
    expect(spy).toHaveBeenCalled()
  })

  test('does not prevent vertical wheel events', () => {
    installPreventTrackpadSwipeNavigation()
    const ev = new WheelEvent('wheel', { deltaX: 0, deltaY: 12, bubbles: true, cancelable: true })
    const spy = vi.spyOn(ev, 'preventDefault')
    document.dispatchEvent(ev)
    expect(spy).not.toHaveBeenCalled()
  })
})
