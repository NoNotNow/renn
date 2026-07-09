import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTransientSnackbar } from './useTransientSnackbar'

describe('useTransientSnackbar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a message and clears it after the default duration', () => {
    const { result } = renderHook(() => useTransientSnackbar())

    act(() => {
      result.current.showSnackbar('Project saved')
    })
    expect(result.current.message).toBe('Project saved')

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.message).toBeNull()
  })

  it('respects a custom duration', () => {
    const { result } = renderHook(() => useTransientSnackbar())

    act(() => {
      result.current.showSnackbar('Saved', 1)
    })
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(result.current.message).toBe('Saved')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.message).toBeNull()
  })
})
