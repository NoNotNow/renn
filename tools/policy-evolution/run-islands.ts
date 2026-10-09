/**
 * Headless policy evolution with islands, random immigrants, neuron-aligned crossover and a field curriculum.
 *
 *   npx tsx tools/policy-evolution/run-islands.ts --gens 600 --workers 4 --out test-results/policy-evolution/islands.json [--resume]
 *
 * Several independent ES centres (islands) learn on the same course batches; every `--epoch` generations they are ranked on fresh
 * courses and the worst MATURE island (age >= `--mature`) is replaced by a crossover of the two best islands (hidden neurons aligned
 * first) or by a new random network (`--p-cross` is the crossover share). The field course difficulty (0 = empty track, 1 = full) rises automatically while the
 * mean policies cover enough of the field route (`--no-curriculum` turns it off). Same start variants / sensor noise as run.ts.
 *
 * Options: --islands N (default 3) --pairs N (antithetic pairs PER island, default 8) --epoch N (25) --mature N (75) --p-cross P (0.5)
 *   --sigma --lr --seed --batch N (18) --train-per-kind N (30) --holdout-per-kind N (20) --workers N --out FILE --resume
 *   --no-variants --no-curriculum --curriculum-start D (0)
 * The best mean policy by TRAIN score (checked at every epoch end) is stored as `best.genome` (same layout as run.ts; ship.ts reads it).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { COURSE_LENGTH, holdoutCourseKeys, parseCourseKey, trainCourseKeys, withVariant } from '@/policyEvolution/courses'
import { applyCurriculum, DEFAULT_CURRICULUM, initialCurriculum, updateCurriculum, type CurriculumState } from '@/policyEvolution/curriculum'
import { aggregateFitness, DEFAULT_ES_CONFIG, type EsConfig } from '@/policyEvolution/es'
import { DEFAULT_ISLANDS, initialIslands, IslandEs, type IslandsConfig, type IslandsState } from '@/policyEvolution/islands'
import { GENOME_LENGTH } from '@/policyEvolution/policy'
import { PolicyPool } from './pool'

function parseArgs(argv: string[]) {
  const o: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      o[a.slice(2)] = next
      i++
    } else o[a.slice(2)] = true
  }
  return o
}
const num = (v: string | true | undefined, d: number) => (v === undefined ? d : Number(v))

interface RunFile {
  schema: 'renn.policy-evolution.islands/1'
  config: EsConfig
  islands: IslandsConfig
  curriculum: CurriculumState | null
  state: IslandsState
  history: Array<Record<string, unknown>>
  best?: { gen: number; island: number; train: number; holdout: number; genome: number[] }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const out = String(args.out ?? 'test-results/policy-evolution/islands.json')
  const gens = num(args.gens, 100)
  const batch = num(args.batch, 18)
  const workers = num(args.workers, Math.max(1, os.cpus().length - 1))
  const train = trainCourseKeys(num(args['train-per-kind'], 30))
  const holdout = holdoutCourseKeys(num(args['holdout-per-kind'], 20))

  let file: RunFile
  if (args.resume && fs.existsSync(out)) file = JSON.parse(fs.readFileSync(out, 'utf8')) as RunFile
  else {
    const config: EsConfig = {
      ...DEFAULT_ES_CONFIG,
      dim: GENOME_LENGTH,
      pairs: num(args.pairs, 8),
      sigma: num(args.sigma, DEFAULT_ES_CONFIG.sigma),
      lr: num(args.lr, DEFAULT_ES_CONFIG.lr),
      seed: num(args.seed, 1),
    }
    const islands: IslandsConfig = {
      islands: num(args.islands, DEFAULT_ISLANDS.islands),
      epoch: num(args.epoch, DEFAULT_ISLANDS.epoch),
      mature: num(args.mature, DEFAULT_ISLANDS.mature),
      pCross: num(args['p-cross'], DEFAULT_ISLANDS.pCross),
    }
    file = {
      schema: 'renn.policy-evolution.islands/1',
      config,
      islands,
      curriculum: args['no-curriculum'] ? null : initialCurriculum({ ...DEFAULT_CURRICULUM, start: num(args['curriculum-start'], DEFAULT_CURRICULUM.start) }),
      state: initialIslands(config, islands),
      history: [],
    }
  }
  const isl = new IslandEs(file.config, file.islands, file.state)
  const pool = new PolicyPool(workers)
  const evaluate = pool.evaluator()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const t0 = Date.now()
  try {
    for (let i = 0; i < gens; i++) {
      const g = isl.state.gen
      let keys = Array.from({ length: Math.min(batch, train.length) }, (_, j) => train[(g * batch + j) % train.length]!)
      if (!args['no-variants']) keys = keys.map((k) => withVariant(k, g + 1))
      if (file.curriculum) keys = applyCurriculum(keys, file.curriculum, g)
      const { reports } = await isl.step(evaluate, keys)
      const entry: Record<string, unknown> = { gen: isl.state.gen, centers: reports.map((r) => Math.round(r.center * 1000) / 1000), difficulty: file.curriculum?.difficulty }
      let line = `gen ${isl.state.gen}  centers [${reports.map((r) => r.center.toFixed(2)).join(' ')}] ages [${isl.state.islands.map((x) => x.age).join(' ')}]`
      if (file.curriculum) {
        const fieldRuns = reports.flatMap((r) => (r.centerMetrics ?? []).filter((m) => parseCourseKey(m.key).kind === 'field'))
        if (fieldRuns.length) file.curriculum = updateCurriculum(file.curriculum, fieldRuns.reduce((a, m) => a + Math.min(1, m.progress / COURSE_LENGTH), 0) / fieldRuns.length)
        line += `  field difficulty ${file.curriculum.difficulty.toFixed(2)} (route fraction ema ${file.curriculum.ema.toFixed(2)})`
      }
      if (isl.isEpochEnd()) {
        // rank the islands on fresh courses at full difficulty, then reproduce
        const rankKeys = Array.from({ length: 36 }, (_, j) => withVariant(train[(g * 36 + j) % train.length]!, 9000 + g))
        const scores = await Promise.all(isl.engines.map(async (e) => aggregateFitness(await evaluate(e.state.theta.slice(), rankKeys))))
        const { best, event } = isl.reproduce(scores)
        const theta = isl.state.islands[best]!.es.theta.slice()
        const [tr, ho] = await Promise.all([evaluate(theta, train), evaluate(theta, holdout)])
        const trainFit = aggregateFitness(tr)
        const holdFit = aggregateFitness(ho)
        const fin = (m: typeof tr) => `${m.filter((x) => x.outcome === 'finish').length}/${m.length}`
        line += `\n  EPOCH scores [${scores.map((s) => s.toFixed(3)).join(' ')}] best island ${best}${event ? `, replaced island ${event.replaced} by ${event.with}` : ''}  | TRAIN ${trainFit.toFixed(3)} (${fin(tr)}) HOLDOUT ${holdFit.toFixed(3)} (${fin(ho)})`
        Object.assign(entry, { scores, best, event, train: trainFit, holdout: holdFit })
        if (!file.best || trainFit > file.best.train) file.best = { gen: isl.state.gen, island: best, train: trainFit, holdout: holdFit, genome: theta }
      }
      file.history.push(entry)
      file.state = isl.state
      fs.writeFileSync(out, JSON.stringify(file))
      console.log(`${line}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
    }
  } finally {
    await pool.close()
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
