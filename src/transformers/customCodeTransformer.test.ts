import { describe, expect, test } from 'vitest'
import { CustomCodeTransformer, defaultCustomTransformerCode, TRANSFORMER_RUNTIME_API } from './customCodeTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('CustomCodeTransformer', () => {
  test('legacy body without api still runs', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: 'return { force: [1, 2, 3] };',
    })
    const out = t.transform(createMockTransformInput(), 0.1)
    expect(out.force).toEqual([1, 2, 3])
  })

  test('uses api.getForwardVector and scaleVec3', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: 'return { impulse: api.scaleVec3(api.getForwardVector([0,0,0]), 5 * dt) };',
    })
    const out = t.transform(
      createMockTransformInput({
        rotation: [0, 0, 0],
        environment: { isTouchingObject: true },
      }),
      0.2,
    )
    const fwd = TRANSFORMER_RUNTIME_API.getForwardVector([0, 0, 0])
    expect(out.impulse).toEqual([fwd[0] * 5 * 0.2, fwd[1] * 5 * 0.2, fwd[2] * 5 * 0.2])
  })

  test('defaultCustomTransformerCode references api and respects touching gate', () => {
    const src = defaultCustomTransformerCode()
    expect(src).toContain('api.getForwardVector')
    const t = new CustomCodeTransformer({ type: 'custom', code: src, params: { power: 100 } })
    const inAir = t.transform(createMockTransformInput({ environment: {} }), 0.1)
    expect(inAir).toEqual({})
    const grounded = t.transform(
      createMockTransformInput({ environment: { isTouchingObject: true } }),
      0.1,
    )
    expect(grounded.impulse).toBeDefined()
  })
})
