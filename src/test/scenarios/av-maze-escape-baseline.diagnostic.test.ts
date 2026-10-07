/* Baseline of the AV car (CURRENT params) on the maze-escape episodes (TRAIN + HOLDOUT).
 * AV_MAZE_BASELINE=1 npx vitest run src/test/scenarios/av-maze-escape-baseline.diagnostic.test.ts
 * Optional: AV_PARAMS='{"..."}' overrides car params, AV_MAZE_ONLY=tr1,ho3 limits the episodes.
 * Writes test-results/av-maze-escape/baseline.json. */
import { it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { yawOf } from '@/test/avLab/lab'
import { listMazeEpisodes, mazeArenaSpec, MAZE_EPISODE_SECONDS, type MazeEpisodeSpec } from '@/avEvolution/maze/episodes'
import { ARENA_CAR_ID, CAR_SIZE, polyGap, rectPoly, type ArenaBox } from '@/test/fixtures/avEvasionArena'
import { CONTACT_GAP, GOAL_REACH, runScenario } from '@/test/fixtures/avEvasionRunner'

interface EpisodeResult {
  key: string
  mazeSeed: number
  startCell: [number, number]
  startYaw: number
  reached: boolean
  exitTimeS: number | null
  contactEvents: number
  contactFrames: number
  minStaticGap: number
  reversals: number
  shuttleEpisodes: number
  stalledS: number
  minGoalDist: number
  wallS: number
}

function boxPoly(b: ArenaBox) {
  return rectPoly(b.at[0], b.at[1], ((b.yawDeg ?? 0) * Math.PI) / 180, b.size[0], b.size[1])
}

async function runEpisode(ep: MazeEpisodeSpec): Promise<EpisodeResult> {
  const spec = mazeArenaSpec(ep)
  const polys = spec.boxes.map((b) => ({ b, poly: boxPoly(b) }))
  let events = 0
  let inContact = false
  const t0 = Date.now()
  const m = await runScenario(spec, MAZE_EPISODE_SECONDS, {
    onFrame: ({ sim }) => {
      const p = sim.getPosition(ARENA_CAR_ID)
      const hull = rectPoly(p[0], p[2], yawOf(sim.getRotation(ARENA_CAR_ID)), CAR_SIZE[0], CAR_SIZE[1])
      let touch = false
      for (const w of polys) {
        if (Math.abs(w.b.at[0] - p[0]) > 25 || Math.abs(w.b.at[1] - p[2]) > 25) continue
        if (polyGap(hull, w.poly) < CONTACT_GAP) {
          touch = true
          break
        }
      }
      if (touch && !inContact) events++
      inContact = touch
    },
  })
  return {
    key: ep.key,
    mazeSeed: ep.mazeSeed,
    startCell: ep.startCell,
    startYaw: ep.startYaw,
    reached: Number.isFinite(m.goalReachT),
    exitTimeS: Number.isFinite(m.goalReachT) ? m.goalReachT : null,
    contactEvents: events,
    contactFrames: m.staticContactFrames,
    minStaticGap: m.minStaticGap,
    reversals: m.reversals,
    shuttleEpisodes: m.shuttleEvents,
    stalledS: m.stalledSec,
    minGoalDist: m.minGoalDist,
    wallS: (Date.now() - t0) / 1000,
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const f = (v: number | null, d = 1) => (v == null || !Number.isFinite(v) ? '-' : v.toFixed(d))

function table(name: string, rs: EpisodeResult[]): string[] {
  const rows = [`${name}`, 'key  seed cell  yaw  reached exit_s  contacts frames minGap rev shuttle stalled_s minGoal wall_s']
  for (const r of rs) {
    rows.push(
      `${r.key.padEnd(4)} ${String(r.mazeSeed).padStart(4)} ${`${r.startCell}`.padEnd(5)} ${String(r.startYaw).padStart(4)} ${(r.reached ? 'yes' : 'DNF').padEnd(7)} ${f(r.exitTimeS).padStart(6)}  ${String(r.contactEvents).padStart(8)} ${String(r.contactFrames).padStart(6)} ${f(r.minStaticGap, 2).padStart(6)} ${String(r.reversals).padStart(3)} ${String(r.shuttleEpisodes).padStart(7)} ${f(r.stalledS).padStart(9)} ${f(r.minGoalDist).padStart(7)} ${f(r.wallS).padStart(6)}`,
    )
  }
  const ok = rs.filter((r) => r.reached)
  rows.push(
    `MEAN reached ${ok.length}/${rs.length}  exit_s(reached) ${f(mean(ok.map((r) => r.exitTimeS!)))}  contacts ${f(mean(rs.map((r) => r.contactEvents)), 2)}  frames ${f(mean(rs.map((r) => r.contactFrames)))}  minGap ${f(mean(rs.map((r) => r.minStaticGap)), 2)}  rev ${f(mean(rs.map((r) => r.reversals)))}  shuttle ${f(mean(rs.map((r) => r.shuttleEpisodes)), 2)}  stalled ${f(mean(rs.map((r) => r.stalledS)))}  wall ${f(mean(rs.map((r) => r.wallS)))}`,
  )
  return rows
}

it.skipIf(!process.env.AV_MAZE_BASELINE)(
  'maze-escape baseline (current car params)',
  async () => {
    const only = process.env.AV_MAZE_ONLY?.split(',')
    const sel = (xs: MazeEpisodeSpec[]) => xs.filter((e) => !only || only.includes(e.key))
    const { train, holdout } = listMazeEpisodes()
    const out: Record<string, EpisodeResult[]> = { train: [], holdout: [] }
    for (const ep of sel(train)) out.train!.push(await runEpisode(ep))
    for (const ep of sel(holdout)) out.holdout!.push(await runEpisode(ep))
    const lines = [`MAZE ESCAPE BASELINE  timeout ${MAZE_EPISODE_SECONDS}s  goal radius ${GOAL_REACH} m  params ${process.env.AV_PARAMS ?? '(car as shipped)'}`, ...table('TRAIN', out.train!), ...table('HOLDOUT', out.holdout!)]
    console.log('\n' + lines.join('\n'))
    const dir = path.join(process.cwd(), 'test-results/av-maze-escape')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify({ timeoutS: MAZE_EPISODE_SECONDS, goalRadius: GOAL_REACH, params: process.env.AV_PARAMS ?? null, ...out }, null, 2) + '\n')
  },
  3_600_000,
)
