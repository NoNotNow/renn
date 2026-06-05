import { describe, it, expect } from 'vitest'
import {
  groupRegistryTransformersByTitle,
  transformerConfigDisplayName,
  transformerOrganizeTitle,
} from '@/transformers/transformerUtils'
import type { TransformerConfig } from '@/types/transformer'

describe('transformerConfigDisplayName', () => {
  it('uses trimmed name for custom transformers when set', () => {
    const config: TransformerConfig = { type: 'custom', name: '  AutoBrake  ', code: 'return {}' }
    expect(transformerConfigDisplayName(config)).toBe('AutoBrake')
  })

  it('falls back to type when name is empty', () => {
    expect(transformerConfigDisplayName({ type: 'wanderer' })).toBe('wanderer')
    expect(transformerConfigDisplayName({ type: 'custom', name: '   ', code: 'return {}' })).toBe('custom')
  })
})

describe('groupRegistryTransformersByTitle', () => {
  it('stacks transformers with the same organize title', () => {
    const registry: Record<string, TransformerConfig> = {
      car_a_tf1: { type: 'wanderer', priority: 0 },
      car_b_tf1: { type: 'wanderer', priority: 1 },
      car_b_tf2: { type: 'custom', name: 'AutoBrake', code: 'return {}', priority: 2 },
    }

    expect(transformerOrganizeTitle(registry.car_b_tf2!)).toBe('AutoBrake')

    const groups = groupRegistryTransformersByTitle(registry, ['car_a_tf1'])
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.title === 'wanderer')).toMatchObject({
      ids: ['car_b_tf1'],
      representativeId: 'car_b_tf1',
    })
    expect(groups.find((g) => g.title === 'AutoBrake')).toMatchObject({
      ids: ['car_b_tf2'],
      representativeId: 'car_b_tf2',
    })
  })

  it('merges multiple wanderer entries into one stack', () => {
    const registry: Record<string, TransformerConfig> = {
      a_tf0: { type: 'wanderer' },
      b_tf0: { type: 'wanderer' },
      c_tf0: { type: 'wanderer' },
    }

    const groups = groupRegistryTransformersByTitle(registry)
    expect(groups).toEqual([
      {
        title: 'wanderer',
        ids: ['a_tf0', 'b_tf0', 'c_tf0'],
        representativeId: 'a_tf0',
      },
    ])
  })
})
