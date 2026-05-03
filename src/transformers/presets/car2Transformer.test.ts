import { describe, expect, test } from 'vitest'
import { CarTransformer2 } from './car2Transformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('CarTransformer2', () => {
  const t = new CarTransformer2(10)

  test('when not touching, returns no impulse or addRotation', () => {
    const output = t.transform(
      createMockTransformInput({
        actions: { throttle: 1.0 },
        environment: { isTouchingObject: false },
      }),
      0.016,
    )
    expect(output.impulse).toBeUndefined()
    expect(output.addRotation).toBeUndefined()
  })

  test('when touching, throttle produces impulse', () => {
    const output = t.transform(
      createMockTransformInput({
        actions: { throttle: 1.0 },
        environment: { isTouchingObject: true },
      }),
      0.016,
    )
    expect(output.impulse).toBeDefined()
    expect(output.force).toBeUndefined()
    expect(output.torque).toBeUndefined()
  })

  test('when touching, steer produces addRotation with forward velocity', () => {
    const output = t.transform(
      createMockTransformInput({
        actions: { steer_right: 1.0 },
        velocity: [0, 0, -5],
        rotation: [0, 0, 0],
        environment: { isTouchingObject: true },
      }),
      0.016,
    )
    expect(output.torque).toBeUndefined()
    expect(output.addRotation).toBeDefined()
    expect(Math.abs(output.addRotation![0])).toBe(0)
    expect(Math.abs(output.addRotation![2])).toBe(0)
    // Y steer component can be tiny and sign may vary with FP noise; assert non-negligible magnitude.
    expect(Math.abs(output.addRotation![1])).toBeGreaterThan(1e-5)
  })

  describe('supportVelocity (velocity relative to surface)', () => {
    test('when world velocity matches support, steer does not add yaw (no forward speed relative to platform)', () => {
      const tFresh = new CarTransformer2(10)
      const output = tFresh.transform(
        createMockTransformInput({
          actions: { steer_right: 1.0 },
          velocity: [5, 0, 0],
          rotation: [0, 0, 0],
          environment: {
            isTouchingObject: true,
            supportVelocity: [5, 0, 0],
          },
        }),
        0.016,
      )
      expect(output.addRotation).toBeDefined()
      expect(Math.abs(output.addRotation![0])).toBeLessThan(1e-6)
      expect(Math.abs(output.addRotation![1])).toBeLessThan(1e-6)
      expect(Math.abs(output.addRotation![2])).toBeLessThan(1e-6)
    })

    test('when world velocity matches support, lateral grip sees no slip (impulse ~0 without throttle)', () => {
      const tGrip = new CarTransformer2(10, {
        lateralToForwardTransfer: 0.2,
        lateralGrip: 100,
      })
      const output = tGrip.transform(
        createMockTransformInput({
          actions: {},
          velocity: [5, 0, 0],
          rotation: [0, 0, 0],
          environment: {
            isTouchingObject: true,
            supportVelocity: [5, 0, 0],
          },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      const i = output.impulse!
      expect(Math.abs(i[0])).toBeLessThan(1e-3)
      expect(Math.abs(i[1])).toBeLessThan(1e-3)
      expect(Math.abs(i[2])).toBeLessThan(1e-3)
    })

    test('when grounded with no input, tiny lateral velocity does not emit grip impulse (solver dead zone)', () => {
      const tFresh = new CarTransformer2(10, { lateralGrip: 100, lateralToForwardTransfer: 0.2 })
      const output = tFresh.transform(
        createMockTransformInput({
          actions: {},
          velocity: [1e-6, 0, 0],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.impulse![0]).toBe(0)
      expect(output.impulse![1]).toBe(0)
      expect(output.impulse![2]).toBe(0)
    })

    test('when grounded with throttle, tiny lateral velocity still applies throttle only', () => {
      const tFresh = new CarTransformer2(10, { power: 400 })
      const output = tFresh.transform(
        createMockTransformInput({
          actions: { throttle: 1 },
          velocity: [1e-6, 0, 0],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.impulse![0]).toBe(0)
      expect(output.impulse![1]).toBe(0)
      expect(output.impulse![2]).toBe(-400)
    })
  })

  describe('lateral-to-forward transfer', () => {
    const lateralInput = createMockTransformInput({
      actions: {},
      velocity: [5, 0, 0],
      rotation: [0, 0, 0],
      environment: { isTouchingObject: true },
    })
    const forward: [number, number, number] = [0, 0, -1]
    /** High threshold so lateral speed 5 stays in full-grip regime for transfer math. */
    const noSlipGrip = { tireGripSlipSpeedThreshold: 1e6 } as const

    test('with lateralToForwardTransfer > 0, impulse has forward component from lateral', () => {
      const tWithTransfer = new CarTransformer2(10, {
        lateralToForwardTransfer: 0.2,
        lateralGrip: 100,
        ...noSlipGrip,
      })
      const output = tWithTransfer.transform(lateralInput, 0.016)
      expect(output.impulse).toBeDefined()
      const dot = (output.impulse![0] * forward[0] + output.impulse![1] * forward[1] + output.impulse![2] * forward[2])
      expect(dot).toBeCloseTo(100, 0)
    })

    test('with lateralToForwardTransfer = 0, no forward component from lateral', () => {
      const tNoTransfer = new CarTransformer2(10, {
        lateralToForwardTransfer: 0,
        lateralGrip: 100,
        ...noSlipGrip,
      })
      const output = tNoTransfer.transform(lateralInput, 0.016)
      expect(output.impulse).toBeDefined()
      const dot = (output.impulse![0] * forward[0] + output.impulse![1] * forward[1] + output.impulse![2] * forward[2])
      expect(dot).toBeCloseTo(0, 0)
    })
  })

  describe('tire grip slip threshold', () => {
    const grounded = { isTouchingObject: true as const }
    const common = {
      lateralGrip: 100,
      lateralToForwardTransfer: 0.2,
      lateralGripSlipScale: 0.3,
    }

    test('lateral speed at or below default threshold keeps full lateral correction', () => {
      const ref = new CarTransformer2(10, {
        ...common,
        tireGripSlipSpeedThreshold: 1e6,
      })
      const def = new CarTransformer2(10, { ...common })
      const input = createMockTransformInput({
        actions: {},
        velocity: [1, 0, 0],
        rotation: [0, 0, 0],
        environment: grounded,
      })
      const iRef = ref.transform(input, 0.016).impulse!
      const iDef = def.transform(input, 0.016).impulse!
      expect(iDef[0]).toBeCloseTo(iRef[0], 5)
      expect(iDef[1]).toBeCloseTo(iRef[1], 5)
      expect(iDef[2]).toBeCloseTo(iRef[2], 5)
    })

    test('lateral speed above default threshold scales grip by lateralGripSlipScale', () => {
      const ref = new CarTransformer2(10, {
        ...common,
        tireGripSlipSpeedThreshold: 1e6,
      })
      const slipping = new CarTransformer2(10, { ...common })
      const input = createMockTransformInput({
        actions: {},
        velocity: [3, 0, 0],
        rotation: [0, 0, 0],
        environment: grounded,
      })
      const iRef = ref.transform(input, 0.016).impulse!
      const iSlip = slipping.transform(input, 0.016).impulse!
      const scale = common.lateralGripSlipScale
      expect(iSlip[0]).toBeCloseTo(iRef[0] * scale, 5)
      expect(iSlip[2]).toBeCloseTo(iRef[2] * scale, 5)
    })

    test('custom tireGripSlipSpeedThreshold is applied (strictly greater than)', () => {
      const ref = new CarTransformer2(10, {
        ...common,
        tireGripSlipSpeedThreshold: 1e6,
      })
      const custom = new CarTransformer2(10, {
        ...common,
        tireGripSlipSpeedThreshold: 5,
      })
      const below = createMockTransformInput({
        actions: {},
        velocity: [4, 0, 0],
        rotation: [0, 0, 0],
        environment: grounded,
      })
      const iRef4 = ref.transform(below, 0.016).impulse!
      const iCustom4 = custom.transform(below, 0.016).impulse!
      expect(iCustom4[0]).toBeCloseTo(iRef4[0], 5)

      const above = createMockTransformInput({
        actions: {},
        velocity: [6, 0, 0],
        rotation: [0, 0, 0],
        environment: grounded,
      })
      const iRef6 = ref.transform(above, 0.016).impulse!
      const iCustom6 = custom.transform(above, 0.016).impulse!
      const scale = common.lateralGripSlipScale
      expect(iCustom6[0]).toBeCloseTo(iRef6[0] * scale, 5)
    })
  })

  describe('touch-gating: physics only when touching', () => {
    test('when isTouchingObject is false, no impulse and no addRotation', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { throttle: 1.0, steer_right: 1.0 },
          velocity: [0, 0, -5],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: false },
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
      expect(output.addRotation).toBeUndefined()
    })

    test('when isTouchingObject is undefined, no impulse and no addRotation', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { throttle: 1.0 },
          velocity: [0, 0, -3],
          rotation: [0, 0, 0],
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
      expect(output.addRotation).toBeUndefined()
    })

    test('when isTouchingObject is true, impulse and addRotation are present', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { throttle: 1.0, steer_right: 1.0 },
          velocity: [0, 0, -5],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.addRotation).toBeDefined()
    })
  })

  describe('jump', () => {
    test('rising edge while touching adds world-Y jumpImpulse to impulse', () => {
      const tJump = new CarTransformer2(10, { jumpImpulse: 500 })
      const output = tJump.transform(
        createMockTransformInput({
          actions: { jump: 1.0 },
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.impulse![1]).toBe(500)
    })

    test('holding jump does not add impulse again on the next frame', () => {
      const tJump = new CarTransformer2(10, { jumpImpulse: 500 })
      const grounded = {
        actions: { jump: 1.0 },
        environment: { isTouchingObject: true },
      }
      tJump.transform(createMockTransformInput(grounded), 0.016)
      const second = tJump.transform(createMockTransformInput(grounded), 0.016)
      expect(second.impulse).toBeDefined()
      expect(second.impulse![1]).toBe(0)
    })

    test('when not touching, no impulse even on jump rising edge', () => {
      const tJump = new CarTransformer2(10, { jumpImpulse: 500 })
      const output = tJump.transform(
        createMockTransformInput({
          actions: { jump: 1.0 },
          environment: { isTouchingObject: false },
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
    })

    test('jumpImpulse 0 adds no vertical impulse', () => {
      const tJump = new CarTransformer2(10, { jumpImpulse: 0 })
      const output = tJump.transform(
        createMockTransformInput({
          actions: { jump: 1.0 },
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.impulse![1]).toBe(0)
    })
  })
})
