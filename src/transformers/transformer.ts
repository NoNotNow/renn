/**
 * Base Transformer class and TransformerChain implementation.
 *
 * Transformers are executed in a pipeline: each transformer receives
 * the output from previous transformers and can add forces/torques.
 */

import type {
  Transformer,
  TransformInput,
  TransformOutput,
  Vec3,
} from '@/types/transformer'
import { EMPTY_TRANSFORM_OUTPUT, ZERO_VEC3 } from '@/types/transformer'

/**
 * Abstract base class for all transformers.
 * Provides default implementations and common utilities.
 */
export abstract class BaseTransformer implements Transformer {
  abstract readonly type: string
  readonly priority: number
  enabled: boolean

  constructor(priority: number = 10, enabled: boolean = true) {
    this.priority = priority
    this.enabled = enabled
  }

  abstract transform(input: TransformInput, dt: number): TransformOutput

  /**
   * Helper: Get action value, defaulting to 0 if not present.
   */
  protected getAction(input: TransformInput, name: string): number {
    return input.actions[name] ?? 0
  }

  /**
   * Helper: Create a force vector.
   */
  protected createForce(x: number, y: number, z: number): Vec3 {
    return [x, y, z]
  }

  /**
   * Helper: Create a torque vector.
   */
  protected createTorque(x: number, y: number, z: number): Vec3 {
    return [x, y, z]
  }

  /**
   * Helper: Add two vectors.
   */
  protected addVec3(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
  }

  /**
   * Helper: Scale a vector.
   */
  protected scaleVec3(v: Vec3, s: number): Vec3 {
    return [v[0] * s, v[1] * s, v[2] * s]
  }
}

/**
 * Executes a chain of transformers in priority order.
 * Forces and torques are accumulated; early-exit stops the chain.
 */
export class TransformerChain {
  private transformers: Transformer[] = []

  /**
   * Add a transformer to the chain.
   */
  add(transformer: Transformer): void {
    this.transformers.push(transformer)
  }

  /**
   * Remove a transformer from the chain.
   */
  remove(transformer: Transformer): void {
    const index = this.transformers.indexOf(transformer)
    if (index >= 0) {
      this.transformers.splice(index, 1)
    }
  }

  /**
   * Clear all transformers.
   */
  clear(): void {
    this.transformers = []
  }

  /**
   * Get all transformers (sorted by priority).
   */
  getAll(): readonly Transformer[] {
    return [...this.transformers].sort((a, b) => a.priority - b.priority)
  }

  /**
   * Execute the transformer chain.
   * Returns accumulated forces and torques.
   */
  execute(
    input: TransformInput,
    dt: number,
  ): TransformOutput {
    // Sort by priority (lower = earlier)
    const sorted = [...this.transformers].sort(
      (a, b) => a.priority - b.priority,
    )

    // Accumulated output
    const accumulated: TransformOutput = {
      force: [0, 0, 0],
      torque: [0, 0, 0],
      earlyExit: false,
    }

    // Current input (will be updated as we go through the chain)
    let currentInput: TransformInput = { ...input }

    for (const transformer of sorted) {
      // Skip disabled transformers
      if (!transformer.enabled) {
        continue
      }

      // Execute transformer
      const output = transformer.transform(currentInput, dt)

      // Accumulate forces
      if (output.force) {
        accumulated.force![0] += output.force[0]
        accumulated.force![1] += output.force[1]
        accumulated.force![2] += output.force[2]
      }

      // Accumulate impulses (treated as forces for accumulation)
      if (output.impulse) {
        accumulated.force![0] += output.impulse[0]
        accumulated.force![1] += output.impulse[1]
        accumulated.force![2] += output.impulse[2]
      }

      // Accumulate torques
      if (output.torque) {
        accumulated.torque![0] += output.torque[0]
        accumulated.torque![1] += output.torque[1]
        accumulated.torque![2] += output.torque[2]
      }

      // Early exit?
      if (output.earlyExit) {
        accumulated.earlyExit = true
        break
      }

      // Update accumulated forces in input for next transformer
      currentInput = {
        ...currentInput,
        accumulatedForce: accumulated.force!,
        accumulatedTorque: accumulated.torque!,
      }
    }

    // Return empty output if no forces were generated
    if (
      accumulated.force![0] === 0 &&
      accumulated.force![1] === 0 &&
      accumulated.force![2] === 0 &&
      accumulated.torque![0] === 0 &&
      accumulated.torque![1] === 0 &&
      accumulated.torque![2] === 0 &&
      !accumulated.earlyExit
    ) {
      return EMPTY_TRANSFORM_OUTPUT
    }

    return accumulated
  }
}
