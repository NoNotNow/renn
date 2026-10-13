/**
 * Shared headless --score measurement of the playable training worlds (maze + crux exporters): every car of the world
 * drives simultaneously (up to `maxSimS` of sim, stopping once EVERY car is within `goalReachM` of its goal slab), each
 * car's watch score is snapshotted AT the moment it reaches (the in-world stage freezes the score at its finish), and
 * the bestScore (max over cars) is written into meta.json. A pure-JS scorer with the same rules as the in-world stage
 * (monotone chain progress + speed bonus, incl. the wall line-of-sight gate) cross-checks the watch value.
 * Extracted from export-maze-training-worlds.ts so the two training-set exporters share one measurement.
 */
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '../../src/runtime/transformerWatchBridge'
import { WallLos } from '../../src/policyEvolution/wallLos'
import { DEFAULT_DT, WorldSimulator } from '../../src/test/helpers/worldSimulator'
import type { RennWorld } from '../../src/types/world'
import type { V2 } from '../../src/avEvolution/eval/geometry'

export interface TrainingScoreRunResult {
  reached: boolean
  seconds: number
  score: number
  fromWatch: boolean
}

function watchValues(entityId: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of getTransformerWatchEntries().values()) if (e.entityId === entityId) out[e.label] = e.value
  return out
}

/** Same scoring rule as the in-world stage (monotone chain progress + speed bonus, incl. the wall line-of-sight gate on the progress credit), as a cross-check of the watch value. */
function identicalScorer(chain: number[][], walls: V2[][], vRef: number, bonusRate: number) {
  const cum = [0]
  for (let q = 1; q < chain.length; q++) cum.push(cum[q - 1]! + Math.hypot(chain[q]![0] - chain[q - 1]![0], chain[q]![1] - chain[q - 1]![1]))
  let s = 0
  let bonus = 0
  let seg = 0
  const los = new WallLos(walls)
  return {
    step(px: number, pz: number, vx: number, vz: number, dt: number): number {
      let bestD = Infinity
      let bestS = s
      let bestSeg = seg
      let bestPX = px
      let bestPZ = pz
      for (let i = Math.max(0, seg - 2); i <= Math.min(chain.length - 2, seg + 3); i++) {
        const ax = chain[i]![0]
        const az = chain[i]![1]
        const dx = chain[i + 1]![0] - ax
        const dz = chain[i + 1]![1] - az
        const len2 = dx * dx + dz * dz || 1
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
        const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
        if (d < bestD) {
          bestD = d
          bestS = cum[i]! + t * Math.sqrt(len2)
          bestSeg = i
          bestPX = ax + t * dx
          bestPZ = az + t * dz
        }
      }
      seg = bestSeg
      if (bestS > s && !los.blocked(px, pz, bestPX, bestPZ)) s = bestS
      bonus += (Math.min(Math.hypot(vx, vz), vRef) / vRef) * dt * bonusRate
      return Math.floor(s + bonus)
    },
  }
}

/**
 * Headless run of one training world: every car drives simultaneously; per car reached/seconds/score,
 * bestScore = max over cars. `carId(i)` names copy i's car entity, `goalPrefix` its goal slab id prefix,
 * `watchLabel` the in-world score watch label ('maze.score' / 'crux.score') and `chains` / `walls` the per-copy
 * (already shifted) score-stage params.
 */
export async function scoreTrainingWorld(
  world: RennWorld,
  opts: {
    carId: (i: number) => string
    goalPrefix: string
    goalReachM: number
    watchLabel: string
    maxSimS: number
    chains: number[][][]
    walls: V2[][][]
    vRef: number
    bonusRate: number
  },
): Promise<TrainingScoreRunResult[]> {
  const K = opts.chains.length
  const goalPos = (world.entities as { id: string; position: number[] }[]).filter((e) => e.id.startsWith(opts.goalPrefix)).map((e) => e.position)
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(world, 0)
  try {
    const scorers = opts.chains.map((ch, i) => identicalScorer(ch, opts.walls[i] ?? [], opts.vRef, opts.bonusRate))
    const reachedAt: Array<number | null> = new Array(K).fill(null)
    // per-car snapshot AT the moment of reaching: the in-world stage freezes the score at its finish (goalReachM),
    // so the watch value stands still afterwards — but snapshotting at reachedAt makes each car's result independent of
    // the rest of the run (a slow chain can no longer drag the early cars' scores through post-finish penalties)
    const snapshot = new Array<number>(K).fill(0)
    const fromWatch = new Array<boolean>(K).fill(false)
    let t = 0
    const frames = Math.round(opts.maxSimS / DEFAULT_DT)
    for (let f = 0; f < frames; f++) {
      sim.runFrames(1)
      t = (f + 1) * DEFAULT_DT
      let allReached = true
      for (let i = 0; i < K; i++) {
        if (reachedAt[i] !== null) continue
        const p = sim.getPosition(opts.carId(i))
        const v = sim.getVelocity(opts.carId(i))
        snapshot[i] = scorers[i]!.step(p[0], p[2], v[0], v[2], DEFAULT_DT)
        if (Math.hypot(p[0] - goalPos[i]![0]!, p[2] - goalPos[i]![2]!) < opts.goalReachM) {
          reachedAt[i] = t
          const m = /(\d+)/.exec(String(watchValues(opts.carId(i))[opts.watchLabel] ?? ''))
          if (m) {
            snapshot[i] = Number(m[1])
            fromWatch[i] = true
          }
        } else {
          allReached = false
        }
      }
      if (allReached) break
    }
    return reachedAt.map((reached, i) => {
      if (reached !== null) return { reached: true, seconds: reached, score: snapshot[i]!, fromWatch: fromWatch[i]! }
      const m = /(\d+)/.exec(String(watchValues(opts.carId(i))[opts.watchLabel] ?? ''))
      return { reached: false, seconds: t, score: m ? Number(m[1]) : snapshot[i]!, fromWatch: Boolean(m) }
    })
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}
