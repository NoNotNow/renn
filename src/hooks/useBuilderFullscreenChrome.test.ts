import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuilderFullscreenChrome } from '@/hooks/useBuilderFullscreenChrome'
import * as fullscreenApi from '@/utils/fullscreenApi'

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

  it('collapseSideDrawers closes both drawers without affecting fullscreen restore from that state', () => {
    const { result } = renderHook(() => useBuilderFullscreenChrome())
    expect(result.current.leftDrawerOpen).toBe(true)
    expect(result.current.rightDrawerOpen).toBe(true)

    act(() => {
      result.current.collapseSideDrawers()
    })
    expect(result.current.leftDrawerOpen).toBe(false)
    expect(result.current.rightDrawerOpen).toBe(false)
    expect(result.current.builderFullscreenActive).toBe(false)

    act(() => {
      result.current.handleSceneFullscreenChange(true)
    })
    expect(result.current.builderFullscreenActive).toBe(true)
    act(() => {
      result.current.handleSceneFullscreenChange(false)
    })
    expect(result.current.leftDrawerOpen).toBe(false)
    expect(result.current.rightDrawerOpen).toBe(false)
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

  it('exposes stable builderColumnRef and fsSidebarsHitTestRef objects', () => {
    const { result, rerender } = renderHook(() => useBuilderFullscreenChrome())
    const col = result.current.builderColumnRef
    const hit = result.current.fsSidebarsHitTestRef
    rerender()
    expect(result.current.builderColumnRef).toBe(col)
    expect(result.current.fsSidebarsHitTestRef).toBe(hit)
  })

  it('keeps builder chrome idle-visible while pointer is over the sidebars hit-test root', async () => {
    vi.useFakeTimers()
    const elementFromPoint = vi.fn<(nx: number, ny: number) => Element | null>()
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      writable: true,
      value: elementFromPoint,
    })
    try {
      const spyEnabled = vi.spyOn(fullscreenApi, 'isFullscreenEnabled').mockReturnValue(true)
      const { result } = renderHook(() => useBuilderFullscreenChrome())
      await act(async () => {
        await Promise.resolve()
      })

      const root = document.createElement('div')
      const inner = document.createElement('span')
      root.appendChild(inner)

      act(() => {
        result.current.fsSidebarsHitTestRef.current = root
      })
      act(() => {
        result.current.handleSceneFullscreenChange(true)
      })
      act(() => {
        result.current.bumpFsChrome()
      })

      elementFromPoint.mockReturnValue(inner)

      act(() => {
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }))
      })
      expect(result.current.builderChromeIdleHidden).toBe(false)

      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      expect(result.current.fsChromeVisible).toBe(false)
      expect(result.current.builderChromeIdleHidden).toBe(false)

      elementFromPoint.mockReturnValue(document.body)
      act(() => {
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }))
      })
      expect(result.current.fsChromeVisible).toBe(true)
      expect(result.current.builderChromeIdleHidden).toBe(false)

      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      expect(result.current.builderChromeIdleHidden).toBe(true)

      spyEnabled.mockRestore()
    } finally {
      Reflect.deleteProperty(document, 'elementFromPoint')
      vi.useRealTimers()
    }
  })
})
