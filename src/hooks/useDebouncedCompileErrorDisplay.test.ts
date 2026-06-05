import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import {
  COMPILE_ERROR_DISPLAY_DEBOUNCE_MS,
  useDebouncedCompileErrorDisplay,
} from './useDebouncedCompileErrorDisplay'

describe('useDebouncedCompileErrorDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null while debounce is pending', () => {
    const containerRef = createRef<HTMLDivElement>()
    const { result, rerender } = renderHook(
      ({ error }) => useDebouncedCompileErrorDisplay(error, containerRef),
      { initialProps: { error: null as string | null } },
    )

    rerender({ error: 'Failed to compile custom transformer "custom"' })
    expect(result.current).toBeNull()

    act(() => {
      vi.advanceTimersByTime(COMPILE_ERROR_DISPLAY_DEBOUNCE_MS - 1)
    })
    expect(result.current).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('Failed to compile custom transformer "custom"')
  })

  it('clears immediately when compile error is resolved', () => {
    const containerRef = createRef<HTMLDivElement>()
    const { result, rerender } = renderHook(
      ({ error }: { error: string | null }) => useDebouncedCompileErrorDisplay(error, containerRef),
      { initialProps: { error: 'Failed to compile' as string | null } },
    )

    act(() => {
      vi.advanceTimersByTime(COMPILE_ERROR_DISPLAY_DEBOUNCE_MS)
    })
    expect(result.current).toBe('Failed to compile')

    rerender({ error: null })
    expect(result.current).toBeNull()
  })

  it('resets debounce when compile error changes while typing', () => {
    const containerRef = createRef<HTMLDivElement>()
    const { result, rerender } = renderHook(
      ({ error }) => useDebouncedCompileErrorDisplay(error, containerRef),
      { initialProps: { error: 'error A' } },
    )

    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ error: 'error B' })
    expect(result.current).toBeNull()

    act(() => {
      vi.advanceTimersByTime(COMPILE_ERROR_DISPLAY_DEBOUNCE_MS - 1)
    })
    expect(result.current).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('error B')
  })

  it('flushes immediately when focus leaves Monaco inside the container', () => {
    const container = document.createElement('div')
    const monacoRoot = document.createElement('div')
    monacoRoot.className = 'monaco-editor'
    const textarea = document.createElement('textarea')
    monacoRoot.appendChild(textarea)
    container.appendChild(monacoRoot)
    document.body.appendChild(container)

    const containerRef = { current: container }
    const { result } = renderHook(() =>
      useDebouncedCompileErrorDisplay('Failed to compile', containerRef),
    )

    expect(result.current).toBeNull()
    textarea.focus()

    act(() => {
      textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      vi.runAllTimers()
    })

    expect(result.current).toBe('Failed to compile')

    container.remove()
  })
})
