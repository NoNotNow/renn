import { describe, expect, test } from 'vitest'
import { listPresetNames, loadPreset } from './loader'

describe('transformerPresets loader', () => {
  test('listPresetNames returns array for preset transformer types', () => {
    for (const type of ['car2', 'input', 'person', 'targetPoseInput', 'kinematicMovement'] as const) {
      const names = listPresetNames(type)
      expect(Array.isArray(names)).toBe(true)
    }
  })

  test('loadPreset with non-existent name returns null', async () => {
    const result = await loadPreset('car2', '__does_not_exist__')
    expect(result).toBeNull()
  })
})
