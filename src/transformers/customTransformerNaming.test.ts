import { describe, expect, test } from 'vitest'
import {
  defaultCustomNameForOrdinal,
  ensureUniqueCustomTransformerName,
  labelCustomTransformer,
  nextUniqueCustomTransformerName,
} from './customTransformerNaming'
import type { TransformerConfig } from '@/types/transformer'

describe('customTransformerNaming', () => {
  test('defaultCustomNameForOrdinal', () => {
    expect(defaultCustomNameForOrdinal(1)).toBe('Custom')
    expect(defaultCustomNameForOrdinal(2)).toBe('Custom 2')
    expect(defaultCustomNameForOrdinal(3)).toBe('Custom 3')
  })

  test('nextUniqueCustomTransformerName skips collisions', () => {
    const stack: TransformerConfig[] = [
      { type: 'custom', name: 'Custom' },
      { type: 'custom', name: 'Custom 2' },
    ]
    expect(nextUniqueCustomTransformerName(stack)).toBe('Custom 3')
  })

  test('ensureUniqueCustomTransformerName resolves duplicates', () => {
    const stack: TransformerConfig[] = [
      { type: 'custom', name: 'A' },
      { type: 'car2' },
      { type: 'custom', name: 'B' },
    ]
    expect(ensureUniqueCustomTransformerName('A', stack, 2)).toBe('A (2)')
    expect(ensureUniqueCustomTransformerName('new', stack, 2)).toBe('new')
  })

  test('labelCustomTransformer uses index when name empty', () => {
    expect(labelCustomTransformer({ type: 'custom' }, 4)).toBe('Custom (4)')
    expect(labelCustomTransformer({ type: 'custom', name: '  Hi  ' }, 4)).toBe('Hi')
  })
})
