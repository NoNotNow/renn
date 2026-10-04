/* eslint-disable @typescript-eslint/no-explicit-any -- raw world JSON surgery */
import { runLab, watchValues } from '@/test/avLab/lab'
import { summarizeEntityProfile } from '@/runtime/transformerProfilerBridge'
import { DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { AV_CAR_SOURCE_ID, buildArenaWorld, type ArenaBox, type V2 } from '@/test/fixtures/avEvasionArena'
import { seg } from '@/test/fixtures/avMazeCases'
import type { RennWorld } from '@/types/world'

/**
 * Many-cars arena for the CPU budget (economy mode, `budget: 'eco' | 'normal' | 'full'`, see feature-av-stack.md).
 * `n` copies of the example AV car (own entity, own wanderer goal + car2 stage, shared global stages) on a ring of radius `ring`,
 * each heading for the opposite side of the ring, so they meet in the middle (moving obstacles for each other). A few low walls
 * across the field (static map) make some of them route around.
 */
export interface FleetSpec {
  n: number
  ring?: number
  /** Pipe binding params merged over the example car's params (e.g. `{ budget: 'eco' }`). */
  params?: Record<string, unknown>
  walls?: ArenaBox[]
  /** 'ring' (default): all cars cross the middle (worst case, they meet); 'spread': a grid 90 m apart, each heading 260 m in its own direction (typical open map). */
  layout?: 'ring' | 'spread'
}

export const fleetCarId = (i: number) => (i === 0 ? AV_CAR_SOURCE_ID : `fleet_car_${i}`)

export const FLEET_WALLS: ArenaBox[] = [seg([-60, -40], [-20, -40]), seg([20, 40], [60, 40]), seg([-45, 10], [-45, 50]), seg([45, -50], [45, -10])]

function slot(i: number, n: number, ring: number, layout: FleetSpec['layout'] = 'ring'): { at: V2; goal: V2; yawDeg: number } {
  let at: V2
  let goal: V2
  if (layout === 'spread') {
    const cols = Math.ceil(Math.sqrt(n))
    at = [((i % cols) - (cols - 1) / 2) * 90, (Math.floor(i / cols) - (cols - 1) / 2) * 90]
    // fixed pseudo-random direction per car (golden angle)
    const a = i * 2.399963 + 0.4
    goal = [at[0] + 260 * Math.cos(a), at[1] + 260 * Math.sin(a)]
  } else {
    const a = (2 * Math.PI * i) / n + 0.3
    at = [ring * Math.cos(a), ring * Math.sin(a)]
    goal = [-at[0], -at[1]]
  }
  // heading convention: 0 = -Z, positive = left (counter-clockwise from above); face the goal
  const yawDeg = (Math.atan2(-(goal[0] - at[0]), -(goal[1] - at[1])) * 180) / Math.PI
  return { at, goal, yawDeg }
}

export function buildFleetWorld(spec: FleetSpec): RennWorld {
  const ring = spec.ring ?? 110
  const s0 = slot(0, spec.n, ring, spec.layout)
  const world = buildArenaWorld({ car: { at: s0.at, yawDeg: s0.yawDeg }, goal: s0.goal, boxes: spec.walls ?? FLEET_WALLS, puppets: [] }) as RennWorld & Record<string, any>
  const ents = world.entities as any[]
  const car0 = ents.find((e) => e.id === AV_CAR_SOURCE_ID)
  car0.transformerPipeStack[0].params = { ...car0.transformerPipeStack[0].params, ...spec.params, threatIds: undefined }
  const tfs = world.transformers as Record<string, any>
  for (let i = 1; i < spec.n; i++) {
    const s = slot(i, spec.n, ring, spec.layout)
    const id = fleetCarId(i)
    const car = JSON.parse(JSON.stringify(car0))
    car.id = id
    car.name = id
    car.position = [s.at[0], car0.position[1], s.at[1]]
    car.rotation = [0, (s.yawDeg * Math.PI) / 180, 0]
    car.transformers = (car0.transformers as string[]).map((t) => (t.startsWith(AV_CAR_SOURCE_ID) ? t.replace(AV_CAR_SOURCE_ID, id) : t))
    for (const t of car0.transformers as string[]) {
      if (!t.startsWith(AV_CAR_SOURCE_ID) || !tfs[t]) continue
      tfs[t.replace(AV_CAR_SOURCE_ID, id)] = JSON.parse(JSON.stringify(tfs[t]))
    }
    const w = tfs[`${id}_tf10`]
    w.params = { ...w.params, perimeter: { center: [s.goal[0], 0, s.goal[1]], halfExtents: [0, 0, 0] } }
    ents.push(car)
  }
  return world
}

export interface FleetResult {
  n: number
  seconds: number
  /** Mean chain ms per car per frame (all cars). */
  perCarMs: number
  /** Worst car's chain mean. */
  maxCarMs: number
  /** Stage table summed over all cars: mean ms per car per frame. */
  stages: { label: string; meanMs: number; share: number }[]
  /** Fraction of driving frames (> 2 m/s) the motion planner was fixated (economy mode). */
  fixShare: number
  /** Driving frames per fixation outcome (av.fixWhy). */
  whyHist: Record<string, number>
  /** Mean progress toward the own goal (m) and how many reached it (within 15 m). */
  meanProgress: number
  reached: number
  /** Closest approach to the own goal per car (m). */
  best: number[]
  wallMs: number
}

export async function runFleet(spec: FleetSpec, seconds: number, seed = 1): Promise<FleetResult> {
  const world = buildFleetWorld(spec)
  const ring = spec.ring ?? 110
  const ids = Array.from({ length: spec.n }, (_, i) => fleetCarId(i))
  const slots = ids.map((_, i) => slot(i, spec.n, ring, spec.layout))
  const goals = slots.map((s) => s.goal)
  const best = ids.map(() => Infinity)
  let fixFrames = 0
  let driveFrames = 0
  const whyHist: Record<string, number> = {}
  const res = await runLab({
    world: { inline: world },
    preparedWorld: world,
    applyLibrary: false,
    focus: ids[0]!,
    seed,
    frames: Math.round(seconds / DEFAULT_DT),
    profile: true,
    maxScenes: 0,
    onFrame: ({ sim }) => {
      ids.forEach((id, i) => {
        const p = sim.getPosition(id)
        best[i] = Math.min(best[i]!, Math.hypot(p[0] - goals[i]![0], p[2] - goals[i]![1]))
        const v = sim.getVelocity(id)
        if (Math.hypot(v[0], v[2]) > 2) {
          driveFrames++
          const why = String(watchValues(id)['av.fixWhy'] ?? '-')
          whyHist[why] = (whyHist[why] ?? 0) + 1
          if (why === 'fix') fixFrames++
        }
      })
    },
  })
  const means = ids.map((id) => res.chainMeans[id] ?? 0)
  const frames = Math.round(seconds / DEFAULT_DT)
  const agg = new Map<number, number>()
  for (const id of ids) {
    const p = summarizeEntityProfile(id, (_i, t) => t)
    for (const r of p?.stages ?? []) agg.set(r.index, (agg.get(r.index) ?? 0) + (r.meanMs * r.calls) / frames / ids.length)
  }
  const labels = res.profile?.stages ?? []
  const aggTotal = [...agg.values()].reduce((a, b) => a + b, 0) || 1
  return {
    n: spec.n,
    seconds,
    perCarMs: means.reduce((a, b) => a + b, 0) / means.length,
    maxCarMs: Math.max(...means),
    stages: [...agg.entries()]
      .map(([idx, ms]) => ({ label: labels.find((l) => l.index === idx)?.label ?? String(idx), meanMs: ms, share: ms / aggTotal }))
      .sort((a, b) => b.meanMs - a.meanMs),
    fixShare: fixFrames / Math.max(1, driveFrames),
    whyHist,
    meanProgress: best.reduce((a, b, i) => a + (Math.hypot(slots[i]!.at[0] - goals[i]![0], slots[i]!.at[1] - goals[i]![1]) - b), 0) / best.length,
    reached: best.filter((b) => b <= 15).length,
    best,
    wallMs: res.wallMs,
  }
}

export function formatFleet(label: string, r: FleetResult): string {
  return (
    `${label.padEnd(8)} ${r.n} cars ${r.seconds} s: per car ${r.perCarMs.toFixed(3)} ms/frame (max ${r.maxCarMs.toFixed(3)}), fixated ${(r.fixShare * 100).toFixed(0)}% of driving, reached ${r.reached}/${r.n}, mean progress ${r.meanProgress.toFixed(0)} m, wall ${(r.wallMs / 1000).toFixed(1)} s ${JSON.stringify(r.whyHist)}\n` +
    r.stages.slice(0, 8).map((s) => `    ${s.label.padEnd(30)} ${s.meanMs.toFixed(3)} ms ${(s.share * 100).toFixed(0)}%`).join('\n')
  )
}
