/**
 * export-schlau-candidates: writes `public/policy-evolution/schlau-candidates.json` — the candidate models the
 * Schlau car of the Training dialog can load besides the deployed one (the deployed best stays baked into the
 * exported worlds): the ISLAND CENTERS of the schlau training run, the LATEST BEST and the SHIPPED schlau policy
 * (or the untrained placeholder until one is shipped). One flat candidate list (id / label / genome / gen / detail),
 * the same MazeCandidatesFile shape as candidates.json — but `policy: 'schlau'` and SCHLAU-shaped genomes
 * (26 inputs, len = 29 H + 2; the v3 length formula collides, the layout does not — every candidate is checked
 * with ensureSchlauGenome, never ensureV3Inputs).
 *
 * Every candidate also gets headless SCORES over the six schlau training worlds (`scores`: per world the one car's
 * score, measured with the same scoreTrainingWorldStages run as the maze candidates) — the dialog's health dots
 * follow the SELECTED candidate's scores instead of the deployed ones.
 *
 *   npx tsx tools/policy-evolution/export-schlau-candidates.ts [runFile]   # default: training-data/policy-evolution/schlau/latest-best.json's `source`
 *   npx tsx tools/policy-evolution/export-schlau-candidates.ts --fast [latestBestFile]
 *                                                                          # FAST path: merges the given latest-best
 *                                                                          # (default test-results/policy-evolution/latest-best.json)
 *                                                                          # into the existing candidates file within
 *                                                                          # seconds — NO headless scoring; the fresh
 *                                                                          # best is marked unscored until the next full
 *                                                                          # export. tools/policy-evolution/watch-schlau-best.ts
 *                                                                          # runs this on every latest-best change.
 *
 * Without a run file (nothing trained yet) the file still ships with the single placeholder candidate, so the
 * dialog's model dropdown works from the first deploy on.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureSchlauGenome } from '../../src/policyEvolution/exampleWorld'
import {
  SCHLAU_GOAL_PREFIX,
  SCHLAU_GOAL_REACH_M,
  SCHLAU_SCORE_STAGE_BASE,
  SCHLAU_TRAINING_WORLDS,
  buildSchlauTrainingWorld,
  placeholderSchlauGenome,
  schlauCarId,
} from '../../src/policyEvolution/schlauTraining'
// tools/renn-mcp is CommonJS (no package.json type field); under tsx its exports ride the DEFAULT interop,
// under vitest they land on the import NAMESPACE — the fallback keeps the module importable by the fast
// path's unit tests (the full export uses the same function either way).
import * as trainingScoreRunNs from '../renn-mcp/trainingScoreRun'
import type { TrainingCandidateWorldScores } from '../renn-mcp/trainingScoreRun'

const trainingScoreRunModule = trainingScoreRunNs as typeof trainingScoreRunNs & { default?: typeof trainingScoreRunNs }
const { scoreTrainingWorldStages } = (trainingScoreRunModule.default ?? trainingScoreRunModule) as typeof trainingScoreRunNs

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')

const latestBestPath = resolve(root, 'training-data/policy-evolution/schlau/latest-best.json')
const shippedPath = resolve(root, 'src/policyEvolution/shippedPolicySchlau.json')
const outPath = resolve(root, 'public/policy-evolution/schlau-candidates.json')
/** latest-best of the ACTIVE training run (the runner writes it on every new best) — the fast path's default input. */
const fastLatestBestPath = resolve(root, 'test-results/policy-evolution/latest-best.json')

const MAX_SIM_S = 120

interface RunIsland {
  es: { theta?: number[] }
  age?: number
  origin?: string
  stagn?: number
  lastCenter?: number
  bestScore?: number
}

interface SchlauRunFile {
  /** ALWAYS 'schlau' — schlau genomes are length-identical to v3 genomes (29 H + 2); the tag is the only difference */
  policy?: string
  source?: string
  state?: { gen?: number; islands?: RunIsland[] }
  best?: { gen?: number; island?: number; genome?: number[] }
}

interface ExportedCandidate {
  id: string
  label: string
  gen: number | null
  genome: number[]
  detail: string
  scores?: Record<string, TrainingCandidateWorldScores>
  scoredGen?: number | null
}

/** latest-best.json of the ACTIVE run (schema renn.policy-evolution.latest-best/1) — the fast path's input. */
export interface SchlauLatestBestFile {
  schema?: string
  source?: string
  policy?: string
  best?: { gen?: number; island?: number; genome?: number[] }
}

/** The exported candidates file (the shape main() writes and the training dialog's picker reads). */
export interface SchlauCandidatesFile {
  schema: string
  source: string
  policy: string
  gen: number | null
  updatedAt: string
  candidates: ExportedCandidate[]
}

/**
 * Pure merge of the FAST path: splices the run's latest-best genome into an existing candidates file as its
 * `best` entry — NO headless scoring (`scores`/`scoredGen` are dropped: stale for a new genome; the dialog's
 * picker then hides that entry's health dots until the next FULL export re-scores). The entry updates IN PLACE
 * when the file already has a `best`, else inserts before the shipped/placeholder tail; islands and every
 * other entry ride along untouched, and the file-level `source`/`gen` keep describing the last full export
 * (only `updatedAt` moves). `existing` null (nothing exported yet) creates a fresh schlau file with just the
 * best, so the picker works before any full export ran.
 */
export function mergeFastBest(
  existing: SchlauCandidatesFile | null,
  latestBest: SchlauLatestBestFile,
  now: Date = new Date(),
): SchlauCandidatesFile {
  if (latestBest.policy != null && latestBest.policy !== 'schlau')
    throw new Error(`latest-best.json policy '${latestBest.policy}' is not 'schlau' — never export a non-schlau genome as a schlau candidate`)
  if (existing != null && existing.policy != null && existing.policy !== 'schlau')
    throw new Error(`existing candidates file policy '${existing.policy}' is not 'schlau' — the fast path never merges into another policy's file`)
  const genome = latestBest.best?.genome
  if (!Array.isArray(genome) || genome.length === 0 || !genome.every((w) => typeof w === 'number' && Number.isFinite(w)))
    throw new Error('latest-best.json has no usable best.genome (non-empty finite number array)')
  ensureSchlauGenome(genome)
  const best: ExportedCandidate = {
    id: 'best',
    label: 'Best',
    gen: latestBest.best?.gen ?? null,
    genome,
    detail: `latest best by train fitness${latestBest.best?.island != null ? ` (island ${latestBest.best.island})` : ''} — fresh export, headless scores pending`,
  }
  if (existing == null) {
    return {
      schema: 'renn.policy-evolution.candidates/1',
      source: latestBest.source ?? 'unknown (fast export before the first full export)',
      policy: 'schlau',
      gen: latestBest.best?.gen ?? null,
      updatedAt: now.toISOString(),
      candidates: [best],
    }
  }
  const candidates = existing.candidates.map((c) => ({ ...c }))
  const at = candidates.findIndex((c) => c.id === 'best')
  if (at >= 0) candidates[at] = best
  else {
    const tail = candidates.findIndex((c) => c.id === 'shipped' || c.id === 'placeholder')
    if (tail >= 0) candidates.splice(tail, 0, best)
    else candidates.push(best)
  }
  return { ...existing, candidates, updatedAt: now.toISOString() }
}

export type FastExportStatus = 'updated' | 'created' | 'skipped'
export interface FastExportResult {
  status: FastExportStatus
  gen: number | null
  detail: string
}

/**
 * One fast-path run: reads the run's latest-best.json, merges its best into the exported candidates file and
 * writes it ATOMICALLY (tmp + rename), so a racing FULL export (plain writeFileSync) never leaves a torn file
 * for the dialog's runtime fetch — worst case one write wins, and the watcher's next change re-runs the fast
 * path. Any read/parse problem (either file caught mid-write, or a non-schlau/broken latest-best) returns
 * 'skipped' instead of throwing: the watcher keeps its state and retries on the next poll.
 */
export function runFastExport(opts: { latestBestPath: string; outPath: string; now?: Date }): FastExportResult {
  let latestBest: SchlauLatestBestFile
  let existing: SchlauCandidatesFile | null
  try {
    latestBest = JSON.parse(readFileSync(opts.latestBestPath, 'utf8')) as SchlauLatestBestFile
    existing = existsSync(opts.outPath) ? (JSON.parse(readFileSync(opts.outPath, 'utf8')) as SchlauCandidatesFile) : null
  } catch (e) {
    return { status: 'skipped', gen: null, detail: `read/parse failed: ${e instanceof Error ? e.message : String(e)}` }
  }
  let merged: SchlauCandidatesFile
  try {
    merged = mergeFastBest(existing, latestBest, opts.now)
  } catch (e) {
    return { status: 'skipped', gen: null, detail: e instanceof Error ? e.message : String(e) }
  }
  mkdirSync(dirname(opts.outPath), { recursive: true })
  const tmp = `${opts.outPath}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(merged))
  renameSync(tmp, opts.outPath)
  return {
    status: existing == null ? 'created' : 'updated',
    gen: latestBest.best?.gen ?? null,
    detail: `best gen ${latestBest.best?.gen ?? '?'} -> ${opts.outPath.slice(root.length + 1)} (unscored fast export)`,
  }
}

const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '?')

async function main(): Promise<void> {
  // the run file: the argument, or latest-best.json's `source` (the training run's --out)
  let runFile: string | null = null
  if (process.argv[2]) runFile = resolve(root, process.argv[2])
  else if (existsSync(latestBestPath)) {
    const lb = JSON.parse(readFileSync(latestBestPath, 'utf8')) as { source?: string }
    if (!lb.source) throw new Error('latest-best.json has no source — pass the run file as an argument')
    runFile = resolve(root, lb.source)
  }
  const run = runFile && existsSync(runFile) ? (JSON.parse(readFileSync(runFile, 'utf8')) as SchlauRunFile) : null
  if (run && run.policy !== 'schlau')
    throw new Error(`${runFile}: policy '${String(run.policy)}' is not 'schlau' — schlau and v3 genomes share the 29 H + 2 length but NOT the layout; never export v3 candidates as schlau`)

  const candidates: ExportedCandidate[] = []
  const islands = run?.state?.islands ?? []
  for (const [k, island] of islands.entries()) {
    const genome = island.es.theta
    if (!genome || genome.length === 0) throw new Error(`island ${k} has no es.theta`)
    candidates.push({
      id: `island-${k}`,
      label: `I${k + 1}`,
      gen: run?.state?.gen ?? null,
      genome,
      detail: `island ${k + 1} center · age ${island.age ?? '?'} · origin ${island.origin ?? '?'} · stagn ${island.stagn ?? '?'} · lastCenter ${island.lastCenter ?? '?'} · bestScore ${num(island.bestScore)}`,
    })
  }

  const best = run?.best?.genome
  if (best && best.length > 0) {
    candidates.push({
      id: 'best',
      label: 'Best',
      gen: run?.best?.gen ?? null,
      genome: best,
      detail: `latest best by train fitness${run?.best?.island != null ? ` (island ${run.best.island})` : ''}`,
    })
  }

  if (existsSync(shippedPath)) {
    const shipped = JSON.parse(readFileSync(shippedPath, 'utf8')) as { genome?: number[]; source?: string }
    if (shipped.genome && shipped.genome.length > 0) {
      const genMatch = /generation (\d+)/.exec(shipped.source ?? '')
      candidates.push({
        id: 'shipped',
        label: 'Shipped',
        gen: genMatch ? Number(genMatch[1]) : null,
        genome: shipped.genome,
        detail: 'shippedPolicySchlau.json (the shipped schlau policy)',
      })
    }
  }
  if (!candidates.some((c) => c.id === 'shipped')) {
    candidates.push({
      id: 'placeholder',
      label: 'Placeholder',
      gen: null,
      genome: placeholderSchlauGenome(),
      detail: 'untrained placeholder net (no shippedPolicySchlau.json yet)',
    })
  }

  // schlau shape on EVERY candidate (never ensureV3Inputs — a v3 genome is not a schlau genome despite the same length)
  for (const c of candidates) ensureSchlauGenome(c.genome)

  // headless scores per candidate over the six schlau training worlds (same measurement as the exporters' --score):
  // the dialog's health dots show the selected candidate's weakest world, not the deployed one's
  const t0 = Date.now()
  const scoreRows: string[] = []
  for (const candidate of candidates) {
    const scores: Record<string, TrainingCandidateWorldScores> = {}
    for (const spec of SCHLAU_TRAINING_WORLDS) {
      scores[spec.id] = await scoreTrainingWorldStages(buildSchlauTrainingWorld(spec, candidate.genome), {
        scoreStageBase: SCHLAU_SCORE_STAGE_BASE,
        carId: schlauCarId,
        goalPrefix: SCHLAU_GOAL_PREFIX,
        goalReachM: SCHLAU_GOAL_REACH_M,
        watchLabel: 'schlau.score',
        maxSimS: MAX_SIM_S,
      })
    }
    candidate.scores = scores
    candidate.scoredGen = run?.state?.gen ?? null
    const worlds = Object.keys(scores)
    const sumBest = worlds.reduce((a, id) => a + scores[id]!.best, 0)
    const worsts = worlds.map((id) => scores[id]!.routes.filter((s): s is number => s != null)).filter((r) => r.length > 0).map((r) => Math.min(...r))
    scoreRows.push(`${candidate.label}: Σ Best ${Math.round(sumBest)} · Σ Worst ${Math.round(worsts.reduce((a, w) => a + w, 0))}`)
  }

  const file = {
    schema: 'renn.policy-evolution.candidates/1',
    source: runFile ? runFile.slice(root.length + 1) : 'placeholder (nothing trained yet)',
    policy: 'schlau',
    gen: run?.state?.gen ?? null,
    updatedAt: new Date().toISOString(),
    candidates,
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(file))
  console.log(
    `candidates -> ${outPath.slice(root.length + 1)} (gen ${file.gen}: ${candidates.map((c) => `${c.label} ${c.genome.length}w`).join(', ')})`,
  )
  console.log(`scores (${((Date.now() - t0) / 1000).toFixed(1)} s): ${scoreRows.join(' · ')}`)
}

// main() runs only when this file is the executed script — the fast path (watch-schlau-best.ts) and the unit
// tests import the pure functions above without triggering a full (minutes-slow) export.
const invokedDirectly = process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  if (process.argv.includes('--fast')) {
    const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))
    const result = runFastExport({
      latestBestPath: arg ? resolve(root, arg) : fastLatestBestPath,
      outPath,
    })
    console.log(`${result.status}: ${result.detail}`)
    process.exit(result.status === 'skipped' ? 1 : 0)
  }
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
