import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useTouchDriveStrip,
  attachTouchDriveStrip,
  zeroTouchDrive,
} from './touchDriveInput'
import type { RawDriveTouchState } from '@/types/transformer'

function firePointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  x: number,
  y: number,
  pointerType: 'touch' | 'mouse' = 'touch',
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      pointerType,
      clientX: x,
      clientY: y,
      button: type === 'pointerdown' ? 0 : -1,
      bubbles: true,
    }),
  )
}

describe('attachTouchDriveStrip (analog axes from wheel drag)', () => {
  it('drag up → drive positive (throttle); drag down → drive negative (brake)', () => {
    const strip = document.createElement('div')
    document.body.appendChild(strip)
    const state = zeroTouchDrive()
    const detach = attachTouchDriveStrip(strip, state)

    firePointer(strip, 'pointerdown', 1, 100, 100)
    firePointer(strip, 'pointermove', 1, 100, 70)
    expect(state.drive).toBeGreaterThan(0)
    expect(state.steer).toBe(0)

    firePointer(strip, 'pointermove', 1, 100, 130)
    expect(state.drive).toBeLessThan(0)
    detach()
  })

  it('drag right → steer negative (right); drag left → steer positive (left)', () => {
    const strip = document.createElement('div')
    document.body.appendChild(strip)
    const state = zeroTouchDrive()
    const detach = attachTouchDriveStrip(strip, state)

    firePointer(strip, 'pointerdown', 1, 100, 100)
    firePointer(strip, 'pointermove', 1, 200, 100)
    expect(state.steer).toBeLessThan(0)
    expect(state.drive).toBe(0)

    firePointer(strip, 'pointermove', 1, 40, 100)
    expect(state.steer).toBeGreaterThan(0)
    detach()
  })

  it('offset from touch-down maps to −1…1 clamped (distance = intensity)', () => {
    const strip = document.createElement('div')
    strip.getBoundingClientRect = () =>
      ({ width: 200, height: 60, left: 0, top: 0, right: 200, bottom: 60 } as DOMRect)
    document.body.appendChild(strip)
    const state = zeroTouchDrive()
    const detach = attachTouchDriveStrip(strip, state)
    // radius = max(40, 200 × 0.32) = 64
    firePointer(strip, 'pointerdown', 1, 100, 30)
    firePointer(strip, 'pointermove', 1, 100, 130)
    expect(state.drive).toBe(-1)
    firePointer(strip, 'pointermove', 1, 100, 62)
    expect(state.drive).toBeCloseTo(-32 / 64, 5)
    detach()
  })

  it('lift resets both axes to zero', () => {
    const strip = document.createElement('div')
    document.body.appendChild(strip)
    const state = zeroTouchDrive()
    const detach = attachTouchDriveStrip(strip, state)

    firePointer(strip, 'pointerdown', 1, 100, 100)
    firePointer(strip, 'pointermove', 1, 160, 70)
    expect(state.steer).not.toBe(0)

    firePointer(strip, 'pointerup', 1, 160, 70)
    expect(state.steer).toBe(0)
    expect(state.drive).toBe(0)
    detach()
  })

  it('single primary finger: a second finger is ignored until the first lifts', () => {
    const strip = document.createElement('div')
    document.body.appendChild(strip)
    const state = zeroTouchDrive()
    const detach = attachTouchDriveStrip(strip, state)

    firePointer(strip, 'pointerdown', 1, 100, 100)
    firePointer(strip, 'pointerdown', 2, 60, 60)
    firePointer(strip, 'pointermove', 2, 20, 60)
    expect(state.steer).toBe(0) // finger 2 ignored
    expect(state.drive).toBe(0)
    firePointer(strip, 'pointermove', 1, 140, 100)
    expect(state.steer).toBeLessThan(0) // finger 1 still owns the strip
    detach()
  })

  it('mouse pointers do nothing', () => {
    const strip = document.createElement('div')
    document.body.appendChild(strip)
    const state = zeroTouchDrive()
    const detach = attachTouchDriveStrip(strip, state)

    firePointer(strip, 'pointerdown', 1, 100, 100, 'mouse')
    firePointer(strip, 'pointermove', 1, 200, 100, 'mouse')
    expect(state.steer).toBe(0)
    expect(state.drive).toBe(0)
    detach()
  })
})

describe('useTouchDriveStrip (hook)', () => {
  it('marks the element as a touch input sink and writes into the state ref', () => {
    const strip = document.createElement('div')
    document.body.appendChild(strip)
    const stateRef = { current: { steer: 0, drive: 0 } as RawDriveTouchState | null }
    renderHook(() => useTouchDriveStrip({ current: strip }, stateRef))

    expect(strip.dataset.touchInputSink).toBe('')

    act(() => {
      firePointer(strip, 'pointerdown', 7, 100, 100)
      firePointer(strip, 'pointermove', 7, 100, 40)
    })

    expect(stateRef.current!.drive).toBeGreaterThan(0)
  })

  it('does nothing when the state ref is empty (HUD without touch drive)', () => {
    const strip = document.createElement('div')
    document.body.appendChild(strip)
    const stateRef = { current: null }
    expect(() => renderHook(() => useTouchDriveStrip({ current: strip }, stateRef))).not.toThrow()
    expect(strip.dataset.touchInputSink).toBeUndefined()
  })
})
