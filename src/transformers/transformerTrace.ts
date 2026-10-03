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
  /** Non-empty data channels on the wire into this step (`target`, blackboard keys like `av.ego`, `av.points[213]`). */
  channelsIn?: string[]
  /** Channels this step changed in place (wrote `input.target`, `input.av.plan`, …). */
  channelsWritten?: string[]
  /** Builder output LED — forces/setPose/etc., or input-mapping publishing actions. */
  outputLedActive: boolean
}

function cloneTuple3(t: readonly [number, number, number] | undefined): [number, number, number] {
  if (!t) return [0, 0, 0]
  return [t[0] ?? 0, t[1] ?? 0, t[2] ?? 0]
}

export function serializeTransformInputForTrace(input: TransformInput): TransformInputTraceSnapshot {
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
    target: input.target
      ? {
          pose: {
            position: cloneTuple3(input.target.pose?.position),
            rotation: cloneTuple3(input.target.pose?.rotation),
          },
          speed: input.target.speed,
          curve: input.target.curve,
          velocity: input.target.velocity ? cloneTuple3(input.target.velocity) : undefined,
          label: input.target.label,
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

/** Brief summary of what flows into a step (actions + live data channels) for Builder trace cards (IN: ...). */
export function summarizeTransformInputBrief(input: TransformInputTraceSnapshot, channelsIn?: string[]): string {
  const parts: string[] = []
  const actionsSummary = summarizeActions(input.actions)
  if (actionsSummary !== '(idle)') parts.push(actionsSummary)
  if (channelsIn && channelsIn.length > 0) parts.push(briefList(channelsIn))
  else {
    const target = input.target as { label?: string } | undefined
    if (target?.label) parts.push(`target: ${target.label}`)
  }
  return parts.length > 0 ? parts.join('; ') : '(idle)'
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

  const parts: string[] = []
  if (structural !== '(none)') parts.push(structural)
  if (actionsDeltaBrief) parts.push(`actions · ${actionsDeltaBrief}`)
  if (step.channelsWritten && step.channelsWritten.length > 0) parts.push(`wrote ${briefList(step.channelsWritten)}`)
  return parts.length > 0 ? parts.join('; ') : '(none)'
}

export function serializeTransformerTraceOutputJson(step: TransformerTraceStep): unknown {
  const o = step.transformOutput ?? {}
  const ret: Record<string, unknown> = { ...o }
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
  const ret: Record<string, unknown> = { ...input }
  if (ret.target && typeof ret.target === 'object') {
    const target = { ...(ret.target as Record<string, unknown>) }
    delete target.label
    ret.target = target
  }
  return ret
}

/** Input LED: semantic actions present on the wire into this step. */
export function hasNonZeroSemanticActions(
  inputBefore: TransformInputTraceSnapshot | undefined,
  channelsIn?: string[],
): boolean {
  if (!inputBefore) return false
  if (channelsIn && channelsIn.length > 0) return true
  const actions = inputBefore.actions as Record<string, number> | undefined
  if (!actions) return false
  return Object.values(actions).some((v) => v !== 0)
}

// ---- data channels (what stages pass to each other by mutating `input`) ----

const STANDARD_INPUT_KEYS = new Set([
  'actions',
  'position',
  'rotation',
  'velocity',
  'angularVelocity',
  'accumulatedForce',
  'accumulatedTorque',
  'environment',
  'deltaTime',
  'entityId',
])

function fpValue(v: unknown, depth: number): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(2) : String(v)
  if (typeof v === 'string') return v.slice(0, 60)
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v !== 'object' || depth <= 0) return typeof v === 'object' ? '{…}' : ''
  if (Array.isArray(v)) {
    const head = v.slice(0, 3).map((x) => fpValue(x, depth - 1))
    return `[${v.length}:${head.join(',')}]`
  }
  const keys = Object.keys(v as Record<string, unknown>).slice(0, 14)
  return `{${keys.map((k) => `${k}:${fpValue((v as Record<string, unknown>)[k], depth - 1)}`).join(',')}}`
}

function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

function channelLabel(name: string, v: unknown): string {
  return Array.isArray(v) ? `${name}[${v.length}]` : name
}

/** Fingerprint per data channel: `target`, plus every non-standard input key (one level deeper for blackboard objects). */
export function collectChannelFingerprints(input: TransformInput): Map<string, { fp: string; label: string; live: boolean }> {
  const out = new Map<string, { fp: string; label: string; live: boolean }>()
  const rec = input as unknown as Record<string, unknown>
  for (const key of Object.keys(rec)) {
    if (STANDARD_INPUT_KEYS.has(key)) continue
    const v = rec[key]
    if (typeof v === 'function') continue
    if (v && typeof v === 'object' && !Array.isArray(v) && key !== 'target') {
      for (const sub of Object.keys(v as Record<string, unknown>)) {
        const sv = (v as Record<string, unknown>)[sub]
        if (typeof sv === 'function') continue
        out.set(`${key}.${sub}`, { fp: fpValue(sv, 2), label: channelLabel(`${key}.${sub}`, sv), live: isNonEmpty(sv) })
      }
    } else {
      out.set(key, { fp: fpValue(v, 3), label: channelLabel(key, v), live: isNonEmpty(v) })
    }
  }
  return out
}

export function channelsLive(ch: Map<string, { label: string; live: boolean }>): string[] {
  return [...ch.values()].filter((c) => c.live).map((c) => c.label)
}

export function channelsChanged(
  before: Map<string, { fp: string; label: string }>,
  after: Map<string, { fp: string; label: string }>,
): string[] {
  const names: string[] = []
  for (const [k, a] of after) {
    const b = before.get(k)
    if (!b || b.fp !== a.fp) names.push(a.label)
  }
  for (const [k, b] of before) if (!after.has(k)) names.push(`${b.label} (removed)`)
  return names
}

/** `a, b, c +4` for brief card lines. */
export function briefList(items: string[], max = 4): string {
  if (items.length <= max) return items.join(', ')
  return `${items.slice(0, max).join(', ')} +${items.length - max}`
}

/** Pipe-level IN/OUT: IN of the first stage that ran, OUT = everything the member stages produced. */
export function summarizePipeTraceBrief(steps: readonly TransformerTraceStep[]): { input: string; output: string } {
  const ran = steps.filter((st) => !st.skipped)
  if (ran.length === 0) return { input: steps.length > 0 ? '(disabled)' : '—', output: steps.length > 0 ? '(disabled)' : '—' }
  const first = ran[0]!
  const input = first.inputBefore ? summarizeTransformInputBrief(first.inputBefore, first.channelsIn) : '(idle)'
  const written: string[] = []
  const structural = new Set<string>()
  const actionTags = new Set<string>()
  for (const st of ran) {
    for (const c of st.channelsWritten ?? []) if (!written.includes(c)) written.push(c)
    if (st.transformOutput) {
      const b = summarizeTransformOutputBrief(st.transformOutput)
      if (b !== '(none)') for (const t of b.split(', ')) structural.add(t)
    }
    const before = st.inputBefore?.actions as Record<string, number> | undefined
    if (st.type === 'input' && before && st.actionsAfter && actionsMapsDiffer(before, st.actionsAfter))
      actionTags.add('actions')
  }
  const parts: string[] = []
  if (structural.size > 0) parts.push([...structural].join(', '))
  if (actionTags.size > 0) parts.push('actions')
  if (written.length > 0) parts.push(`wrote ${briefList(written, 5)}`)
  return { input, output: parts.length > 0 ? parts.join('; ') : '(none)' }
}
