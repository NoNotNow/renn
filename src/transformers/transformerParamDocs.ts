/**
 * User-facing descriptions for transformer JSON in the Builder.
 * Shown as tooltips on field names in the transformer inspector.
 */

import type { PresetTransformerType } from '@/types/transformer'
import { isPresetTransformerType } from '@/transformers/transformerPresets'

/** Top-level keys on `TransformerConfig` (serialised JSON). */
export const TRANSFORMER_CONFIG_COMMON_DOCS: Record<string, string> = {
  type:
    'Preset id (e.g. input, car2, person). Must match a registered transformer implementation.',
  priority:
    'Execution order in the chain: lower numbers run first. Typical: input = 0, movement = 5–10.',
  enabled:
    'When false, this transformer is skipped for the entity. Default is true if omitted.',
  params:
    'Optional bag of numbers/booleans/objects specific to this transformer type. Keys are documented below for each preset.',
  inputMapping:
    'Only for type "input": maps hardware keys and wheel axes to semantic action names (strings) that downstream transformers read via getAction(name).',
}

/** Keys under inputMapping — use dotted paths as in JSON. */
export const INPUT_MAPPING_FIELD_DOCS: Record<string, string> = {
  'keyboard.w':
    'Key W → semantic action name (e.g. throttle for a car, forward for a character).',
  'keyboard.a':
    'Key A → semantic action (e.g. steer_left or strafe left depending on your game).',
  'keyboard.s':
    'Key S → semantic action (e.g. brake or backward).',
  'keyboard.d':
    'Key D → semantic action (e.g. steer_right or strafe right).',
  'keyboard.space':
    'Space → semantic action (e.g. jump).',
  'keyboard.shift':
    'Shift → semantic action (e.g. run) if you bind it.',
  'wheel.horizontal':
    'Trackpad/mouse horizontal delta → semantic action name (optional).',
  'wheel.vertical':
    'Trackpad/mouse vertical delta → semantic action name (optional).',
  'sensitivity.keyboard':
    'Optional multiplier applied to keyboard-derived action values.',
  'sensitivity.wheel':
    'Optional multiplier applied to wheel-derived action values.',
}

/** `params` object entries per preset type (empty object means no numeric params). */
export const TRANSFORMER_PARAMS_DOCS: {
  [K in PresetTransformerType]: Record<string, string>
} = {
  input: {},

  car2: {
    power:
      'Throttle and brake impulse strength (same scale as other impulse-based presets). Higher = stronger acceleration/braking. Default 400.',
    steeringIntensity:
      'How much yaw you get per metre travelled per unit wheel angle (rad/m). Higher = tighter turning for the same speed. Default 0.1.',
    steeringSpeed:
      'How fast the virtual wheel responds to steer_left / steer_right actions (per frame). Default 0.01.',
    lateralGrip:
      'Sideways correction strength vs lateral velocity. Higher = less sliding. Very low values feel icy regardless of slip threshold. Default 100.',
    lateralToForwardTransfer:
      'Fraction (0–1) of lateral grip that is applied along forward axis when there is sideways motion—some energy can be redirected forward in turns. Default 0.2.',
    tireGripSlipSpeedThreshold:
      'Relative lateral speed (world units, same as velocity) above which effective grip is multiplied by lateralGripSlipScale. At or below this speed, full lateralGrip applies. Default 2.',
    lateralGripSlipScale:
      'Multiplier on lateralGrip when lateral speed exceeds tireGripSlipSpeedThreshold (simulates breakaway / drifting). Default 0.3.',
    jumpImpulse:
      'World +Y impulse applied once per rising edge of the jump action while grounded. Default 200; set 0 to disable.',
  },

  person: {
    walkForce:
      'Impulse magnitude used when walking (forward/back from actions). Default 200.',
    runForce:
      'Impulse magnitude used when running (e.g. with shift). Default 350.',
    maxWalkSpeed:
      'Target cap on forward/back speed when walking (m/s). Default 4.',
    maxRunSpeed:
      'Target cap on forward/back speed when running (m/s). Default 8.',
    turnSpeed:
      'Yaw rate scaling (rad/s per unit turn input) for in-place turning torque. Default 2.',
  },

  targetPoseInput: {
    poses:
      'Array of waypoints: each has position [x,y,z] and rotation [x,y,z] (Euler radians). Order defines the path.',
    speed:
      'Linear speed (m/s) toward the current waypoint position along the path. Default 2.',
    mode:
      'Waypoint sequence: cycle (loop), pingPong (reverse at ends), or stopAtEnd (halt on last pose).',
    positionEpsilon:
      'Distance (world units) within which the current waypoint counts as reached for position. Default 0.05.',
    rotationEpsilon:
      'Rotation difference (radians) within which the current waypoint counts as reached. Default 0.08.',
  },

  kinematicMovement: {
    maxRotationRate:
      'Maximum rotation rate (rad/s) when slewing toward targetPoseInput (or other) target rotation. Not the same as target.speed. Default 2π.',
  },

  wanderer: {
    speed:
      'Linear speed (m/s) toward randomly chosen poses inside the perimeter. Default 2.',
    jumpDistance:
      'Maximum distance to the next random target; 0 allows anywhere in the perimeter box. Default 3.',
    linear:
      'When true, wanders position within the perimeter.',
    angular:
      'When true, wanders rotation.',
    perimeter:
      'Object with center [x,y,z] and halfExtents [x,y,z] defining the axis-aligned wander box.',
    'perimeter.center':
      'World-space center of the wander region.',
    'perimeter.halfExtents':
      'Half-size of the box along each axis (full width = 2 × halfExtent).',
    positionEpsilon:
      'Position reach threshold (world units) before picking the next wander target. Default 0.05.',
    rotationEpsilon:
      'Rotation reach threshold (radians) before picking the next wander target. Default 0.08.',
  },

  follow: {
    targetEntityId:
      'Id of another entity to follow; each frame copies its pose into TransformInput.target for movers. Empty or invalid id → no target.',
    speed:
      'Linear speed (m/s) passed on the target for downstream kinematic movement. Default 2.',
    linear:
      'When true, target position tracks the followed entity.',
    angular:
      'When true, target rotation tracks the followed entity.',
  },
}

export function getTransformerParamDoc(
  type: string,
  paramKey: string,
): string | undefined {
  if (!isPresetTransformerType(type)) return undefined
  return TRANSFORMER_PARAMS_DOCS[type][paramKey]
}
