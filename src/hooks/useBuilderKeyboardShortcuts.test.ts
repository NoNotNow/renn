import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuilderKeyboardShortcuts } from '@/hooks/useBuilderKeyboardShortcuts'

function dispatch(init: KeyboardEventInit & { code?: string }): KeyboardEvent {
  const evt = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  window.dispatchEvent(evt)
  return evt
}

function makeApi() {
  return {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClearSelection: vi.fn(),
    onToggleEditNavigationMode: vi.fn(),
    onCycleActiveAvatar: vi.fn(() => true),
    onChangeCameraMode: vi.fn(),
    onGroupSelection: vi.fn(),
    onUngroupSelection: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onSave: vi.fn(),
  }
}

describe('useBuilderKeyboardShortcuts', () => {
  let prevFocus: HTMLElement | null
  beforeEach(() => {
    prevFocus = document.activeElement as HTMLElement | null
    document.body.focus()
  })
  afterEach(() => {
    prevFocus?.focus()
    document.body.innerHTML = ''
  })

  it('Cmd+C and Cmd+V invoke copy and paste', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    act(() => {
      dispatch({ key: 'c', metaKey: true })
    })
    expect(api.onCopy).toHaveBeenCalledTimes(1)
    expect(api.onPaste).not.toHaveBeenCalled()

    act(() => {
      dispatch({ key: 'v', ctrlKey: true })
    })
    expect(api.onPaste).toHaveBeenCalledTimes(1)
  })

  it('Cmd+S invokes onSave', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    act(() => {
      dispatch({ key: 's', code: 'KeyS', metaKey: true })
    })
    expect(api.onSave).toHaveBeenCalledTimes(1)

    act(() => {
      dispatch({ key: 's', code: 'KeyS', ctrlKey: true })
    })
    expect(api.onSave).toHaveBeenCalledTimes(2)
  })

  it('Cmd+C is skipped when there is a non-empty text selection', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'hello',
    } as unknown as Selection)

    act(() => {
      dispatch({ key: 'c', metaKey: true })
    })
    expect(api.onCopy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('Cmd+Z triggers undo, Cmd+Shift+Z and Cmd+Y trigger redo', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    act(() => {
      dispatch({ key: 'z', metaKey: true })
    })
    expect(api.onUndo).toHaveBeenCalledTimes(1)
    expect(api.onRedo).not.toHaveBeenCalled()

    act(() => {
      dispatch({ key: 'z', metaKey: true, shiftKey: true })
    })
    expect(api.onRedo).toHaveBeenCalledTimes(1)

    act(() => {
      dispatch({ key: 'y', ctrlKey: true })
    })
    expect(api.onRedo).toHaveBeenCalledTimes(2)
  })

  it('Escape clears selection; Shift+Escape does not; Cmd+E toggles edit-nav', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    act(() => {
      dispatch({ key: 'Escape' })
    })
    expect(api.onClearSelection).toHaveBeenCalledTimes(1)

    act(() => {
      dispatch({ key: 'Escape', shiftKey: true })
    })
    expect(api.onClearSelection).toHaveBeenCalledTimes(1)

    act(() => {
      dispatch({ key: 'e', code: 'KeyE', metaKey: true })
    })
    expect(api.onToggleEditNavigationMode).toHaveBeenCalledTimes(1)
  })

  it('Digit1 cycles avatar; Digit0 cycles camera mode', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    act(() => {
      dispatch({ key: '1', code: 'Digit1' })
    })
    expect(api.onCycleActiveAvatar).toHaveBeenCalledTimes(1)

    act(() => {
      dispatch({ key: '0', code: 'Digit0' })
    })
    expect(api.onChangeCameraMode).toHaveBeenCalledTimes(1)
  })

  it('shortcuts are suppressed while focus is inside .monaco-editor', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    const root = document.createElement('div')
    root.className = 'monaco-editor'
    const ta = document.createElement('textarea')
    root.appendChild(ta)
    document.body.appendChild(root)
    ta.focus()

    act(() => {
      dispatch({ key: 'Escape' })
      dispatch({ key: '0', code: 'Digit0' })
    })
    expect(api.onClearSelection).not.toHaveBeenCalled()
    expect(api.onChangeCameraMode).not.toHaveBeenCalled()
  })

  it('shortcuts are suppressed while focus is on an INPUT', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    act(() => {
      dispatch({ key: 'z', metaKey: true })
      dispatch({ key: 'Escape' })
      dispatch({ key: '0', code: 'Digit0' })
      dispatch({ key: '1', code: 'Digit1' })
      dispatch({ key: 'e', code: 'KeyE', metaKey: true })
    })
    expect(api.onUndo).not.toHaveBeenCalled()
    expect(api.onRedo).not.toHaveBeenCalled()
    expect(api.onClearSelection).not.toHaveBeenCalled()
    expect(api.onToggleEditNavigationMode).not.toHaveBeenCalled()
    expect(api.onCycleActiveAvatar).not.toHaveBeenCalled()
    expect(api.onChangeCameraMode).not.toHaveBeenCalled()
    expect(api.onCopy).not.toHaveBeenCalled()
    expect(api.onPaste).not.toHaveBeenCalled()
  })

  it('listener is removed on unmount', () => {
    const api = makeApi()
    const { unmount } = renderHook(() => useBuilderKeyboardShortcuts(api))

    unmount()

    act(() => {
      dispatch({ key: 'Escape' })
    })
    expect(api.onClearSelection).not.toHaveBeenCalled()
  })

  it('Cmd+G groups; Cmd+Shift+G ungroups', () => {
    const api = makeApi()
    renderHook(() => useBuilderKeyboardShortcuts(api))

    act(() => {
      dispatch({ key: 'g', code: 'KeyG', metaKey: true })
    })
    expect(api.onGroupSelection).toHaveBeenCalledTimes(1)
    expect(api.onUngroupSelection).not.toHaveBeenCalled()

    act(() => {
      dispatch({ key: 'g', code: 'KeyG', metaKey: true, shiftKey: true })
    })
    expect(api.onUngroupSelection).toHaveBeenCalledTimes(1)
    expect(api.onGroupSelection).toHaveBeenCalledTimes(1)
  })

  it('does not log avatar cycle when onCycleActiveAvatar returns false', () => {
    const api = makeApi()
    api.onCycleActiveAvatar.mockReturnValue(false)
    renderHook(() => useBuilderKeyboardShortcuts(api))

    act(() => {
      dispatch({ key: '1', code: 'Digit1' })
    })
    expect(api.onCycleActiveAvatar).toHaveBeenCalled()
  })
})
