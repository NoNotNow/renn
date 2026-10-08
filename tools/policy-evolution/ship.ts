/**
 * Pick the policy to ship from a run file (best mean policy by TRAIN score), round it, re-score it on TRAIN + HOLDOUT and write
 * src/policyEvolution/shippedPolicy.json. Then regenerate the example world: npx tsx tools/renn-mcp/export-policy-drive-example-world.ts
 *
 *   npx tsx tools/policy-evolution/ship.ts test-results/policy-evolution/run1.json [--workers 4]
 */
import fs from 'node:fs'
import os from 'node:os'
import { holdoutCourseKeys, trainCourseKeys } from '@/policyEvolution/courses'
import { aggregateFitness } from '@/policyEvolution/es'
import { PolicyPool } from './pool'

const runFile = process.argv[2]
if (!runFile) throw new Error('usage: ship.ts <run.json> [--workers N]')
const wi = process.argv.indexOf('--workers')
const workers = wi > 0 ? Number(process.argv[wi + 1]) : Math.max(1, os.cpus().length - 1)
const run = JSON.parse(fs.readFileSync(runFile, 'utf8')) as { best?: { gen: number; genome: number[] } }
if (!run.best) throw new Error('run file has no best policy yet')
const genome = run.best.genome.map((x) => Math.round(x * 1e5) / 1e5)
const pool = new PolicyPool(workers)
const evaluate = pool.evaluator()
try {
  const [tr, ho] = await Promise.all([evaluate(genome, trainCourseKeys()), evaluate(genome, holdoutCourseKeys())])
  const outcomes = (m: typeof tr) => Object.fromEntries(['finish', 'crash', 'stall', 'flip', 'timeout'].map((o) => [o, m.filter((x) => x.outcome === o).length]))
  const info = {
    source: `${runFile} generation ${run.best.gen} (best mean policy by TRAIN fitness)`,
    train: { fitness: aggregateFitness(tr), meanProgress: tr.reduce((a, m) => a + m.progress, 0) / tr.length, outcomes: outcomes(tr) },
    holdout: { fitness: aggregateFitness(ho), meanProgress: ho.reduce((a, m) => a + m.progress, 0) / ho.length, outcomes: outcomes(ho) },
    genome,
  }
  fs.writeFileSync('src/policyEvolution/shippedPolicy.json', JSON.stringify(info, null, 1) + '\n')
  console.log(JSON.stringify({ ...info, genome: undefined }, null, 2))
} finally {
  await pool.close()
}
