import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuilderFullscreenChrome } from '@/hooks/useBuilderFullscreenChrome'

function clearDrawerKeys() {
  if (typeof localStorage?.removeItem !== 'function') return
  localStorage.removeItem('leftDrawerOpen')
  localStorage.removeItem('rightDrawerOpen')
}

describe('useBuilderFullscreenChrome', () => {
  beforeEach(() => {
    clearDrawerKeys()
  })
  afterEach(() => {
    clearDrawerKeys()
  })

  it('initializes with both drawers open by default and chrome hidden', () => {
    const { result } = renderHook(() => useBuilderFullscreenChrome())
    expect(result.current.leftDrawerOpen).toBe(true)
    expect(result.current.rightDrawerOpen).toBe(true)
    expect(result.current.builderFullscreenActive).toBe(false)
    expect(result.current.fsChromeVisible).toBe(false)
    expect(result.current.builderChromeIdleHidden).toBe(false)
  })

  it('reads persisted drawer state from localStorage', () => {
    if (typeof localStorage?.setItem !== 'function') return
    localStorage.setItem('leftDrawerOpen', 'false')
    localStorage.setItem('rightDrawerOpen', 'false')
    const { result } = renderHook(() => useBuilderFullscreenChrome())
    expect(result.current.leftDrawerOpen).toBe(false)
    expect(result.current.rightDrawerOpen).toBe(false)
  })

  it('collapses drawers on fullscreen enter and restores on exit', () => {
    const { result } = renderHook(() => useBuilderFullscreenChrome())
    expect(result.current.leftDrawerOpen).toBe(true)
    expect(result.current.rightDrawerOpen).toBe(true)

    act(() => {
      result.current.handleSceneFullscreenChange(true)
    })
    expect(result.current.builderFullscreenActive).toBe(true)
    expect(result.current.leftDrawerOpen).toBe(false)
    expect(result.current.rightDrawerOpen).toBe(false)

    act(() => {
      result.current.handleSceneFullscreenChange(false)
    })
    expect(result.current.builderFullscreenActive).toBe(false)
    expect(result.current.leftDrawerOpen).toBe(true)
    expect(result.current.rightDrawerOpen).toBe(true)
  })

  it('preserves a manually-collapsed drawer through the fullscreen round trip', () => {
    const { result } = renderHook(() => useBuilderFullscreenChrome())

    act(() => {
      result.current.setLeftDrawerOpen(false)
    })
    expect(result.current.leftDrawerOpen).toBe(false)
    expect(result.current.rightDrawerOpen).toBe(true)

    act(() => {
      result.current.handleSceneFullscreenChange(true)
    })
    expect(result.current.leftDrawerOpen).toBe(false)
    expect(result.current.rightDrawerOpen).toBe(false)

    act(() => {
      result.current.handleSceneFullscreenChange(false)
    })
    expect(result.current.leftDrawerOpen).toBe(false)
    expect(result.current.rightDrawerOpen).toBe(true)
  })

  it('builderChromeIdleHidden is true only in fullscreen with chrome hidden', () => {
    const { result } = renderHook(() => useBuilderFullscreenChrome())
    expect(result.current.builderChromeIdleHidden).toBe(false)

    act(() => {
      result.current.handleSceneFullscreenChange(true)
    })
    expect(result.current.builderFullscreenActive).toBe(true)
    expect(result.current.fsChromeVisible).toBe(false)
    expect(result.current.builderChromeIdleHidden).toBe(true)

    act(() => {
      result.current.bumpFsChrome()
    })
    expect(result.current.fsChromeVisible).toBe(true)
    expect(result.current.builderChromeIdleHidden).toBe(false)
  })

  it('exposes a stable builderColumnRef ref object', () => {
    const { result, rerender } = renderHook(() => useBuilderFullscreenChrome())
    const first = result.current.builderColumnRef
    rerender()
    expect(result.current.builderColumnRef).toBe(first)
  })
})
