import { describe, expect, it } from 'vitest'
import { JSON_TEXTAREA_ROWS_CAP, jsonTextareaRows } from './jsonTextareaRows'

describe('jsonTextareaRows', () => {
  it('returns 1 for empty string', () => {
    expect(jsonTextareaRows('')).toBe(1)
  })

  it('matches line count for short JSON', () => {
    expect(jsonTextareaRows('{\n  "a": 1\n}')).toBe(3)
  })

  it(`caps at ${JSON_TEXTAREA_ROWS_CAP}`, () => {
    const text = Array.from({ length: 40 }, () => 'x').join('\n')
    expect(jsonTextareaRows(text)).toBe(JSON_TEXTAREA_ROWS_CAP)
  })
})
