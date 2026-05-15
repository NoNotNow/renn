import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatMenuShortcut, isMacPlatform } from './menuShortcut'

describe('menuShortcut', () => {
  const originalUserAgent = navigator.userAgent

  afterEach(() => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: originalUserAgent })
  })

  it('formatMenuShortcut leaves Ctrl labels on non-Mac', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Windows NT 10.0' })
    expect(formatMenuShortcut('Ctrl+Shift+S')).toBe('Ctrl+Shift+S')
  })

  it('formatMenuShortcut maps Ctrl/Shift to symbols on Mac', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Macintosh' })
    expect(formatMenuShortcut('Ctrl+Shift+S')).toBe('⌘⇧S')
    expect(formatMenuShortcut('Ctrl+Z')).toBe('⌘Z')
  })

  it('isMacPlatform detects Mac user agents', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Macintosh' })
    expect(isMacPlatform()).toBe(true)
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Windows NT 10.0' })
    expect(isMacPlatform()).toBe(false)
  })
})
