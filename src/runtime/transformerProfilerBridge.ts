/**
 * Transformer profiler: wall-clock cost of every stage (and every entity's whole chain) per frame.
 *
 * Off by default — `TransformerChain.execute` and `RenderItemRegistry.executeTransformers` only read the clock while
 * enabled. Accumulates per entity × `configStackIndex` (index into the flat runtime chain): calls, total, max and a
 * small ring of recent samples for percentiles. Same module-singleton pattern as the trace / watch bridges.
 *
 * Headless: `setTransformerProfilerEnabled(true)` → run frames → `getTransformerProfile()`.
 * Browser console: `window.__rennProfiler.enable()` / `.report()` / `.reset()`.
 */

const RING = 256

export interface StageProfile {
  calls: number
  totalMs: number
  maxMs: number
  /** Most recent samples (ring buffer, ms). */
  recent: number[]
  type: string
}

export interface EntityProfile {
  frames: number
  totalMs: number
  maxMs: number
  recent: number[]
  stages: Map<number, StageProfile>
}

let enabled = false
const profiles = new Map<string, EntityProfile>()

/** A single stage call slower than `slowThresholdMs` (spike trigger). */
export interface SlowStageCall {
  entityId: string
  configStackIndex: number
  type: string
  ms: number
  /** Frame tag set by the caller (`setTransformerProfilerFrame`), -1 if unknown. */
  frame: number
}
let slowThresholdMs = 50
let currentFrame = -1
const slowCalls: SlowStageCall[] = []
const MAX_SLOW = 200

export function setTransformerProfilerSlowThreshold(ms: number): void {
  slowThresholdMs = ms
}

/** Tag subsequent samples with a frame number (lab / frame loop), so spikes can be located and replayed. */
export function setTransformerProfilerFrame(frame: number): void {
  currentFrame = frame
}

export function getSlowStageCalls(): readonly SlowStageCall[] {
  return slowCalls
}
const now: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now.bind(performance)
    : () => Date.now()

export function isTransformerProfilerEnabled(): boolean {
  return enabled
}

export function setTransformerProfilerEnabled(on: boolean): void {
  enabled = on
}

export function resetTransformerProfile(): void {
  smoothedChainMs.clear()
  profiles.clear()
  slowCalls.length = 0
}

/** Real wall clock (bound before any test can patch `performance.now`). */
export function profilerNow(): number {
  return now()
}

function entityProfile(entityId: string): EntityProfile {
  let p = profiles.get(entityId)
  if (!p) {
    p = { frames: 0, totalMs: 0, maxMs: 0, recent: [], stages: new Map() }
    profiles.set(entityId, p)
  }
  return p
}

function pushRing(ring: number[], n: number, ms: number): void {
  if (ring.length < RING) ring.push(ms)
  else ring[n % RING] = ms
}

export function recordStageTiming(entityId: string, configStackIndex: number, type: string, ms: number): void {
  const p = entityProfile(entityId)
  let s = p.stages.get(configStackIndex)
  if (!s) {
    s = { calls: 0, totalMs: 0, maxMs: 0, recent: [], type }
    p.stages.set(configStackIndex, s)
  }
  pushRing(s.recent, s.calls, ms)
  if (ms > slowThresholdMs && slowCalls.length < MAX_SLOW) slowCalls.push({ entityId, configStackIndex, type, ms, frame: currentFrame })
  s.calls++
  s.totalMs += ms
  if (ms > s.maxMs) s.maxMs = ms
}

/** Always-on smoothed chain cost per entity (exponential average, ~1 s at 60 fps), read by `TransformerChain` into `input.chainMs`. */
const smoothedChainMs = new Map<string, number>()
const CHAIN_MS_ALPHA = 1 / 60

export function noteChainMs(entityId: string, ms: number): number {
  const prev = smoothedChainMs.get(entityId)
  const next = prev === undefined ? ms : prev + (ms - prev) * CHAIN_MS_ALPHA
  smoothedChainMs.set(entityId, next)
  return next
}

export function getSmoothedChainMs(entityId: string): number {
  return smoothedChainMs.get(entityId) ?? 0
}

export function recordChainTiming(entityId: string, ms: number): void {
  const p = entityProfile(entityId)
  pushRing(p.recent, p.frames, ms)
  p.frames++
  p.totalMs += ms
  if (ms > p.maxMs) p.maxMs = ms
}

export function getTransformerProfile(): ReadonlyMap<string, EntityProfile> {
  return profiles
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}

export interface StageProfileRow {
  index: number
  type: string
  label: string
  calls: number
  meanMs: number
  p95Ms: number
  maxMs: number
  share: number
}

/**
 * Table for one entity, sorted by total time. `labelFor(index)` resolves a readable stage name
 * (e.g. from `entity.transformers[index]` / the world registry); default is the stage type.
 */
export function summarizeEntityProfile(entityId: string, labelFor?: (index: number, type: string) => string): {
  frames: number
  meanMs: number
  p95Ms: number
  maxMs: number
  stages: StageProfileRow[]
} | null {
  const p = profiles.get(entityId)
  if (!p) return null
  const stageTotal = [...p.stages.values()].reduce((a, s) => a + s.totalMs, 0) || 1
  const stages = [...p.stages.entries()]
    .map(([index, s]) => ({
      index,
      type: s.type,
      label: labelFor ? labelFor(index, s.type) : s.type,
      calls: s.calls,
      meanMs: s.totalMs / Math.max(1, s.calls),
      p95Ms: percentile(s.recent, 0.95),
      maxMs: s.maxMs,
      share: s.totalMs / stageTotal,
    }))
    .sort((a, b) => b.meanMs * b.calls - a.meanMs * a.calls)
  return {
    frames: p.frames,
    meanMs: p.totalMs / Math.max(1, p.frames),
    p95Ms: percentile(p.recent, 0.95),
    maxMs: p.maxMs,
    stages,
  }
}

/** Human-readable multi-line report (all entities, slowest first). */
export function formatTransformerProfile(labelFor?: (entityId: string, index: number, type: string) => string): string {
  const lines: string[] = []
  const ids = [...profiles.keys()].sort((a, b) => profiles.get(b)!.totalMs - profiles.get(a)!.totalMs)
  for (const id of ids) {
    const s = summarizeEntityProfile(id, labelFor ? (i, t) => labelFor(id, i, t) : undefined)
    if (!s) continue
    lines.push(`${id}: ${s.frames} frames, chain mean ${s.meanMs.toFixed(3)} ms, p95 ${s.p95Ms.toFixed(3)}, max ${s.maxMs.toFixed(2)}`)
    for (const r of s.stages) {
      lines.push(
        `  [${String(r.index).padStart(2)}] ${r.label.padEnd(34)} mean ${r.meanMs.toFixed(3)}  p95 ${r.p95Ms.toFixed(3)}  max ${r.maxMs.toFixed(2)}  ${(r.share * 100).toFixed(1)}%`,
      )
    }
  }
  return lines.join('\n')
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __rennProfiler?: unknown }).__rennProfiler = {
    enable: () => setTransformerProfilerEnabled(true),
    disable: () => setTransformerProfilerEnabled(false),
    reset: resetTransformerProfile,
    report: () => formatTransformerProfile(),
    data: getTransformerProfile,
  }
}
