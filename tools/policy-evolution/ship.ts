/**
 * Pick the policy to ship from a run file (best mean policy by TRAIN score), round it and compare it with the currently shipped one on
 * the same TRAIN and HOLDOUT courses. src/policyEvolution/shippedPolicy.json is rewritten only if the candidate has the better HOLDOUT
 * fitness (or with --force). Then regenerate the example world: npx tsx tools/renn-mcp/export-policy-drive-example-world.ts
 *
 *   npx tsx tools/policy-evolution/ship.ts test-results/policy-evolution/run2.json [--workers 4] [--train-per-kind 30] [--holdout-per-kind 10] [--force]
 */
import fs from 'node:fs'
import os from 'node:os'
import { holdoutCourseKeys, trainCourseKeys } from '@/policyEvolution/courses'
import { aggregateFitness } from '@/policyEvolution/es'
import { PolicyPool } from './pool'

const SHIPPED = 'src/policyEvolution/shippedPolicy.json'
const argv = process.argv.slice(2)
const runFile = argv[0]
if (!runFile) throw new Error('usage: ship.ts <run.json> [--workers N] [--train-per-kind N] [--holdout-per-kind N] [--force]')
const opt = (name: string, d: number) => {
  const i = argv.indexOf(`--${name}`)
  return i > 0 ? Number(argv[i + 1]) : d
}
const run = JSON.parse(fs.readFileSync(runFile, 'utf8')) as { best?: { gen: number; genome: number[] } }
if (!run.best) throw new Error('run file has no best policy yet')
const genome = run.best.genome.map((x) => Math.round(x * 1e5) / 1e5)
const pool = new PolicyPool(opt('workers', Math.max(1, os.cpus().length - 1)))
const evaluate = pool.evaluator()
const trainKeys = trainCourseKeys(opt('train-per-kind', 6))
const holdoutKeys = holdoutCourseKeys(opt('holdout-per-kind', 6))

async function score(g: number[]) {
  const [tr, ho] = await Promise.all([evaluate(g, trainKeys), evaluate(g, holdoutKeys)])
  const outcomes = (m: typeof tr) => Object.fromEntries(['finish', 'crash', 'stall', 'flip', 'timeout'].map((o) => [o, m.filter((x) => x.outcome === o).length]))
  const part = (m: typeof tr) => ({ fitness: aggregateFitness(m), meanProgress: m.reduce((a, x) => a + x.progress, 0) / m.length, outcomes: outcomes(m) })
  return { train: part(tr), holdout: part(ho) }
}

try {
  const cand = await score(genome)
  const current = fs.existsSync(SHIPPED) ? (JSON.parse(fs.readFileSync(SHIPPED, 'utf8')) as { genome: number[] }) : undefined
  const cur = current ? await score(current.genome) : undefined
  const better = !cur || cand.holdout.fitness > cur.holdout.fitness
  const force = argv.includes('--force')
  console.log(JSON.stringify({ candidate: { gen: run.best.gen, ...cand }, shipped: cur, courses: { train: trainKeys.length, holdout: holdoutKeys.length }, better }, null, 2))
  if (better || force) {
    const info = { source: `${runFile} generation ${run.best.gen} (best mean policy by TRAIN fitness)`, ...cand, evaluatedOn: { train: trainKeys.length, holdout: holdoutKeys.length }, genome }
    fs.writeFileSync(SHIPPED, JSON.stringify(info, null, 1) + '\n')
    console.log('WROTE', SHIPPED)
  } else console.log('kept the shipped policy (candidate is not better on HOLDOUT)')
} finally {
  await pool.close()
}
