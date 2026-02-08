import { describe, expect, test } from 'vitest'
import { AirplaneTransformer } from './airplaneTransformer'
import { createMockTransformInput, assertForceEquals } from '@/test/helpers/transformer'

describe('AirplaneTransformer', () => {
  test('thrust action generates forward force', () => {
    const transformer = new AirplaneTransformer(10, { thrustForce: 50 })
    const input = createMockTransformInput({
      actions: { thrust: 1.0 },
      rotation: [0, 0, 0], // Looking forward (-Z)
    })

    const output = transformer.transform(input, 0.016)

    expect(output.force).toBeDefined()
    // Forward is -Z direction
    expect(output.force![2]).toBeLessThan(0)
  })

  test('lift proportional to velocity', () => {
    const transformer = new AirplaneTransformer(10, { liftCoefficient: 2.5 })
    const input1 = createMockTransformInput({
      velocity: [0, 0, -10], // Moving forward
    })
    const input2 = createMockTransformInput({
      velocity: [0, 0, -20], // Moving faster forward
    })

    const out1 = transformer.transform(input1, 0.016)
    const out2 = transformer.transform(input2, 0.016)

    // More lift with higher velocity
    expect(out2.force![1]).toBeGreaterThan(out1.force![1])
  })

  test('drag opposes velocity', () => {
    const transformer = new AirplaneTransformer(10, { dragCoefficient: 0.1 })
    const input = createMockTransformInput({
      velocity: [10, 0, 0], // Moving in +X
    })

    const output = transformer.transform(input, 0.016)

    // Drag should oppose velocity (negative X)
    expect(output.force![0]).toBeLessThan(0)
  })

  test('pitch action generates torque', () => {
    const transformer = new AirplaneTransformer(10, { pitchSensitivity: 5.0 })
    const input = createMockTransformInput({
      actions: { pitch: 0.5 },
    })

    const output = transformer.transform(input, 0.016)

    expect(output.torque).toBeDefined()
    expect(output.torque![0]).toBeGreaterThan(0) // Pitch around X axis
  })

  test('yaw action generates torque', () => {
    const transformer = new AirplaneTransformer(10, { yawSensitivity: 5.0 })
    const input = createMockTransformInput({
      actions: { yaw: 0.5 },
    })

    const output = transformer.transform(input, 0.016)

    expect(output.torque).toBeDefined()
    expect(output.torque![1]).toBeGreaterThan(0) // Yaw around Y axis
  })

  test('roll actions generate torque', () => {
    const transformer = new AirplaneTransformer(10, { rollSensitivity: 5.0 })
    const inputLeft = createMockTransformInput({
      actions: { roll_left: 1.0 },
    })
    const inputRight = createMockTransformInput({
      actions: { roll_right: 1.0 },
    })

    const outLeft = transformer.transform(inputLeft, 0.016)
    const outRight = transformer.transform(inputRight, 0.016)

    expect(outLeft.torque![2]).toBeLessThan(0) // Roll left = negative Z
    expect(outRight.torque![2]).toBeGreaterThan(0) // Roll right = positive Z
  })

  test('brake reduces thrust', () => {
    const transformer = new AirplaneTransformer(10, { thrustForce: 50 })
    const inputThrust = createMockTransformInput({
      actions: { thrust: 1.0 },
      rotation: [0, 0, 0],
    })
    const inputBrake = createMockTransformInput({
      actions: { brake: 1.0 },
      rotation: [0, 0, 0],
    })

    const outThrust = transformer.transform(inputThrust, 0.016)
    const outBrake = transformer.transform(inputBrake, 0.016)

    // Brake should produce opposite force
    expect(outBrake.force![2]).toBeGreaterThan(outThrust.force![2])
  })

  test('boost increases thrust', () => {
    const transformer = new AirplaneTransformer(10, { thrustForce: 50 })
    const inputNormal = createMockTransformInput({
      actions: { thrust: 1.0 },
      rotation: [0, 0, 0],
    })
    const inputBoost = createMockTransformInput({
      actions: { thrust: 1.0, boost: 1.0 },
      rotation: [0, 0, 0],
    })

    const outNormal = transformer.transform(inputNormal, 0.016)
    const outBoost = transformer.transform(inputBoost, 0.016)

    // Boost should increase thrust magnitude
    expect(Math.abs(outBoost.force![2])).toBeGreaterThan(Math.abs(outNormal.force![2]))
  })
})
