/**
 * Headless policy evolution for the "schlau" car (2026-10-21): a SECOND, independently trained driving policy with its
 * OWN input layout (schlauPolicy.ts: 14 raycasts over the full 360 deg, the forward speed, 4 movement vectors of the
 * traveled distance a 20 m and the goal vector; 26 inputs, len = 29 H + 2) on START -> GOAL tasks only (schlauCourses.ts:
 * `goal_open` free ground, `goal_box` a fenced arena with obstacles — no waypoint chains, no carrots).
 *
 *   npm run policy:schlau -- --gens 600 --workers 4 --out test-results/policy-evolution/schlau.json [--resume]
 *   npx tsx tools/policy-evolution/run-schlau.ts --gens 600 --workers 4 --out test-results/policy-evolution/schlau.json
 *
 * Same islands model as run-islands.ts (v3 path): several independent ES centres (islands) learn on the same stratified
 * batches; every `--epoch` generations they are ranked on fresh tasks and the worst MATURE island (age >= `--mature`) is
 * replaced by a crossover of the two best islands (hidden neurons aligned first) or by a new random network (`--p-cross`
 * is the crossover share). Fitness = weakest link (MIN over all episode values of the batch, es.ts aggregateKindMin);
 * the rank order is the LEXICOGRAPHIC episode-value vector (episodeValues) — one immediate stall saturates the scalar
 * min to 0 and would make all early candidates indistinguishable, the vector keeps the gradient (the second-worst run
 * breaks the tie). State (incl. the stage) is saved every generation, `--resume` continues.
 *
 * SHAPE COLLISION: schlau genomes have the SAME length formula as v3 (len = 29 H + 2, 26 inputs) but a DIFFERENT layout.
 * The run file and the agent exports therefore ALWAYS carry `policy: 'schlau'` (plus `hidden`), and a resume refuses any
 * file whose policy is not 'schlau'. Never ship a schlau genome into a v3 world or a v3 genome into a schlau world (the
 * v3 stage would read the movement vectors as touch flags and vice versa; ensureV3Inputs is NEVER applied to schlau
 * genomes — the shape check is hiddenOfSchlau).
 *
 * Stage curriculum (2 kinds: goal_open -> goal_box): the run starts on `goal_open` only; `goal_box` joins when the EMA of
 * the goal_open finish rate reaches 0.7 (share 0 -> 1 in steps of 0.25, at least 6 generations between steps;
 * `--no-stage` = both kinds from the start, stage: null). Batches are STRATIFIED: `--batch N` = tasks PER ACTIVE KIND per
 * generation (default 1), a rotating window over the kind's train keys, rewritten to a start variant per generation
 * (`--no-variants` = canonical starts only).
 *
 * `--kinds a,b,c` (CREATION only, persisted like speedCap): the run's kind band — validated, deduped, canonical
 * SCHLAU_KINDS order. Default = the base band `goal_open,goal_box`, so the shared base run never mixes `goal_wall`
 * into its batch and stays comparable with the dedicated wall runs (Auftrag C: the WF lesson — a 0-finish blockade
 * kind poisons the weakest-link min fitness, so `goal_wall` trains in DEDICATED runs: `--kinds goal_wall`). A
 * single-kind band (or any band without `goal_open`) forces the stage curriculum OFF (the stage is a goal_open ->
 * rest ramp); a plain `--resume` continues the stored kinds and rejects the flag (like --hidden).
 *
 * `--hidden N` (default 10): hidden units of this run's genomes — small to start, widened later (see the widen-freeze
 * recipe below). `--warm FILE` starts every island centre from a genome file ({ genome } like a shipped policy, or
 * { best: { genome } } of a run file; shape checked with hiddenOfSchlau). `--warm` + `--hidden N` > warm H widens the warm
 * genome to N (new units: zero outgoing weights, small random incoming ones, function unchanged). `--freeze-old`
 * (creation only, needs --warm + a widening --hidden): freezes everything the warm function lives in (freezeOldMask) and
 * evolves ONLY the new units — phase 1; `--resume --unfreeze` clears the mask (phase 2, all dims evolve again).
 * Widen-freeze recipe:
 *   npx tsx tools/policy-evolution/run-schlau.ts --warm <run.json> --hidden 24 --freeze-old --gens 300 --out test-results/policy-evolution/schlau-widen.json
 *   npx tsx tools/policy-evolution/run-schlau.ts --resume --unfreeze --gens 300 --out test-results/policy-evolution/schlau-widen.json
 *
 * Options: --gens N (100) --pairs N (antithetic pairs PER island, 8) --workers N (cpus-1)
 *   --out FILE (test-results/policy-evolution/schlau.json) --seed N (1) --islands N (3) --epoch N (25) --mature N (75)
 *   --p-cross P (0.5) --hidden N (10, creation only) --warm FILE --freeze-old --unfreeze --resume
 *   --kinds a,b,c (creation only, default goal_open,goal_box) --train-per-kind N (per-kind default: open 3, box/wall 16) --holdout-per-kind N (8) --batch N (1)
 *   --fit min|mean (creation only, persisted; default min — 'mean' is the dense-gradient aggregate for the dedicated
 *   goal_wall runs: with every candidate at 0 finishes the MIN is flat 0 and the ES has no gradient, the MEAN
 *   differentiates partial progress toward the gate; the island ranking stays the ascending lex vector either way)
 *   --no-stage --no-variants --speed-cap M (creation only, persisted) --sigma --lr --stats-every N (20) --latest-best FILE --latest-stats FILE
 *
 * The best policy by TRAIN FINISH COUNT (the ascending lex train vector as the tie-break, beatsBestSchlau —
 * checked at every epoch end) is stored as `best.genome` (critique 2026-10-23 §0: the pure lex order stored a
 * 0-finish creeper over the driving island). Agent exports (next to
 * --out): latest-best.json on every best change + resume (policy: 'schlau', hidden, the genome), and latest-stats.json
 * every --stats-every gens (default 20) + every epoch end + resume (adds the stage share/ema while staging is on).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { createRng } from '@/avEvolution/core/rng'
import type { PolicyEpisodeMetrics } from '@/policyEvolution/episode'
import { initialStage, stageBatch, updateStage, type StageConfig, type StageState } from '@/policyEvolution/curriculum'
import { aggregateKindMin, DEFAULT_ES_CONFIG, episodeValues, type EsConfig, type EvaluateGenome, type FitnessFn, type FitnessVecFn } from '@/policyEvolution/es'
import { DEFAULT_ISLANDS, initialIslands, IslandEs, sigmaBoost, type IslandsConfig, type IslandsState } from '@/policyEvolution/islands'
import { freezeOldMask, widenHidden } from '@/policyEvolution/policy'
import { beatsBestSchlau } from '@/policyEvolution/schlauCheckpoint'
import { genomeLengthSchlau, hiddenOfSchlau, N_IN_SCHLAU } from '@/policyEvolution/schlauPolicy'
import { parseSchlauKey, parseSchlauKinds, schlauHoldoutKeys, schlauKindsCanStage, schlauKey, schlauTrainKeys, type SchlauKind } from '@/policyEvolution/schlauCourses'
import type { SchlauWorkerJob } from './worker-schlau'

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
  schema: 'renn.policy-evolution.schlau/1'
  /** IMMER 'schlau' — schlau-Genomes sind längen-identisch zu v3 (29 H + 2); der Policy-Tag ist die einzige Unterscheidung. */
  policy: 'schlau'
  /** hidden size of this run's genomes (persisted so --resume is exact) */
  hidden: number
  /** stage curriculum (null = beide kinds ab Start, --no-stage) */
  stage?: StageState | null
  /** the run's kind band (creation-only --kinds, persisted; absent = die Basis-Band goal_open,goal_box) */
  kinds?: SchlauKind[]
  /** the ES scalar fitness aggregate (creation-only --fit, persisted; absent = 'min' — the weakest-link design) */
  fit?: 'min' | 'mean'
  /** opt-in training speed cap (m/s), persisted so --resume keeps it; absent = uncapped */
  speedCap?: number
  config: EsConfig
  islands: IslandsConfig
  state: IslandsState
  history: Array<Record<string, unknown>>
  /** TRAIN finishes of the best candidate (critique 2026-10-23 §0: FINISH COUNT is the primary checkpoint key, the lex vector only ties); absent in legacy files = the 0-finish creeper */
  best?: { gen: number; island: number; train: number; holdout: number; trainFinishes?: number; genome: number[]; trainVec?: number[]; holdoutVec?: number[] }
}

/** Stage-Curriculum der schlau-kinds: share 0 = nur `goal_open`, share max = alle kinds des Runs; Tor: EMA der goal_open-Finish-Rate >= 0.7. */
const SCHLAU_STAGE: StageConfig = { start: 0, step: 0.25, max: 1, threshold: 0.7, alpha: 0.3, minSteps: 6 }

/** die Basis-Band: der Default von --kinds (Basis-Run bleibt vergleichbar, goal_wall mischt NIE unbemerkt hinein) */
const SCHLAU_BASE_KINDS: SchlauKind[] = ['goal_open', 'goal_box']

/** aktive kinds bei dieser share (activeKinds aus curriculum.ts ist v3-spezifisch — NICHT verwenden): unter der Schwelle nur `goal_open`, ab share max die kinds DIESES Runs */
const schlauActiveKinds = (share: number, kinds: readonly SchlauKind[]): SchlauKind[] =>
  share >= SCHLAU_STAGE.max - 1e-9 ? [...kinds] : ['goal_open']

/** Liest ein Genome aus `--warm FILE`: { genome } oder { best: { genome } } (wie v2GenomeFromFile, ohne v2-Padding). Shape-Prüfung via hiddenOfSchlau — NICHT ensureV3Inputs (die Längenformel kollidiert mit v3; der Layout-Unterschied ist der Policy-Tag). */
function readWarmGenome(file: string): number[] {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { genome?: number[]; best?: { genome?: number[] } }
  const g = doc.genome ?? doc.best?.genome
  if (!g || !g.every((x) => typeof x === 'number')) throw new Error(`--warm ${file}: no genome (expected { genome } or { best: { genome } })`)
  if (hiddenOfSchlau(g.length) < 1)
    throw new Error(`--warm ${file}: genome of ${g.length} numbers has no integer hidden size for schlau (${N_IN_SCHLAU} inputs, len = 29 H + 2)`)
  return g
}

// --- worker pool -----------------------------------------------------------------------------------------------------------------

interface Pending {
  job: SchlauWorkerJob
  resolve: (m: PolicyEpisodeMetrics) => void
  reject: (e: Error) => void
}

/* Node-only worker_threads pool für schlau: eine Episode pro Worker zur Zeit, Jobs reihen sich ein (Copy von PolicyPool, boot URL ./worker-boot-schlau.mjs, Job ohne seconds/shaping). */
class SchlauPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: Pending[] = []
  private running = new Map<Worker, Pending>()
  private nextId = 1
  private ready: Promise<void>

  constructor(n: number) {
    const url = new URL('./worker-boot-schlau.mjs', import.meta.url)
    const boots: Promise<void>[] = []
    for (let i = 0; i < n; i++) {
      const w = new Worker(url)
      this.workers.push(w)
      boots.push(
        new Promise<void>((resolve, reject) => {
          w.once('error', reject)
          w.on('message', (msg: { ready?: boolean; metrics?: PolicyEpisodeMetrics; error?: string }) => {
            if (msg.ready) {
              this.idle.push(w)
              resolve()
              return
            }
            const p = this.running.get(w)
            this.running.delete(w)
            this.idle.push(w)
            if (p) {
              if (msg.error) p.reject(new Error(msg.error))
              else p.resolve(msg.metrics!)
            }
            this.pump()
          })
        }),
      )
    }
    this.ready = Promise.all(boots).then(() => this.pump())
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift()!
      const p = this.queue.shift()!
      this.running.set(w, p)
      w.postMessage(p.job)
    }
  }

  episode(genome: number[], key: string): Promise<PolicyEpisodeMetrics> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job: { id: this.nextId++, genome, key }, resolve, reject })
      void this.ready.then(() => this.pump())
    })
  }

  evaluator(): EvaluateGenome {
    return (genome, keys) => Promise.all(keys.map((k) => this.episode(genome, k)))
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()))
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const out = String(args.out ?? 'test-results/policy-evolution/schlau.json')
  const gens = num(args.gens, 100)
  const workers = num(args.workers, Math.max(1, os.cpus().length - 1))
  // definite-assignment assertion: das Resume-if und das Creation-if weisen `file` auf ALLEN Pfaden zu, TS sieht die
  // Korrelation der komplementären Bedingungen (resumed / !resumed) nicht (CFA-Lücke, siehe run-islands.ts)
  let file!: RunFile
  const resumed = !!args.resume && fs.existsSync(out)
  if (resumed) file = JSON.parse(fs.readFileSync(out, 'utf8')) as RunFile
  // schlau-Genomes sind längen-identisch zu v3 — der Policy-Tag im Run-File ist die einzige Unterscheidung; ein v3-Run darf niemals als schlau fortgesetzt werden (und umgekehrt)
  if (resumed && file!.policy !== 'schlau')
    throw new Error(`--resume ${out}: policy is ${JSON.stringify(file!.policy) ?? 'absent'}, not 'schlau' (schlau and v3 genomes share the 29 H + 2 length formula — never mix them)`)
  const hiddenArg = args.hidden === undefined ? undefined : Number(args.hidden)
  if (hiddenArg !== undefined && (!Number.isInteger(hiddenArg) || hiddenArg < 1)) throw new Error(`--hidden must be a positive integer, got ${String(args.hidden)}`)
  // --hidden ist creation-only: das Run-File trägt hidden (und config.dim), ein Resume setzt es exakt fort
  if (resumed && hiddenArg !== undefined) throw new Error(`--hidden is a creation flag (the run file stores hidden: ${file!.hidden}; a resume continues it)`)
  // --kinds a,b,c (creation only, PERSISTED wie speedCap): die Kind-Band dieses Runs. Default = die Basis-Band
  // (goal_open,goal_box) — der Basis-Run mischt goal_wall NIE unbemerkt in seinen Batch; die Wall-Runs (Auftrag C)
  // sind DEDIZIERT (--kinds goal_wall), weil eine 0-finish-Blockade-Kind die MIN-Fitness vergiftet (WF-Lektion).
  if (resumed && args.kinds !== undefined)
    throw new Error(`--kinds is a creation flag (the run file stores kinds: ${(file!.kinds ?? SCHLAU_BASE_KINDS).join(',')}; a plain --resume continues them)`)
  if (args.kinds === true) throw new Error('--kinds needs a comma list of schlau kinds (e.g. --kinds goal_wall)')
  const kinds: SchlauKind[] = resumed ? file!.kinds ?? SCHLAU_BASE_KINDS : args.kinds !== undefined ? parseSchlauKinds(String(args.kinds)) : SCHLAU_BASE_KINDS
  // --fit min|mean (creation only, PERSISTED wie --kinds): die skalare ES-Fitness. Default 'min' (weakest link —
  // das Basis-Design); 'mean' für die dedizierten Wall-Runs (WF-Lektion: bei 0-Finishes aller Kandidaten ist die
  // MIN flach 0 und der ES hat keinen Gradienten — die MEAN differenziert den Teil-Fortschritt Richtung Gate;
  // die Insel-Rangordnung bleibt der aufsteigende lex Vektor).
  if (resumed && args.fit !== undefined)
    throw new Error(`--fit is a creation flag (the run file stores fit: ${file!.fit ?? 'min'}; a plain --resume continues it)`)
  if (args.fit !== undefined && args.fit !== 'min' && args.fit !== 'mean') throw new Error(`--fit must be min or mean, got ${String(args.fit)}`)
  const fit: 'min' | 'mean' = resumed ? file!.fit ?? 'min' : args.fit === 'mean' ? 'mean' : 'min'
  if (!resumed && fit === 'mean') console.log('fitness aggregate: MEAN (dense gradient for the wall runs) — the island ranking stays the lex vector')
  // die Stage ist ein goal_open -> Rest-Ramp: eine Single-Kind-Band (die Wall-Runs) oder eine Band ohne goal_open
  // stagt NIE — die aktive Kind-Band ist dann von Anfang an voll (implizites --no-stage)
  const canStage = schlauKindsCanStage(kinds)
  if (!resumed && args['no-stage'] === undefined && !canStage)
    console.log(`stage curriculum off: --kinds ${kinds.join(',')} (the stage needs >= 2 kinds including goal_open — this band trains its kinds from the start)`)
  // --warm FILE: { genome } oder { best: { genome } }; Shape-Prüfung via hiddenOfSchlau (NICHT ensureV3Inputs)
  let warm = args.warm ? readWarmGenome(String(args.warm)) : undefined
  const warmH0 = warm ? hiddenOfSchlau(warm.length) : 0
  if (warm && hiddenArg !== undefined && !resumed) {
    if (hiddenArg < warmH0) throw new Error(`--hidden ${hiddenArg} is smaller than the warm genome's ${warmH0} hidden units`)
    if (hiddenArg > warmH0) warm = widenHidden(warm, hiddenArg, createRng(num(args.seed, 1) * 31 + 7))
    console.log(`warm start: hidden ${warmH0} -> ${hiddenArg}`)
  }
  // ohne --hidden gewinnt die hidden size des warm genome (wie v3), sonst der Default 10 (klein anfangen, später per widen-freeze vergrößern)
  const hidden = resumed ? file!.hidden : (hiddenArg ?? (warm ? warmH0 : 10))
  // --freeze-old (widen-freeze phase 1, CREATION only): freeze everything the warm function lives in (old W1 rows,
  // old b1, old W2 columns, both b2 — freezeOldMask) and evolve ONLY the new units' parameters. The mask lives in
  // config.freeze (EsConfig), so every resume keeps it; --unfreeze on resume clears it (phase 2).
  if (args['freeze-old'] !== undefined) {
    if (resumed) throw new Error('--freeze-old is a creation flag (the mask persists in config.freeze; clear it on resume with --unfreeze)')
    if (!warm) throw new Error('--freeze-old needs --warm (the old core the mask freezes)')
    if (hiddenArg === undefined) throw new Error('--freeze-old needs --hidden N (the widened hidden size)')
    if (hiddenArg <= warmH0) throw new Error(`--freeze-old needs a widening: --hidden ${hiddenArg} must be greater than the warm genome's ${warmH0} hidden units`)
  }
  // Keys: TRAIN (kanonische Starts, variant 0) und HOLDOUT (Start-Variante 1), pro kind gruppiert für die stratified
  // batch — NUR die kinds dieses Runs (die --kinds Band). Default-Band-Größen: per-kind TRAIN
  // (SCHLAU_TRAIN_PER_KIND: goal_open 3 — saturiert, critique §3; goal_box / goal_wall 16 — die Ramps) und
  // HOLDOUT 8 pro kind (Entscheidungs-Convention, eval-candidate DECISION_HOLDOUT_PER_KIND)
  const train = schlauTrainKeys(args['train-per-kind'] !== undefined ? num(args['train-per-kind'], 16) : undefined, kinds)
  const holdout = schlauHoldoutKeys(args['holdout-per-kind'] !== undefined ? num(args['holdout-per-kind'], 8) : undefined, kinds)
  const trainByKind: Record<string, string[]> = {}
  for (const k of train) (trainByKind[parseSchlauKey(k).kind] ??= []).push(k)
  // --speed-cap only at creation (persisted); a resume uses the stored value, so a resume without the flag behaves as before
  const speedCap = resumed ? file!.speedCap : args['speed-cap'] !== undefined ? num(args['speed-cap'], 0) || undefined : undefined
  // Fitness: weakest link (MIN über alle Episode-Werte des Batches) oder — bei --fit mean (Wall-Runs) — der
  // Mittelwert derselben Werte (dichter Gradient); der Vektor (aufsteigend) ist die Rangordnung (ES step, islands, best)
  const fitness: FitnessFn = fit === 'mean'
    ? (m) => { const v = episodeValues(m, speedCap); return v.reduce((a, b) => a + b, 0) / v.length }
    : (m) => aggregateKindMin(m, speedCap)
  const fitnessVec: FitnessVecFn = (m) => episodeValues(m, speedCap)

  if (!resumed) {
    const config: EsConfig = {
      ...DEFAULT_ES_CONFIG,
      dim: genomeLengthSchlau(hidden),
      pairs: num(args.pairs, 8),
      sigma: num(args.sigma, DEFAULT_ES_CONFIG.sigma),
      lr: num(args.lr, DEFAULT_ES_CONFIG.lr),
      seed: num(args.seed, 1),
      // --freeze-old only at creation: the mask persists with the config, a plain resume keeps it (phase 1 continues)
      ...(args['freeze-old'] !== undefined ? { freeze: freezeOldMask(genomeLengthSchlau(hidden), warmH0) } : {}),
    }
    const islands: IslandsConfig = {
      islands: num(args.islands, DEFAULT_ISLANDS.islands),
      epoch: num(args.epoch, DEFAULT_ISLANDS.epoch),
      mature: num(args.mature, DEFAULT_ISLANDS.mature),
      pCross: num(args['p-cross'], DEFAULT_ISLANDS.pCross),
    }
    file = {
      schema: 'renn.policy-evolution.schlau/1',
      policy: 'schlau',
      hidden,
      config,
      islands,
      ...(speedCap ? { speedCap } : {}),
      kinds,
      ...(fit === 'mean' ? { fit } : {}),
      stage: args['no-stage'] === undefined && canStage ? initialStage(SCHLAU_STAGE) : null,
      state: initialIslands(config, islands, warm),
      history: [],
    }
  }
  // --unfreeze (widen-freeze phase 2, RESUME only): clears the persisted config.freeze — every dim evolves again.
  // A plain resume of a freeze file KEEPS the mask (like speedCap); this flag is the explicit release.
  if (args.unfreeze !== undefined) {
    if (!resumed) throw new Error('--unfreeze is a resume flag (a fresh run has no freeze mask: create it with --freeze-old)')
    if (file!.config.freeze !== undefined) console.log(`unfreeze: config.freeze cleared at gen ${file!.state.gen} (phase 2 — all ${file!.config.dim} dims evolve; the stored config.lr keeps applying — --lr is a creation flag, for a smaller phase-2 step edit config.lr in the run file)`)
    delete file!.config.freeze
  }
  const isl = new IslandEs(file!.config, file!.islands, file!.state, fitness, fitnessVec)
  const pool = new SchlauPool(workers)
  const evaluate = pool.evaluator()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  // agent-facing export of the latest best candidate: one stable path (default <out dir>/latest-best.json),
  // written whenever best changes and once on resume — IMMER mit policy: 'schlau' UND hidden (die Längenkollision mit v3)
  const t0 = Date.now()
  const latestBest = args['latest-best'] ? String(args['latest-best']) : path.join(path.dirname(out), 'latest-best.json')
  const writeLatestBest = (why: string) => {
    if (!file.best) return
    fs.writeFileSync(
      latestBest,
      JSON.stringify(
        {
          schema: 'renn.policy-evolution.latest-best/1',
          source: out,
          policy: 'schlau',
          hidden: file.hidden,
          kinds: [...kinds],
          ...(file.speedCap ? { speedCap: file.speedCap } : {}),
          best: file.best,
          genome: file.best.genome,
          why,
          updatedAt: new Date().toISOString(),
        },
        null,
        1,
      ) + '\n',
    )
    console.log(`latest-best -> ${latestBest} (gen ${file.best.gen}, ${why})`)
  }
  // agent-facing stats snapshot (default <out dir>/latest-stats.json): written every --stats-every generations
  // (default 20), at every epoch end (the eval numbers change only there) and once on resume — `npm run train`
  // (train-ctl status) prints these numbers instead of parsing the log.
  const latestStats = args['latest-stats'] ? String(args['latest-stats']) : path.join(path.dirname(out), 'latest-stats.json')
  const statsEvery = Math.max(1, num(args['stats-every'], 20))
  let centers: number[] = []
  let lastEpoch: Record<string, unknown> | null = null
  const writeLatestStats = (why: string) => {
    fs.writeFileSync(
      latestStats,
      JSON.stringify(
        {
          schema: 'renn.policy-evolution.latest-stats/1',
          source: out,
          policy: 'schlau',
          hidden: file.hidden,
          kinds: [...kinds],
          ...(file.speedCap ? { speedCap: file.speedCap } : {}),
          gen: isl.state.gen,
          updatedAt: new Date().toISOString(),
          elapsedSec: Math.round((Date.now() - t0) / 1000),
          islands: {
            centers,
            ages: isl.state.islands.map((x) => x.age),
            stagns: isl.state.islands.map((x) => x.stagn ?? 0),
            boosts: isl.state.islands.map((_, k) => Math.round(isl.boost(k) * 100) / 100),
            globalStagn: isl.state.globalStagn ?? 0,
            globalBoost: Math.round(sigmaBoost(isl.state.globalStagn) * 100) / 100,
          },
          ...(file.stage ? { stage: { share: file.stage.share, ema: file.stage.ema } } : {}),
          epoch: lastEpoch,
          ...(file.best ? { best: { gen: file.best.gen, train: file.best.train, holdout: file.best.holdout, worst3: (file.best.trainVec ?? [file.best.train]).slice(0, 3) } } : {}),
          why,
        },
        null,
        1,
      ) + '\n',
    )
  }
  if (resumed) writeLatestStats('resume')
  if (resumed && file.best) writeLatestBest('resume')
  try {
    for (let i = 0; i < gens; i++) {
      const g = isl.state.gen
      const active = file.stage ? schlauActiveKinds(file.stage.share, kinds) : [...kinds]
      const batchPerKind = num(args.batch, 1)
      const variant = args['no-variants'] ? 0 : g + 1
      // STRATIFIED batch: pro aktiver kind genau batchPerKind keys (rotierendes Fenster über die kind-Liste),
      // auf die Start-Variante dieser Generation umgeschrieben (parseSchlauKey + schlauKey)
      const keys = stageBatch(trainByKind, active, batchPerKind, g).map((k) => {
        const { kind, seed } = parseSchlauKey(k)
        return schlauKey(kind, seed, variant)
      })
      const { reports } = await isl.step(evaluate, keys)
      centers = reports.map((r) => Math.round(r.center * 1000) / 1000)
      const boosts = isl.state.islands.map((_, k) => Math.round(isl.boost(k) * 100) / 100)
      const entry: Record<string, unknown> = { gen: isl.state.gen, centers }
      let line = `gen ${isl.state.gen}  centers [${reports.map((r) => r.center.toFixed(2)).join(' ')}] ages [${isl.state.islands.map((x) => x.age).join(' ')}]`
      if (boosts.some((b) => b > 1)) line += `  sigma-boost [${boosts.map((b) => b.toFixed(2)).join(' ')}] (stagns [${isl.state.islands.map((x) => x.stagn ?? 0).join(' ')}] global ${isl.state.globalStagn ?? 0})`
      if (file.stage) {
        // Stage-Update: EMA der goal_open-Finish-Rate über die Centre-Metriken dieser Generation
        const openRuns = reports.flatMap((r) => (r.centerMetrics ?? []).filter((m) => parseSchlauKey(m.key).kind === 'goal_open'))
        if (openRuns.length) file.stage = updateStage(file.stage, openRuns.filter((m) => m.outcome === 'finish').length / openRuns.length, SCHLAU_STAGE)
        entry.stage = file.stage.share
        line += `  stage share ${file.stage.share.toFixed(2)} (goal_open finish ema ${file.stage.ema.toFixed(2)}, kinds ${active.join(',')})`
      }
      if (isl.isEpochEnd()) {
        // Epoch-End-Ranking: dieselbe stratified batch mit Variante 9000 + g (frische Start-Pose), dann reproduce
        const rankKeys = stageBatch(trainByKind, active, batchPerKind, g).map((k) => {
          const { kind, seed } = parseSchlauKey(k)
          return schlauKey(kind, seed, 9000 + g)
        })
        const scoreVecs = await Promise.all(isl.engines.map(async (e) => fitnessVec(await evaluate(e.state.theta.slice(), rankKeys))))
        const scores = scoreVecs.map((v) => v[0] ?? 0)
        const { best, event } = isl.reproduce(scoreVecs)
        const theta = isl.state.islands[best]!.es.theta.slice()
        const [tr, ho] = await Promise.all([evaluate(theta, train), evaluate(theta, holdout)])
        const trainFit = fitness(tr)
        const holdFit = fitness(ho)
        // ascending episode-value vectors of the best island on TRAIN / HOLDOUT (the lex tie-breakers; the scalar min above stays the display number)
        const trainVec = fitnessVec(tr)
        const holdoutVec = fitnessVec(ho)
        const fin = (m: typeof tr) => `${m.filter((x) => x.outcome === 'finish').length}/${m.length}`
        const perKind = kinds.map((k) => {
          const ms = ho.filter((m) => parseSchlauKey(m.key).kind === k)
          return { kind: k, finished: ms.filter((m) => m.outcome === 'finish').length, total: ms.length }
        })
        line += `\n  EPOCH scores [${scores.map((s) => s.toFixed(3)).join(' ')}] best island ${best}${event ? `, replaced island ${event.replaced} by ${event.with}` : ''}  | TRAIN ${trainFit.toFixed(3)} (${fin(tr)}) HOLDOUT ${holdFit.toFixed(3)} (${fin(ho)})`
        line += `\n  HOLDOUT per kind: ${perKind.map((p) => `${p.kind} ${p.finished}/${p.total}`).join('  ')}`
        Object.assign(entry, { scores, best, event, train: trainFit, holdout: holdFit })
        lastEpoch = {
          gen: isl.state.gen,
          scores,
          bestIsland: best,
          ...(event ? { replaced: event.replaced, by: event.with } : {}),
          train: { fitness: trainFit, finished: tr.filter((x) => x.outcome === 'finish').length, total: tr.length, worst3: trainVec.slice(0, 3) },
          holdout: { fitness: holdFit, finished: ho.filter((x) => x.outcome === 'finish').length, total: ho.length },
          perKind,
        }
        // best-update: FINISH COUNT FIRST, the ascending lex train vector only as the tie-break
        // (beatsBestSchlau, critique 2026-10-23 §0: the pure lex order preferred a 0-finish creeper over the
        // 14/16-finish driver — a FAIL slot is never exactly 0); trainFit (scalar min) stays the display number
        const trainFinishes = tr.filter((x) => x.outcome === 'finish').length
        if (beatsBestSchlau({ finishes: trainFinishes, vec: trainVec }, file.best ? { finishes: file.best.trainFinishes ?? 0, vec: file.best.trainVec ?? [file.best.train] } : undefined)) {
          file.best = { gen: isl.state.gen, island: best, train: trainFit, holdout: holdFit, trainFinishes, genome: theta, trainVec, holdoutVec }
          writeLatestBest(`new best by TRAIN (${trainFinishes} finishes)`)
        }
        writeLatestStats('epoch end')
      }
      file.history.push(entry)
      file.state = isl.state
      fs.writeFileSync(out, JSON.stringify(file))
      if (isl.state.gen % statsEvery === 0) writeLatestStats(`every ${statsEvery} gens`)
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
