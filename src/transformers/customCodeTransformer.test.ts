import { describe, expect, test, vi, afterEach } from 'vitest'
import type { TransformInput, Vec3 } from '@/types/transformer'
import type { Entity } from '@/types/world'
import {
  CustomCodeTransformer,
  defaultCustomTransformerCode,
  TRANSFORMER_RUNTIME_API,
  setTransformerRuntimeEntityLookup,
  setTransformerRuntimeLivePositionLookup,
  setTransformerRuntimeRaycast,
  setTransformerSnackbarFn,
  validateCustomTransformerSource,
} from './customCodeTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'
import {
  clearCustomTransformerRuntimeError,
  getCustomTransformerRuntimeError,
  publishCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import {
  clearSlots,
  getVariableOverlaySlots,
  setVariableOverlayDisplayEntityId,
  setVariableOverlayFn,
} from '@/runtime/variableOverlayBridge'
import {
  clearCoordinateEntries,
  getCoordinateOverlayEntries,
  setCoordinateOverlayDisplayEntityId,
  setCoordinateOverlayFn,
} from '@/runtime/coordinateOverlayBridge'

describe('TransformerRuntimeApi argument validation', () => {
  test('getForwardVector rejects missing or invalid rotation', () => {
    expect(() => TRANSFORMER_RUNTIME_API.getForwardVector(undefined as unknown as [number, number, number])).toThrow(
      /\[TransformerRuntimeApi\.getForwardVector\] expected rotation:/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.getForwardVector([0, 0] as unknown as [number, number, number])).toThrow(
      /\[TransformerRuntimeApi\.getForwardVector\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.getForwardVector([NaN, 0, 0])).toThrow(
      /\[TransformerRuntimeApi\.getForwardVector\]/,
    )
  })

  test('vec.getForwardVector uses same validation as top-level', () => {
    expect(() => TRANSFORMER_RUNTIME_API.vec.getForwardVector(undefined as unknown as [number, number, number])).toThrow(
      /\[TransformerRuntimeApi\.vec\.getForwardVector\]/,
    )
  })

  test('vec.add, vec.subtract, scaleVec3, normalizeVec3 reject invalid arguments', () => {
    expect(() => TRANSFORMER_RUNTIME_API.vec.add([1, 0, 0], [0, 1] as unknown as Vec3)).toThrow(
      /\[TransformerRuntimeApi\.vec\.add\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.vec.subtract([1, 0, 0], [0, 1] as unknown as Vec3)).toThrow(
      /\[TransformerRuntimeApi\.vec\.subtract\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.subtractVec3([1, 0, 0], [0, 1] as unknown as Vec3)).toThrow(
      /\[TransformerRuntimeApi\.subtractVec3\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.scaleVec3([1, 0, 0], NaN)).toThrow(/\[TransformerRuntimeApi\.scaleVec3\]/)
    expect(() => TRANSFORMER_RUNTIME_API.vec.normalize([0, 1] as unknown as Vec3)).toThrow(
      /\[TransformerRuntimeApi\.vec\.normalize\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.normalizeVec3([0, 1] as unknown as Vec3)).toThrow(
      /\[TransformerRuntimeApi\.normalizeVec3\]/,
    )
  })

  test('vec.getForwardSpeed rejects non-Vec3', () => {
    expect(() => TRANSFORMER_RUNTIME_API.vec.getForwardSpeed([0, 0, 1], [0, 1] as unknown as Vec3)).toThrow(
      /\[TransformerRuntimeApi\.vec\.getForwardSpeed\]/,
    )
  })

  test('vec.projectOntoPlane and vec.rotateAroundAxis reject invalid arguments', () => {
    expect(() => TRANSFORMER_RUNTIME_API.vec.projectOntoPlane([0, 1] as unknown as Vec3, [0, 1, 0])).toThrow(
      /\[TransformerRuntimeApi\.vec\.projectOntoPlane\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.vec.rotateAroundAxis([1, 0, 0], [0, 1, 0], NaN)).toThrow(
      /\[TransformerRuntimeApi\.vec\.rotateAroundAxis\]/,
    )
  })

  test('vec.projectOntoPlane zeros Y component for world-up plane', () => {
    expect(TRANSFORMER_RUNTIME_API.vec.projectOntoPlane([1, 2, 3], [0, 1, 0])).toEqual([1, 0, 3])
  })

  test('vec.rotateAroundAxis uses right-handed rotation around axis', () => {
    const vec: Vec3 = [1, 0, 0]
    const rotated = TRANSFORMER_RUNTIME_API.vec.rotateAroundAxis(vec, [0, 1, 0], Math.PI / 2)
    expect(rotated[0]).toBeCloseTo(0, 10)
    expect(rotated[1]).toBeCloseTo(0, 10)
    expect(rotated[2]).toBeCloseTo(-1, 10)
  })

  test('vec.offsetAlong, angleBetween, signedAngleAroundAxis, rightFromForward', () => {
    expect(TRANSFORMER_RUNTIME_API.vec.offsetAlong([0, 0, 0], [0, 0, -1], 5)).toEqual([0, 0, -5])
    expect(TRANSFORMER_RUNTIME_API.vec.angleBetween([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.PI / 2, 10)
    const signed = TRANSFORMER_RUNTIME_API.vec.signedAngleAroundAxis([0, 0, -1], [-1, 0, 0], [0, 1, 0])
    expect(signed).toBeGreaterThan(0)
    expect(TRANSFORMER_RUNTIME_API.vec.rightFromForward([0, 0, -1])[0]).toBeCloseTo(1, 10)
  })

  test('raycastSpread rejects invalid rayCount', () => {
    expect(() =>
      TRANSFORMER_RUNTIME_API.raycastSpread([0, 0, 0], [0, 0, -1], 10, 2, 0),
    ).toThrow(/\[TransformerRuntimeApi\.raycastSpread\] expected rayCount:/)
  })

  test('raycastSpread picks closest hit', () => {
    setTransformerRuntimeRaycast((origin) => {
      if (origin[0] < 0) return { hit: true, distance: 1, entityId: 'near' }
      return { hit: true, distance: 9, entityId: 'far' }
    })
    const result = TRANSFORMER_RUNTIME_API.raycastSpread([0, 0, 0], [0, 0, -1], 20, 2, 3)
    expect(result.distance).toBe(1)
    setTransformerRuntimeRaycast(null)
  })

  test('eulerDeltaAroundAxis rejects invalid args', () => {
    expect(() =>
      TRANSFORMER_RUNTIME_API.eulerDeltaAroundAxis(undefined as unknown as [number, number, number], [0, 1, 0], 0.1),
    ).toThrow(/\[TransformerRuntimeApi\.eulerDeltaAroundAxis\]/)
    expect(() => TRANSFORMER_RUNTIME_API.eulerDeltaAroundAxis([0, 0, 0], [0, 0] as unknown as Vec3, 0.1)).toThrow(
      /\[TransformerRuntimeApi\.eulerDeltaAroundAxis\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.eulerDeltaAroundAxis([0, 0, 0], [0, 1, 0], NaN)).toThrow(
      /\[TransformerRuntimeApi\.eulerDeltaAroundAxis\]/,
    )
  })

  test('clamp rejects non-finite numbers', () => {
    expect(() => TRANSFORMER_RUNTIME_API.clamp(1, NaN, 3)).toThrow(/\[TransformerRuntimeApi\.clamp\]/)
  })

  test('getAction rejects invalid input or name', () => {
    expect(() => TRANSFORMER_RUNTIME_API.getAction(undefined as unknown as TransformInput, 'a')).toThrow(
      /\[TransformerRuntimeApi\.getAction\] expected input:/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.getAction({ actions: [] } as unknown as TransformInput, 'a')).toThrow(
      /\[TransformerRuntimeApi\.getAction\] expected input\.actions:/,
    )
    expect(() =>
      TRANSFORMER_RUNTIME_API.getAction(createMockTransformInput(), 1 as unknown as string),
    ).toThrow(/\[TransformerRuntimeApi\.getAction\] expected name:/)
  })

  test('visualize rejects invalid arguments before publishing', () => {
    expect(() => TRANSFORMER_RUNTIME_API.visualize(1, '#000', 'x', 0)).toThrow(
      /\[TransformerRuntimeApi\.visualize\] expected index:/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.visualize(1, '#000', 'x', 1.5)).toThrow(
      /\[TransformerRuntimeApi\.visualize\] expected index:/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.visualize(NaN, '#000', 'x', 1)).toThrow(
      /\[TransformerRuntimeApi\.visualize\] expected value:/,
    )
  })

  test('visualizeLine rejects invalid coordinate', () => {
    expect(() => TRANSFORMER_RUNTIME_API.visualizeLine([0, 1] as unknown as [number, number, number], [0, 0, 0], 'red')).toThrow(
      /\[TransformerRuntimeApi\.visualizeLine\]/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.visualizeLine([0, 0, 0], [0, 1] as unknown as [number, number, number], 'red')).toThrow(
      /\[TransformerRuntimeApi\.visualizeLine\]/,
    )
  })

  test('getWorldPosition rejects non-string id', () => {
    expect(() => TRANSFORMER_RUNTIME_API.getWorldPosition(123 as unknown as string)).toThrow(
      /\[TransformerRuntimeApi\.getWorldPosition\] expected id:/,
    )
  })

  test('getStartPosition and getEntity reject non-string id', () => {
    expect(() => TRANSFORMER_RUNTIME_API.getStartPosition(null as unknown as string)).toThrow(
      /\[TransformerRuntimeApi\.getStartPosition\] expected id:/,
    )
    expect(() => TRANSFORMER_RUNTIME_API.getEntity(1 as unknown as string)).toThrow(
      /\[TransformerRuntimeApi\.getEntity\] expected id:/,
    )
  })

  test('log rejects non-string message or invalid duration', () => {
    expect(() => TRANSFORMER_RUNTIME_API.log(1 as unknown as string)).toThrow(/\[TransformerRuntimeApi\.log\]/)
    expect(() => TRANSFORMER_RUNTIME_API.log('hi', NaN)).toThrow(/\[TransformerRuntimeApi\.log\]/)
  })
})

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
    expect(msg).toMatch(/\(line \d+\)/)
  })

  test('reports line 10 for syntax error in default skeleton', () => {
    const lines = defaultCustomTransformerCode().split('\n')
    lines[9] = '  @@@ invalid'
    const msg = validateCustomTransformerSource(lines.join('\n'), 'custom:p2')
    expect(msg).toContain('custom:p2')
    expect(msg).toContain('(line 10)')
  })

  test('includes mapped user line for full-function syntax errors', () => {
    const lines = ['function transform(input, dt, params, state, api) {']
    for (let i = 1; i <= 20; i++) lines.push(`  // filler ${i}`)
    lines.push('  return {')
    const source = lines.join('\n')

    const originalFunction = globalThis.Function
    globalThis.Function = function wrappedFunction(this: unknown, body: string) {
      const err = new SyntaxError("Unexpected token ')' at line 25 column 1")
      err.stack =
        "SyntaxError: Unexpected token ')'\n    at wrappedFunction (<anonymous>:25:1)"
      throw err
    } as unknown as FunctionConstructor

    try {
      const msg = validateCustomTransformerSource(source)
      expect(msg).toContain('Failed to compile')
      expect(msg).toContain('(line 22)')
      expect(msg).not.toContain('line 25')
    } finally {
      globalThis.Function = originalFunction
    }
  })

  test('includes mapped user line for inline legacy syntax errors', () => {
    const source = 'a\nb\nreturn {'
    const originalFunction = globalThis.Function
    globalThis.Function = function wrappedFunction(this: unknown, body: string) {
      const err = new SyntaxError("Unexpected token ')' at line 6 column 1")
      throw err
    } as unknown as FunctionConstructor

    try {
      const msg = validateCustomTransformerSource(source)
      expect(msg).toContain('(line 3)')
    } finally {
      globalThis.Function = originalFunction
    }
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
    setVariableOverlayFn(null)
    setVariableOverlayDisplayEntityId(null)
    clearSlots()
    setCoordinateOverlayFn(null)
    setCoordinateOverlayDisplayEntityId(null)
    clearCoordinateEntries()
    setTransformerRuntimeEntityLookup(null)
    setTransformerRuntimeLivePositionLookup(null)
    setTransformerRuntimeRaycast(null)
  })

  test('publishRuntimeError reports when entity id and stack index are set', () => {
    const source = `function transform() { throw new Error('runtime-boom'); }`
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: source,
    })
    t.configStackIndex = 0
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    const snap = getCustomTransformerRuntimeError()
    expect(snap).not.toBeNull()
    expect(snap).toMatchObject({
      entityId: 'ent-a',
      configStackIndex: 0,
      message: 'runtime-boom',
      code: source,
    })
    expect(typeof snap!.stack === 'string' && snap!.stack.includes('runtime-boom')).toBe(true)
  })

  test('api.visualize publishes when bridge is wired and entity matches', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('ent-a')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.visualize(1.25, '#ff0', 'x', 2);
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    const rows = getVariableOverlaySlots()
    expect(rows).toEqual([expect.objectContaining({ index: 2, value: 1.25, name: 'x' })])
  })

  test('api.visualize is a no-op for mismatched selection', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('other')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.visualize(9, '#ff0', 'x', 1);
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getVariableOverlaySlots()).toEqual([])
  })

  test('api.visualizeLine publishes when bridge is wired and entity matches', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('ent-a')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.visualizeLine([0, 0, 0], [10, 0, 5], 'blue');
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getCoordinateOverlayEntries()).toEqual([{ from: [0, 0, 0], to: [10, 0, 5], color: 'blue' }])
  })

  test('api.visualizeLine is a no-op for mismatched selection', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('other')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.visualizeLine([0, 0, 0], [1, 2, 3], 'red');
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getCoordinateOverlayEntries()).toEqual([])
  })

  test('api.visualizeLine is a no-op when bridge is not wired', () => {
    setCoordinateOverlayDisplayEntityId('ent-a')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.visualizeLine([1, 1, 1], [0, 0, 0], 'green');
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getCoordinateOverlayEntries()).toEqual([])
  })

  test('api.raycast with visualize draws hit line to impact distance', () => {
    setTransformerRuntimeRaycast(() => ({ hit: true, distance: 4, entityId: 'wall' }))
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('ent-a')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.raycast([0, 0, 0], [0, 0, -1], 10, { visualize: true });
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getCoordinateOverlayEntries()).toEqual([{ from: [0, 0, 0], to: [0, 0, -4], color: 'red' }])
  })

  test('api.raycast with visualize draws miss line to maxDistance', () => {
    setTransformerRuntimeRaycast(() => ({ hit: false, distance: 0, entityId: '' }))
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('ent-a')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.raycast([1, 2, 3], [0, 1, 0], 7, { visualize: true, missColor: 'lime' });
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getCoordinateOverlayEntries()).toEqual([{ from: [1, 2, 3], to: [1, 9, 3], color: 'lime' }])
  })

  test('api.raycast without visualize does not publish lines', () => {
    setTransformerRuntimeRaycast(() => ({ hit: true, distance: 2, entityId: 'x' }))
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('ent-a')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        api.raycast([0, 0, 0], [1, 0, 0], 5);
        return {};
      }`,
    })
    t.runtimeEntityId = 'ent-a'
    t.transform(createMockTransformInput({ entityId: 'ent-a' }), 0.1)
    expect(getCoordinateOverlayEntries()).toEqual([])
  })

  test('api.getWorldPosition uses live-position hook', () => {
    setTransformerRuntimeLivePositionLookup((id) => (id === 'box' ? [9, 8, 7] : null))
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        const p = api.getWorldPosition('box');
        return p && p[0] === 9 ? { impulse: [1, 0, 0] } : {};
      }`,
    })
    expect(t.transform(createMockTransformInput(), 0.1).impulse).toEqual([1, 0, 0])
  })

  test('api.getWorldPosition is null when live hook unwired', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        return api.getWorldPosition('box') === null ? { impulse: [0, 1, 0] } : {};
      }`,
    })
    expect(t.transform(createMockTransformInput(), 0.1).impulse).toEqual([0, 1, 0])
  })

  test('api.getStartPosition reads persisted entity.position', () => {
    const other: Entity = { id: 'box', position: [4, 5, 6] }
    setTransformerRuntimeEntityLookup((id) => (id === 'box' ? other : undefined))
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        const p = api.getStartPosition('box');
        return p && p[1] === 5 ? { impulse: [0, 0, 3] } : {};
      }`,
    })
    expect(t.transform(createMockTransformInput(), 0.1).impulse).toEqual([0, 0, 3])
  })

  test('api.getStartPosition is null when entity missing or position absent', () => {
    const other: Entity = { id: 'box' }
    setTransformerRuntimeEntityLookup((id) => (id === 'box' ? other : undefined))
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        return api.getStartPosition('box') === null ? { torque: [1, 0, 0] } : {};
      }`,
    })
    expect(t.transform(createMockTransformInput(), 0.1).torque).toEqual([1, 0, 0])
  })

  test('api.getEntity returns shallow copy with getLivePosition from live hook', () => {
    const other: Entity = { id: 'other', name: 'Buddy', position: [0, 0, 0] }
    setTransformerRuntimeEntityLookup((id) => (id === 'other' ? other : undefined))
    setTransformerRuntimeLivePositionLookup((id) => (id === 'other' ? [1, 2, 3] : null))
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        const e = api.getEntity('other');
        const p = e && e.getLivePosition();
        return p && p[0] === 1 && p[1] === 2 && p[2] === 3 ? { impulse: [2, 0, 0] } : {};
      }`,
    })
    const out = t.transform(createMockTransformInput(), 0.1)
    expect(out.impulse).toEqual([2, 0, 0])
  })

  test('api.getEntity getLivePosition is null when live hook unwired', () => {
    const other: Entity = { id: 'other', name: 'Buddy' }
    setTransformerRuntimeEntityLookup((id) => (id === 'other' ? other : undefined))
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        const e = api.getEntity('other');
        return e && e.getLivePosition() === null ? { impulse: [3, 0, 0] } : {};
      }`,
    })
    const out = t.transform(createMockTransformInput(), 0.1)
    expect(out.impulse).toEqual([3, 0, 0])
  })

  test('api.getEntity resolves via setTransformerRuntimeEntityLookup', () => {
    const other: Entity = { id: 'other', name: 'Buddy' }
    setTransformerRuntimeEntityLookup((id) => (id === 'other' ? other : undefined))
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        const e = api.getEntity('other');
        return e && e.name === 'Buddy' ? { impulse: [1, 0, 0] } : {};
      }`,
    })
    const out = t.transform(createMockTransformInput(), 0.1)
    expect(out.impulse).toEqual([1, 0, 0])
  })

  test('api.getEntity is undefined when lookup is unwired', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        return api.getEntity('any') === undefined ? { impulse: [0, 2, 0] } : {};
      }`,
    })
    const out = t.transform(createMockTransformInput(), 0.1)
    expect(out.impulse).toEqual([0, 2, 0])
  })

  test('api.visualize before touch gate plots power without ground contact', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('ent-a')
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `/** @returns {TransformOutput | undefined} */
function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  const power = Number(params.power ?? 0);
  api.visualize(power, '#48d9ff', 'power', 1);
  if (!input.environment.isTouchingObject || power === 0) return {};
  const forward = api.vec.getForwardVector(input.rotation);
  return { impulse: api.vec.scale(forward, power * dt) };
}`,
    })
    t.runtimeEntityId = 'ent-a'
    t.setParams({ power: 42 })
    t.transform(
      createMockTransformInput({
        entityId: 'ent-a',
        environment: { isTouchingObject: false },
      }),
      0.1,
    )
    expect(getVariableOverlaySlots()).toEqual([
      expect.objectContaining({ index: 1, value: 42, name: 'power' }),
    ])
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
      code: '',
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

  test('full function uses api.vec.getForwardVector and api.vec.scale', () => {
    const t = new CustomCodeTransformer({
      type: 'custom',
      code: `function transform(input, dt, params, state, api) {
        return { impulse: api.vec.scale(api.vec.getForwardVector([0,0,0]), 5 * dt) };
      }`,
    })
    const out = t.transform(
      createMockTransformInput({ rotation: [0, 0, 0], environment: { isTouchingObject: true } }),
      0.2,
    )
    const fwd = TRANSFORMER_RUNTIME_API.getForwardVector([0, 0, 0])
    expect(out.impulse).toEqual([fwd[0] * 5 * 0.2, fwd[1] * 5 * 0.2, fwd[2] * 5 * 0.2])
  })

  test('defaultCustomTransformerCode is minimal typed stub', () => {
    const src = defaultCustomTransformerCode()
    expect(src).toContain('function transform(')
    expect(src).toContain('//your code goes here')
    expect(src).not.toContain('api.visualize')
    const t = new CustomCodeTransformer({ type: 'custom', code: src })
    expect(t.transform(createMockTransformInput({ environment: {} }), 0.1)).toEqual({})
    expect(
      t.transform(
        createMockTransformInput({ environment: { isTouchingObject: true } }),
        0.1,
      ),
    ).toEqual({})
  })

  test('defaultCustomTransformerCode annotates params for IntelliSense (inline @type)', () => {
    const src = defaultCustomTransformerCode()
    expect(src).toContain('/** @type {TransformInput} */ input')
    expect(src).toContain('/** @type {TransformerRuntimeApi} */ api')
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

  test('TRANSFORMER_RUNTIME_API.vec matches tuple math', () => {
    const api = TRANSFORMER_RUNTIME_API
    const a: [number, number, number] = [1, 2, 3]
    const b: [number, number, number] = [4, 5, 6]
    expect(api.vec.getForwardVector([0, 0, 0])).toEqual(api.getForwardVector([0, 0, 0]))
    expect(api.vec.getUpVector([0, 0, 0])).toEqual(api.getUpVector([0, 0, 0]))
    expect(api.vec.dot(a, b)).toBe(32)
    expect(api.vec.cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
    expect(api.vec.cross([3, -3, 1], [4, 9, 2])).toEqual([-15, -2, 39])
    expect(api.vec.length([3, 4, 0])).toBe(5)
    const u305 = api.vec.normalize([3, 4, 0])
    expect(u305[0]).toBeCloseTo(0.6)
    expect(u305[1]).toBeCloseTo(0.8)
    expect(u305[2]).toBe(0)
    expect(api.vec.normalize([0, 0, 0])).toEqual([0, 0, 0])
    expect(api.normalizeVec3([0, -12, 0])).toEqual([0, -1, 0])
    expect(api.normalizeVec3([3, 4, 0])).toEqual(api.vec.normalize([3, 4, 0]))
    expect(api.vec.add([1, 0, 0], [0, 2, 0])).toEqual([1, 2, 0])
    expect(api.vec.subtract([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3])
    expect(api.vec.scale([2, 3, 4], 2)).toEqual([4, 6, 8])
    expect(api.addVec3(a, b)).toEqual(api.vec.add(a, b))
    expect(api.subtractVec3(a, b)).toEqual(api.vec.subtract(a, b))
    expect(api.scaleVec3(a, 2)).toEqual(api.vec.scale(a, 2))
    const fwd: [number, number, number] = [0, 0, -1]
    expect(api.vec.getForwardSpeed([0, 0, -5], fwd)).toBe(5)
  })

  test('api.log is a no-op when snackbar is not wired', () => {
    setTransformerSnackbarFn(null)
    expect(() => TRANSFORMER_RUNTIME_API.log('test')).not.toThrow()
  })
})
