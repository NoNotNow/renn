import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  formatTransformerTraceBriefLine,
  isTransformerTraceBriefLineWider,
  measureTransformerTraceBriefLineWidth,
  resetTransformerTraceBriefMeasureForTests,
} from './transformerTraceBriefMeasure'

const FONT = '10px sans-serif'

afterEach(() => {
  resetTransformerTraceBriefMeasureForTests()
})

describe('transformerTraceBriefMeasure', () => {
  it('formats IN/OUT prefixes', () => {
    expect(formatTransformerTraceBriefLine('IN', 'throttle')).toBe('IN: throttle')
    expect(formatTransformerTraceBriefLine('OUT', 'force')).toBe('OUT: force')
  })

  it('compares rendered width, not character count', () => {
    const wide = 'WWWWWW'
    const narrow = 'iiiiii'
    expect(wide.length).toBe(narrow.length)

    let call = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const text = this.textContent ?? ''
      const width = text.includes('W') ? 120 : 60
      call += 1
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }
    })

    expect(
      isTransformerTraceBriefLineWider('IN', wide, narrow, FONT),
    ).toBe(true)
    expect(
      isTransformerTraceBriefLineWider('IN', narrow, wide, FONT),
    ).toBe(false)
    expect(call).toBeGreaterThan(0)
    expect(measureTransformerTraceBriefLineWidth('OUT', wide, FONT)).toBe(120)
  })
})
