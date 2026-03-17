import { describe, expect, test } from 'vitest'
import { listPresetNames, loadPreset } from './loader'

describe('transformerPresets loader', () => {
  test('listPresetNames returns array for car2 and input', () => {
    const car2 = listPresetNames('car2')
    const input = listPresetNames('input')
    expect(Array.isArray(car2)).toBe(true)
    expect(Array.isArray(input)).toBe(true)
  })

  test('loadPreset with non-existent name returns null', async () => {
    const result = await loadPreset('car2', '__does_not_exist__')
    expect(result).toBeNull()
  })
})
