import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRef } from 'react'
import { renderHook, act } from '@testing-library/react'
import { useSceneFullscreen } from '@/hooks/useSceneFullscreen'

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => el,
  })
}

function setFullscreenEnabled(enabled: boolean) {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => enabled,
  })
}

function fireFullscreenChange() {
  document.dispatchEvent(new Event('fullscreenchange'))
}

describe('useSceneFullscreen', () => {
  let requestSpy: ReturnType<typeof vi.fn>
  let exitSpy: ReturnType<typeof vi.fn>
  let sceneRoot: HTMLDivElement

  beforeEach(() => {
    sceneRoot = document.createElement('div')
    document.body.appendChild(sceneRoot)
    requestSpy = vi.fn(async () => {})
    exitSpy = vi.fn(async () => {})
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      writable: true,
      value: requestSpy,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      writable: true,
      value: exitSpy,
    })
    setFullscreenEnabled(true)
    setFullscreenElement(null)
  })

  afterEach(() => {
    document.body.removeChild(sceneRoot)
  })

  it('detects fullscreen support after mount', () => {
    const ref = { current: sceneRoot } as React.RefObject<HTMLElement | null>
    const { result } = renderHook(() => useSceneFullscreen({ sceneRootRef: ref }))
    expect(result.current.supported).toBe(true)
  })

  it('reports inactive when no element is fullscreen', () => {
    const ref = { current: sceneRoot } as React.RefObject<HTMLElement | null>
    const { result } = renderHook(() => useSceneFullscreen({ sceneRootRef: ref }))
    expect(result.current.active).toBe(false)
  })

  it('toggle requests fullscreen on the configured target', () => {
    const ref = { current: sceneRoot } as React.RefObject<HTMLElement | null>
    const { result } = renderHook(() => useSceneFullscreen({ sceneRootRef: ref }))
    act(() => {
      result.current.toggle()
    })
    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(requestSpy.mock.instances[0]).toBe(sceneRoot)
  })

  it('toggle exits when target is already the fullscreen element', () => {
    setFullscreenElement(sceneRoot)
    const ref = { current: sceneRoot } as React.RefObject<HTMLElement | null>
    const { result } = renderHook(() => useSceneFullscreen({ sceneRootRef: ref }))
    act(() => {
      fireFullscreenChange()
    })
    expect(result.current.active).toBe(true)
    act(() => {
      result.current.toggle()
    })
    expect(exitSpy).toHaveBeenCalledTimes(1)
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it('prefers fullscreenTargetRef over sceneRootRef', () => {
    const altTarget = document.createElement('div')
    document.body.appendChild(altTarget)
    const sceneRef = { current: sceneRoot } as React.RefObject<HTMLElement | null>
    const altRef = { current: altTarget } as React.RefObject<HTMLElement | null>
    const { result } = renderHook(() =>
      useSceneFullscreen({ sceneRootRef: sceneRef, fullscreenTargetRef: altRef }),
    )
    act(() => {
      result.current.toggle()
    })
    expect(requestSpy.mock.instances[0]).toBe(altTarget)
    document.body.removeChild(altTarget)
  })

  it('fires onFullscreenChange on every transition', () => {
    const onChange = vi.fn()
    const ref = { current: sceneRoot } as React.RefObject<HTMLElement | null>
    renderHook(() => useSceneFullscreen({ sceneRootRef: ref, onFullscreenChange: onChange }))
    expect(onChange).not.toHaveBeenCalled()

    setFullscreenElement(sceneRoot)
    act(() => {
      fireFullscreenChange()
    })
    expect(onChange).toHaveBeenLastCalledWith(true)

    setFullscreenElement(null)
    act(() => {
      fireFullscreenChange()
    })
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('externalChromeControl overrides the internal pointer reveal timer', () => {
    const ref = { current: sceneRoot } as React.RefObject<HTMLElement | null>
    const bump = vi.fn()
    const { result } = renderHook(() =>
      useSceneFullscreen({
        sceneRootRef: ref,
        externalChromeControl: { visible: true, bumpActivity: bump },
      }),
    )
    expect(result.current.useExternalChrome).toBe(true)
    expect(result.current.chromeVisible).toBe(true)
    expect(result.current.bumpChrome).toBe(bump)
  })

  it('returns null active when target ref is missing', () => {
    const ref = createRef<HTMLElement | null>()
    const { result } = renderHook(() => useSceneFullscreen({ sceneRootRef: ref }))
    act(() => {
      result.current.toggle()
    })
    expect(requestSpy).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
