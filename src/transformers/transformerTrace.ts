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
  /** `input.actions` after this step (tracing only); shows published semantics for `input` transformers. */
  actionsAfter?: Record<string, number>
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
          label: target.label,
        }
      : undefined,
  }
}

/** Clone TransformOutput for trace storage (plain data). */
export function cloneTransformOutputForTrace(o: TransformOutput): TransformOutput {
  const next: TransformOutput = {
    earlyExit: o.earlyExit ?? false,
    targetLabel: o.targetLabel,
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
  if (o.targetLabel) return true
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

/** Brief diff string for Builder trace labels when actions changed this step. */
export function summarizePublishedActionsDelta(
  before: Record<string, number>,
  after: Record<string, number>,
): string {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const parts: string[] = []
  for (const k of [...keys].sort()) {
    const b = before[k] ?? 0
    const a = after[k] ?? 0
    if (a !== b) parts.push(`${k}=${Number(a.toFixed(3))}`)
  }
  if (parts.length === 0) return '(idle)'
  return parts.join(', ')
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

export function summarizeActions(actions: unknown): string {
  if (!actions || typeof actions !== 'object') return '(idle)'
  const rec = actions as Record<string, number>
  const pairs = Object.entries(rec).filter(([, v]) => typeof v === 'number' && v !== 0)
  if (pairs.length === 0) return '(idle)'
  return pairs.map(([k, v]) => `${k}=${Number((v as number).toFixed(3))}`).join(', ')
}

function vec3AnyNonZero(v: readonly [number, number, number] | undefined): boolean {
  if (!v) return false
  return v[0] !== 0 || v[1] !== 0 || v[2] !== 0
}

export function summarizeTransformOutputBrief(o: TransformOutput): string {
  if (!isStructuralTransformOutputActive(o)) return '(none)'
  const tags: string[] = []
  if (o.earlyExit) tags.push('earlyExit')
  if (vec3AnyNonZero(o.force)) tags.push('force')
  if (vec3AnyNonZero(o.impulse)) tags.push('impulse')
  if (vec3AnyNonZero(o.torque)) tags.push('torque')
  if (o.color) tags.push('color')
  if (o.addRotation != null) tags.push('addRotation')
  if (o.setPose) tags.push('setPose')
  if (o.targetLabel) tags.push(`target: ${o.targetLabel}`)
  return tags.join(', ')
}

/** Brief summary of TransformInput for Builder trace cards (IN: ...). */
export function summarizeTransformInputBrief(input: TransformInputTraceSnapshot): string {
  const actionsSummary = summarizeActions(input.actions)
  const target = input.target as any
  const targetLabel = target?.label ? `target: ${target.label}` : null

  if (actionsSummary !== '(idle)' && targetLabel) return `${actionsSummary}; ${targetLabel}`
  if (actionsSummary !== '(idle)') return actionsSummary
  if (targetLabel) return targetLabel
  return '(idle)'
}

/** Combines physics/pose return value with actions-wire delta for `input` transformers. */
export function summarizeTransformerTraceOutputBrief(
  transformerType: string,
  step: TransformerTraceStep | undefined,
): string {
  if (!step) return '(none)'
  if (step.skipped) return '(disabled)'
  const structural =
    step.transformOutput !== undefined
      ? summarizeTransformOutputBrief(step.transformOutput)
      : '(none)'
  const before = step.inputBefore?.actions as Record<string, number> | undefined
  const after = step.actionsAfter
  const actionsDeltaBrief =
    transformerType === 'input' && before && after && actionsMapsDiffer(before, after)
      ? summarizePublishedActionsDelta(before, after)
      : null

  if (structural !== '(none)' && actionsDeltaBrief)
    return `${structural}; actions · ${actionsDeltaBrief}`
  if (structural !== '(none)') return structural
  if (actionsDeltaBrief) return `actions · ${actionsDeltaBrief}`
  return '(none)'
}

export function serializeTransformerTraceOutputJson(step: TransformerTraceStep): unknown {
  const o = step.transformOutput ?? {}
  const ret: any = { ...o }
  delete ret.targetLabel

  const before = step.inputBefore?.actions as Record<string, number> | undefined
  const after = step.actionsAfter
  if (before && after && actionsMapsDiffer(before, after)) {
    return { transformReturn: ret, actionsAfter: after }
  }
  return ret
}

/** Clean snapshot of TransformInput for popup display (removes internal labels). */
export function serializeTransformInputForDisplay(input: TransformInputTraceSnapshot | undefined): unknown {
  if (!input) return null
  const ret: any = { ...input }
  if (ret.target) {
    ret.target = { ...ret.target }
    delete ret.target.label
  }
  return ret
}

/** Input LED: semantic actions present on the wire into this step. */
export function hasNonZeroSemanticActions(inputBefore: TransformInputTraceSnapshot | undefined): boolean {
  if (!inputBefore) return false
  const actions = inputBefore.actions as Record<string, number> | undefined
  if (!actions) return false
  return Object.values(actions).some((v) => v !== 0)
}
