/**
 * Per-episode leg / chain metrics of maze episodes (hook-free: derived from the car's signed forward speed and pose).
 *   npx tsx tools/av-evolution/legs.ts <paramsFile.json|{}> <out.json> <sliceIdx> <sliceN> [train|holdout-all]
 * Reverse leg = run of forward speed < -1 m/s; a CHAIN = reverse legs whose gaps (forward / rest between them) are < CHAIN_GAP s.
 * Reverse legs per chain = K-turn size (2 = one reversal pair, a 3-point turn); heading error = |car heading - direction of the actual
 * path over the next HEAD_LOOK m| at the end of every reverse leg (the pose the car continues from).
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './loadSource'
import { prepareSourceWorld } from '@/avEvolution/eval/evaluator'
import { buildArenaWorldFrom } from '@/avEvolution/maze/arenaWorld'
import { listMazeEpisodes, mazeArenaSpec, MAZE_EPISODE_SECONDS } from '@/avEvolution/maze/episodes'
import { EPISODE_SEED, GOAL_REACH } from '@/avEvolution/eval/episode'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator, DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { yawOf, forwardSpeed } from '@/avEvolution/eval/geometry'
import type { Params } from '@/avEvolution/core/genes'

const CHAIN_GAP = 6
const HEAD_LOOK = 10
const ARENA_CAR_ID = 'entity_1779823253285_brtkx1p'
const [pj, outFile, si, sn, set] = process.argv.slice(2) as [string, string, string, string, string | undefined]
const params: Params = pj.startsWith('@') ? JSON.parse(fs.readFileSync(pj.slice(1), 'utf8')) : JSON.parse(pj || '{}')
const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'public/exampleWorlds/self_hunt_flexible/world.json'), 'utf8'))
const bundle = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'public/global/shipped-global-behavior-library.json'), 'utf8'))
const source = prepareSourceWorld(raw, bundle)
const lists = listMazeEpisodes()
const eps = (set === 'holdout-all' ? [...lists.holdout, ...lists.holdoutExtra] : lists.train).filter((_, i) => i % Number(sn) === Number(si))

const out: Record<string, unknown>[] = []
for (const ep of eps) {
  const spec = mazeArenaSpec(ep)
  const world = buildArenaWorldFrom(source, spec, params)
  const frames = Math.round(MAZE_EPISODE_SECONDS / DEFAULT_DT)
  const det = installDeterminism(EPISODE_SEED, 0)
  const prevWarn = console.warn
  console.warn = () => {}
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(world, 0)
  const rows: { t: number; x: number; z: number; fwd: number; yaw: number }[] = []
  let exitT = Infinity
  try {
    for (let frame = 0; frame < frames; frame++) {
      sim.runFrames(1)
      det.advance(DEFAULT_DT)
      const cp = sim.getPosition(ARENA_CAR_ID)
      const q = sim.getRotation(ARENA_CAR_ID)
      const v = sim.getVelocity(ARENA_CAR_ID)
      rows.push({ t: (frame + 1) * DEFAULT_DT, x: cp[0], z: cp[2], fwd: forwardSpeed(q, v), yaw: yawOf(q) })
      if (Math.hypot(cp[0] - spec.goal[0], cp[2] - spec.goal[1]) < GOAL_REACH) {
        exitT = (frame + 1) * DEFAULT_DT
        break
      }
    }
  } finally {
    sim.dispose()
    det.restore()
    console.warn = prevWarn
    setAgentObservationWatchActive(false)
  }
  // reverse legs
  const legs: { i0: number; i1: number }[] = []
  let cur: { i0: number; i1: number } | null = null
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.fwd < -1) {
      if (!cur) {
        cur = { i0: i, i1: i }
        legs.push(cur)
      } else cur.i1 = i
    } else if (cur && rows[i]!.fwd > 1) cur = null
  }
  // merge legs split by a rest (fwd within +-1): a leg ends only when forward motion > 1 follows
  const chains: { legs: typeof legs }[] = []
  for (const l of legs) {
    const last = chains[chains.length - 1]
    if (last && rows[l.i0]!.t - rows[last.legs[last.legs.length - 1]!.i1]!.t < CHAIN_GAP) last.legs.push(l)
    else chains.push({ legs: [l] })
  }
  const headErr: number[] = []
  for (const l of legs) {
    const r = rows[l.i1]!
    let j = l.i1
    let acc = 0
    while (j + 1 < rows.length && acc < HEAD_LOOK) {
      acc += Math.hypot(rows[j + 1]!.x - rows[j]!.x, rows[j + 1]!.z - rows[j]!.z)
      j++
    }
    if (acc < 3) continue
    const dx = rows[j]!.x - r.x
    const dz = rows[j]!.z - r.z
    const h = [Math.sin(r.yaw), Math.cos(r.yaw)]
    const c = (h[0] * dx + h[1] * dz) / Math.hypot(dx, dz)
    headErr.push((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI)
  }
  let flips = 0
  let rs = 0
  for (const r of rows) {
    if (Math.abs(r.fwd) > 1) {
      const s = Math.sign(r.fwd)
      if (rs !== 0 && s !== rs) flips++
      rs = s
    }
  }
  const revS = rows.filter((r) => r.fwd < -0.5).length * DEFAULT_DT
  out.push({ key: ep.key, exitT, reached: Number.isFinite(exitT), nLegs: legs.length, chainLegs: chains.map((c) => c.legs.length), headErr, flips, revS })
  console.log(ep.key, Number.isFinite(exitT) ? exitT.toFixed(1) : 'T', 'flips', flips, 'chains', chains.map((c) => c.legs.length).join(','))
}
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(out))
process.exit(0)
