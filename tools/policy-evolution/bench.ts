/**
 * Where does an evolution run spend its time? Runs the shipped policy on a few TRAIN courses in this thread and prints, per episode,
 * wall time, sim seconds, setup (world build) and per-frame phase shares. Single thread on purpose: numbers are per core.
 *
 *   npx tsx tools/policy-evolution/bench.ts [--per-kind 3]
 */
import { buildCourse, parseCourseKey, trainCourseKeys } from '@/policyEvolution/courses'
import { buildPolicyWorld, runPolicyEpisode } from '@/policyEvolution/episode'
import { shippedGenome } from '@/policyEvolution/exampleWorld'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

const argv = process.argv.slice(2)
const i = argv.indexOf('--per-kind')
const perKind = i >= 0 ? Number(argv[i + 1]) : 3
const genome = shippedGenome()
// warm up (Rapier init, JIT)
await runPolicyEpisode(genome, 'slalom:1', { seconds: 2 })

let wall = 0
let simS = 0
for (const key of trainCourseKeys(perKind)) {
  const m = await runPolicyEpisode(genome, key)
  wall += m.wallMs
  simS += m.timeS
  console.log(`${key.padEnd(14)} ${m.outcome.padEnd(9)} sim ${m.timeS.toFixed(1).padStart(5)} s  wall ${m.wallMs.toFixed(0).padStart(5)} ms  ${(m.wallMs / Math.max(m.timeS, 1e-3)).toFixed(1)} ms per sim s`)
}
console.log(`TOTAL wall ${(wall / 1000).toFixed(1)} s for ${simS.toFixed(0)} sim s = ${(wall / simS).toFixed(1)} ms per sim s (${(simS / (wall / 1000)).toFixed(1)}x real time)`)

// phase split: world build vs transformers (policy stage + car2) vs physics step vs sync, 3 s of driving per course
const det = installDeterminism(1, 0)
const sum = { create: 0, transformers: 0, physics: 0, sync: 0, frames: 0, worlds: 0 }
try {
  for (const key of trainCourseKeys(perKind)) {
    const { kind, seed, variant, difficulty } = parseCourseKey(key)
    const world = buildPolicyWorld(buildCourse(kind, seed, variant, difficulty), genome)
    const t0 = performance.now()
    const sim = await WorldSimulator.create(world, 0)
    sum.create += performance.now() - t0
    sum.worlds++
    for (const f of sim.runFramesTimed(180)) {
      sum.transformers += f.transformersMs
      sum.physics += f.physicsStepMs
      sum.sync += f.syncMs
      sum.frames++
    }
    sim.dispose()
  }
} finally {
  det.restore()
}
const perSimS = (ms: number) => ((ms / sum.frames) * 60).toFixed(2)
console.log(`world build ${(sum.create / sum.worlds).toFixed(1)} ms per episode; per sim s: transformers ${perSimS(sum.transformers)} ms, physics ${perSimS(sum.physics)} ms, sync ${perSimS(sum.sync)} ms`)
