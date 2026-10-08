/* eslint-disable @typescript-eslint/no-explicit-any -- raw world JSON surgery */
/**
 * One labyrinth episode on the REAL hunt world (full world.json + shipped library, all entities), fresh world per call,
 * defined start poses, seeded RNG + simulated clock. Calls must not interleave in one thread.
 * kinds: solo (no chasers/threats, goal beyond the gate), flee (3 chasers 70 m outside, real flee/wanderer logic),
 *        flee-real (3 chasers at their world.json poses), cim (chaser inside the maze, AV parked outside at the goal).
 */
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import { installDeterminism } from '@/test/avLab/determinism'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { forwardSpeed, polyGap, rectPoly, upY, yawOf } from '@/avEvolution/eval/geometry'
import { ReversalCounter } from '@/avEvolution/eval/reversals'
import type { RennWorld } from '@/types/world'
import { insideBBox, OUT_MARGIN, type BBox, type V2 } from './geometry'

export const AV_ID = 'entity_1779823253285_brtkx1p'
export const CAR_START_Y = 0.494
export const GOAL_REACH = 10
export const DAMAGE_DIST = 8 // av-ego damageDist / damageClear defaults (hit per approach episode)
export const DAMAGE_CLEAR = 14
const CAR_SIZE: V2 = [4, 8]

export type Kind = 'solo' | 'flee' | 'flee-real' | 'cim'
export interface EpSpec {
  id: string
  kind: Kind
  maze: string
  bbox: BBox
  start: { x: number; z: number; yawDeg: number }
  goal: V2
  /** flee / cim: placements for the kept chasers (in world order); flee-real: unused */
  chasers: { x: number; z: number; yawDeg: number }[]
}
export type ApplyTo = 'av' | 'chasers' | 'both'
export interface EpOpts { params: Record<string, unknown>; applyTo: ApplyTo; seconds: number; fullRun?: boolean }

export interface EpResult {
  id: string; kind: Kind; maze: string; reached: boolean
  /** goal reach (solo) | catch (cim) | outside bbox+margin (flee) */
  exitT: number; outT: number | null; catchT: number | null
  contactEvents: number; contactFrames: number; reversals: number; reverseS: number
  hits: number; firstHitT: number | null; minChaserDist: number
  flipped: boolean; simS: number; wallMs: number; endDist: number
}

const isChaser = (e: any, w: RennWorld) =>
  e.transformerPipeStack?.[0]?.pipeId === 'global_av_autopilot' &&
  !(e.transformerPipeStack[0].params?.threatIds?.length) &&
  (e.transformers ?? []).some((t: string) => (w.transformers as any)?.[t]?.type === 'follow')

export function chaserIds(w: RennWorld): string[] {
  return (w.entities as any[]).filter((e) => isChaser(e, w)).map((e) => e.id)
}

const rad = (d: number) => (d * Math.PI) / 180

function mergeParams(binding: any, set: Record<string, unknown>) {
  binding.params = { ...binding.params, ...set }
  // same rule as the arena builder: without the saver flag the tickEvery scopes are not applied
  if (binding.params.saver !== true) delete binding.scopeParams
}

export function buildEpisodeWorld(src: RennWorld, spec: EpSpec, o: EpOpts): { world: RennWorld; subject: string; chasers: string[] } {
  const w = JSON.parse(JSON.stringify(src)) as RennWorld
  const ents = w.entities as any[]
  const all = chaserIds(w)
  const keep = spec.kind === 'solo' ? [] : spec.kind === 'cim' ? all.slice(0, 1) : all.slice(0, 3)
  const drop = new Set(all.filter((id) => !keep.includes(id)))
  w.entities = ents.filter((e) => !drop.has(e.id)) as any
  const av = (w.entities as any[]).find((e) => e.id === AV_ID)
  const pose = (e: any, p: { x: number; z: number; yawDeg: number }) => {
    e.position = [p.x, CAR_START_Y, p.z]
    e.rotation = [0, rad(p.yawDeg), 0]
  }
  const applyAv = o.applyTo !== 'chasers'
  const applyCh = o.applyTo !== 'av'
  // chasers: placed (flee/cim) or left at their world poses (flee-real); the kept ones follow the AV
  keep.forEach((id, i) => {
    const e = (w.entities as any[]).find((x) => x.id === id)
    if (spec.kind === 'flee') pose(e, spec.chasers[i]!)
    if (applyCh) mergeParams(e.transformerPipeStack[0], o.params)
  })
  if (spec.kind === 'cim') {
    // AV = parked target outside at the goal (kinematic, no driver)
    pose(av, { x: spec.goal[0], z: spec.goal[1], yawDeg: 0 })
    av.bodyType = 'kinematic'
    delete av.transformerPipeStack
    delete av.transformers
    const ch = (w.entities as any[]).find((x) => x.id === keep[0])
    pose(ch, spec.start)
    return { world: w, subject: keep[0]!, chasers: keep }
  }
  pose(av, spec.start)
  const binding = av.transformerPipeStack[0]
  if (applyAv) mergeParams(binding, o.params)
  const present = new Set((w.entities as any[]).map((e) => e.id))
  binding.params.threatIds = spec.kind === 'solo' ? [] : (binding.params.threatIds as string[]).filter((id) => present.has(id))
  if (spec.kind === 'solo') {
    const wander = (w.transformers as any)[`${AV_ID}_tf10`]
    if (!wander || wander.type !== 'wanderer') throw new Error('wanderer stage of the AV car not found')
    wander.params = { ...wander.params, perimeter: { center: [spec.goal[0], 0, spec.goal[1]], halfExtents: [0, 0, 0] } }
  }
  return { world: w, subject: AV_ID, chasers: keep }
}

export async function runEpisode(src: RennWorld, spec: EpSpec, o: EpOpts): Promise<EpResult> {
  const { world, subject, chasers } = buildEpisodeWorld(src, spec, o)
  const walls = (world.entities as any[])
    .filter((e) => e.bodyType === 'static' && e.shape?.type === 'box')
    .map((e) => {
      const yaw = e.rotation[1] ?? 0
      return { cx: e.position[0], cz: e.position[2], r: Math.hypot(e.shape.width, e.shape.depth) / 2, poly: rectPoly(e.position[0], e.position[2], yaw, e.shape.width, e.shape.depth) }
    })
  const hullR = Math.hypot(CAR_SIZE[0], CAR_SIZE[1]) / 2
  const frames = Math.round(o.seconds / DEFAULT_DT)
  const t0 = performance.now()
  const det = installDeterminism(1, 0)
  const prevWarn = console.warn
  console.warn = () => {}
  setAgentObservationWatchActive(true)
  let sim: WorldSimulator | null = null
  try {
    sim = await WorldSimulator.create(world, 0)
    const rev = new ReversalCounter()
    let events = 0, contactFrames = 0, inContact = false, minGap = Infinity
    let outT: number | null = null, catchT: number | null = null, reachT: number | null = null
    let hits = 0, firstHit: number | null = null, minCh = Infinity, flipped = false, endDist = 0, simS = 0
    const armed = new Map<string, boolean>(chasers.map((c) => [c, true]))
    for (let f = 0; f < frames; f++) {
      sim.runFrames(1)
      det.advance(DEFAULT_DT)
      const t = (f + 1) * DEFAULT_DT
      simS = t
      const cp = sim.getPosition(subject)
      const q = sim.getRotation(subject)
      const v = sim.getVelocity(subject)
      const hull = rectPoly(cp[0], cp[2], yawOf(q), CAR_SIZE[0], CAR_SIZE[1])
      let touch = false
      for (const w of walls) {
        const lb = Math.hypot(w.cx - cp[0], w.cz - cp[2]) - w.r - hullR
        if (lb >= 0.1 && lb >= minGap) continue
        const g = polyGap(hull, w.poly)
        if (g < minGap) minGap = g
        if (g < 0.1) touch = true
      }
      if (process.env.HM_TRACE && f % 60 === 0) console.log(`  ${spec.id} t=${t.toFixed(0)} pos ${cp[0].toFixed(0)},${cp[2].toFixed(0)} v ${Math.hypot(v[0], v[2]).toFixed(1)} fwd ${forwardSpeed(q, v).toFixed(1)}`)
      if (touch) { contactFrames++; if (!inContact) events++ }
      inContact = touch
      const stillIn = outT === null && catchT === null && reachT === null
      if (stillIn) rev.push(forwardSpeed(q, v))
      if (outT === null && !insideBBox(spec.bbox, cp[0], cp[2], OUT_MARGIN)) outT = t
      endDist = Math.hypot(cp[0] - spec.goal[0], cp[2] - spec.goal[1])
      if (spec.kind === 'solo' && reachT === null && endDist < GOAL_REACH) reachT = t
      if (spec.kind === 'cim') {
        const ap = sim.getPosition(AV_ID)
        const d = Math.hypot(ap[0] - cp[0], ap[2] - cp[2])
        minCh = Math.min(minCh, d)
        if (catchT === null && d < DAMAGE_DIST) catchT = t
      } else {
        for (const c of chasers) {
          const p = sim.getPosition(c)
          const d = Math.hypot(p[0] - cp[0], p[2] - cp[2])
          minCh = Math.min(minCh, d)
          if (armed.get(c) && d < DAMAGE_DIST) { armed.set(c, false); hits++; firstHit ??= t }
          else if (!armed.get(c) && d > DAMAGE_CLEAR) armed.set(c, true)
        }
      }
      if (upY(q) < 0.2) { flipped = true; break }
      if (!o.fullRun) {
        if (spec.kind === 'solo' && reachT !== null) break
        if (spec.kind === 'cim' && (catchT !== null || outT !== null)) break
        if ((spec.kind === 'flee' || spec.kind === 'flee-real') && outT !== null) break
      }
    }
    const reached = spec.kind === 'solo' ? reachT !== null : spec.kind === 'cim' ? outT !== null || catchT !== null : outT !== null
    const exitT = spec.kind === 'solo' ? (reachT ?? o.seconds) : spec.kind === 'cim' ? (catchT ?? outT ?? o.seconds) : (outT ?? o.seconds)
    return {
      id: spec.id, kind: spec.kind, maze: spec.maze, reached, exitT, outT, catchT,
      contactEvents: events, contactFrames, reversals: rev.count, reverseS: rev.reverseFrames * DEFAULT_DT,
      hits, firstHitT: firstHit, minChaserDist: minCh, flipped, simS, wallMs: performance.now() - t0, endDist,
    }
  } finally {
    sim?.dispose()
    det.restore()
    console.warn = prevWarn
    setAgentObservationWatchActive(false)
  }
}
