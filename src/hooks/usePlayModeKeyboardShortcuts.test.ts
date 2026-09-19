import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePlayModeKeyboardShortcuts } from './usePlayModeKeyboardShortcuts'

describe('usePlayModeKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, href: '' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Cmd+P navigates to builder and prevents default', () => {
    renderHook(() => usePlayModeKeyboardShortcuts())
    const e = new KeyboardEvent('keydown', { code: 'KeyP', metaKey: true, bubbles: true, cancelable: true })
    const prevented = !window.dispatchEvent(e)
    expect(prevented).toBe(true)
    expect(window.location.href).not.toBe('')
  })
})
