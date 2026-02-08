/**
 * Test utilities for transformer system.
 */

import type {
  TransformInput,
  TransformOutput,
  Vec3,
} from '@/types/transformer'
import { createEmptyTransformInput } from '@/types/transformer'

/**
 * Create a mock TransformInput with optional overrides.
 */
export function createMockTransformInput(
  overrides?: Partial<TransformInput>,
): TransformInput {
  const base = createEmptyTransformInput('test-entity', 0.016)
  return {
    ...base,
    ...overrides,
    actions: { ...base.actions, ...overrides?.actions },
    environment: { ...base.environment, ...overrides?.environment },
  }
}

/**
 * Assert that a TransformOutput has the expected force (within tolerance).
 */
export function assertForceEquals(
  output: TransformOutput,
  expected: Vec3,
  tolerance = 0.01,
): void {
  expect(output.force).toBeDefined()
  expect(output.force![0]).toBeCloseTo(expected[0], tolerance)
  expect(output.force![1]).toBeCloseTo(expected[1], tolerance)
  expect(output.force![2]).toBeCloseTo(expected[2], tolerance)
}

/**
 * Assert that a TransformOutput has the expected torque (within tolerance).
 */
export function assertTorqueEquals(
  output: TransformOutput,
  expected: Vec3,
  tolerance = 0.01,
): void {
  expect(output.torque).toBeDefined()
  expect(output.torque![0]).toBeCloseTo(expected[0], tolerance)
  expect(output.torque![1]).toBeCloseTo(expected[1], tolerance)
  expect(output.torque![2]).toBeCloseTo(expected[2], tolerance)
}

/**
 * Assert that a TransformOutput has no forces or torques.
 */
export function assertEmptyOutput(output: TransformOutput): void {
  expect(output.force).toBeUndefined()
  expect(output.impulse).toBeUndefined()
  expect(output.torque).toBeUndefined()
  expect(output.earlyExit).toBe(false)
}
