/**
 * Maze-profile evolution runner (plain tsx; no vitest).
 *
 *   npx tsx tools/hunt-profile-evo/run.ts --out test-results/hunt-profile-evo/run1 --gens 20 --pop 12 --workers 5
 *
 * Evolves the AV binding's `mazeProfile` (per-key on/off + value) and `mazeProfileHold` for the self_hunt_flexible AV car.
 * Fitness (minimise) = weighted harness result on the TRAIN starts (solo, flee, flee-real); hard constraint = proxy of the real
 * maze/evasion/keep-right test rows at both budgets (sentinel tier first, full 22-case set for candidates that beat the elite cut).
 * Resume: rerun with the same --out (and --gens as the new TOTAL generation target). Finished tasks are never recomputed.
 * Long runs: perl -e 'alarm shift; exec @ARGV' <seconds> npx tsx tools/hunt-profile-evo/run.ts ...   (SIGTERM flushes and exits 143)
 *
 * Options:
 *   --out DIR          out dir (default test-results/hunt-profile-evo/run)    --gens N    total generations after the seed generation (default 10)
 *   --pop N            population / offspring per generation (default 12)    --elite N   elite count defining the proxy cut (default 3)
 *   --seed N           rng seed (default 1)                                    --workers N worker threads, max 5 (default 5)
 *   --seconds N        sim cap per harness episode (default 120)               --world ID  example world (default self_hunt_flexible)
 *   --mazes A,B,..     train mazes (default all)    --starts N   first N starts per maze (default 3)    --scenarios solo,flee,flee-real
 *   --seeds a,b,..     seed profiles besides base: seed name (tools/hunt-profile-evo/seeds), json path or best:<dir>[:rank] (default S8,P1,LMnoC)
 *   --weights JSON     partial override of the fitness weights (see fitness.ts DEFAULT_WEIGHTS), e.g. '{"hit":5,"scen":{"solo":0.2}}'
 *   --cut-slack X      full proxy when fitness <= cut * X (default 1.0)        --cross P   crossover probability (default 0.5)
 *   --help
 * Out dir: checkpoint.json, candidates.jsonl (genome, profile, per-scenario metrics, proxy result per case, feasible flag, timings),
 *          tasks.jsonl (task cache), progress.json (gen, best feasible fitness, feasible rate, evals, wall, ETA), best.json (feasible only).
 */
import { Evolution } from './evolve'
import { parseArgs, resolveProfile, specSet, DEFAULT_KINDS } from './common'
import { DEFAULT_WEIGHTS, type FitWeights } from './fitness'
import { assertKeysValid } from './genome'
import { TaskPool } from './pool'
import { files } from './store'
import type { Kind } from '../hunt-maze/episode'
import fs from 'node:fs'

async function main() {
  const rawArgs = process.argv.slice(2)
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    const src = fs.readFileSync(new URL(import.meta.url), 'utf8')
    console.log(src.slice(src.indexOf('/**') + 4, src.indexOf('*/')).replace(/^ \* ?/gm, ''))
    return
  }
  const A = parseArgs(rawArgs)
  const one = (k: string, d: string) => A[k]?.[0] ?? d
  assertKeysValid()
  const outDir = one('out', 'test-results/hunt-profile-evo/run')
  const kinds = one('scenarios', DEFAULT_KINDS.join(',')).split(',') as Kind[]
  const over = A.weights ? (JSON.parse(one('weights', '{}')) as Partial<FitWeights>) : {}
  const weights: FitWeights = { ...DEFAULT_WEIGHTS, ...over, scen: { ...DEFAULT_WEIGHTS.scen, ...(over.scen ?? {}) } }
  const specs = specSet({ world: A.world?.[0], kinds, mazes: A.mazes ? one('mazes', '').split(',') : undefined, starts: Number(one('starts', '3')) })
  const seeds = one('seeds', 'S8,P1,LMnoC').split(',').filter(Boolean).map((s) => resolveProfile(s))
  fs.mkdirSync(outDir, { recursive: true })
  const pool = new TaskPool(Number(one('workers', '5')), files(outDir).tasks)
  const evo = new Evolution(
    {
      outDir, popSize: Number(one('pop', '12')), eliteCount: Number(one('elite', '3')), gens: Number(one('gens', '10')), seed: Number(one('seed', '1')),
      seconds: Number(one('seconds', '120')), specs, world: A.world?.[0], weights, cutSlack: Number(one('cut-slack', '1')), crossP: Number(one('cross', '0.5')), seeds,
    },
    pool,
  )
  const bye = (code: number) => { evo.stop(); evo.progress(); void pool.close().finally(() => process.exit(code)) }
  process.on('SIGTERM', () => { console.error('SIGTERM: checkpoint is current, exiting'); bye(143) })
  process.on('SIGINT', () => { console.error('SIGINT: checkpoint is current, exiting'); bye(130) })
  try {
    await evo.run()
    console.log(`done. computed ${pool.stats.computed} tasks (${pool.stats.cached} served from cache), best.json written`)
  } finally {
    await pool.close()
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
