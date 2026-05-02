import type { TransformInput, TransformOutput } from '@/types/transformer'

/** Plain JSON-friendly snapshot of TransformInput for Builder trace UI. */
export type TransformInputTraceSnapshot = Record<string, unknown>

export interface TransformerTraceStep {
  /** Matches entity.transformers stack index (Editor row). */
  configStackIndex: number
  type: string
  priority: number
  /** Transformer disabled this frame — no transform() call. */
  skipped: boolean
  /** Snapshot immediately before transform(); omitted when skipped. */
  inputBefore?: TransformInputTraceSnapshot
  /** Raw return value from transform(); omitted when skipped. */
  transformOutput?: TransformOutput
  /** Builder output LED — forces/setPose/etc., or input-mapping publishing actions. */
  outputLedActive: boolean
}

function cloneTuple3(t: readonly [number, number, number]): [number, number, number] {
  return [t[0], t[1], t[2]]
}

export function serializeTransformInputForTrace(input: TransformInput): TransformInputTraceSnapshot {
  const target = input.target
  return {
    actions: { ...input.actions },
    position: cloneTuple3(input.position),
    rotation: cloneTuple3(input.rotation),
    velocity: cloneTuple3(input.velocity),
    angularVelocity: cloneTuple3(input.angularVelocity),
    accumulatedForce: cloneTuple3(input.accumulatedForce),
    accumulatedTorque: cloneTuple3(input.accumulatedTorque),
    environment: { ...input.environment },
    deltaTime: input.deltaTime,
    entityId: input.entityId,
    target: target
      ? {
          pose: {
            position: cloneTuple3(target.pose.position),
            rotation: cloneTuple3(target.pose.rotation),
          },
          speed: target.speed,
          curve: target.curve,
          velocity: target.velocity ? cloneTuple3(target.velocity) : undefined,
        }
      : undefined,
  }
}

/** Clone TransformOutput for trace storage (plain data). */
export function cloneTransformOutputForTrace(o: TransformOutput): TransformOutput {
  const next: TransformOutput = {
    earlyExit: o.earlyExit ?? false,
  }
  if (o.force) next.force = cloneTuple3(o.force)
  if (o.impulse) next.impulse = cloneTuple3(o.impulse)
  if (o.torque) next.torque = cloneTuple3(o.torque)
  if (o.color) next.color = cloneTuple3(o.color)
  if (o.addRotation !== undefined) {
    next.addRotation = o.addRotation === null ? null : cloneTuple3(o.addRotation)
  }
  if (o.setPose) {
    next.setPose = {
      position: cloneTuple3(o.setPose.position),
      rotation: cloneTuple3(o.setPose.rotation),
    }
  }
  return next
}

function vec3NonZero(v: readonly [number, number, number] | undefined): boolean {
  if (!v) return false
  return v[0] !== 0 || v[1] !== 0 || v[2] !== 0
}

/**
 * True when transform() returned something that should light the output LED
 * (non-empty physics / pose / colour / early exit).
 */
export function isStructuralTransformOutputActive(o: TransformOutput): boolean {
  if (o.earlyExit) return true
  if (vec3NonZero(o.force)) return true
  if (vec3NonZero(o.impulse)) return true
  if (vec3NonZero(o.torque)) return true
  if (o.color) return true
  if (o.addRotation != null) return true
  if (o.setPose) return true
  return false
}

export function actionsMapsDiffer(
  before: Record<string, number>,
  after: Record<string, number>,
): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    const b = before[k] ?? 0
    const a = after[k] ?? 0
    if (a !== b) return true
  }
  return false
}

/** Output LED for `input` transformer: actions changed by this step. */
export function inputTransformerPublishedActions(
  transformerType: string,
  actionsBefore: Record<string, number>,
  actionsAfter: Record<string, number>,
): boolean {
  return transformerType === 'input' && actionsMapsDiffer(actionsBefore, actionsAfter)
}

export function computeOutputLedActive(
  transformerType: string,
  output: TransformOutput,
  actionsBefore: Record<string, number>,
  actionsAfter: Record<string, number>,
): boolean {
  return (
    isStructuralTransformOutputActive(output) ||
    inputTransformerPublishedActions(transformerType, actionsBefore, actionsAfter)
  )
}

/** Input LED: semantic actions present on the wire into this step. */
export function hasNonZeroSemanticActions(inputBefore: TransformInputTraceSnapshot | undefined): boolean {
  if (!inputBefore) return false
  const actions = inputBefore.actions as Record<string, number> | undefined
  if (!actions) return false
  return Object.values(actions).some((v) => v !== 0)
}
