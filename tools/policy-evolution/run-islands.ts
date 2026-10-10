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
 * v2 (command chains, see agent-context/spec-command-chains.md): `--v2` evolves the 24-input policy on CHAIN episodes `<setupKey>#<i>`; `--batch` is then the
 * number of SETUPS per generation (all their chains are driven), fitness is the evenness aggregate, the field difficulty is capped at
 * CHAIN_FIELD_DIFFICULTY. `--warm FILE` starts every island centre from a genome file ({genome} like shippedPolicy.json, or a run file with best.genome;
 * a v1 genome is padded to v2). `--kinds field,slalom,maze,crowd` restricts the setup kinds (also in v1 mode, where crowd does not exist).
 *   npx tsx tools/policy-evolution/run-islands.ts --v2 --warm src/policyEvolution/shippedPolicy.json --gens 600 --workers 4 --out test-results/policy-evolution/v2.json
 *
 * `--hidden N` (v2 only): hidden units (default 10). With --warm the warm genome is widened to N (new units: zero outgoing weights, small random incoming ones,
 * function unchanged); without --warm the networks start random with N. Fresh immigrants / crossover use the run's N.
 *
 * Options: --islands N (default 3) --pairs N (antithetic pairs PER island, default 8) --epoch N (25) --mature N (75) --p-cross P (0.5)
 *   --sigma --lr --seed --batch N (18) --train-per-kind N (30) --holdout-per-kind N (20) --workers N --out FILE --resume
 *   --no-variants --no-curriculum --curriculum-start D (0)
 * The best mean policy by TRAIN score (checked at every epoch end) is stored as `best.genome` (same layout as run.ts; ship.ts reads it).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { capFieldDifficulty, chainEpisodeKeys, CHAIN_FIELD_DIFFICULTY, flattenChainKeys, holdoutChainEpisodes, trainChainEpisodes, type SetupChains } from '@/policyEvolution/chains'
import { chainReportByKind, formatChainReport, parseKinds, v2GenomeFromFile } from '@/policyEvolution/chainReport'
import { CHAIN_KINDS, COURSE_KINDS, COURSE_LENGTH, holdoutCourseKeys, parseCourseKey, trainCourseKeys, withVariant } from '@/policyEvolution/courses'
import { parseChainEpisodeKey } from '@/policyEvolution/chains'
import { applyCurriculum, DEFAULT_CURRICULUM, initialCurriculum, updateCurriculum, type CurriculumState } from '@/policyEvolution/curriculum'
import { aggregateEvenness, aggregateFitness, DEFAULT_ES_CONFIG, type EsConfig, type FitnessFn } from '@/policyEvolution/es'
import { DEFAULT_ISLANDS, initialIslands, IslandEs, type IslandsConfig, type IslandsState } from '@/policyEvolution/islands'
import { createRng } from '@/avEvolution/core/rng'
import { GENOME_LENGTH, genomeLengthV2, hiddenOfLength, N_HIDDEN, N_IN_V2, widenHidden } from '@/policyEvolution/policy'
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
  /** command-chain run (24 inputs, chain episodes, evenness fitness) */
  v2?: boolean
  config: EsConfig
  islands: IslandsConfig
  curriculum: CurriculumState | null
  state: IslandsState
  history: Array<Record<string, unknown>>
  best?: { gen: number; island: number; train: number; holdout: number; genome: number[] }
}

/** Setup groups of one v2 generation: a rotating window of the TRAIN setups, a start variant per generation, the field curriculum; setups that lose their chains keep the canonical key. */
function setupBatch(train: SetupChains[], batch: number, g: number, variant: number | null, curriculum: CurriculumState | null): SetupChains[] {
  const picked = Array.from({ length: Math.min(batch, train.length) }, (_, j) => train[(g * batch + j) % train.length]!)
  const withCurriculum = (k: string) => (curriculum && !(parseCourseKey(k).kind === 'field' && curriculum.difficulty >= CHAIN_FIELD_DIFFICULTY) ? applyCurriculum([k], curriculum, g)[0]! : k)
  return picked.map((grp, j) => {
    let key = grp.setupKey
    if (variant !== null) key = withVariant(key, variant)
    key = capFieldDifficulty(withCurriculum(key))
    const keys = chainEpisodeKeys(key)
    return keys.length >= 2 ? { setupKey: key, keys } : { ...grp, setupKey: grp.setupKey, keys: grp.keys.length ? grp.keys : picked[(j + 1) % picked.length]!.keys }
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const out = String(args.out ?? 'test-results/policy-evolution/islands.json')
  const gens = num(args.gens, 100)
  const batch = num(args.batch, 18)
  const workers = num(args.workers, Math.max(1, os.cpus().length - 1))
  let file: RunFile
  const resumed = !!args.resume && fs.existsSync(out)
  if (resumed) file = JSON.parse(fs.readFileSync(out, 'utf8')) as RunFile
  const v2 = resumed ? !!file!.v2 : !!args.v2
  const kinds = parseKinds(args.kinds, v2 ? CHAIN_KINDS : COURSE_KINDS)
  let warm = args.warm ? v2GenomeFromFile(JSON.parse(fs.readFileSync(String(args.warm), 'utf8'))) : undefined
  if (warm && !v2) throw new Error('--warm needs --v2')
  if (args.hidden !== undefined && !v2) throw new Error('--hidden needs --v2')
  const hiddenArg = args.hidden === undefined ? undefined : Number(args.hidden)
  if (hiddenArg !== undefined && (!Number.isInteger(hiddenArg) || hiddenArg < 1)) throw new Error(`--hidden must be a positive integer, got ${String(args.hidden)}`)
  // --hidden N with --warm: the warm genome (v1 padded) is widened to N, function preserved; N below the warm size is refused
  if (warm && hiddenArg !== undefined && !resumed) {
    const h0 = hiddenOfLength(warm.length, N_IN_V2)
    if (hiddenArg < h0) throw new Error(`--hidden ${hiddenArg} is smaller than the warm genome's ${h0} hidden units`)
    if (hiddenArg > h0) warm = widenHidden(warm, hiddenArg, createRng(num(args.seed, 1) * 31 + 7))
    console.log(`warm start: hidden ${h0} -> ${hiddenArg}`)
  }
  const trainGroups = v2 ? trainChainEpisodes(num(args['train-per-kind'], 8), kinds) : []
  const holdoutGroups = v2 ? holdoutChainEpisodes(num(args['holdout-per-kind'], 5), kinds) : []
  const train = v2 ? flattenChainKeys(trainGroups) : trainCourseKeys(num(args['train-per-kind'], 30), kinds)
  const holdout = v2 ? flattenChainKeys(holdoutGroups) : holdoutCourseKeys(num(args['holdout-per-kind'], 20), kinds)
  const fitness: FitnessFn = v2 ? aggregateEvenness : aggregateFitness

  if (!resumed) {
    const config: EsConfig = {
      ...DEFAULT_ES_CONFIG,
      dim: v2 ? genomeLengthV2(warm ? hiddenOfLength(warm.length, N_IN_V2) : (hiddenArg ?? N_HIDDEN)) : GENOME_LENGTH,
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
      v2,
      curriculum: args['no-curriculum'] ? null : initialCurriculum({ ...DEFAULT_CURRICULUM, start: num(args['curriculum-start'], DEFAULT_CURRICULUM.start) }),
      state: initialIslands(config, islands, warm),
      history: [],
    }
  }
  const isl = new IslandEs(file!.config, file!.islands, file!.state, fitness)
  const pool = new PolicyPool(workers)
  const evaluate = pool.evaluator()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const t0 = Date.now()
  try {
    for (let i = 0; i < gens; i++) {
      const g = isl.state.gen
      let keys: string[]
      if (v2) keys = flattenChainKeys(setupBatch(trainGroups, num(args.batch, 6), g, args['no-variants'] ? null : g + 1, file.curriculum))
      else {
        keys = Array.from({ length: Math.min(batch, train.length) }, (_, j) => train[(g * batch + j) % train.length]!)
        if (!args['no-variants']) keys = keys.map((k) => withVariant(k, g + 1))
        if (file.curriculum) keys = applyCurriculum(keys, file.curriculum, g)
      }
      const { reports } = await isl.step(evaluate, keys)
      const entry: Record<string, unknown> = { gen: isl.state.gen, centers: reports.map((r) => Math.round(r.center * 1000) / 1000), difficulty: file.curriculum?.difficulty }
      let line = `gen ${isl.state.gen}  centers [${reports.map((r) => r.center.toFixed(2)).join(' ')}] ages [${isl.state.islands.map((x) => x.age).join(' ')}]`
      if (file.curriculum) {
        const fieldRuns = reports.flatMap((r) => (r.centerMetrics ?? []).filter((m) => parseCourseKey(parseChainEpisodeKey(m.key).setupKey).kind === 'field'))
        if (fieldRuns.length) file.curriculum = updateCurriculum(file.curriculum, fieldRuns.reduce((a, m) => a + Math.min(1, m.progress / (m.length ?? COURSE_LENGTH)), 0) / fieldRuns.length)
        line += `  field difficulty ${file.curriculum.difficulty.toFixed(2)} (route fraction ema ${file.curriculum.ema.toFixed(2)})`
      }
      if (isl.isEpochEnd()) {
        // rank the islands on fresh courses at full difficulty, then reproduce
        const rankKeys = v2
          ? flattenChainKeys(setupBatch(trainGroups, num(args['rank-setups'], 12), g, 9000 + g, null))
          : Array.from({ length: 36 }, (_, j) => withVariant(train[(g * 36 + j) % train.length]!, 9000 + g))
        const scores = await Promise.all(isl.engines.map(async (e) => fitness(await evaluate(e.state.theta.slice(), rankKeys))))
        const { best, event } = isl.reproduce(scores)
        const theta = isl.state.islands[best]!.es.theta.slice()
        const [tr, ho] = await Promise.all([evaluate(theta, train), evaluate(theta, holdout)])
        const trainFit = fitness(tr)
        const holdFit = fitness(ho)
        const fin = (m: typeof tr) => `${m.filter((x) => x.outcome === 'finish').length}/${m.length}`
        line += `\n  EPOCH scores [${scores.map((s) => s.toFixed(3)).join(' ')}] best island ${best}${event ? `, replaced island ${event.replaced} by ${event.with}` : ''}  | TRAIN ${trainFit.toFixed(3)} (${fin(tr)}) HOLDOUT ${holdFit.toFixed(3)} (${fin(ho)})`
        if (v2) line += `\n  HOLDOUT per kind: ${formatChainReport(chainReportByKind(ho, kinds))}`
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
