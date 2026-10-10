/* A/B of the neural drive mode on the maze-escape HOLDOUT-24 (runMazeEpisode, evolved params of av_maze_escape): off vs auto vs always.
 * AV_NEURAL_MAZE_AB=1 npx vitest run src/test/scenarios/av-neural-maze-ab.diagnostic.test.ts
 * Optional: AV_NEURAL_MODES=off,auto  AV_NEURAL_N=6 (first N episodes)  AV_NEURAL_TRIGGER=crowd (use the crowd thresholds for auto; default = library defaults). */
import { it } from 'vitest'
import { listMazeEpisodes } from '@/avEvolution/maze/episodes'
import { MAZE_ESCAPE_DEFAULT_CAR_PARAMS } from '@/avEvolution/maze/exampleWorld'
import { runMazeEpisode } from '@/avEvolution/eval/episode'
import { loadLabWorld, watchValues } from '@/test/avLab/lab'
import { ARENA_CAR_ID } from '@/test/fixtures/avEvasionArena'
import { NEURAL_CROWD_TRIGGER } from '@/test/fixtures/avCrowdCases'

const modes = (process.env.AV_NEURAL_MODES ?? 'off,auto,always').split(',') as ('off' | 'always' | 'auto')[]
const N = Number(process.env.AV_NEURAL_N ?? 24)

function bootstrapCi(d: number[], reps = 5000): [number, number] {
  let s = 12345
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const means: number[] = []
  for (let r = 0; r < reps; r++) {
    let a = 0
    for (let i = 0; i < d.length; i++) a += d[Math.floor(rnd() * d.length)]!
    means.push(a / d.length)
  }
  means.sort((a, b) => a - b)
  return [means[Math.floor(reps * 0.025)]!, means[Math.floor(reps * 0.975)]!]
}

it.runIf(process.env.AV_NEURAL_MAZE_AB === '1')('neural A/B on the maze HOLDOUT-24', async () => {
  const source = loadLabWorld({ exampleId: 'self_hunt_flexible' })
  const { holdout, holdoutExtra } = listMazeEpisodes()
  const eps = [...holdout, ...holdoutExtra].slice(0, N)
  const res: Record<string, { exitT: number; reached: boolean; contacts: number; stalled: number; on: number; frames: number; ho: number; fails: number }[]> = {}
  for (const mode of modes) {
    res[mode] = []
    for (const ep of eps) {
      let on = 0
      let frames = 0
      let n = ''
      const params = { ...MAZE_ESCAPE_DEFAULT_CAR_PARAMS, saver: false, neuralMode: mode, ...(mode === 'auto' && process.env.AV_NEURAL_TRIGGER === 'crowd' ? NEURAL_CROWD_TRIGGER : {}) }
      const m = await runMazeEpisode(source, params, ep, {
        onFrame: () => {
          frames++
          if (mode === 'off') return
          const w = watchValues(ARENA_CAR_ID)
          if (String(w['av.neural'] ?? '').startsWith('on')) on++
          n = String(w['av.neural.n'] ?? n)
        },
      })
      const nums = (n.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      res[mode]!.push({ exitT: m.exitT, reached: m.reached, contacts: m.contactEvents, stalled: m.stalledSec, on, frames, ho: nums[1] ?? 0, fails: nums[2] ?? 0 })
      console.log(`MAZE_AB ${mode.padEnd(6)} ${ep.key.padEnd(10)} reached ${m.reached} exit ${m.exitT.toFixed(1)} contacts ${m.contactEvents} stalled ${m.stalledSec.toFixed(1)} on ${frames ? ((on / frames) * 100).toFixed(0) : 0}% [${n}]`)
    }
  }
  const out: string[] = []
  for (const mode of modes) {
    const r = res[mode]!
    const reached = r.filter((x) => x.reached)
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
    out.push(
      `${mode.padEnd(6)} reached ${reached.length}/${r.length} meanExit(all, timeout=fail) ${mean(r.map((x) => x.exitT)).toFixed(1)}s meanExit(reached) ${mean(reached.map((x) => x.exitT)).toFixed(1)}s contacts ${r.reduce((a, x) => a + x.contacts, 0)} (eps ${r.filter((x) => x.contacts > 0).length}) stalled ${mean(r.map((x) => x.stalled)).toFixed(1)}s/ep netOn ${((r.reduce((a, x) => a + x.on, 0) / Math.max(1, r.reduce((a, x) => a + x.frames, 0))) * 100).toFixed(1)}% handovers ${r.reduce((a, x) => a + x.ho, 0)} fails ${r.reduce((a, x) => a + x.fails, 0)}`,
    )
  }
  for (const mode of modes) {
    if (mode === 'off' || !res.off) continue
    const d = res[mode]!.map((x, i) => x.exitT - res.off![i]!.exitT)
    const [lo, hi] = bootstrapCi(d)
    out.push(`${mode} - off exit time: mean ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2)}s CI95 [${lo.toFixed(2)}, ${hi.toFixed(2)}] wins(faster) ${d.filter((x) => x < -0.5).length} losses ${d.filter((x) => x > 0.5).length} ties ${d.filter((x) => Math.abs(x) <= 0.5).length}`)
  }
  console.log('MAZE_AB_SUMMARY\n' + out.join('\n'))
}, 6 * 3600 * 1000)
