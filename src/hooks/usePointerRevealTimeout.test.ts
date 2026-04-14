import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePointerRevealTimeout, POINTER_REVEAL_HIDE_DELAY_MS } from '@/hooks/usePointerRevealTimeout'

describe('usePointerRevealTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows on first bumpActivity and hides after delay', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePointerRevealTimeout(1000))

    expect(result.current.visible).toBe(false)

    act(() => {
      result.current.bumpActivity()
    })
    expect(result.current.visible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.visible).toBe(false)
  })

  it('does not setState on bumpActivity while already visible (timer only resets)', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePointerRevealTimeout(1000))

    act(() => {
      result.current.bumpActivity()
    })
    expect(result.current.visible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    act(() => {
      result.current.bumpActivity()
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.visible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.visible).toBe(false)
  })

  it('exports default hide delay constant', () => {
    expect(POINTER_REVEAL_HIDE_DELAY_MS).toBe(2800)
  })
})
