import { describe, expect, test } from 'vitest'
import { createTransformerChain } from './transformerRegistry'
import type { TransformerConfig } from '@/types/transformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('Transformer Integration', () => {
  test('creates transformer chain from configs', async () => {
    const configs: TransformerConfig[] = [
      {
        type: 'input',
        priority: 0,
      },
      {
        type: 'airplane',
        priority: 1,
        params: {
          thrustForce: 50.0,
        },
      },
    ]

    const chain = await createTransformerChain(configs)

    expect(chain).not.toBeNull()
    expect(chain?.getAll().length).toBe(2)
  })

  test('transformer chain executes correctly', async () => {
    const configs: TransformerConfig[] = [
      {
        type: 'airplane',
        priority: 0,
        params: {
          thrustForce: 50.0,
        },
      },
    ]

    const chain = await createTransformerChain(configs)
    expect(chain).not.toBeNull()

    const input = createMockTransformInput({
      actions: { thrust: 1.0 },
      rotation: [0, 0, 0],
    })

    const output = chain!.execute(input, 0.016)

    expect(output.force).toBeDefined()
    expect(output.force![2]).toBeLessThan(0) // Forward force
  })

  test('handles empty config array', async () => {
    const chain = await createTransformerChain([])
    expect(chain).toBeNull()
  })

  test('handles invalid transformer type gracefully', async () => {
    const configs: TransformerConfig[] = [
      {
        type: 'invalid_type' as any,
        priority: 0,
      },
    ]

    // Should not throw, but log error
    const chain = await createTransformerChain(configs)
    expect(chain).not.toBeNull()
    expect(chain?.getAll().length).toBe(0) // Invalid transformer not added
  })
})
