/**
 * How is the simulated time of one ES generation spread over episode outcomes? Evaluates `--n` perturbed copies (sigma `--sigma`) of a
 * policy (default: shipped; `--run FILE` uses that run's best) on one generation's course batch and sums sim seconds per outcome.
 *
 *   npx tsx tools/policy-evolution/bench-es.ts [--n 32] [--sigma 0.1] [--batch 18] [--run FILE] [--workers 4]
 */
import fs from 'node:fs'
import { trainCourseKeys, withVariant } from '@/policyEvolution/courses'
import { shippedGenome } from '@/policyEvolution/exampleWorld'
import { PolicyPool } from './pool'

const argv = process.argv.slice(2)
const opt = (name: string, d: number) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? Number(argv[i + 1]) : d
}
const ri = argv.indexOf('--run')
const base = ri >= 0 ? (JSON.parse(fs.readFileSync(argv[ri + 1]!, 'utf8')) as { best: { genome: number[] } }).best.genome : shippedGenome()
const n = opt('n', 32)
const sigma = opt('sigma', 0.1)
const batch = opt('batch', 18)
let s = 12345
const gauss = () => {
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0
  const u = (s + 1) / 4294967297
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0
  const v = (s + 1) / 4294967297
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const train = trainCourseKeys(30)
const keys = Array.from({ length: batch }, (_, j) => withVariant(train[(100 * batch + j) % train.length]!, 101))
const pool = new PolicyPool(opt('workers', 4))
const t0 = Date.now()
try {
  const all = (await Promise.all(Array.from({ length: n }, () => pool.evaluator()(base.map((w) => w + sigma * gauss()), keys)))).flat()
  const wall = (Date.now() - t0) / 1000
  const by: Record<string, { n: number; sim: number }> = {}
  let sim = 0
  for (const m of all) {
    const b = (by[m.outcome] ??= { n: 0, sim: 0 })
    b.n++
    b.sim += m.timeS
    sim += m.timeS
  }
  console.log(`${all.length} episodes, ${sim.toFixed(0)} sim s, wall ${wall.toFixed(1)} s (${(sim / wall).toFixed(0)} sim s per wall s)`)
  for (const [o, b] of Object.entries(by)) console.log(`  ${o.padEnd(9)} ${String(b.n).padStart(4)} episodes  ${((100 * b.sim) / sim).toFixed(1).padStart(5)} % of sim time  mean ${(b.sim / b.n).toFixed(1)} s`)
} finally {
  await pool.close()
}
