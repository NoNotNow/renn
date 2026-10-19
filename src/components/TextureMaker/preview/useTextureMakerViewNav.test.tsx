import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTextureMakerViewNav } from './useTextureMakerViewNav'

const ZOOM_LOG_PER_PX = 0.0008

function setup(compositePreviewUrl: string | null = 'blob:preview') {
  const viewport = document.createElement('div')
  // jsdom's setPointerCapture throws for inactive pointer ids; the hook only needs the call.
  viewport.setPointerCapture = vi.fn()
  viewport.releasePointerCapture = vi.fn()
  document.body.appendChild(viewport)
  const previewViewportRef = { current: viewport as HTMLDivElement | null }
  const hook = renderHook(() => useTextureMakerViewNav({ previewViewportRef, compositePreviewUrl }))
  return { result: hook.result, viewport }
}

function fireTouch(target: Element | Window, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', pointerId: number, x: number, y: number) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, { pointerId, pointerType: 'touch', clientX: x, clientY: y, button: 0, bubbles: true }),
    )
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useTextureMakerViewNav pinch zoom', () => {
  it('a two-finger spread zooms in around the pinch midpoint', () => {
    const { result, viewport } = setup()

    fireTouch(viewport, 'pointerdown', 1, 100, 100)
    fireTouch(viewport, 'pointerdown', 2, 200, 100)
    // Fingers apart: distance 100 -> 150 (50 px).
    fireTouch(window, 'pointermove', 2, 250, 100)

    const expected = Math.exp(50 * ZOOM_LOG_PER_PX)
    expect(result.current.viewZoom).toBeCloseTo(expected, 6)
  })

  it('closing the pinch zooms out', () => {
    const { result, viewport } = setup()

    fireTouch(viewport, 'pointerdown', 1, 100, 100)
    fireTouch(viewport, 'pointerdown', 2, 200, 100)
    // Fingers together: distance 100 -> 40 (-60 px).
    fireTouch(window, 'pointermove', 2, 140, 100)

    const expected = Math.exp(-60 * ZOOM_LOG_PER_PX)
    expect(result.current.viewZoom).toBeCloseTo(expected, 6)
  })

  it('clamps each pinch event like a wheel notch, capping at VIEW_ZOOM_MAX', () => {
    const { result, viewport } = setup()

    fireTouch(viewport, 'pointerdown', 1, 100, 100)
    fireTouch(viewport, 'pointerdown', 2, 200, 100)
    // One huge move: +500 px apart, clamped to one notch (100 px) per event.
    fireTouch(window, 'pointermove', 2, 700, 100)
    expect(result.current.viewZoom).toBeCloseTo(Math.exp(100 * ZOOM_LOG_PER_PX), 6)

    // Repeated spreads converge on the configured cap.
    for (let i = 0; i < 60; i++) {
      fireTouch(window, 'pointermove', 2, 700 + i * 500, 100)
    }
    expect(result.current.viewZoom).toBe(8)
  })

  it('a one-finger touch drag does not zoom (hand tool owns single-finger pan)', () => {
    const { result, viewport } = setup()

    fireTouch(viewport, 'pointerdown', 1, 100, 100)
    fireTouch(window, 'pointermove', 1, 300, 200)

    expect(result.current.viewZoom).toBe(1)
    expect(result.current.viewPan).toEqual({ x: 0, y: 0 })
  })

  it('mouse pointers are ignored by the pinch layer', () => {
    const { result, viewport } = setup()

    act(() => {
      viewport.dispatchEvent(
        new PointerEvent('pointerdown', { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true }),
      )
      viewport.dispatchEvent(
        new PointerEvent('pointerdown', { pointerType: 'mouse', pointerId: 2, button: 0, clientX: 200, clientY: 100, bubbles: true }),
      )
      window.dispatchEvent(
        new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 2, clientX: 400, clientY: 100, bubbles: true }),
      )
    })

    expect(result.current.viewZoom).toBe(1)
  })

  it('during a pinch the hand-tool pan does not start for the second finger', () => {
    const { result, viewport } = setup()

    fireTouch(viewport, 'pointerdown', 1, 100, 100)
    fireTouch(viewport, 'pointerdown', 2, 200, 100)

    // The pane routes React onPointerDown through onViewportPointerDown; a touch
    // landing while a pinch is active must not start a hand pan.
    act(() => {
      result.current.onViewportPointerDown(
        {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 200,
          clientY: 100,
          currentTarget: viewport,
          preventDefault: vi.fn(),
        } as unknown as React.PointerEvent<HTMLDivElement>,
        'hand',
      )
    })

    // This pinch move zooms around the midpoint; without the guard, hand-pan would
    // add the full (dx, dy) on top of the zoom-focal pan.
    fireTouch(window, 'pointermove', 2, 300, 150)
    const zoom = Math.exp(100 * ZOOM_LOG_PER_PX)
    const midX = (100 + 300) / 2
    const midY = (100 + 150) / 2
    expect(result.current.viewZoom).toBeCloseTo(zoom, 6)
    expect(result.current.viewPan.x).toBeCloseTo(midX - midX * zoom, 6)
    expect(result.current.viewPan.y).toBeCloseTo(midY - midY * zoom, 6)
  })

  it('hand-tool pan still works for mouse after the pinch changes zoom', () => {
    const { result, viewport } = setup()

    // Pinch once (zoom + focal pan change).
    fireTouch(viewport, 'pointerdown', 1, 100, 100)
    fireTouch(viewport, 'pointerdown', 2, 200, 100)
    fireTouch(window, 'pointermove', 2, 250, 100)
    fireTouch(window, 'pointerup', 2, 250, 100)
    fireTouch(window, 'pointerup', 1, 100, 100)

    const zoom = Math.exp(50 * ZOOM_LOG_PER_PX)
    const panAfterPinch = {
      x: 175 - 175 * zoom, // midpoint of (100,100)+(250,100), focal pan
      y: 100 - 100 * zoom,
    }

    act(() => {
      result.current.onViewportPointerDown(
        {
          pointerId: 9,
          pointerType: 'mouse',
          clientX: 100,
          clientY: 100,
          currentTarget: viewport,
          preventDefault: vi.fn(),
        } as unknown as React.PointerEvent<HTMLDivElement>,
        'hand',
      )
    })
    act(() => {
      result.current.handleWindowPointerMove(
        new PointerEvent('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 160, clientY: 130, bubbles: true }),
      )
    })

    expect(result.current.viewPan.x).toBeCloseTo(panAfterPinch.x + 60, 6)
    expect(result.current.viewPan.y).toBeCloseTo(panAfterPinch.y + 30, 6)
  })
})
