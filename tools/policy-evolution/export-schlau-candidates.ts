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
 *
 * Without a run file (nothing trained yet) the file still ships with the single placeholder candidate, so the
 * dialog's model dropdown works from the first deploy on.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
// tools/renn-mcp is CommonJS (no package.json type field); its exports ride the default interop from this ESM side
import trainingScoreRunCjs from '../renn-mcp/trainingScoreRun'
import type { TrainingCandidateWorldScores } from '../renn-mcp/trainingScoreRun'

const { scoreTrainingWorldStages } = trainingScoreRunCjs as typeof import('../renn-mcp/trainingScoreRun')

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')

const latestBestPath = resolve(root, 'training-data/policy-evolution/schlau/latest-best.json')
const shippedPath = resolve(root, 'src/policyEvolution/shippedPolicySchlau.json')
const outPath = resolve(root, 'public/policy-evolution/schlau-candidates.json')

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

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
