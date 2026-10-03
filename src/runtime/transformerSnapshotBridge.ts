/**
 * Builder UI: one-shot "snapshot" of every custom transformer of an entity (input → output of one frame).
 * Armed by a button press; the next frame's custom transformer runs record into it, then it is published.
 * Nothing is recorded (and nothing costs time) while no snapshot is armed.
 */

export type TransformerSnapshotStage = {
  stackIndex: number
  priority: number
  /** First comment line of the stage code (usually names the stage). */
  label: string
  params: unknown
  input: unknown
  /** Blackboard / input after the stage ran, only when the stage changed it in place. */
  inputAfter?: unknown
  output: unknown
  state: unknown
  watch: Record<string, string>
  error?: string
}

export type TransformerSnapshot = {
  entityId: string
  /** Rapier view of the entity at the start of the frame: velocities and every collider in contact (id, overlap, normal). */
  physics?: unknown
  capturedAt: string
  frameDt: number
  stages: TransformerSnapshotStage[]
  note?: string
}

const MAX_DEPTH = 6
const MAX_ARRAY = 12
const MAX_STRING = 240
const MAX_KEYS = 60

/** JSON-safe, size-capped copy (long arrays are truncated, numbers rounded). */
export function sanitizeForSnapshot(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value ?? null
  const t = typeof value
  if (t === 'number') {
    const n = value as number
    return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : String(n)
  }
  if (t === 'string') {
    const s = value as string
    return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s
  }
  if (t === 'boolean') return value
  if (t === 'function' || t === 'symbol') return undefined
  if (t !== 'object') return String(value)
  const obj = value as object
  if (seen.has(obj)) return '[circular]'
  if (depth >= MAX_DEPTH) return '[max depth]'
  seen.add(obj)
  try {
    if (Array.isArray(obj) || ArrayBuffer.isView(obj)) {
      const arr = Array.from(obj as ArrayLike<unknown>)
      const head = arr.slice(0, MAX_ARRAY).map((v) => sanitizeForSnapshot(v, depth + 1, seen))
      return arr.length > MAX_ARRAY ? [...head, `…(${arr.length} items)`] : head
    }
    const out: Record<string, unknown> = {}
    const keys = Object.keys(obj)
    for (const k of keys.slice(0, MAX_KEYS)) {
      const v = sanitizeForSnapshot((obj as Record<string, unknown>)[k], depth + 1, seen)
      if (v !== undefined) out[k] = v
    }
    if (keys.length > MAX_KEYS) out['…'] = `${keys.length - MAX_KEYS} more keys`
    return out
  } finally {
    seen.delete(obj)
  }
}

type Armed = { physics?: unknown; entityId: string; stages: TransformerSnapshotStage[]; seenIndices: Set<number>; timer: ReturnType<typeof setTimeout> | null; startedAt: number; frameDt: number }

let physicsProbe: ((entityId: string) => unknown) | null = null
/** Wired by the render item registry while transformers run (physics diagnostics for the snapshot). */
export function setTransformerSnapshotPhysicsProbe(fn: ((entityId: string) => unknown) | null): void {
  physicsProbe = fn
}

let armed: Armed | null = null
let latest: TransformerSnapshot | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

export function subscribeTransformerSnapshot(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function getLatestTransformerSnapshot(): TransformerSnapshot | null {
  return latest
}

export function clearTransformerSnapshot(): void {
  latest = null
  notify()
}

/** Arm a snapshot of `entityId`'s next simulated frame. Publishes after one full stack pass (or a short timeout). */
export function requestTransformerSnapshot(entityId: string): void {
  if (armed?.timer) clearTimeout(armed.timer)
  const a: Armed = { entityId, stages: [], seenIndices: new Set(), timer: null, startedAt: Date.now(), frameDt: 0 }
  armed = a
  a.timer = setTimeout(() => finish(a, 'timeout'), 700)
}

export function isTransformerSnapshotArmed(entityId: string | null): boolean {
  return armed !== null && armed.entityId === entityId
}

function finish(a: Armed, why: 'complete' | 'timeout'): void {
  if (armed !== a) return
  if (a.timer) clearTimeout(a.timer)
  armed = null
  a.stages.sort((x, y) => x.stackIndex - y.stackIndex)
  latest = {
    entityId: a.entityId,
    physics: a.physics,
    capturedAt: new Date(a.startedAt).toISOString(),
    frameDt: a.frameDt,
    stages: a.stages,
    note:
      a.stages.length === 0
        ? 'No custom transformer ran for this entity — is the simulation paused (press Play) or the entity asleep?'
        : why === 'timeout'
          ? 'Snapshot ended by timeout before the stack repeated.'
          : undefined,
  }
  notify()
}

/** Called by the custom transformer around each run. Returns a recorder, or null when not armed for this entity. */
export function beginStageSnapshot(
  entityId: string | undefined,
  stackIndex: number | undefined,
  priority: number,
  code: string,
  input: unknown,
  dt: number,
  params: unknown,
): ((result: { output?: unknown; state: unknown; watch: Record<string, string>; error?: string; inputAfter: unknown }) => void) | null {
  const a = armed
  if (!a || entityId !== a.entityId) return null
  const idx = typeof stackIndex === 'number' ? stackIndex : -1
  if (a.seenIndices.has(idx)) {
    // the stack started its second pass: one full frame is recorded
    queueMicrotask(() => finish(a, 'complete'))
    return null
  }
  a.seenIndices.add(idx)
  if (a.physics === undefined && physicsProbe && entityId) a.physics = sanitizeForSnapshot(physicsProbe(entityId))
  a.frameDt = dt
  const before = sanitizeForSnapshot(input)
  const beforeJson = JSON.stringify(before)
  const firstComment = code.split('\n').find((l) => l.trim().startsWith('//'))
  const label = firstComment ? firstComment.replace(/^\s*\/\/\s*/, '').slice(0, 120) : `custom p${priority}`
  return (result) => {
    const after = sanitizeForSnapshot(result.inputAfter)
    a.stages.push({
      stackIndex: idx,
      priority,
      label,
      params: sanitizeForSnapshot(params),
      input: before,
      inputAfter: JSON.stringify(after) === beforeJson ? undefined : after,
      output: sanitizeForSnapshot(result.output ?? {}),
      state: sanitizeForSnapshot(result.state),
      watch: result.watch,
      error: result.error,
    })
  }
}
