/**
 * export-maze-candidates: writes `public/policy-evolution/candidates.json` — the candidate models the Training
 * Mazes dialog can load besides the deployed one (the deployed best stays baked into the exported worlds):
 * the ISLAND CENTERS of the training run, the LATEST BEST and the SHIPPED policy. One flat candidate list
 * (id / label / genome / gen / detail tooltip); the dialog renders one chip per candidate.
 *
 * Every candidate also gets headless SCORES over all maze + crux training worlds (`scores`: per world the best
 * over cars + the per-route scores, measured with the same scoreTrainingWorld run as the exporters' --score) —
 * the dialog's health dots follow the SELECTED candidate's scores instead of the deployed ones. Scoring the
 * full set is fast (a reached world scores in well under a second), so the auto-trial watcher can refresh it
 * every cycle while the islands move.
 *
 * The auto-trial watcher refreshes this file every cycle while the training runs; it also deploys with the site
 * (public/ is served as-is). Genomes are stored in the v3 26-input layout (the shipped legacy 24-input genome is
 * zero-padded via ensureV3Inputs, bit-identical behavior), so the dialog can swap `params.w` of the drive stages
 * without any shape handling.
 *
 *   npx tsx tools/policy-evolution/export-maze-candidates.ts [runFile]   # default: latest-best.json's `source`
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ensureV3Inputs } from '../../src/policyEvolution/exampleWorld'
import {
  CRUX_GOAL_PREFIX,
  CRUX_GOAL_REACH_M,
  CRUX_SCORE_STAGE_BASE,
  CRUX_TRAINING_WORLDS,
  buildCruxTrainingWorld,
  cruxCarId,
} from '../../src/policyEvolution/cruxTraining'
import { warmCruxGate } from '../../src/policyEvolution/cruxChains'
import { readWfCandidates } from '../../src/policyEvolution/wfCandidateWorlds'
import {
  MAZE_GOAL_PREFIX,
  MAZE_GOAL_REACH_M,
  MAZE_SCORE_STAGE_BASE,
  MAZE_TRAINING_WORLDS,
  buildMazeTrainingWorld,
  mazeCarId,
} from '../../src/policyEvolution/mazeTraining'
// tools/renn-mcp is CommonJS (no package.json type field); its exports ride the default interop from this ESM side
import trainingScoreRunCjs from '../renn-mcp/trainingScoreRun'
import type { TrainingCandidateWorldScores } from '../renn-mcp/trainingScoreRun'

const { scoreTrainingWorldStages } = trainingScoreRunCjs as typeof import('../renn-mcp/trainingScoreRun')

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')

const latestBestPath = resolve(root, 'training-data/policy-evolution/latest-best.json')
const shippedPath = resolve(root, 'src/policyEvolution/shippedPolicyV3.json')
const outPath = resolve(root, 'public/policy-evolution/candidates.json')

const MAX_SIM_S = 120

interface RunIsland {
  es: { theta?: number[] }
  age?: number
  origin?: string
  stagn?: number
  lastCenter?: number
  bestScore?: number
}

interface RunFile {
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
  const runFile = resolve(root, process.argv[2] ?? (() => {
    const lb = JSON.parse(readFileSync(latestBestPath, 'utf8')) as { source?: string }
    if (!lb.source) throw new Error('latest-best.json has no source — pass the run file as an argument')
    return lb.source
  })())

  const run = JSON.parse(readFileSync(runFile, 'utf8')) as RunFile
  const islands = run.state?.islands ?? []
  if (islands.length === 0) throw new Error(`${runFile} has no islands`)

  const candidates: ExportedCandidate[] = islands.map((island, k) => {
    const genome = island.es.theta
    if (!genome || genome.length === 0) throw new Error(`island ${k} has no es.theta`)
    return {
      id: `island-${k}`,
      label: `I${k + 1}`,
      gen: run.state?.gen ?? null,
      genome,
      detail: `island ${k + 1} center · age ${island.age ?? '?'} · origin ${island.origin ?? '?'} · stagn ${island.stagn ?? '?'} · lastCenter ${island.lastCenter ?? '?'} · bestScore ${num(island.bestScore)}`,
    }
  })

  const best = run.best?.genome
  if (best && best.length > 0) {
    candidates.push({
      id: 'best',
      label: 'Best',
      gen: run.best?.gen ?? null,
      genome: best,
      detail: `latest best by train fitness${run.best?.island != null ? ` (island ${run.best.island})` : ''}`,
    })
  }

  const shipped = JSON.parse(readFileSync(shippedPath, 'utf8')) as { genome?: number[]; source?: string }
  if (shipped.genome && shipped.genome.length > 0) {
    const genMatch = /generation (\d+)/.exec(shipped.source ?? '')
    candidates.push({
      id: 'shipped',
      label: 'Shipped',
      gen: genMatch ? Number(genMatch[1]) : null,
      genome: ensureV3Inputs(shipped.genome),
      detail: 'shippedPolicyV3.json (the shipped policy)',
    })
  }

  // widen-freeze candidates (public/policy-evolution/wf-candidates.json): EVERY manifest entry becomes a
  // dropdown model — entries whose genome file does not exist yet (a stretch still training) are skipped here
  // too, so re-running this script is all it takes once the stretch wrote its candidate file
  for (const wf of readWfCandidates()) {
    candidates.push({
      id: wf.id,
      label: wf.chipLabel ?? wf.label,
      gen: wf.gen,
      genome: wf.genome,
      detail: wf.detail ?? wf.label,
    })
  }

  for (const c of candidates) ensureV3Inputs(c.genome)

  // headless scores per candidate over BOTH training sets (same measurement as the exporters' --score): the
  // dialog's health dots show the selected candidate's weakest link, not the deployed one's
  const t0 = Date.now()
  const scoreRows: string[] = []
  // the crux chain enumeration runs the pure-pursuit acceptance gate (builds simulators) — warm the engine first
  await warmCruxGate()
  for (const candidate of candidates) {
    const scores: Record<string, TrainingCandidateWorldScores> = {}
    for (const spec of MAZE_TRAINING_WORLDS) {
      scores[spec.id] = await scoreTrainingWorldStages(buildMazeTrainingWorld(spec, candidate.genome), {
        scoreStageBase: MAZE_SCORE_STAGE_BASE,
        carId: mazeCarId,
        goalPrefix: MAZE_GOAL_PREFIX,
        goalReachM: MAZE_GOAL_REACH_M,
        watchLabel: 'maze.score',
        maxSimS: MAX_SIM_S,
      })
    }
    for (const spec of CRUX_TRAINING_WORLDS) {
      scores[spec.id] = await scoreTrainingWorldStages(buildCruxTrainingWorld(spec, candidate.genome), {
        scoreStageBase: CRUX_SCORE_STAGE_BASE,
        carId: cruxCarId,
        goalPrefix: CRUX_GOAL_PREFIX,
        goalReachM: CRUX_GOAL_REACH_M,
        watchLabel: 'crux.score',
        maxSimS: MAX_SIM_S,
      })
    }
    candidate.scores = scores
    candidate.scoredGen = run.state?.gen ?? null
    const worlds = Object.keys(scores)
    const sumBest = worlds.reduce((a, id) => a + scores[id]!.best, 0)
    const worsts = worlds.map((id) => scores[id]!.routes.filter((s): s is number => s != null)).filter((r) => r.length > 0).map((r) => Math.min(...r))
    scoreRows.push(`${candidate.label}: Σ Best ${Math.round(sumBest)} · Σ Worst ${Math.round(worsts.reduce((a, w) => a + w, 0))}`)
  }

  const file = {
    schema: 'renn.policy-evolution.candidates/1',
    source: runFile.slice(root.length + 1),
    policy: 'v3',
    gen: run.state?.gen ?? null,
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
