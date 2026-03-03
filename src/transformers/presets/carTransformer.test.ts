import { describe, expect, test } from 'vitest'
import { CarTransformer } from './carTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

// Convenience: default params used in many tests
const DEFAULT = {
  maxSpeed: 25,
  acceleration: 200,
  brakeForce: 400,
  engineBrake: 30,
  maxSteerAngle: 0.5,
  wheelbase: 2.0,
  lateralGrip: 25,
  handbrakeGripFactor: 0.15,
  handbrakeMultiplier: 3,
  steeringTorqueScale: 40,
}

describe('CarTransformer – throttle / engine', () => {
  test('throttle produces forward (-Z) force from rest', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: { throttle: 1.0 }, rotation: [0, 0, 0] }),
      0.016,
    )
    expect(output.force).toBeDefined()
    expect(output.force![2]).toBeLessThan(0) // -Z = forward
  })

  test('throttle force tapers near maxSpeed', () => {
    const t = new CarTransformer(10, DEFAULT)
    const slow = t.transform(
      createMockTransformInput({ actions: { throttle: 1.0 }, velocity: [0, 0, -5] }),
      0.016,
    )
    const fast = t.transform(
      createMockTransformInput({ actions: { throttle: 1.0 }, velocity: [0, 0, -20] }),
      0.016,
    )
    // Force at high speed should be less than at low speed
    expect(Math.abs(fast.force![2])).toBeLessThan(Math.abs(slow.force![2]))
  })

  test('throttle force is zero at exactly maxSpeed', () => {
    const t = new CarTransformer(10, { ...DEFAULT, maxSpeed: 10, acceleration: 200, lateralGrip: 0, engineBrake: 0 })
    const output = t.transform(
      createMockTransformInput({ actions: { throttle: 1.0 }, velocity: [0, 0, -10] }),
      0.016,
    )
    // No engine force, no lateral (lateralGrip=0), no engine brake (engineBrake=0, input given)
    expect(output.force).toBeUndefined()
  })

  test('no input at rest produces no output', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: {}, velocity: [0, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    expect(output.force).toBeUndefined()
    expect(output.torque).toBeUndefined()
    expect(output.earlyExit).toBe(false)
  })
})

describe('CarTransformer – braking and reverse', () => {
  test('brake while moving forward produces a decelerating force', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: { brake: 1.0 }, velocity: [0, 0, -10] }), // moving forward
      0.016,
    )
    expect(output.force).toBeDefined()
    // Deceleration should oppose forward motion: force in +Z
    expect(output.force![2]).toBeGreaterThan(0)
  })

  test('brake from near-standstill produces reverse force', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: { brake: 1.0 }, velocity: [0, 0, 0] }), // stationary
      0.016,
    )
    expect(output.force).toBeDefined()
    // Reverse = positive Z (backward direction)
    expect(output.force![2]).toBeGreaterThan(0)
  })

  test('braking force magnitude scales with brake input', () => {
    const t = new CarTransformer(10, { ...DEFAULT, lateralGrip: 0 })
    const full = t.transform(
      createMockTransformInput({ actions: { brake: 1.0 }, velocity: [0, 0, -10] }),
      0.016,
    )
    const half = t.transform(
      createMockTransformInput({ actions: { brake: 0.5 }, velocity: [0, 0, -10] }),
      0.016,
    )
    expect(full.force![2]).toBeGreaterThan(half.force![2])
  })
})

describe('CarTransformer – engine braking', () => {
  test('engine braking applies deceleration force when coasting', () => {
    const t = new CarTransformer(10, { ...DEFAULT, lateralGrip: 0 })
    const output = t.transform(
      createMockTransformInput({ actions: {}, velocity: [0, 0, -10] }), // moving, no input
      0.016,
    )
    expect(output.force).toBeDefined()
    // Engine braking opposes forward motion → force in +Z
    expect(output.force![2]).toBeGreaterThan(0)
  })

  test('no engine braking when stationary', () => {
    const t = new CarTransformer(10, { ...DEFAULT, lateralGrip: 0 })
    const output = t.transform(
      createMockTransformInput({ actions: {}, velocity: [0, 0, 0] }),
      0.016,
    )
    expect(output.force).toBeUndefined()
  })
})

describe('CarTransformer – steering (bicycle model)', () => {
  test('steer right while moving forward produces positive Y torque', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: { steer_right: 1.0 }, velocity: [0, 0, -10] }),
      0.016,
    )
    expect(output.torque).toBeDefined()
    expect(output.torque![1]).toBeGreaterThan(0) // +Y = turn right
  })

  test('steer left while moving forward produces negative Y torque', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: { steer_left: 1.0 }, velocity: [0, 0, -10] }),
      0.016,
    )
    expect(output.torque).toBeDefined()
    expect(output.torque![1]).toBeLessThan(0) // -Y = turn left
  })

  test('steering torque scales with forward speed (bicycle model)', () => {
    const t = new CarTransformer(10, DEFAULT)
    const slow = t.transform(
      createMockTransformInput({ actions: { steer_right: 1.0 }, velocity: [0, 0, -5] }),
      0.016,
    )
    const fast = t.transform(
      createMockTransformInput({ actions: { steer_right: 1.0 }, velocity: [0, 0, -20] }),
      0.016,
    )
    // Faster speed → larger omega → larger torque magnitude
    expect(Math.abs(fast.torque![1])).toBeGreaterThan(Math.abs(slow.torque![1]))
  })

  test('no steering torque when stationary', () => {
    const t = new CarTransformer(10, { ...DEFAULT, lateralGrip: 0, engineBrake: 0 })
    const output = t.transform(
      createMockTransformInput({ actions: { steer_right: 1.0 }, velocity: [0, 0, 0] }),
      0.016,
    )
    expect(output.torque).toBeUndefined()
  })

  test('steering only affects Y axis (no pitch or roll torque)', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: { steer_right: 1.0 }, velocity: [0, 0, -10] }),
      0.016,
    )
    expect(output.torque![0]).toBe(0)
    expect(output.torque![2]).toBe(0)
  })

  test('steering is deterministic across identical calls', () => {
    const t = new CarTransformer(10, DEFAULT)
    const input = createMockTransformInput({ actions: { steer_right: 1.0 }, velocity: [0, 0, -10] })
    const out1 = t.transform(input, 0.016)
    const out2 = t.transform(input, 0.016)
    expect(out1.torque).toEqual(out2.torque)
  })
})

describe('CarTransformer – lateral grip', () => {
  test('lateral velocity produces a counter-force on the right axis', () => {
    const t = new CarTransformer(10, { ...DEFAULT, engineBrake: 0, lateralGrip: 8 })
    // Car facing forward (-Z), sliding right (+X)
    const output = t.transform(
      createMockTransformInput({ actions: {}, velocity: [5, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    expect(output.force).toBeDefined()
    // Counter-force should oppose rightward slide → negative X
    expect(output.force![0]).toBeLessThan(0)
  })

  test('lateral grip force magnitude proportional to lateral speed', () => {
    const t = new CarTransformer(10, { ...DEFAULT, engineBrake: 0, lateralGrip: 8 })
    const slow = t.transform(
      createMockTransformInput({ actions: {}, velocity: [2, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    const fast = t.transform(
      createMockTransformInput({ actions: {}, velocity: [6, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    expect(Math.abs(fast.force![0])).toBeGreaterThan(Math.abs(slow.force![0]))
  })

  test('lateral grip force = -lateralSpeed * lateralGrip along right axis', () => {
    const grip = 8
    const lateralSpeed = 5
    const t = new CarTransformer(10, { ...DEFAULT, engineBrake: 0, lateralGrip: grip })
    const output = t.transform(
      createMockTransformInput({ actions: {}, velocity: [lateralSpeed, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    expect(output.force![0]).toBeCloseTo(-lateralSpeed * grip, 3)
  })
})

describe('CarTransformer – handbrake', () => {
  test('handbrake while moving produces a braking force', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({ actions: { handbrake: 1.0 }, velocity: [0, 0, -10] }),
      0.016,
    )
    expect(output.force).toBeDefined()
    // Handbrake opposes forward velocity → positive Z component
    expect(output.force![2]).toBeGreaterThan(0)
  })

  test('handbrake reduces lateral grip (allows sliding)', () => {
    // Isolate the grip contribution by zeroing out handbrake braking force (handbrakeMultiplier=0)
    // and engine braking, so only the lateral grip component is in play.
    const grip = 10
    const gripFactor = 0.2
    const lateralSpeed = 5
    const t = new CarTransformer(10, {
      ...DEFAULT,
      lateralGrip: grip,
      handbrakeGripFactor: gripFactor,
      handbrakeMultiplier: 0,
      engineBrake: 0,
    })
    // Car sliding purely sideways (lateral velocity only, no forward/backward)
    const withGrip = t.transform(
      createMockTransformInput({ actions: {}, velocity: [lateralSpeed, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    const withHandbrake = t.transform(
      createMockTransformInput({ actions: { handbrake: 1.0 }, velocity: [lateralSpeed, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    // Normal grip: -5 * 10 = -50 in X
    expect(withGrip.force![0]).toBeCloseTo(-lateralSpeed * grip, 3)
    // Handbrake grip: -5 * 10 * 0.2 = -10 in X (significantly less resistance to sliding)
    expect(withHandbrake.force![0]).toBeCloseTo(-lateralSpeed * grip * gripFactor, 3)
    // Confirm handbrake grip is weaker than normal grip
    expect(Math.abs(withHandbrake.force![0])).toBeLessThan(Math.abs(withGrip.force![0]))
  })

  test('handbrake at standstill produces no force', () => {
    const t = new CarTransformer(10, { ...DEFAULT, lateralGrip: 0 })
    const output = t.transform(
      createMockTransformInput({ actions: { handbrake: 1.0 }, velocity: [0, 0, 0] }),
      0.016,
    )
    expect(output.force).toBeUndefined()
  })
})

describe('CarTransformer – idempotency and consistency', () => {
  test('identical inputs produce identical outputs across 10 frames', () => {
    const t = new CarTransformer(10, DEFAULT)
    const input = createMockTransformInput({
      actions: { throttle: 0.5, steer_right: 0.5 },
      velocity: [0, 0, -10],
      rotation: [0, 0, 0],
    })
    const outputs = Array.from({ length: 10 }, () => t.transform({ ...input }, 0.016))
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i].force).toEqual(outputs[0].force)
      expect(outputs[i].torque).toEqual(outputs[0].torque)
    }
  })

  test('throttle and steer together produce both force and torque', () => {
    const t = new CarTransformer(10, DEFAULT)
    const output = t.transform(
      createMockTransformInput({
        actions: { throttle: 1.0, steer_right: 1.0 },
        velocity: [0, 0, -10],
        rotation: [0, 0, 0],
      }),
      0.016,
    )
    expect(output.force).toBeDefined()
    expect(output.torque).toBeDefined()
  })
})
