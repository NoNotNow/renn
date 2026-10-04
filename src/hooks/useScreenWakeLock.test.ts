import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock'

let visibility: 'visible' | 'hidden' = 'visible'

function setVisibility(v: 'visible' | 'hidden') {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

const flush = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

describe('useScreenWakeLock', () => {
  let release: ReturnType<typeof vi.fn>
  let request: ReturnType<typeof vi.fn>

  beforeEach(() => {
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    release = vi.fn().mockResolvedValue(undefined)
    request = vi.fn().mockImplementation(async () => ({ release, addEventListener: vi.fn() }))
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
  })

  afterEach(() => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock
  })

  it('acquires when active and visible, releases on stop', async () => {
    const { rerender } = renderHook(({ a }) => useScreenWakeLock(a), { initialProps: { a: true } })
    await flush()
    expect(request).toHaveBeenCalledWith('screen')
    rerender({ a: false })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('does not acquire when inactive', async () => {
    renderHook(() => useScreenWakeLock(false))
    await flush()
    expect(request).not.toHaveBeenCalled()
  })

  it('releases on hidden and re-acquires on visible', async () => {
    renderHook(() => useScreenWakeLock(true))
    await flush()
    act(() => setVisibility('hidden'))
    expect(release).toHaveBeenCalledTimes(1)
    act(() => setVisibility('visible'))
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('releases on unmount', async () => {
    const { unmount } = renderHook(() => useScreenWakeLock(true))
    await flush()
    unmount()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('swallows request rejections', async () => {
    request.mockRejectedValue(new Error('low battery'))
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    renderHook(() => useScreenWakeLock(true))
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('no-ops when unsupported', () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow()
  })
})
