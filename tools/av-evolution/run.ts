/**
 * Headless AV maze-escape evolution (node, worker_threads pool).
 *
 *   npx tsx tools/av-evolution/run.ts --gens 20 --pop 16 --workers 9 --out test-results/av-evolution/run.json
 *   npx tsx tools/av-evolution/run.ts --gens 10 --out test-results/av-evolution/run.json --resume   # continue that file
 *
 * Options (all optional):
 *   --gens N            generations to run in THIS invocation (default 5; the first ever one seeds the population)
 *   --pop N             population size (default: core default 16)       [ignored on --resume]
 *   --elite N           elite count (default: core default 4)            [ignored on --resume]
 *   --episodes N        episode BATCH per generation: all candidates are ranked on the same N keys (rotating window over TRAIN) [ignored on --resume]
 *   --batch N           alias of --episodes
 *   --full-top N        best N candidates of each generation are completed on all TRAIN keys (default 2) [ignored on --resume]
 *   --timeout-factor F  episode timeout = clamp(F * baselineExitT(key), --timeout-floor, 120 s); default 1.6 / 25 s
 *   --active FILE|a,b   only mutate these genes (JSON array or {active:[...]} file from sensitivity.ts, or comma list) [ignored on --resume]
 *   --seed-params FILES comma list of params JSON files added as extra seed individuals [ignored on --resume]
 *   --seed N            evolution RNG seed (default 1)                   [ignored on --resume]
 *   --train a,b,c       train episode keys (default: all TRAIN episodes) [ignored on --resume]
 *   --workers N         worker threads (default: cores - 1)
 *   --out FILE          export JSON, schema 'renn.av-evolution/1' (default test-results/av-evolution/run.json); rewritten after every generation
 *   --resume [FILE]     resume from FILE (default: --out) if it exists
 *   --name TEXT         run name
 *   --full              run every episode for the full timeout (no stop-on-reach; parity with the baseline diagnostic)
 *   --example ID        example world holding the AV car (default self_hunt_flexible)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_EVOLUTION_CONFIG, type EvaluateFn, DEFAULT_FITNESS_WEIGHTS, EvolutionEngine, MemoryEvolutionStore, type RunExport, type RunRecord } from '@/avEvolution/core'
import type { Params } from '@/avEvolution/core/genes'
import { AV_GENOME_SPEC, avSpecResumeError } from '@/avEvolution/genes'
import { listMazeEpisodes } from '@/avEvolution/maze/episodes'
import { avStackVersion } from '@/globalPipeline/avStackVersion'
import { computeBaseline, timeoutFor, type TimeoutPolicy } from './baseline'
import { DEFAULT_SOURCE_WORLD_ID, loadSourceWorld } from './loadSource'
import { EpisodePool } from './pool'

function parseArgs(argv: string[]) {
  const o: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`)
    const k = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      o[k] = next
      i++
    } else o[k] = true
  }
  return o
}

const num = (v: string | true | undefined, d: number): number => {
  if (v === undefined) return d
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`not a number: ${String(v)}`)
  return n
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const out = path.resolve(String(args.out ?? 'test-results/av-evolution/run.json'))
  const workers = Math.max(1, Math.floor(num(args.workers, Math.max(1, os.cpus().length - 1))))
  const gens = Math.floor(num(args.gens, 5))
  const exampleId = String(args.example ?? DEFAULT_SOURCE_WORLD_ID)
  const store = new MemoryEvolutionStore()

  let engine: EvolutionEngine
  let run: RunRecord
  const policy: TimeoutPolicy = { factor: num(args['timeout-factor'], 1.6), floor: num(args['timeout-floor'], 25) }
  const pool = new EpisodePool({ workers, exampleId, stopOnReach: !args.full })
  const resumeFile = args.resume === undefined ? undefined : path.resolve(args.resume === true ? out : String(args.resume))
  if (resumeFile && fs.existsSync(resumeFile)) {
    const data = JSON.parse(fs.readFileSync(resumeFile, 'utf8')) as RunExport
    const id = await store.importJSON(data)
    run = (await store.loadRun(id))!
    if (!run.state) throw new Error(`${resumeFile}: export has no resumable engine state`)
    const specErr = avSpecResumeError(run.specVersion)
    if (specErr) throw new Error(`${resumeFile}: ${specErr}`)
    engine = EvolutionEngine.fromJSON(run.state)
    console.log(`resumed ${id} at generation ${engine.gen} (${run.state.evals} episodes so far)`)
  } else {
    if (resumeFile) console.log(`--resume: ${resumeFile} not found, starting a new run`)
    const train = args.train ? String(args.train).split(',') : listMazeEpisodes().train.map((e) => e.key)
    const config = {
      seed: num(args.seed, DEFAULT_EVOLUTION_CONFIG.seed),
      popSize: Math.floor(num(args.pop, DEFAULT_EVOLUTION_CONFIG.popSize)),
      eliteCount: Math.floor(num(args.elite, DEFAULT_EVOLUTION_CONFIG.eliteCount)),
      episodesPerEval: Math.floor(num(args.episodes, DEFAULT_EVOLUTION_CONFIG.episodesPerEval)),
    }
    config.eliteCount = Math.min(config.eliteCount, config.popSize)
    if (args.batch !== undefined) config.episodesPerEval = Math.floor(num(args.batch, config.episodesPerEval))
    const fullTop = args['full-top'] === undefined ? undefined : Math.floor(num(args['full-top'], 2))
    let activeGenes: string[] | undefined
    if (args.active) {
      const a = String(args.active)
      if (fs.existsSync(a)) {
        const j = JSON.parse(fs.readFileSync(a, 'utf8')) as string[] | { active: string[] }
        activeGenes = Array.isArray(j) ? j : j.active
      } else activeGenes = a.split(',')
      const known = new Set(AV_GENOME_SPEC.genes.map((g) => g.key))
      const bad = activeGenes.filter((k) => !known.has(k))
      if (bad.length) throw new Error(`--active: unknown genes ${bad.join(',')}`)
    }
    const seedParams = args['seed-params'] ? String(args['seed-params']).split(',').map((f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) as Params) : undefined
    console.log(`baseline (default params, ${train.length} train episodes)...`)
    const baseline = await computeBaseline(pool, train, { ...DEFAULT_FITNESS_WEIGHTS })
    console.log(`baseline mean exit ${(train.reduce((s, k) => s + baseline[k]!.exitT, 0) / train.length).toFixed(1)} s`)
    engine = new EvolutionEngine({ spec: AV_GENOME_SPEC, trainKeys: train, baseline, seedParams, config: { ...config, ...(fullTop === undefined ? {} : { fullEvalTop: fullTop }), ...(activeGenes ? { activeGenes } : {}) } })
    const now = Date.now()
    run = {
      runId: `run-${now.toString(36)}`,
      name: args.name ? String(args.name) : undefined,
      createdAt: now,
      updatedAt: now,
      specVersion: AV_GENOME_SPEC.specVersion,
      stackVersion: avStackVersion(loadSourceWorld(exampleId)),
      weights: engine.weights,
      config: engine.config,
      spec: AV_GENOME_SPEC,
      trainKeys: engine.trainKeys,
    }
    await store.saveRun(run)
  }

  const baselineMap = engine.getBaseline()
  const evaluate: EvaluateFn = (params, keys) => Promise.all(keys.map((k) => pool.episode(params, k, timeoutFor(baselineMap, k, policy))))
  const t0 = Date.now()
  const startEvals = engine.toJSON().evals
  console.log(`run ${run.runId}: pop ${engine.config.popSize}, train [${engine.trainKeys.join(',')}], ${AV_GENOME_SPEC.genes.length} genes, ${workers} workers, ${gens} generation(s) -> ${out}`)
  const write = async () => {
    const dir = path.dirname(out)
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${out}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(await store.exportJSON(run.runId)))
    fs.renameSync(tmp, out)
  }
  try {
    for (let i = 0; i < gens; i++) {
      const st = await engine.step(evaluate, { concurrency: workers * 2 })
      await store.saveCandidates(run, [...engine.getPopulation(), ...engine.getHallOfFame()])
      await store.saveGeneration({ runId: run.runId, gen: st.gen, stats: st, createdAt: Date.now() })
      run = { ...run, updatedAt: Date.now(), state: engine.toJSON() }
      await store.saveRun(run)
      await write()
      console.log(`gen ${String(st.gen).padStart(3)}  best ${st.best.toFixed(2)}  mean ${st.mean.toFixed(2)}  median ${st.median.toFixed(2)}  sigma ${st.sigmaMean.toFixed(3)}  evals ${st.evals}  ${(st.wallMs / 1000).toFixed(1)}s  best=${st.bestId}`)
    }
  } finally {
    await pool.close()
  }
  const wallS = (Date.now() - t0) / 1000
  const evals = engine.toJSON().evals - startEvals
  console.log(`done: ${evals} episodes in ${wallS.toFixed(1)}s = ${(evals / Math.max(1e-9, wallS)).toFixed(2)} episodes/s; wrote ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
