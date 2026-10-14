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
 * v3 (forward AND backward, free-track pretraining, see spec-command-chains.md section v3): `--v3` evolves the 26-input net (v2 inputs + the two touch flags, len = 29 H + 2) FROM SCRATCH (random nets, no warm start unless
 * --warm is given) on v3 chain episodes `<setupKey>#<i>v3` of the kinds free, bay, corridor, field, slalom, maze, crowd (`--kinds` restricts). Stage curriculum: the run starts on
 * the free track only; the obstacle kinds join (bay, corridor, slalom, crowd, field, maze) as the free-track chain finish-rate EMA reaches 0.7 (share 0 -> 0.7 in steps of 0.1;
 * `--no-stage` = all kinds from the start). Batches are STRATIFIED: `--batch N` = setups PER ACTIVE KIND per generation (default 1). Fitness = weakest link
 * (MIN over all episode values of the batch: the worst run decides). State (incl. the stage) is saved every generation, `--resume` continues.
 *   npx tsx tools/policy-evolution/run-islands.ts --v3 --hidden 24 --batch 1 --gens 600 --workers 4 --out test-results/policy-evolution/v3.json
 *
 * Options: --islands N (default 3) --pairs N (antithetic pairs PER island, default 8) --epoch N (25) --mature N (75) --p-cross P (0.5)
 *   --sigma --lr --seed --batch N (18) --train-per-kind N (30) --holdout-per-kind N (20) --workers N --out FILE --resume
 *   --no-variants --no-curriculum --curriculum-start D (0) --lex-eps E --csa
 *   --train-per-kind-<kind> N / --holdout-per-kind-<kind> N override the count of that one kind (v2/v3; others keep the plain flags' defaults).
 * --focus-setups "crux:5,crux:12#2v3,.." (v3, see agent-context/focus-curriculum.md): the failure-focus mode - train ONLY these
 *   setups (setup keys, or the chain keys a diagnose --list prints, mapped to their setups; ALL chains of each, the normal variant
 *   rotation) until every focus chain passes; the epoch-end island ranking runs on them too. The passing setups are fully excluded,
 *   not down-weighted. Given at creation or resume; persisted like speedCap (a resume keeps the stored set), --no-focus-setups clears it.
 * --epoch-best (v3, persisted like speedCap): track the best island's center at EVERY epoch end as file.epochBest
 *   {gen, island, genome}. Given at creation or on resume (--no-epoch-best clears it; a resume without either keeps the
 *   stored value). The focus-curriculum driver sets it on its focus + validation chunks: its verdict candidate is this
 *   epoch-best, NOT the stored file.best - a focused / recovering run's fitness does not beat the stored full-band best, so
 *   file.best can stay a pre-focus genome for a whole cycle (the first real cycle proved it).
 * --lex-eps E (v3, creation only - persisted in config like speedCap): rank-tie tolerance for the lex vector ranks; near-tie
 *   candidates share their rank instead of getting opposite ranks off evaluation noise. 0/absent = strict (old behaviour).
 *   Calibration: the per-gen log prints `lex ties F`, the share of candidate pairs sharing a rank (starves the gradient when high).
 * --csa (creation only - persisted like speedCap): Hansen cumulative step-size adaptation per island - the island's BASE sigma
 *   adapts to its evolution path every generation, the stagnation boost keeps multiplying on top. Off (default) = bit-identical.
 * --freeze-old (v2/v3, creation only - persisted in config.freeze like speedCap): with --warm FILE and --hidden N > warm H the warm
 *   genome is widened to N and everything the old function lives in is FROZEN (old W1 rows, old b1, old W2 columns, both b2 -
 *   freezeOldMask in policy.ts); only the new units' parameters evolve (they start silent; the freeze puts the selection pressure
 *   on them). Island replacement (crossover / immigrants) is blocked while the mask is active - frozen dims are identical across
 *   islands, an immigrant would destroy the warm core. A plain resume keeps the mask (phase 1 continues).
 * --unfreeze (resume only): clears the persisted freeze mask - phase 2, all dims evolve again (use a reduced --lr, e.g. 0.01).
 * The best mean policy by TRAIN score (checked at every epoch end) is stored as `best.genome` (same layout as run.ts; ship.ts reads it).
 * Agent exports (next to --out): latest-best.json on every best change + resume (trial via RENN_V3_GENOME_FILE), and
 *   latest-stats.json every --stats-every gens (default 20) + every epoch end + resume (--latest-best/--latest-stats override the paths).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { capFieldDifficulty, chainEpisodeKeys, CHAIN_FIELD_DIFFICULTY, flattenChainKeys, holdoutChainEpisodes, trainChainEpisodes, type SetupChains } from '@/policyEvolution/chains'
import { warmCruxGate } from '@/policyEvolution/cruxChains'
import { chainReportByKind, formatChainReport, parseKinds, v2GenomeFromFile } from '@/policyEvolution/chainReport'
import { CHAIN_KINDS, COURSE_KINDS, COURSE_LENGTH, holdoutCourseKeys, parseCourseKey, trainCourseKeys, withVariant } from '@/policyEvolution/courses'
import { parseChainEpisodeKey } from '@/policyEvolution/chains'
import { applyCurriculum, DEFAULT_CURRICULUM, initialCurriculum, updateCurriculum, type CurriculumState } from '@/policyEvolution/curriculum'
import { focusBatch, focusPassReport, parseFocusSetups, type FocusPassReport } from '@/policyEvolution/focusSetups'
import { aggregateEvenness, aggregateFitness, aggregateKindMin, beatsBest, DEFAULT_ES_CONFIG, episodeValues, type EsConfig, type FitnessFn, type FitnessVecFn } from '@/policyEvolution/es'
import { DEFAULT_ISLANDS, FOCUS_MAX_EPOCHS, initialIslands, IslandEs, sigmaBoost, type IslandsConfig, type IslandsState } from '@/policyEvolution/islands'
import { createRng } from '@/avEvolution/core/rng'
import { freezeOldMask, GENOME_LENGTH, genomeLength, genomeShape, hiddenOfLength, N_HIDDEN, N_IN_V2, N_IN_V3, padV2Genome, widenHidden } from '@/policyEvolution/policy'
import { PolicyPool } from './pool'
import { activeKinds, DEFAULT_STAGE, initialStage, stageBatch, updateStage, type StageState } from '@/policyEvolution/curriculum'
import { holdoutV3Episodes, trainV3Episodes, v3EpisodeKeys } from '@/policyEvolution/chains'
import { formatV3Report, v3ReportByKind } from '@/policyEvolution/chainReport'
import { V3_KINDS, type CourseKind } from '@/policyEvolution/courses'

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
  /** v3 run: fresh nets, v3 episodes, stratified batches, stage curriculum */
  v3?: boolean
  /** opt-in v3 training speed cap (m/s), persisted so --resume keeps it; absent = uncapped */
  speedCap?: number
  /** opt-in per-island cumulative step-size adaptation (Hansen CSA), persisted so --resume keeps it; absent = off */
  csa?: boolean
  /** failure-focus mode (v3): the ONLY setups trained/ranked on (all their chains); persisted so a resume keeps it, --no-focus-setups clears it */
  focusSetups?: string[]
  /** last epoch-end focus pass check (the driver's phase-exit signal): per-setup finished chains on the canonical focus episodes */
  focusPass?: FocusPassReport
  /** opt-in v3 epoch-best tracking (--epoch-best, persisted so --resume keeps it): the best island's center is stored at every epoch end */
  epochBestOn?: true
  /** the last epoch-end best island (written when epochBestOn): the focus-curriculum driver's verdict candidate */
  epochBest?: { gen: number; island: number; genome: number[] }
  stage?: StageState | null
  config: EsConfig
  islands: IslandsConfig
  curriculum: CurriculumState | null
  state: IslandsState
  history: Array<Record<string, unknown>>
  best?: { gen: number; island: number; train: number; holdout: number; genome: number[]; trainVec?: number[]; holdoutVec?: number[] }
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
  // the crux chain enumeration runs the sync pursuit gate, which needs the physics engine warm (no-op otherwise)
  await warmCruxGate()
  const args = parseArgs(process.argv.slice(2))
  const out = String(args.out ?? 'test-results/policy-evolution/islands.json')
  const gens = num(args.gens, 100)
  const batch = num(args.batch, 18)
  const workers = num(args.workers, Math.max(1, os.cpus().length - 1))
  let file: RunFile
  const resumed = !!args.resume && fs.existsSync(out)
  if (resumed) file = JSON.parse(fs.readFileSync(out, 'utf8')) as RunFile
  const v3 = resumed ? !!file!.v3 : !!args.v3
  const v2 = v3 || (resumed ? !!file!.v2 : !!args.v2)
  const kinds = parseKinds(args.kinds, v3 ? V3_KINDS : v2 ? CHAIN_KINDS : COURSE_KINDS)
  // --focus-setups (v3 failure-focus mode): parsed here so a bad spec fails BEFORE any training; a resume without the
  // flag keeps the stored set (crash-safe, like speedCap), --no-focus-setups clears it (the validation phase of the driver)
  let focusSetups: string[] | undefined
  if (args['focus-setups'] !== undefined) focusSetups = parseFocusSetups(String(args['focus-setups']), kinds)
  else if (!args['no-focus-setups'] && resumed && file!.focusSetups?.length) focusSetups = file!.focusSetups
  if (focusSetups && !v3) throw new Error('--focus-setups needs --v3')
  // --epoch-best (v3, persisted like speedCap): --epoch-best sets tracking on RESUME too (the focus-curriculum driver's
  // chunks always resume the checkpoint copy, whose source never stored the flag); --no-epoch-best clears it, a resume
  // without either keeps the stored value
  const epochBestOn = args['epoch-best'] ? true : args['no-epoch-best'] ? false : resumed ? !!file!.epochBestOn : false
  if (epochBestOn && !v3) throw new Error('--epoch-best needs --v3')
  let warm = args.warm ? v2GenomeFromFile(JSON.parse(fs.readFileSync(String(args.warm), 'utf8'))) : undefined
  if (warm && !v2) throw new Error('--warm needs --v2')
  if (args.hidden !== undefined && !v2) throw new Error('--hidden needs --v2')
  // v3 runs need the 26-input layout: a legacy 24-input (v2-shaped) warm genome is zero-padded onto the two touch inputs (identical function)
  if (warm && v3 && hiddenOfLength(warm.length, N_IN_V2) && !hiddenOfLength(warm.length, N_IN_V3)) warm = padV2Genome(warm)
  const hiddenArg = args.hidden === undefined ? undefined : Number(args.hidden)
  if (hiddenArg !== undefined && (!Number.isInteger(hiddenArg) || hiddenArg < 1)) throw new Error(`--hidden must be a positive integer, got ${String(args.hidden)}`)
  // --hidden N with --warm: the warm genome (v1 padded) is widened to N, function preserved; N below the warm size is refused
  const warmH0 = warm ? genomeShape(warm.length).hidden : 0
  if (warm && hiddenArg !== undefined && !resumed) {
    if (hiddenArg < warmH0) throw new Error(`--hidden ${hiddenArg} is smaller than the warm genome's ${warmH0} hidden units`)
    if (hiddenArg > warmH0) warm = widenHidden(warm, hiddenArg, createRng(num(args.seed, 1) * 31 + 7))
    console.log(`warm start: hidden ${warmH0} -> ${hiddenArg}`)
  }
  // --freeze-old (widen-freeze phase 1, CREATION only): freeze everything the warm function lives in (old W1 rows,
  // old b1, old W2 columns, both b2 — freezeOldMask) and evolve ONLY the new units' parameters (new W1 rows, new b1,
  // new W2 columns; they start silent, the freeze is what puts selection pressure on them). Needs --warm and a
  // widening --hidden N > warm H. The mask lives in config.freeze (EsConfig), so every resume keeps it exactly like
  // speedCap / focusSetups; --unfreeze on resume clears it (phase 2: all dims evolve again).
  if (args['freeze-old'] !== undefined) {
    if (resumed) throw new Error('--freeze-old is a creation flag (the mask persists in config.freeze; clear it on resume with --unfreeze)')
    if (!warm) throw new Error('--freeze-old needs --warm (the old core the mask freezes)')
    if (hiddenArg === undefined) throw new Error('--freeze-old needs --hidden N (the widened hidden size)')
    if (hiddenArg <= warmH0) throw new Error(`--freeze-old needs a widening: --hidden ${hiddenArg} must be greater than the warm genome's ${warmH0} hidden units`)
  }
  // per-kind overrides of the setup counts: --train-per-kind-<kind> N / --holdout-per-kind-<kind> N (e.g. --train-per-kind-maze 16)
  // replace the count of exactly that kind; the plain flags stay the defaults of the others. Without any override the
  // groups are built exactly as before (bit-identical, resume determinism); with one the groups are built per kind and
  // concatenated (trainV3Episodes keeps appending the adversarial setups of each kind).
  const perKindOverrides = (prefix: 'train-per-kind' | 'holdout-per-kind'): Map<CourseKind, number> => {
    const overrides = new Map<CourseKind, number>()
    for (const key of Object.keys(args)) {
      if (!key.startsWith(`${prefix}-`)) continue
      const kind = key.slice(prefix.length + 1) as CourseKind
      if (!(V3_KINDS as readonly string[]).includes(kind) || !kinds.includes(kind))
        throw new Error(`--${key}: '${kind}' is not a kind of this run (--kinds ${kinds.join(',')})`)
      const n = Number(args[key])
      if (!Number.isInteger(n) || n < 1) throw new Error(`--${key} must be a positive integer, got ${String(args[key])}`)
      overrides.set(kind, n)
    }
    return overrides
  }
  const withOverrides = (
    groups: (perKind: number, ks: readonly CourseKind[]) => SetupChains[],
    overrides: Map<CourseKind, number>,
    fallback: number,
  ): SetupChains[] => (overrides.size ? kinds.flatMap((k) => groups(overrides.get(k) ?? fallback, [k])) : groups(fallback, kinds))
  const trainOverrides = perKindOverrides('train-per-kind')
  const holdoutOverrides = perKindOverrides('holdout-per-kind')
  const trainGroups = v3
    ? withOverrides(trainV3Episodes, trainOverrides, num(args['train-per-kind'], 8))
    : v2
    ? withOverrides(trainChainEpisodes, trainOverrides, num(args['train-per-kind'], 8))
    : []
  const holdoutGroups = v3
    ? withOverrides(holdoutV3Episodes, holdoutOverrides, num(args['holdout-per-kind'], 5))
    : v2
    ? withOverrides(holdoutChainEpisodes, holdoutOverrides, num(args['holdout-per-kind'], 5))
    : []
  const trainByKind: Record<string, SetupChains[]> = {}
  for (const g of trainGroups) (trainByKind[parseCourseKey(g.setupKey).kind] ??= []).push(g)
  /** stratified v3 setups of one generation: perKind setups of every active kind, a start variant per generation, field capped */
  const v3Setups = (perKind: number, g: number, share: number | null, variant: number | null, ks: readonly CourseKind[]): SetupChains[] => {
    const active = share === null || !kinds.includes('free') ? [...ks] : activeKinds(share).filter((k) => ks.includes(k as CourseKind))
    return stageBatch(trainByKind, active, perKind, g).map((grp) => {
      let key = grp.setupKey
      if (variant !== null) key = withVariant(key, variant)
      key = capFieldDifficulty(key)
      const keys = v3EpisodeKeys(key)
      return keys.length >= 2 ? { setupKey: key, keys } : grp
    })
  }
  const train = v2 ? flattenChainKeys(trainGroups) : trainCourseKeys(num(args['train-per-kind'], 30), kinds)
  const holdout = v2 ? flattenChainKeys(holdoutGroups) : holdoutCourseKeys(num(args['holdout-per-kind'], 20), kinds)
  // --speed-cap / --csa only at creation (persisted); a resume uses the stored value, so a resume without the flag behaves as before
  const speedCap = resumed ? file!.speedCap : args['speed-cap'] !== undefined ? num(args['speed-cap'], 0) || undefined : undefined
  const csa = resumed ? !!file!.csa : !!args.csa
  const fitness: FitnessFn = v3 ? (m) => aggregateKindMin(m, speedCap) : v2 ? aggregateEvenness : aggregateFitness
  // v3 weakest link as a VECTOR (ascending episode values): its LEXICOGRAPHIC order ranks candidates (ES step),
  // islands (reproduce) and the stored best — one immediate stall saturates the scalar min to 0 and would make all
  // early candidates indistinguishable; the vector keeps the gradient (the second-worst run breaks the tie).
  // The scalar `fitness` (min) stays for reports / display.
  const fitnessVec: FitnessVecFn | undefined = v3 ? (m) => episodeValues(m, speedCap) : undefined

  if (!resumed) {
    const config: EsConfig = {
      ...DEFAULT_ES_CONFIG,
      dim: v2 ? genomeLength(v3 ? N_IN_V3 : N_IN_V2, warm ? genomeShape(warm.length).hidden : (hiddenArg ?? N_HIDDEN)) : GENOME_LENGTH,
      pairs: num(args.pairs, 8),
      sigma: num(args.sigma, DEFAULT_ES_CONFIG.sigma),
      lr: num(args.lr, DEFAULT_ES_CONFIG.lr),
      seed: num(args.seed, 1),
      // --lex-eps only at creation; persisted here, a resume reuses the stored config (0 / absent = strict, old behaviour)
      ...(num(args['lex-eps'], 0) > 0 ? { lexEps: num(args['lex-eps'], 0) } : {}),
      // --freeze-old only at creation: the mask persists with the config, a plain resume keeps it (phase 1 continues)
      ...(args['freeze-old'] !== undefined ? { freeze: freezeOldMask(genomeLength(v3 ? N_IN_V3 : N_IN_V2, hiddenArg!), warmH0) } : {}),
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
      v3,
      ...(speedCap ? { speedCap } : {}),
      ...(csa ? { csa: true } : {}),
      stage: v3 && !args['no-stage'] ? initialStage({ ...DEFAULT_STAGE, start: num(args['stage-start'], DEFAULT_STAGE.start) }) : null,
      curriculum: v3 || args['no-curriculum'] ? null : initialCurriculum({ ...DEFAULT_CURRICULUM, start: num(args['curriculum-start'], DEFAULT_CURRICULUM.start) }),
      state: initialIslands(config, islands, warm),
      history: [],
    }
  }
  // --unfreeze (widen-freeze phase 2, RESUME only): clears the persisted config.freeze — every dim evolves again.
  // A plain resume of a freeze file KEEPS the mask (like speedCap / focusSetups); this flag is the explicit release.
  if (args.unfreeze !== undefined) {
    if (!resumed) throw new Error('--unfreeze is a resume flag (a fresh run has no freeze mask: create it with --freeze-old)')
    if (file!.config.freeze !== undefined) console.log(`unfreeze: config.freeze cleared at gen ${file!.state.gen} (phase 2 — all ${file!.config.dim} dims evolve; consider a reduced --lr, e.g. 0.01)`)
    delete file!.config.freeze
  }
  // the effective focus set is part of the run file (like speedCap): a plain resume of a focused run stays focused
  if (focusSetups) file!.focusSetups = focusSetups
  else delete file!.focusSetups
  if (epochBestOn) file!.epochBestOn = true
  else delete file!.epochBestOn
  const isl = new IslandEs(file!.config, file!.islands, file!.state, fitness, fitnessVec, csa)
  const pool = new PolicyPool(workers)
  const evaluate = pool.evaluator()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  // agent-facing export of the latest best candidate: one stable path (default <out dir>/latest-best.json),
  // written whenever best changes and once on resume. Trial the candidate without touching the shipped policy:
  //   RENN_V3_GENOME_FILE=<latest-best.json> MAZE_TRAIN_SIM=1 npx vitest run src/test/scenarios/maze-training-worlds.test.ts
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
          policy: v3 ? 'v3' : v2 ? 'v2' : 'v1',
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
  // the last epoch-end focus pass check (v3 failure-focus mode); echoed into latest-stats for display - the DRIVER
  // reads the persisted file.focusPass of the state file (authoritative across restarts)
  let lastFocusPass: FocusPassReport | null = null
  const writeLatestStats = (why: string) => {
    fs.writeFileSync(
      latestStats,
      JSON.stringify(
        {
          schema: 'renn.policy-evolution.latest-stats/1',
          source: out,
          policy: v3 ? 'v3' : v2 ? 'v2' : 'v1',
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
            // CSA base sigmas (only present with --csa): the adapted per-island sigma WITHOUT the stagnation boost
            ...(isl.state.islands.some((x) => x.sigma !== undefined) ? { csaSigmas: isl.state.islands.map((x) => (x.sigma === undefined ? null : Math.round(x.sigma * 10000) / 10000)) } : {}),
            globalStagn: isl.state.globalStagn ?? 0,
            globalBoost: Math.round(sigmaBoost(isl.state.globalStagn) * 100) / 100,
            // focus mode: null = normal operation; else the focused islands, epoch-ends spent in focus and the cap
            focus: isl.state.focus
              ? { set: [...isl.state.focus.set], epochs: isl.state.focus.epochs, sinceGen: isl.state.focus.sinceGen, max: FOCUS_MAX_EPOCHS }
              : null,
          },
          ...(file.stage ? { stage: { share: file.stage.share, ema: file.stage.ema } } : {}),
          ...(file.curriculum ? { curriculum: { difficulty: file.curriculum.difficulty, ema: file.curriculum.ema } } : {}),
          // failure-focus mode (v3 --focus-setups): the setups trained on and the last epoch-end pass check of the
          // best island on them (canonical episodes, the diagnose ones) - allPass is the phase-exit signal
          ...(focusSetups ? { focusSetups: lastFocusPass ?? { gen: isl.state.gen, set: [...focusSetups], perSetup: [], allPass: false } } : {}),
          epoch: lastEpoch,
          ...(file.best ? { best: { gen: file.best.gen, train: file.best.train, holdout: file.best.holdout, ...(file.best.trainVec ? { worst3: file.best.trainVec.slice(0, 3) } : {}) } } : {}),
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
      let keys: string[]
      // focus mode: the batch holds ALL chains of exactly the focus setups (the standard variant rotation); the
      // passing setups are fully excluded - the stage/batch window machinery is bypassed entirely
      if (v3) keys = flattenChainKeys(focusSetups ? focusBatch(focusSetups, args['no-variants'] ? null : g + 1) : v3Setups(num(args.batch, 1), g, file.stage ? file.stage.share : null, args['no-variants'] ? null : g + 1, kinds))
      else if (v2) keys = flattenChainKeys(setupBatch(trainGroups, num(args.batch, 6), g, args['no-variants'] ? null : g + 1, file.curriculum))
      else {
        keys = Array.from({ length: Math.min(batch, train.length) }, (_, j) => train[(g * batch + j) % train.length]!)
        if (!args['no-variants']) keys = keys.map((k) => withVariant(k, g + 1))
        if (file.curriculum) keys = applyCurriculum(keys, file.curriculum, g)
      }
      const { reports, paused } = await isl.step(evaluate, keys)
      centers = reports.map((r) => Math.round(r.center * 1000) / 1000)
      const boosts = isl.state.islands.map((_, k) => Math.round(isl.boost(k) * 100) / 100)
      // lexEps calibration: the share of candidate pairs sharing a rank under the eps grouping (mean over the
      // stepping islands). High (> ~0.5) = the gradient starves on ties -> raise eps; near 0 = eps does nothing.
      const tieFracs = reports.map((r) => r.lexTieFrac).filter((x): x is number => x !== undefined)
      const lexTies = tieFracs.length ? tieFracs.reduce((a, b) => a + b, 0) / tieFracs.length : undefined
      const entry: Record<string, unknown> = { gen: isl.state.gen, centers, difficulty: file.curriculum?.difficulty, ...(lexTies !== undefined ? { lexTies: Math.round(lexTies * 1000) / 1000 } : {}) }
      let line = `gen ${isl.state.gen}  centers [${reports.map((r) => r.center.toFixed(2)).join(' ')}] ages [${isl.state.islands.map((x) => x.age).join(' ')}]`
      if (lexTies !== undefined) line += `  lex ties ${lexTies.toFixed(2)}`
      if (boosts.some((b) => b > 1)) line += `  sigma-boost [${boosts.map((b) => b.toFixed(2)).join(' ')}] (stagns [${isl.state.islands.map((x) => x.stagn ?? 0).join(' ')}] global ${isl.state.globalStagn ?? 0})`
      // focus mode: the stagnant / weak islands step alone, the others are paused (frozen center, frozen age)
      if (isl.state.focus) {
        const f = isl.state.focus
        line += `  FOCUS islands [${f.set.join(' ')}] (epoch ${f.epochs + 1}/${FOCUS_MAX_EPOCHS} since gen ${f.sinceGen}, paused [${paused.join(' ')}])`
      }
      if (focusSetups) line += `  FOCUS-SETUPS [${focusSetups.join(' ')}]`
      if (v3 && file.stage) {
        const freeRuns = reports.flatMap((r) => (r.centerMetrics ?? []).filter((m) => parseCourseKey(parseChainEpisodeKey(m.key).setupKey).kind === 'free'))
        if (freeRuns.length) file.stage = updateStage(file.stage, freeRuns.filter((m) => m.outcome === 'finish').length / freeRuns.length)
        entry.stage = file.stage.share
        line += `  stage share ${file.stage.share.toFixed(1)} (free finish ema ${file.stage.ema.toFixed(2)}, kinds ${activeKinds(file.stage.share).length})`
      }
      if (file.curriculum) {
        const fieldRuns = reports.flatMap((r) => (r.centerMetrics ?? []).filter((m) => parseCourseKey(parseChainEpisodeKey(m.key).setupKey).kind === 'field'))
        if (fieldRuns.length) file.curriculum = updateCurriculum(file.curriculum, fieldRuns.reduce((a, m) => a + Math.min(1, m.progress / (m.length ?? COURSE_LENGTH)), 0) / fieldRuns.length)
        line += `  field difficulty ${file.curriculum.difficulty.toFixed(2)} (route fraction ema ${file.curriculum.ema.toFixed(2)})`
      }
      if (isl.isEpochEnd()) {
        // rank the islands on fresh courses at full difficulty, then reproduce (focus mode: the fresh courses are the
        // focus setups' own jittered starts - the objective IS the focus set)
        const rankKeys = v3
          ? flattenChainKeys(focusSetups ? focusBatch(focusSetups, 9000 + g) : v3Setups(num(args['rank-setups'], 2), g, file.stage ? file.stage.share : null, 9000 + g, kinds))
          : v2
          ? flattenChainKeys(setupBatch(trainGroups, num(args['rank-setups'], 12), g, 9000 + g, null))
          : Array.from({ length: 36 }, (_, j) => withVariant(train[(g * 36 + j) % train.length]!, 9000 + g))
        const scoreVecs = await Promise.all(
          isl.engines.map(async (e) => {
            const m = await evaluate(e.state.theta.slice(), rankKeys)
            return fitnessVec ? fitnessVec(m) : [fitness(m)]
          }),
        )
        const scores = scoreVecs.map((v) => v[0] ?? 0)
        const focusBefore = isl.state.focus
        const { best, event } = isl.reproduce(scoreVecs)
        // focus transitions of this epoch end: entered (stagnation), ended (all over the hump) or capped
        if (isl.state.focus && !focusBefore) line += `\n  FOCUS entered: islands [${isl.state.focus.set.join(' ')}] step alone until over the hump (cap ${FOCUS_MAX_EPOCHS} epochs)`
        else if (!isl.state.focus && focusBefore) {
          const done = focusBefore.set.every((i) => (isl.state.islands[i]!.stagn ?? 0) === 0)
          line += `\n  FOCUS ended: ${done ? `islands [${focusBefore.set.join(' ')}] over the hump` : `capped at ${FOCUS_MAX_EPOCHS} epochs (stagn counters reset)`}`
        }
        const theta = isl.state.islands[best]!.es.theta.slice()
        // epoch-best tracking (v3 --epoch-best): the winner's center at every epoch end - the population's current best
        // candidate, independent of the stored file.best (which only moves on a full-band fitness improvement)
        if (epochBestOn) file!.epochBest = { gen: isl.state.gen, island: best, genome: theta }
        const [tr, ho] = await Promise.all([evaluate(theta, train), evaluate(theta, holdout)])
        const trainFit = fitness(tr)
        const holdFit = fitness(ho)
        // ascending episode-value vectors of the best island on TRAIN / HOLDOUT (v3: the lex tie-breakers; the
        // scalar min above stays the display number)
        const trainVec = fitnessVec ? fitnessVec(tr) : [trainFit]
        const holdoutVec = fitnessVec ? fitnessVec(ho) : [holdFit]
        // focus mode exit criterion: the BEST island of this epoch on the CANONICAL focus chains (variant 0, exactly
        // the episodes diagnose-v3 measures on the train split). Persisted as file.focusPass - the driver reads it
        // between its one-epoch chunks; allPass is the loud phase-exit signal.
        if (v3 && focusSetups) {
          const fm = await evaluate(theta, flattenChainKeys(focusBatch(focusSetups, null)))
          lastFocusPass = focusPassReport(fm, focusSetups, isl.state.gen)
          file!.focusPass = lastFocusPass
          entry.focusPass = lastFocusPass.allPass
          line += `\n  FOCUS-SETUPS ${lastFocusPass.perSetup.map((p) => `${p.setupKey} ${p.finished}/${p.chains}`).join(' ')}`
          if (lastFocusPass.allPass) line += `\n  FOCUS-SETUPS ALL PASS at gen ${isl.state.gen}`
        }
        const fin = (m: typeof tr) => `${m.filter((x) => x.outcome === 'finish').length}/${m.length}`
        line += `\n  EPOCH scores [${scores.map((s) => s.toFixed(3)).join(' ')}] best island ${best}${event ? `, replaced island ${event.replaced} by ${event.with}` : ''}  | TRAIN ${trainFit.toFixed(3)} (${fin(tr)}) HOLDOUT ${holdFit.toFixed(3)} (${fin(ho)})`
        if (v3) line += `\n  HOLDOUT per kind:\n    ${formatV3Report(v3ReportByKind(ho, kinds))}`
        else if (v2) line += `\n  HOLDOUT per kind: ${formatChainReport(chainReportByKind(ho, kinds))}`
        Object.assign(entry, { scores, best, event, train: trainFit, holdout: holdFit })
        lastEpoch = {
          gen: isl.state.gen,
          scores,
          bestIsland: best,
          ...(event ? { replaced: event.replaced, by: event.with } : {}),
          train: { fitness: trainFit, finished: tr.filter((x) => x.outcome === 'finish').length, total: tr.length, ...(fitnessVec ? { worst3: trainVec.slice(0, 3) } : {}) },
          holdout: { fitness: holdFit, finished: ho.filter((x) => x.outcome === 'finish').length, total: ho.length },
          perKind: v3 ? v3ReportByKind(ho, kinds) : v2 ? chainReportByKind(ho, kinds) : [],
        }
        // best-update by the LEXICOGRAPHIC order of the train vector (beatsBest): a pre-vector state file's best
        // keeps its scalar min as a one-element vector, so an old best is beaten at an equal min by any positive
        // second value — the gen-25 deadlock of `0 > 0 = false` is gone. trainFit (scalar min) stays the display.
        if (beatsBest(trainVec, file.best)) {
          file.best = { gen: isl.state.gen, island: best, train: trainFit, holdout: holdFit, genome: theta, trainVec, holdoutVec }
          writeLatestBest('new best by TRAIN')
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
