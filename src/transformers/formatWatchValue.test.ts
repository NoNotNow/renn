import { describe, it, expect } from 'vitest'
import { formatWatchValue } from './formatWatchValue'

describe('formatWatchValue', () => {
  it('formats primitives', () => {
    expect(formatWatchValue(null)).toBe('null')
    expect(formatWatchValue(undefined)).toBe('undefined')
    expect(formatWatchValue(234)).toBe('234')
    expect(formatWatchValue('hello')).toBe('hello')
    expect(formatWatchValue(true)).toBe('true')
  })

  it('JSON-stringifies arrays and objects', () => {
    expect(formatWatchValue([1, 2, 3])).toBe('[1,2,3]')
    expect(formatWatchValue({ a: 1 })).toBe('{"a":1}')
  })

  it('truncates very long strings', () => {
    const long = 'x'.repeat(300)
    expect(formatWatchValue(long).endsWith('…')).toBe(true)
    expect(formatWatchValue(long).length).toBe(241)
  })
})
