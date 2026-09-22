/**
 * Test utilities for transformer system.
 */

import { expect } from 'vitest'
import type {
  TransformInput,
  TransformOutput,
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
 * Assert that a TransformOutput has no forces or torques.
 */
export function assertEmptyOutput(output: TransformOutput): void {
  expect(output.force).toBeUndefined()
  expect(output.impulse).toBeUndefined()
  expect(output.torque).toBeUndefined()
  expect(output.earlyExit).toBe(false)
}
