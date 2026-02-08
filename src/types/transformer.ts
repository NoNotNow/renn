/**
 * Transformer System Types
 *
 * Transformers define movement behaviour for entities. They are chained
 * in a pipeline: each transformer receives input (including accumulated
 * forces from previous transformers) and outputs forces/torques that are
 * ultimately applied to the physics system.
 *
 * Data flow:
 *   RawInput → InputMapping → TransformInput → TransformerChain → TransformOutput → Physics
 */

import type { Vec3, Rotation } from './world'

// ---------------------------------------------------------------------------
// Raw Input (hardware layer)
// ---------------------------------------------------------------------------

/** Keys tracked from the keyboard. */
export interface RawKeyboardState {
  w: boolean
  a: boolean
  s: boolean
  d: boolean
  space: boolean
  shift: boolean
}

/** Accumulated wheel deltas from trackpad / mouse. */
export interface RawWheelState {
  deltaX: number
  deltaY: number
}

/** Combined raw input snapshot captured each frame. */
export interface RawInput {
  keys: RawKeyboardState
  wheel: RawWheelState
}

// ---------------------------------------------------------------------------
// Input Mapping (configurable per transformer)
// ---------------------------------------------------------------------------

/** Maps keyboard keys to semantic action names. */
export interface KeyboardMapping {
  w?: string
  a?: string
  s?: string
  d?: string
  space?: string
  shift?: string
}

/** Maps wheel axes to semantic action names. */
export interface WheelMapping {
  horizontal?: string
  vertical?: string
}

/** Sensitivity multipliers for input sources. */
export interface InputSensitivity {
  keyboard?: number
  wheel?: number
}

/**
 * Full input mapping configuration.
 * Each InputTransformer carries one of these; defaults come from presets.
 */
export interface InputMapping {
  keyboard?: KeyboardMapping
  wheel?: WheelMapping
  sensitivity?: InputSensitivity
}

// ---------------------------------------------------------------------------
// Transform Input / Output (data flowing through the pipeline)
// ---------------------------------------------------------------------------

/** Environmental conditions available to transformers. */
export interface EnvironmentState {
  wind?: Vec3
  isGrounded?: boolean
  groundNormal?: Vec3
}

/**
 * Input passed into every transformer in the chain.
 * The first transformer receives the raw-mapped actions;
 * subsequent transformers also see accumulated forces from earlier stages.
 */
export interface TransformInput {
  /** Semantic actions with their current value (0–1 or -1–1). */
  actions: Record<string, number>

  /** Current physical state of the entity. */
  position: Vec3
  rotation: Rotation
  velocity: Vec3
  angularVelocity: Vec3

  /** Accumulated forces / torques from earlier transformers. */
  accumulatedForce: Vec3
  accumulatedTorque: Vec3

  /** Environmental conditions. */
  environment: EnvironmentState

  /** Frame delta time in seconds. */
  deltaTime: number

  /** Id of the owning entity. */
  entityId: string
}

/**
 * Output produced by a single transformer.
 * Forces and torques are *additive* — the chain sums them up.
 */
export interface TransformOutput {
  /** Linear force to add (world-space). */
  force?: Vec3
  /** Instantaneous impulse to add (world-space). */
  impulse?: Vec3
  /** Torque to add (world-space). */
  torque?: Vec3

  /** If true, stop the chain after this transformer. */
  earlyExit?: boolean
}

// ---------------------------------------------------------------------------
// Transformer interface
// ---------------------------------------------------------------------------

/**
 * A Transformer produces forces/torques for an entity each frame.
 * Implementations range from user-input handlers to AI behaviours.
 */
export interface Transformer {
  /** Unique type identifier (matches TransformerConfig.type). */
  readonly type: string

  /** Execution priority — lower values run first. Default 10. */
  readonly priority: number

  /** When false the transformer is skipped in the chain. */
  enabled: boolean

  /**
   * Produce forces / torques for one frame.
   * @param input  Current transform input including actions, physics state, environment.
   * @param dt     Frame delta time in seconds (also in input.deltaTime).
   */
  transform(input: TransformInput, dt: number): TransformOutput
}

// ---------------------------------------------------------------------------
// JSON-serialisable configuration
// ---------------------------------------------------------------------------

/** Known preset transformer types. */
export type PresetTransformerType =
  | 'input'
  | 'airplane'
  | 'character'
  | 'car'
  | 'animal'
  | 'butterfly'

/** Transformer type string — either a preset or 'custom'. */
export type TransformerType = PresetTransformerType | 'custom' | string

/**
 * Serialisable transformer configuration stored in world JSON.
 */
export interface TransformerConfig {
  /** Preset name or 'custom'. */
  type: TransformerType

  /** Execution order (lower = earlier). Default: 10. */
  priority?: number

  /** Enable/disable. Default: true. */
  enabled?: boolean

  /** Input mapping override (only meaningful for type 'input'). */
  inputMapping?: InputMapping

  /** Transformer-specific parameters. */
  params?: Record<string, unknown>

  /** Custom JavaScript code (only for type 'custom'). */
  code?: string
}

// ---------------------------------------------------------------------------
// Null / empty helpers
// ---------------------------------------------------------------------------

export const ZERO_VEC3: Vec3 = [0, 0, 0]

export const EMPTY_TRANSFORM_OUTPUT: TransformOutput = Object.freeze({
  force: undefined,
  impulse: undefined,
  torque: undefined,
  earlyExit: false,
})

export function createEmptyTransformInput(
  entityId: string,
  dt: number,
): TransformInput {
  return {
    actions: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    accumulatedForce: [0, 0, 0],
    accumulatedTorque: [0, 0, 0],
    environment: {},
    deltaTime: dt,
    entityId,
  }
}
