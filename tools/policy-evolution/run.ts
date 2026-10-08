/**
 * Headless policy evolution (node, worker_threads pool): a small neural driving policy evolved with an evolution strategy.
 *
 *   npx tsx tools/policy-evolution/run.ts --gens 100 --pairs 24 --workers 8 --out test-results/policy-evolution/run.json
 *   npx tsx tools/policy-evolution/run.ts --gens 50 --out test-results/policy-evolution/run.json --resume
 *
 * Options: --train-per-kind N / --holdout-per-kind N (courses per kind, default 6) --gens N (this invocation, default 20) --pairs N (antithetic pairs, default 24) --sigma S --lr L --seed N
 *   --batch N (train courses per generation, a rotating window; default 6) --eval-every N (full TRAIN + HOLDOUT report of the
 *   mean policy, default 5) --workers N --seconds S (episode time limit) --out FILE --resume
 * The best mean policy by TRAIN score is kept in the output file (`best.genome`); HOLDOUT is reported, never selected on.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { holdoutCourseKeys, trainCourseKeys } from '@/policyEvolution/courses'
import { aggregateFitness, DEFAULT_ES_CONFIG, PolicyEs, type EsConfig, type EsState, type GenerationReport } from '@/policyEvolution/es'
import { GENOME_LENGTH, N_OUT } from '@/policyEvolution/policy'
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
  schema: 'renn.policy-evolution/1'
  config: EsConfig
  state: EsState
  history: Array<GenerationReport & { train?: number; holdout?: number }>
  best?: { gen: number; train: number; holdout: number; genome: number[] }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const out = String(args.out ?? 'test-results/policy-evolution/run.json')
  const gens = num(args.gens, 20)
  const batch = num(args.batch, 6)
  const evalEvery = num(args['eval-every'], 5)
  const workers = num(args.workers, Math.max(1, os.cpus().length - 1))
  const train = trainCourseKeys(num(args['train-per-kind'], 6))
  const holdout = holdoutCourseKeys(num(args['holdout-per-kind'], 6))

  let file: RunFile
  if (args.resume && fs.existsSync(out)) file = JSON.parse(fs.readFileSync(out, 'utf8')) as RunFile
  else {
    const config: EsConfig = {
      ...DEFAULT_ES_CONFIG,
      dim: GENOME_LENGTH,
      pairs: num(args.pairs, DEFAULT_ES_CONFIG.pairs),
      sigma: num(args.sigma, DEFAULT_ES_CONFIG.sigma),
      lr: num(args.lr, DEFAULT_ES_CONFIG.lr),
      seed: num(args.seed, DEFAULT_ES_CONFIG.seed),
    }
    const state = new PolicyEs(config).state
    // start prior: a positive speed-target bias so random policies at least roll forward (zero fitness everywhere gives no gradient)
    state.theta[GENOME_LENGTH - N_OUT + 1] = 0.5
    file = { schema: 'renn.policy-evolution/1', config, state, history: [] }
  }
  const es = new PolicyEs(file.config, file.state)
  const pool = new PolicyPool(workers, args.seconds ? Number(args.seconds) : undefined)
  const evaluate = pool.evaluator()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const t0 = Date.now()
  try {
    for (let i = 0; i < gens; i++) {
      const g = es.state.gen
      const keys = Array.from({ length: Math.min(batch, train.length) }, (_, j) => train[(g * batch + j) % train.length]!)
      const rep: RunFile['history'][number] = await es.step(evaluate, keys)
      let line = `gen ${rep.gen}  batch best ${rep.best.toFixed(3)} mean ${rep.mean.toFixed(3)} center ${rep.center.toFixed(3)}`
      if (rep.gen % evalEvery === 0) {
        const theta = es.state.theta.slice()
        const [tr, ho] = await Promise.all([evaluate(theta, train), evaluate(theta, holdout)])
        rep.train = aggregateFitness(tr)
        rep.holdout = aggregateFitness(ho)
        const reach = (m: typeof tr) => `finished ${m.filter((x) => x.outcome === 'finish').length}/${m.length}, mean ${(m.reduce((a, x) => a + x.progress, 0) / m.length).toFixed(0)} m`
        line += `  | TRAIN ${rep.train.toFixed(3)} HOLDOUT ${rep.holdout.toFixed(3)}  train: ${reach(tr)}; holdout: ${reach(ho)}`
        if (!file.best || rep.train > file.best.train) file.best = { gen: rep.gen, train: rep.train, holdout: rep.holdout, genome: theta }
      }
      file.history.push(rep)
      file.state = es.state
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
