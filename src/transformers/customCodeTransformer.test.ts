import { describe, expect, test, vi, afterEach } from 'vitest'
import {
  CustomCodeTransformer,
  defaultCustomTransformerCode,
  TRANSFORMER_RUNTIME_API,
  setTransformerSnackbarFn,
  validateCustomTransformerSource,
} from './customCodeTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'
import {
  clearCustomTransformerRuntimeError,
  getCustomTransformerRuntimeError,
  publishCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'

describe('validateCustomTransformerSource', () => {
  test('returns null for valid legacy body', () => {
    expect(validateCustomTransformerSource('return { force: [1, 0, 0] };')).toBeNull()
  })

  test('returns null for valid full function', () => {
    expect(
      validateCustomTransformerSource(`function transform(input, dt, params, state, api) {
      return {};
    }`),
    ).toBeNull()
  })

  test('returns message for syntax error', () => {
    const msg = validateCustomTransformerSource('return {')
    expect(msg).not.toBeNull()
    expect(msg).toContain('Failed to compile')
  })

  test('returns message for dangerous pattern', () => {
    const msg = validateCustomTransformerSource('eval(1)')
    expect(msg).toContain('dangerous pattern')
  })

  test('uses config key in messages', () => {
    const msg = validateCustomTransformerSource('eval(1)', 'custom:p42')
    expect(msg).toContain('custom:p42')
  })
})

describe('CustomCodeTransformer runtime bridge', () => {
  afterEach(() => {
    clearCustomTransformerRuntimeError()
  })

  test('publishRuntimeError reports when entity id and stack index are set', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform() { throw new Error('runtime-boom'); }`,
    })
    t.configStackIndex = 0
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getCustomTransformerRuntimeError()).toEqual({
      entityId: 'ent-a',
      configStackIndex: 0,
      message: 'runtime-boom',
    })
  })

  test('does not publish when entity context is missing', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform() { throw new Error('x'); }`,
    })
    t.transform(createMockTransformInput(), 0.1)
    expect(getCustomTransformerRuntimeError()).toBeNull()
  })

  test('successful transform clears prior error for same target', () => {
    publishCustomTransformerRuntimeError({
      entityId: 'ent-b',
      configStackIndex: 1,
      message: 'old',
    })
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: 'return {};',
    })
    t.configStackIndex = 1
    t.runtimeEntityId = 'ent-b'
    t.transform(createMockTransformInput(), 0.1)
    expect(getCustomTransformerRuntimeError()).toBeNull()
  })
})

describe('CustomCodeTransformer', () => {
  test('legacy body (bare return) still runs for backward compat', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: 'return { force: [1, 2, 3] };',
    })
    const out = t.transform(createMockTransformInput(), 0.1)
    expect(out.force).toEqual([1, 2, 3])
  })

  test('full function definition compiles and runs', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        return { force: [1, 2, 3] };
      }`,
    })
    const out = t.transform(createMockTransformInput(), 0.1)
    expect(out.force).toEqual([1, 2, 3])
  })

  test('full function uses api.getForwardVector and scaleVec3', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        return { impulse: api.scaleVec3(api.getForwardVector([0,0,0]), 5 * dt) };
      }`,
    })
    const out = t.transform(
      createMockTransformInput({ rotation: [0, 0, 0], environment: { isTouchingObject: true } }),
      0.2,
    )
    const fwd = TRANSFORMER_RUNTIME_API.getForwardVector([0, 0, 0])
    expect(out.impulse).toEqual([fwd[0] * 5 * 0.2, fwd[1] * 5 * 0.2, fwd[2] * 5 * 0.2])
  })

  test('defaultCustomTransformerCode is a full function, references api, respects touching gate', () => {
    const src = defaultCustomTransformerCode()
    expect(src).toContain('function transform(')
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

  test('defaultCustomTransformerCode JSDoc links params to IntelliSense lib types', () => {
    const src = defaultCustomTransformerCode()
    expect(src).toContain('@param {TransformInput} input')
    expect(src).toContain('@param {number} dt')
    expect(src).toContain('@param {Record<string, unknown>} params')
    expect(src).toContain('@param {Record<string, unknown>} state')
    expect(src).toContain('@param {TransformerRuntimeApi} api')
    expect(src).toContain('@returns {TransformOutput | undefined}')
  })

  test('api.log calls the wired snackbar function', () => {
    const snackbar = vi.fn()
    setTransformerSnackbarFn(snackbar)
    try {
      TRANSFORMER_RUNTIME_API.log('hello')
      expect(snackbar).toHaveBeenCalledWith('hello', 4)
      TRANSFORMER_RUNTIME_API.log('world', 2)
      expect(snackbar).toHaveBeenCalledWith('world', 2)
    } finally {
      setTransformerSnackbarFn(null)
    }
  })

  test('api.log is a no-op when snackbar is not wired', () => {
    setTransformerSnackbarFn(null)
    expect(() => TRANSFORMER_RUNTIME_API.log('test')).not.toThrow()
  })
})
