import { describe, expect, test } from 'vitest'
import { applyInputMapping } from './inputMapping'
import {
  AIRPLANE_PRESET,
  CHARACTER_PRESET,
  CAR_PRESET,
} from './inputPresets'
import type { RawInput } from '@/types/transformer'

function createRawInput(overrides?: {
  keys?: Partial<RawInput['keys']>
  wheel?: Partial<RawInput['wheel']>
  touch?: NonNullable<RawInput['touch']>
}): RawInput {
  return {
    keys: {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
      shift: false,
      ...(overrides?.keys ?? {}),
    },
    wheel: {
      deltaX: 0,
      deltaY: 0,
      pinchDelta: 0,
      mouseWheelDelta: 0,
      ...overrides?.wheel,
    },
    ...(overrides?.touch ? { touch: overrides.touch } : {}),
  } as RawInput
}

describe('applyInputMapping', () => {
  test('maps raw keyboard to actions', () => {
    const mapping = {
      keyboard: { w: 'forward', space: 'jump' },
    }
    const raw = createRawInput({ keys: { w: true, space: false } })

    const actions = applyInputMapping(raw, mapping)

    expect(actions.forward).toBe(1.0)
    expect(actions.jump).toBeUndefined()
  })

  test('applies sensitivity multiplier', () => {
    const mapping = {
      keyboard: { w: 'forward' },
      sensitivity: { keyboard: 2.0 },
    }
    const raw = createRawInput({ keys: { w: true } })

    const actions = applyInputMapping(raw, mapping)

    expect(actions.forward).toBe(2.0)
  })

  test('maps wheel horizontal to action', () => {
    const mapping = {
      wheel: { horizontal: 'yaw' },
      sensitivity: { wheel: 1.0 },
    }
    const raw = createRawInput({ wheel: { deltaX: 50, deltaY: 0 } })

    const actions = applyInputMapping(raw, mapping)

    expect(actions.yaw).toBeDefined()
    expect(actions.yaw).toBeGreaterThan(0)
  })

  test('maps wheel vertical to action', () => {
    const mapping = {
      wheel: { vertical: 'pitch' },
      sensitivity: { wheel: 1.0 },
    }
    const raw = createRawInput({ wheel: { deltaX: 0, deltaY: -30 } })

    const actions = applyInputMapping(raw, mapping)

    expect(actions.pitch).toBeDefined()
    expect(actions.pitch).toBeLessThan(0)
  })

  test('preset: airplane mapping correct', () => {
    const raw = createRawInput({
      keys: { w: true, a: true, d: false },
      wheel: { deltaX: 20, deltaY: -10 },
    })

    const actions = applyInputMapping(raw, AIRPLANE_PRESET)

    expect(actions.thrust).toBe(1.0)
    expect(actions.roll_left).toBe(1.0)
    expect(actions.roll_right).toBeUndefined()
    expect(actions.yaw).toBeDefined()
    expect(actions.pitch).toBeDefined()
  })

  test('preset: character mapping correct', () => {
    const raw = createRawInput({
      keys: { w: true, a: true, space: true },
      wheel: { deltaX: 15, deltaY: 0 },
    })

    const actions = applyInputMapping(raw, CHARACTER_PRESET)

    expect(actions.forward).toBe(1.0)
    expect(actions.strafe_left).toBe(1.0)
    expect(actions.jump).toBe(1.0)
    expect(actions.turn).toBeDefined()
  })

  test('preset: car mapping correct', () => {
    const raw = createRawInput({
      keys: { w: true, a: true, space: true },
    })

    const actions = applyInputMapping(raw, CAR_PRESET)

    expect(actions.throttle).toBe(1.0)
    expect(actions.steer_left).toBe(1.0)
    expect(actions.jump).toBe(1.0)
  })

  test('missing mappings are ignored', () => {
    const mapping = {
      keyboard: { w: 'forward' },
    }
    const raw = createRawInput({ keys: { a: true } }) // 'a' not mapped

    const actions = applyInputMapping(raw, mapping)

    expect(actions.forward).toBeUndefined()
    expect(Object.keys(actions)).toHaveLength(0)
  })

  test('touch drive: steer writes steering_angle, drive splits into throttle/brake', () => {
    const raw = createRawInput({ touch: { steer: -0.5, drive: 0.8 } })

    const actions = applyInputMapping(raw, CAR_PRESET)

    // CAR_PRESET: w → throttle, s → brake. Analog values pass through untouched.
    expect(actions.throttle).toBe(0.8)
    expect(actions.brake).toBeUndefined()
    expect(actions.steering_angle).toBe(-0.5)
  })

  test('touch drive: dragging down maps to the brake action', () => {
    const raw = createRawInput({ touch: { steer: 0.25, drive: -0.6 } })

    const actions = applyInputMapping(raw, CAR_PRESET)

    expect(actions.brake).toBe(0.6)
    expect(actions.throttle).toBeUndefined()
    expect(actions.steering_angle).toBe(0.25)
  })

  test('touch drive: zero axes write nothing (car2 self-centers via its binary path)', () => {
    const raw = createRawInput({ touch: { steer: 0, drive: 0 } })

    const actions = applyInputMapping(raw, CAR_PRESET)

    expect(actions.steering_angle).toBeUndefined()
    expect(actions.throttle).toBeUndefined()
    expect(actions.brake).toBeUndefined()
  })

  test('touch drive works for saved worlds whose mapping predates the touch block', () => {
    // A CAR_PRESET snapshot persisted before touch existed: no touch field, keyboard intact.
    const savedMapping = {
      keyboard: { w: 'throttle', s: 'brake', a: 'steer_left', d: 'steer_right', space: 'jump' },
      sensitivity: { keyboard: 1.0, wheel: 1.0 },
    }
    const raw = createRawInput({ touch: { steer: -1, drive: 1 } })

    const actions = applyInputMapping(raw, savedMapping)

    expect(actions.throttle).toBe(1)
    expect(actions.steering_angle).toBe(-1)
  })

  test('touch drive: action names derive from the entity mapping, not the car preset', () => {
    const raw = createRawInput({ touch: { steer: 1, drive: 0.5 } })

    const actions = applyInputMapping(raw, { keyboard: { w: 'thrust', s: 'reverse' } })

    expect(actions.thrust).toBe(0.5)
    expect(actions.reverse).toBeUndefined()
    expect(actions.steering_angle).toBe(1)
  })
})
