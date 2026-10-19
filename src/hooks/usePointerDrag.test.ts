import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePointerDrag } from './usePointerDrag'
import type { PointerEvent as ReactPointerEvent } from 'react'

function makeTarget(): HTMLElement {
  const target = document.createElement('div')
  target.setPointerCapture = vi.fn()
  target.releasePointerCapture = vi.fn()
  return target
}

type FakePointerEvent = Partial<ReactPointerEvent<HTMLElement>> & { currentTarget: HTMLElement }

function pointerEvent(target: HTMLElement, overrides: Partial<ReactPointerEvent<HTMLElement>> = {}): FakePointerEvent {
  return {
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    currentTarget: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  }
}

function down(h: ReturnType<typeof usePointerDrag>, target: HTMLElement, overrides: Partial<ReactPointerEvent<HTMLElement>> = {}) {
  h.onPointerDown(pointerEvent(target, overrides) as unknown as ReactPointerEvent<HTMLElement>)
}
function move(h: ReturnType<typeof usePointerDrag>, target: HTMLElement, overrides: Partial<ReactPointerEvent<HTMLElement>> = {}) {
  h.onPointerMove(pointerEvent(target, overrides) as unknown as ReactPointerEvent<HTMLElement>)
}
function up(h: ReturnType<typeof usePointerDrag>, target: HTMLElement, overrides: Partial<ReactPointerEvent<HTMLElement>> = {}) {
  h.onPointerUp(pointerEvent(target, overrides) as unknown as ReactPointerEvent<HTMLElement>)
}

describe('usePointerDrag', () => {
  it('captures the pointer on primary down and reports total deltas per move', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove, onEnd })).result.current
    const target = makeTarget()

    down(h, target, { pointerType: 'mouse', clientX: 100, clientY: 200 })
    expect(target.setPointerCapture).toHaveBeenCalledWith(1)

    move(h, target, { pointerType: 'mouse', clientX: 130, clientY: 240 })
    move(h, target, { pointerType: 'mouse', clientX: 160, clientY: 200 })
    expect(onMove).toHaveBeenNthCalledWith(1, { pointerId: 1, dx: 30, dy: 40 })
    expect(onMove).toHaveBeenNthCalledWith(2, { pointerId: 1, dx: 60, dy: 0 })

    up(h, target)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(onEnd).toHaveBeenCalledWith({ cancelled: false, pointerId: 1 })
  })

  it('touch drags drive the same callbacks', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove, onEnd })).result.current
    const target = makeTarget()

    down(h, target, { pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 10 })
    move(h, target, { pointerType: 'touch', pointerId: 7, clientX: 34, clientY: 12 })
    up(h, target, { pointerType: 'touch', pointerId: 7 })

    expect(onMove).toHaveBeenCalledWith({ pointerId: 7, dx: 24, dy: 2 })
    expect(onEnd).toHaveBeenCalledWith({ cancelled: false, pointerId: 7 })
  })

  it('pointercancel ends the drag as cancelled and ignores later moves', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove, onEnd })).result.current
    const target = makeTarget()

    down(h, target, { pointerType: 'touch' })
    move(h, target, { pointerType: 'touch', clientX: 130, clientY: 100 })
    h.onPointerCancel(pointerEvent(target, { pointerType: 'touch' }) as unknown as ReactPointerEvent<HTMLElement>)

    expect(onEnd).toHaveBeenCalledWith({ cancelled: true, pointerId: 1 })
    const calls = onMove.mock.calls.length
    move(h, target, { pointerType: 'touch', clientX: 200, clientY: 100 })
    expect(onMove).toHaveBeenCalledTimes(calls)
  })

  it('ignores non-primary buttons', () => {
    const onStart = vi.fn()
    const onMove = vi.fn()
    const h = renderHook(() => usePointerDrag({ onStart, onMove, onEnd: vi.fn() })).result.current
    const target = makeTarget()

    down(h, target, { button: 1, pointerType: 'mouse' })
    move(h, target, { clientX: 130, clientY: 100 })

    expect(onStart).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
    expect(target.setPointerCapture).not.toHaveBeenCalled()
  })

  it('onStart can veto the drag (e.g. pointer on an inner button)', () => {
    const onStart = vi.fn(() => false)
    const onMove = vi.fn()
    const h = renderHook(() => usePointerDrag({ onStart, onMove, onEnd: vi.fn() })).result.current
    const target = makeTarget()
    const e = pointerEvent(target)

    down(h, target, { pointerType: 'mouse' })
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(target.setPointerCapture).not.toHaveBeenCalled()
    move(h, target, { clientX: 130, clientY: 100 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('ignores moves from a different pointer id (second finger)', () => {
    const onMove = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove, onEnd: vi.fn() })).result.current
    const target = makeTarget()

    down(h, target, { pointerId: 1 })
    move(h, target, { pointerId: 2, clientX: 300, clientY: 300 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('survives targets without pointer capture (older jsdom)', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove, onEnd })).result.current
    const target = document.createElement('div')
    // No setPointerCapture / releasePointerCapture stubs.

    down(h, target, { pointerType: 'touch' })
    move(h, target, { pointerType: 'touch', clientX: 150, clientY: 100 })
    up(h, target, { pointerType: 'touch' })

    expect(onMove).toHaveBeenCalledWith({ pointerId: 1, dx: 50, dy: 0 })
    expect(onEnd).toHaveBeenCalledWith({ cancelled: false, pointerId: 1 })
  })

  it('lostpointercapture ends the drag as cancelled and ignores later moves', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove, onEnd })).result.current
    const target = makeTarget()

    down(h, target, { pointerType: 'mouse', clientX: 100, clientY: 100 })
    move(h, target, { pointerType: 'mouse', clientX: 130, clientY: 100 })
    h.onLostPointerCapture(pointerEvent(target, { pointerType: 'mouse' }) as unknown as ReactPointerEvent<HTMLElement>)

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith({ cancelled: true, pointerId: 1 })

    const calls = onMove.mock.calls.length
    move(h, target, { pointerType: 'mouse', clientX: 200, clientY: 100 })
    expect(onMove).toHaveBeenCalledTimes(calls)
  })

  it('lostpointercapture after a normal pointerup does not double-fire onEnd', () => {
    const onEnd = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove: vi.fn(), onEnd })).result.current
    const target = makeTarget()

    down(h, target, { pointerType: 'mouse', clientX: 100, clientY: 100 })
    up(h, target, { pointerType: 'mouse' })
    // Browsers release capture (and fire lostpointercapture) after pointerup.
    h.onLostPointerCapture(pointerEvent(target, { pointerType: 'mouse' }) as unknown as ReactPointerEvent<HTMLElement>)

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith({ cancelled: false, pointerId: 1 })
  })

  it('lostpointercapture for a different pointer id is ignored', () => {
    const onEnd = vi.fn()
    const h = renderHook(() => usePointerDrag({ onMove: vi.fn(), onEnd })).result.current
    const target = makeTarget()

    down(h, target, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 })
    h.onLostPointerCapture(pointerEvent(target, { pointerId: 2, pointerType: 'mouse' }) as unknown as ReactPointerEvent<HTMLElement>)

    expect(onEnd).not.toHaveBeenCalled()
  })
})
