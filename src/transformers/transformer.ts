/**
 * Base Transformer class and TransformerChain implementation.
 *
 * Transformers run in a pipeline: forces/torques accumulate; color, addRotation,
 * and setPose are last-wins per frame.
 */

import type {
  Transformer,
  TransformInput,
  TransformOutput,
  Vec3,
} from '@/types/transformer'
import type { Rotation } from '@/types/world'
import { EMPTY_TRANSFORM_OUTPUT } from '@/types/transformer'
import { getForwardVectorFromEuler, getUpVectorFromEuler } from '@/utils/rotationUtils'
import type { TransformerTraceStep } from '@/transformers/transformerTrace'
import {
  cloneTransformOutputForTrace,
  computeOutputLedActive,
  serializeTransformInputForTrace,
} from '@/transformers/transformerTrace'

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

  /** Default: no-op. Presets with params should override. */
  setParams(_patch: Record<string, unknown>): void {}

  /** Default: rebuild if type or priority changed. */
  needsRebuild(config: TransformerConfig): boolean {
    return (
      config.type !== this.type ||
      (config.priority !== undefined && config.priority !== this.priority)
    )
  }

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

  /**
   * Helper: Get forward direction from Euler rotation (Three.js -Z axis).
   */
  protected getForwardVector(rotation: Rotation): Vec3 {
    return getForwardVectorFromEuler(rotation)
  }

  /**
   * Helper: Get up direction from Euler rotation (Three.js Y axis).
   */
  protected getUpVector(rotation: Rotation): Vec3 {
    return getUpVectorFromEuler(rotation)
  }
}

/**
 * Executes a chain of transformers in priority order.
 * Forces and torques are accumulated; early-exit stops the chain.
 */
export class TransformerChain {
  private transformers: Transformer[] = []
  /** Priority-sorted view; invalidated when the chain list changes. */
  private sorted: Transformer[] = []
  private sortDirty = true

  private ensureSorted(): void {
    if (!this.sortDirty) return
    this.sorted.length = 0
    for (const t of this.transformers) {
      this.sorted.push(t)
    }
    this.sorted.sort((a, b) => a.priority - b.priority)
    this.sortDirty = false
  }

  /**
   * Add a transformer to the chain.
   */
  add(transformer: Transformer): void {
    this.transformers.push(transformer)
    this.sortDirty = true
  }

  /**
   * Remove a transformer from the chain.
   */
  remove(transformer: Transformer): void {
    const index = this.transformers.indexOf(transformer)
    if (index >= 0) {
      this.transformers.splice(index, 1)
      this.sortDirty = true
    }
  }

  /**
   * Clear all transformers.
   */
  clear(): void {
    this.transformers = []
    this.sorted.length = 0
    this.sortDirty = false
  }

  /**
   * Get all transformers (sorted by priority).
   * Do not mutate the returned array.
   */
  getAll(): readonly Transformer[] {
    this.ensureSorted()
    return this.sorted
  }

  /**
   * Transformers in the same order as entity.transformers / add order (not sorted by priority).
   * Used to sync config fields like `enabled` by index.
   */
  getInConfigOrder(): readonly Transformer[] {
    return [...this.transformers]
  }

  /**
   * Execute the transformer chain.
   * Accumulates into `input.accumulatedForce` / `input.accumulatedTorque` (caller must zero them).
   */
  execute(
    input: TransformInput,
    dt: number,
    traceSteps?: TransformerTraceStep[],
  ): TransformOutput {
    this.ensureSorted()

    let lastColor: Vec3 | undefined
    let lastAddRotation: Rotation | null | undefined
    let lastSetPose: TransformOutput['setPose']
    let sawEarlyExit = false

    const f = input.accumulatedForce
    const tq = input.accumulatedTorque

    for (const transformer of this.sorted) {
      const configStackIndex = transformer.configStackIndex ?? -1
      if (!transformer.enabled) {
        if (traceSteps) {
          traceSteps.push({
            configStackIndex,
            type: transformer.type,
            priority: transformer.priority,
            skipped: true,
            outputLedActive: false,
          })
        }
        continue
      }

      let actionsBefore: Record<string, number> | undefined
      let inputBeforeSnapshot: TransformerTraceStep['inputBefore']
      if (traceSteps) {
        inputBeforeSnapshot = serializeTransformInputForTrace(input)
        actionsBefore = { ...input.actions }
      }

      const output = transformer.transform(input, dt)

      if (traceSteps && actionsBefore) {
        const actionsAfter = { ...input.actions }
        traceSteps.push({
          configStackIndex,
          type: transformer.type,
          priority: transformer.priority,
          skipped: false,
          inputBefore: inputBeforeSnapshot,
          transformOutput: cloneTransformOutputForTrace(output),
          actionsAfter,
          outputLedActive: computeOutputLedActive(
            transformer.type,
            output,
            actionsBefore,
            actionsAfter,
          ),
        })
      }

      if (output.force) {
        f[0] += output.force[0]
        f[1] += output.force[1]
        f[2] += output.force[2]
      }
      if (output.impulse) {
        f[0] += output.impulse[0]
        f[1] += output.impulse[1]
        f[2] += output.impulse[2]
      }
      if (output.torque) {
        tq[0] += output.torque[0]
        tq[1] += output.torque[1]
        tq[2] += output.torque[2]
      }
      if (output.color) {
        lastColor = output.color
      }
      if (output.addRotation != null) {
        lastAddRotation = output.addRotation
      }
      if (output.setPose) {
        lastSetPose = output.setPose
      }
      if (output.earlyExit) {
        sawEarlyExit = true
        break
      }
    }

    if (
      f[0] === 0 &&
      f[1] === 0 &&
      f[2] === 0 &&
      tq[0] === 0 &&
      tq[1] === 0 &&
      tq[2] === 0 &&
      !sawEarlyExit
    ) {
      if (lastColor !== undefined || lastAddRotation != null || lastSetPose !== undefined) {
        return {
          ...EMPTY_TRANSFORM_OUTPUT,
          color: lastColor,
          addRotation: lastAddRotation,
          setPose: lastSetPose,
        }
      }
      return EMPTY_TRANSFORM_OUTPUT
    }

    return {
      force: f,
      torque: tq,
      earlyExit: sawEarlyExit,
      color: lastColor,
      addRotation: lastAddRotation,
      setPose: lastSetPose,
    }
  }
}
