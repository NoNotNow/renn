/**
 * AV lab: headless test orchestration for "car gets stuck / jitters" bugs in real (large, random) worlds.
 *
 *   runLab({ world, focus, seed, frames })        drive a world deterministically, watch the focus vehicle with the
 *                                                  MotionMonitor heuristic, and on every trigger capture a replayable
 *                                                  Scene (all dynamic body states over the last seconds + the focus
 *                                                  entity's stage `state`s) and a diagnostic dump (watch values,
 *                                                  sleeping, contacts, physics rays).
 *   replayScene(scene, { rewindSec, restoreState }) rebuild the exact constellation and run it again — the reduced,
 *                                                  reproducible case to debug and to turn into a regression test.
 *
 * Determinism: Math.random is seeded and Date.now follows the simulation clock (see determinism.ts); otherwise legacy
 * stages that time with Date.now make every run different. The focus entity is deliberately NOT a trace target (trace
 * targets never sleep in the runtime — tracing would hide sleep bugs).
 *
 * Pipe timing: the transformer profiler (src/runtime/transformerProfilerBridge.ts) is on during lab runs; results carry
 * per-stage mean / p95 / max wall time for the focus entity and the chain totals of all entities.
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { updateWorldFromGlobalLibrary } from '@/globalPipeline/globalOrigin'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { resolveMergedTransformerConfigsForEntitySync } from '@/utils/pipeStageResolve'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import {
  formatTransformerProfile,
  getSlowStageCalls,
  getTransformerProfile,
  resetTransformerProfile,
  setTransformerProfilerFrame,
  type SlowStageCall,
  setTransformerProfilerEnabled,
  summarizeEntityProfile,
} from '@/runtime/transformerProfilerBridge'
import { WorldSimulator, DEFAULT_DT } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'
import { installDeterminism } from './determinism'
import { MotionMonitor, type MotionEvent, type MotionMonitorOptions } from './motionMonitor'

// ---------------------------------------------------------------------------------------------------------------------
// World loading
// ---------------------------------------------------------------------------------------------------------------------

export type WorldRef = { exampleId: string } | { file: string } | { inline: RennWorld }

const repoRoot = path.resolve(__dirname, '../../..')

export function loadLabWorld(ref: WorldRef, opts: { applyLibrary?: boolean } = {}): RennWorld {
  let world: RennWorld
  if ('inline' in ref) world = JSON.parse(JSON.stringify(ref.inline)) as RennWorld
  else {
    const file = 'exampleId' in ref ? path.join(repoRoot, 'public/exampleWorlds', ref.exampleId, 'world.json') : path.resolve(repoRoot, ref.file)
    world = JSON.parse(fs.readFileSync(file, 'utf8')) as RennWorld
  }
  if (opts.applyLibrary !== false) {
    // the tool runs the current library code (Builder does the same on open via useGlobalLibraryUpgrade)
    const lib = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())
    world = updateWorldFromGlobalLibrary(world, lib).world
  }
  return world
}

// ---------------------------------------------------------------------------------------------------------------------
// Body / stage state capture
// ---------------------------------------------------------------------------------------------------------------------

/** [px, py, pz, qx, qy, qz, qw, lvx, lvy, lvz, avx, avy, avz, sleeping(0|1)] */
export type BodyState = number[]

export interface StageState {
  index: number
  label: string
  type: string
  state: unknown
}

export interface SceneSnapshot {
  frame: number
  simMs: number
  /** Seeded Math.random state after this frame. */
  rng?: number
  bodies: Record<string, BodyState>
}

export interface Scene {
  version: 1
  world: WorldRef
  applyLibrary: boolean
  focus: string
  seed: number
  trigger: { kind: string; frame: number; windowStartFrame: number; metrics: MotionEvent['metrics'] }
  /** Oldest first; the last one is the trigger frame. */
  snapshots: SceneSnapshot[]
  /** Stage states of every chain entity at some snapshot frames (oldest first; the last one is the trigger frame). */
  stageStates: { frame: number; entities: Record<string, StageState[]> }[]
  /**
   * Per-frame poses of the other vehicles (chain entities except the focus) over the history window:
   * id → rows [frame, px, py, pz, qx, qy, qz, qw]. Replay "puppets" them along these tracks, because legacy stage code
   * keeps hidden closure state (top-level `var`s) that no snapshot can capture.
   */
  tracks?: Record<string, number[][]>
  diagnostics?: unknown
}

function captureBodies(sim: WorldSimulator, ids: string[]): Record<string, BodyState> {
  const pw = sim.getPhysicsWorld()
  const out: Record<string, BodyState> = {}
  for (const id of ids) {
    const b = pw.getBody(id)
    if (!b) continue
    const t = b.translation()
    const r = b.rotation()
    const lv = b.linvel()
    const av = b.angvel()
    out[id] = [t.x, t.y, t.z, r.x, r.y, r.z, r.w, lv.x, lv.y, lv.z, av.x, av.y, av.z, b.isSleeping() ? 1 : 0].map((v) => Math.round(v * 1e6) / 1e6)
  }
  return out
}

export function applyBodies(sim: WorldSimulator, bodies: Record<string, BodyState>): void {
  const pw = sim.getPhysicsWorld()
  for (const [id, s] of Object.entries(bodies)) {
    const b = pw.getBody(id)
    if (!b || !b.isDynamic()) continue
    b.setTranslation({ x: s[0]!, y: s[1]!, z: s[2]! }, true)
    b.setRotation({ x: s[3]!, y: s[4]!, z: s[5]!, w: s[6]! }, true)
    b.setLinvel({ x: s[7]!, y: s[8]!, z: s[9]! }, true)
    b.setAngvel({ x: s[10]!, y: s[11]!, z: s[12]! }, true)
    if (s[13]) b.sleep()
  }
  // contacts (and the touching cache that sets environment.isTouchingObject) only exist after a step: settle with a
  // negligible dt so the first replayed frame sees the same contacts as the original (car2 needs ground contact)
  pw.step(1e-6)
  for (const [id, s] of Object.entries(bodies)) {
    const b = pw.getBody(id)
    if (!b || !b.isDynamic()) continue
    b.setTranslation({ x: s[0]!, y: s[1]!, z: s[2]! }, false)
    b.setLinvel({ x: s[7]!, y: s[8]!, z: s[9]! }, false)
    pw.syncBodyToCache(id)
  }
}

type ChainStage = Record<string, unknown> & { type: string; configStackIndex?: number }

function chainStages(sim: WorldSimulator, entityId: string): ChainStage[] {
  const chain = sim.getRegistry().get(entityId)?.transformerChain
  return chain ? (chain.getAll() as unknown as ChainStage[]) : []
}

export function stageLabels(world: RennWorld, entityId: string): string[] {
  const configs = resolveMergedTransformerConfigsForEntitySync(world, entityId) ?? []
  return configs.map((c, i) => {
    const cc = c as { name?: string; id?: string; type: string }
    return cc.name || cc.id || `${cc.type}#${i}`
  })
}

/**
 * Every plain-data own field of a stage instance (custom stages: `state`, presets: wanderer target, car2 wheel angle, …).
 * Functions and values structuredClone cannot copy are skipped.
 */
function cloneFields(t: ChainStage): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(t)) {
    const v = t[k]
    if (typeof v === 'function') continue
    try {
      out[k] = structuredClone(v)
    } catch {
      /* not data (compiled fn holders, WASM handles, …) */
    }
  }
  return out
}

export function captureStageStates(sim: WorldSimulator, world: RennWorld, entityId: string): StageState[] {
  const labels = stageLabels(world, entityId)
  return chainStages(sim, entityId).map((t, i) => {
    const index = t.configStackIndex ?? i
    return { index, label: labels[index] ?? t.type, type: t.type, state: cloneFields(t) }
  })
}

export function restoreStageStates(sim: WorldSimulator, entityId: string, stages: StageState[]): number {
  let n = 0
  const byIndex = new Map(chainStages(sim, entityId).map((t, i) => [t.configStackIndex ?? i, t]))
  for (const s of stages) {
    const t = byIndex.get(s.index)
    if (!t || t.type !== s.type) continue
    const fields = structuredClone(s.state) as Record<string, unknown>
    for (const [k, v] of Object.entries(fields)) {
      const cur = t[k]
      // keep object identity for `state` (the compiled stage closes over nothing, but other code may hold the ref)
      if (cur && v && typeof cur === 'object' && typeof v === 'object' && !Array.isArray(cur) && k === 'state') {
        for (const kk of Object.keys(cur)) delete (cur as Record<string, unknown>)[kk]
        Object.assign(cur, v)
      } else {
        try {
          t[k] = v
        } catch {
          /* readonly accessor */
        }
      }
    }
    n++
  }
  return n
}

/** Live `state` object of the focus stage whose label contains `labelPart` (for per-frame probes; do not mutate). */
export function liveStageState(sim: WorldSimulator, world: RennWorld, entityId: string, labelPart: string): Record<string, unknown> | undefined {
  const labels = stageLabels(world, entityId)
  for (const [i, t] of chainStages(sim, entityId).entries()) {
    const idx = t.configStackIndex ?? i
    if ((labels[idx] ?? '').toLowerCase().includes(labelPart.toLowerCase())) return t.state as Record<string, unknown> | undefined
  }
  return undefined
}

/** Stage states of every entity that runs a chain. */
export function captureAllStageStates(sim: WorldSimulator, world: RennWorld): Record<string, StageState[]> {
  const out: Record<string, StageState[]> = {}
  for (const id of sim.getChainEntityIds()) out[id] = captureStageStates(sim, world, id)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------------------------------------------------

export function watchValues(entityId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const e of getTransformerWatchEntries().values()) if (e.entityId === entityId) out[e.label] = e.value
  return out
}

function yawOf(q: { x: number; y: number; z: number; w: number }): number {
  // forward = −Z rotated by q, projected onto the floor
  const fx = -(2 * (q.x * q.z + q.w * q.y))
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
  return Math.atan2(fx, fz)
}

function forwardSpeed(q: { x: number; y: number; z: number; w: number }, v: [number, number, number]): number {
  const fx = -(2 * (q.x * q.z + q.w * q.y))
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
  const l = Math.hypot(fx, fz) || 1
  return (v[0] * fx + v[2] * fz) / l
}

/** Rays against the real physics around the focus (8 directions, hull height), with what they hit. */
function physicsRays(sim: WorldSimulator, world: RennWorld, focus: string): string[] {
  const p = sim.getPosition(focus)
  const yaw = yawOf(sim.getRotation(focus))
  const names = new Map(world.entities.map((e) => [e.id, e.name ?? e.id]))
  const out: string[] = []
  for (let k = 0; k < 8; k++) {
    const a = yaw + (k * Math.PI) / 4
    const dir: [number, number, number] = [-Math.sin(a), 0, -Math.cos(a)]
    const hit = sim.getPhysicsWorld().raycast(p[0], p[1], p[2], dir[0], dir[1], dir[2], 60, focus) as unknown as
      | { hit?: boolean; distance?: number; entityId?: string }
      | null
    const label = ['fwd', 'fwd-left', 'left', 'back-left', 'back', 'back-right', 'right', 'fwd-right'][k]
    out.push(hit && hit.hit !== false && hit.distance != null ? `${label} ${hit.distance.toFixed(2)} m ${names.get(hit.entityId ?? '') ?? hit.entityId ?? ''}` : `${label} free`)
  }
  return out
}

export function diagnose(sim: WorldSimulator, world: RennWorld, focus: string, opts: { nearRadius?: number } = {}) {
  const p = sim.getPosition(focus)
  const pw = sim.getPhysicsWorld()
  const names = new Map(world.entities.map((e) => [e.id, e.name ?? e.id]))
  const r = opts.nearRadius ?? 15
  const near: { id: string; name: string; d: number; speed: number; sleeping: boolean }[] = []
  for (const e of world.entities) {
    if (e.id === focus || e.bodyType !== 'dynamic') continue
    const q = sim.getPosition(e.id)
    const d = Math.hypot(q[0] - p[0], q[2] - p[2])
    if (d > r) continue
    const v = sim.getVelocity(e.id)
    near.push({ id: e.id, name: names.get(e.id) ?? e.id, d: Math.round(d * 100) / 100, speed: Math.round(Math.hypot(v[0], v[2]) * 100) / 100, sleeping: sim.isSleeping(e.id) })
  }
  near.sort((a, b) => a.d - b.d)
  return {
    pos: p.map((v) => Math.round(v * 100) / 100),
    yawDeg: Math.round((yawOf(sim.getRotation(focus)) * 180) / Math.PI),
    velocity: sim.getVelocity(focus).map((v) => Math.round(v * 100) / 100),
    sleeping: sim.isSleeping(focus),
    contacts: pw.getContactSummary(focus).map((c) => ({ ...c, name: names.get(c.entityId) ?? c.entityId })),
    rays: physicsRays(sim, world, focus),
    watch: watchValues(focus),
    near: near.slice(0, 12),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------------------------------

export interface LabOptions {
  world: WorldRef
  focus: string
  seed?: number
  frames?: number
  applyLibrary?: boolean
  monitor?: MotionMonitorOptions
  /** Which event kinds produce a scene (default all). */
  captureKinds?: MotionEvent['kind'][]
  /** Keep capturing after the first scene (default: stop capturing after `maxScenes`). */
  maxScenes?: number
  /** Body snapshot cadence and how far back scenes reach. */
  snapshotEvery?: number
  historySec?: number
  /** Stop the run once this many scenes were captured (default: run all frames). */
  stopAfterScenes?: number
  /** Also capture a scene at these frames (trigger kind 'frame'). */
  captureAt?: number[]
  /** Capture a scene when a stage call of any entity exceeds this many ms (trigger kind 'slow'; 0 = off, default 0). */
  slowTriggerMs?: number
  /** Directory to write `<name>.scene.json` into (default: none). */
  outDir?: string
  name?: string
  /** Optional per-frame hook (after the physics step). */
  onFrame?: (ctx: { frame: number; sim: WorldSimulator }) => void
  /** Hook before a frame runs (replay puppets set velocities here). */
  beforeFrame?: (ctx: { frame: number; sim: WorldSimulator }) => void
  /** Prepared simulator (replay); the runner then does not create/dispose it. */
  sim?: WorldSimulator
  preparedWorld?: RennWorld
  startFrame?: number
  profile?: boolean
  /** Continue a captured random stream instead of starting at `seed`. */
  rngState?: number
}

export interface LabResult {
  seed: number
  frames: number
  events: MotionEvent[]
  classFrames: Record<string, number>
  scenes: Scene[]
  sceneFiles: string[]
  final: ReturnType<typeof diagnose>
  /** Per-stage timing table of the focus entity (ms). */
  profile: ReturnType<typeof summarizeEntityProfile>
  /** Chain mean ms of every entity with a chain. */
  chainMeans: Record<string, number>
  wallMs: number
  /** Simulated seconds per wall second. */
  realtimeFactor: number
  pathLength: number
  /** Mean |Δ forward speed| per frame (m/s) — a smooth drive stays well below 0.3; a bang-bang limit cycle is metres. */
  speedRoughness: number
  /** Frames with |Δ forward speed| > 2 m/s (velocity spikes / sign flips). */
  speedSpikes: number
  /** Stage calls slower than 50 ms (entity, stage, frame) — spike triggers to replay. */
  slowCalls: (SlowStageCall & { label: string })[]
}

export async function runLab(o: LabOptions): Promise<LabResult> {
  const seed = o.seed ?? 1
  const frames = o.frames ?? 3600
  const applyLibrary = o.applyLibrary !== false
  const world = o.preparedWorld ?? loadLabWorld(o.world, { applyLibrary })
  const det = installDeterminism(seed, (o.startFrame ?? 0) * DEFAULT_DT * 1000)
  if (o.rngState != null) det.setRngState(o.rngState)
  const prevWarn = console.warn
  console.warn = () => {}
  setAgentObservationWatchActive(true)
  const profile = o.profile !== false
  if (profile) {
    resetTransformerProfile()
    setTransformerProfilerEnabled(true)
  }
  const ownSim = !o.sim
  const sim = o.sim ?? (await WorldSimulator.create(world, 0))
  const dynIds = world.entities.filter((e) => e.bodyType === 'dynamic').map((e) => e.id)
  const snapshotEvery = o.snapshotEvery ?? 30
  const historyLen = Math.ceil(((o.historySec ?? 8) / DEFAULT_DT) / snapshotEvery) + 1
  const history: SceneSnapshot[] = []
  const trackIds = sim.getChainEntityIds().filter((id) => id !== o.focus)
  const trackLen = historyLen * snapshotEvery
  const tracks: Record<string, number[][]> = Object.fromEntries(trackIds.map((id) => [id, []]))
  const stateHistory: Scene['stageStates'] = []
  const monitor = new MotionMonitor(o.monitor)
  const scenes: Scene[] = []
  const sceneFiles: string[] = []
  const maxScenes = o.maxScenes ?? 3
  const kinds = o.captureKinds
  const f0 = o.startFrame ?? 0
  let pathLength = 0
  let roughSum = 0
  let spikes = 0
  let prevSpeed: number | null = null
  let prev = sim.getPosition(o.focus)
  let pending: (Omit<MotionEvent, 'kind'> & { kind: string }) | null = null
  let slowSeen = 0
  const captureAt = new Set(o.captureAt ?? [])
  monitor.onTrigger = (ev) => {
    if (scenes.length >= maxScenes) return
    if (kinds && !kinds.includes(ev.kind)) return
    pending = ev
  }
  const t0 = performance.now()
  let f = f0
  try {
    for (; f < f0 + frames; f++) {
      o.beforeFrame?.({ frame: f, sim })
      setTransformerProfilerFrame(f)
      sim.runFrames(1)
      det.advance(DEFAULT_DT)
      for (const id of trackIds) {
        const tp = sim.getPosition(id)
        const tq = sim.getRotation(id)
        const rows = tracks[id]!
        rows.push([f, tp[0], tp[1], tp[2], tq.x, tq.y, tq.z, tq.w])
        if (rows.length > trackLen) rows.shift()
      }
      const p = sim.getPosition(o.focus)
      pathLength += Math.hypot(p[0] - prev[0], p[2] - prev[2])
      prev = p
      const q = sim.getRotation(o.focus)
      const fwdSpeed = forwardSpeed(q, sim.getVelocity(o.focus))
      if (prevSpeed !== null) {
        const dv = Math.abs(fwdSpeed - prevSpeed)
        roughSum += dv
        if (dv > 2) spikes++
      }
      prevSpeed = fwdSpeed
      monitor.push({ frame: f, x: p[0], z: p[2], yaw: yawOf(q), speed: fwdSpeed, sleeping: sim.isSleeping(o.focus) })
      if (f % snapshotEvery === 0) {
        history.push({ frame: f, simMs: det.simMs(), rng: det.rngState(), bodies: captureBodies(sim, dynIds) })
        if (history.length > historyLen) history.shift()
        if (f % (snapshotEvery * 2) === 0) {
          stateHistory.push({ frame: f, entities: captureAllStageStates(sim, world) })
          if (stateHistory.length > Math.ceil(historyLen / 2) + 1) stateHistory.shift()
        }
      }
      o.onFrame?.({ frame: f, sim })
      const sc = getSlowStageCalls()
      if (o.slowTriggerMs && sc.length > slowSeen) {
        const worst = sc.slice(slowSeen).reduce((a, b) => (b.ms > a.ms ? b : a))
        slowSeen = sc.length
        if (worst.ms >= o.slowTriggerMs && scenes.length < maxScenes) {
          pending = { kind: 'slow', startFrame: f, windowStartFrame: f, endFrame: f, metrics: { ...monitor.metrics(), slowMs: worst.ms } as MotionEvent['metrics'], at: { x: p[0], z: p[2], yaw: yawOf(q) } }
        }
      }
      if (captureAt.has(f)) pending = { kind: 'frame', startFrame: f, windowStartFrame: f, endFrame: f, metrics: monitor.metrics(), at: { x: p[0], z: p[2], yaw: yawOf(q) } }
      if (pending) {
        const ev = pending
        pending = null
        const snap = { frame: f, simMs: det.simMs(), rng: det.rngState(), bodies: captureBodies(sim, dynIds) }
        const scene: Scene = {
          version: 1,
          world: o.world,
          applyLibrary,
          focus: o.focus,
          seed,
          trigger: { kind: ev.kind, frame: f, windowStartFrame: ev.windowStartFrame, metrics: ev.metrics },
          snapshots: [...history, snap],
          tracks: Object.fromEntries(Object.entries(tracks).map(([id, rows]) => [id, rows.map((r) => r.map((v) => Math.round(v * 1e5) / 1e5))])),
          stageStates: [...stateHistory, { frame: f, entities: captureAllStageStates(sim, world) }],
          diagnostics: diagnose(sim, world, o.focus),
        }
        scenes.push(scene)
        if (o.outDir) {
          fs.mkdirSync(o.outDir, { recursive: true })
          const file = path.join(o.outDir, `${o.name ?? 'lab'}-s${seed}-${ev.kind}-f${f}.scene.json`)
          fs.writeFileSync(file, JSON.stringify(scene))
          sceneFiles.push(file)
        }
        if (o.stopAfterScenes && scenes.length >= o.stopAfterScenes) {
          f++
          break
        }
      }
    }
    monitor.finish(f)
    const wallMs = performance.now() - t0
    const labels = stageLabels(world, o.focus)
    const chainMeans: Record<string, number> = {}
    for (const [id, p] of getTransformerProfile()) chainMeans[id] = Math.round((p.totalMs / Math.max(1, p.frames)) * 1000) / 1000
    return {
      seed,
      frames: f - f0,
      events: monitor.events,
      classFrames: monitor.classFrames,
      scenes,
      sceneFiles,
      final: diagnose(sim, world, o.focus),
      profile: profile ? summarizeEntityProfile(o.focus, (i, t) => labels[i] ?? t) : null,
      chainMeans,
      wallMs,
      realtimeFactor: ((f - f0) * DEFAULT_DT * 1000) / Math.max(1, wallMs),
      pathLength,
      speedRoughness: roughSum / Math.max(1, f - f0 - 1),
      speedSpikes: spikes,
      slowCalls: getSlowStageCalls().map((c) => ({ ...c, label: stageLabels(world, c.entityId)[c.configStackIndex] ?? c.type })),
    }
  } finally {
    if (ownSim) sim.dispose()
    det.restore()
    console.warn = prevWarn
    setAgentObservationWatchActive(false)
    if (profile) setTransformerProfilerEnabled(false)
  }
}

export function formatProfile(world: RennWorld): string {
  return formatTransformerProfile((id, i, t) => stageLabels(world, id)[i] ?? t)
}

// ---------------------------------------------------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------------------------------------------------

export interface ReplayOptions {
  /** Start this many seconds before the trigger (picks the nearest stored snapshot); 0 = the trigger frame. */
  rewindSec?: number
  /** Restore the focus entity's stage states (memory, plans) from the scene; false = fresh stack. */
  restoreState?: boolean
  frames?: number
  seed?: number
  monitor?: MotionMonitorOptions
  outDir?: string
  name?: string
  /** Edit the world before the replay (ablation: change params, remove bodies, …). */
  editWorld?: (w: RennWorld) => void
  /** Bodies to drop from the snapshot (keep their document pose). */
  onFrame?: LabOptions['onFrame']
  stopAfterScenes?: number
  profile?: boolean
  /** Drive the other vehicles along their recorded tracks (default true; false = run their own chains). */
  puppets?: boolean
}

export function readScene(file: string): Scene {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Scene
}

export interface ReplayFidelity {
  frame: number
  /** Focus position error vs the original run (m). */
  focus: number
  /** Largest position error over all dynamic bodies (m) and which one. */
  maxBody: number
  maxBodyId: string
}

export async function replayScene(
  scene: Scene,
  o: ReplayOptions = {},
): Promise<LabResult & { startFrame: number; restoredStages: number; fidelity: ReplayFidelity[] }> {
  const world = loadLabWorld(scene.world, { applyLibrary: scene.applyLibrary })
  o.editWorld?.(world)
  const puppetTracks = o.puppets === false ? {} : (scene.tracks ?? {})
  for (const e of world.entities) {
    if (!puppetTracks[e.id]) continue
    // a puppet has no behaviour of its own: it is moved along the recording
    e.transformers = []
    e.transformerPipeStack = []
  }
  const targetFrame = scene.trigger.frame - Math.round((o.rewindSec ?? 0) / DEFAULT_DT)
  // with restored stage state, only snapshot frames that also have stage states are consistent starting points
  const stateFrames = new Set(scene.stageStates.map((s) => s.frame))
  let snap = scene.snapshots[0]!
  for (const s of scene.snapshots) if (s.frame <= targetFrame && (!o.restoreState || stateFrames.has(s.frame))) snap = s
  // place every dynamic body at its captured pose in the document too, so chains initialise from that pose
  for (const e of world.entities) {
    const b = snap.bodies[e.id]
    if (!b) continue
    e.position = [b[0]!, b[1]!, b[2]!]
  }
  const sim = await WorldSimulator.create(world, 0)
  applyBodies(sim, snap.bodies)
  let restored = 0
  if (o.restoreState) {
    const st = scene.stageStates.find((s) => s.frame === snap.frame)
    if (st) for (const [id, stages] of Object.entries(st.entities)) restored += restoreStageStates(sim, id, stages)
  }
  // fidelity: compare against the original run at every later stored snapshot frame
  const original = new Map(scene.snapshots.filter((s) => s.frame > snap.frame).map((s) => [s.frame, s.bodies]))
  const fidelity: ReplayFidelity[] = []
  const puppetRows = new Map(Object.entries(puppetTracks).map(([id, rows]) => [id, new Map(rows.map((r) => [r[0]!, r]))]))
  const beforeFrame: LabOptions['beforeFrame'] = ({ frame, sim: s }) => {
    const pw = s.getPhysicsWorld()
    for (const [id, rows] of puppetRows) {
      const r = rows.get(frame)
      const b = pw.getBody(id)
      if (!r || !b) continue
      const t = b.translation()
      // velocity that lands the body on the recorded pose after this frame (gravity is cancelled by the ground contact)
      b.setLinvel({ x: (r[1]! - t.x) / DEFAULT_DT, y: (r[2]! - t.y) / DEFAULT_DT, z: (r[3]! - t.z) / DEFAULT_DT }, true)
      b.setRotation({ x: r[4]!, y: r[5]!, z: r[6]!, w: r[7]! }, true)
      b.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }
  const onFrame: LabOptions['onFrame'] = (ctx) => {
    o.onFrame?.(ctx)
    const ref = original.get(ctx.frame)
    if (!ref) return
    let maxBody = 0
    let maxBodyId = ''
    let focusErr = 0
    for (const [id, b] of Object.entries(ref)) {
      const p = ctx.sim.getPosition(id)
      const d = Math.hypot(p[0] - b[0]!, p[1] - b[1]!, p[2] - b[2]!)
      if (id === scene.focus) focusErr = d
      if (d > maxBody) {
        maxBody = d
        maxBodyId = id
      }
    }
    fidelity.push({ frame: ctx.frame, focus: focusErr, maxBody, maxBodyId })
  }
  try {
    const res = await runLab({
      world: scene.world,
      applyLibrary: scene.applyLibrary,
      preparedWorld: world,
      sim,
      focus: scene.focus,
      seed: o.seed ?? scene.seed,
      frames: o.frames ?? scene.trigger.frame - snap.frame + 600,
      // the snapshot was taken after frame `snap.frame` ran
      startFrame: snap.frame + 1,
      rngState: o.seed == null ? snap.rng : undefined,
      monitor: o.monitor,
      outDir: o.outDir,
      name: o.name ?? 'replay',
      onFrame,
      beforeFrame,
      stopAfterScenes: o.stopAfterScenes,
      profile: o.profile,
    })
    return { ...res, startFrame: snap.frame + 1, restoredStages: restored, fidelity }
  } finally {
    sim.dispose()
  }
}
