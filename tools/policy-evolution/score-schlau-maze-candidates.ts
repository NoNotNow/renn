#!/usr/bin/env npx tsx
/**
 * score-schlau-maze-candidates: the HEADLESS TRIAL of the schlau candidates on the ten schlau_maze worlds
 * (deliverable 2 of the L2A maze bridge). For every candidate (the base run's best — the headline driver —, the
 * wall-2 and wall-1c wall drivers, and the untrained placeholder as the reference floor) it runs each maze world
 * with the WAYPOINT-SEQUENTIAL goal feed headless: a FRESH world per run (every entity at its document pose —
 * the defined-start rule), every car simultaneously, up to 120 s sim, per-car snapshot at the goal reach
 * (scoreTrainingWorld, watch label 'schlau.score', the same measurement as the exporters' --score).
 *
 * Results land incrementally in test-results/policy-evolution/schlau-maze/:
 *   - results.json  — the raw per-candidate / per-world / per-route records (written after EVERY world)
 *   - RESULTS.md    — the human table (regenerated from results.json after every world)
 * so a long run is interruptible and never silent (append `--worlds 1,2` / `--candidates base` to re-run a subset;
 * already-measured cells are kept unless `--force`).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RennWorld } from '../../src/types/world'
import type { V2 } from '../../src/avEvolution/eval/geometry'
import { ensureSchlauGenome } from '../../src/policyEvolution/exampleWorld'
import { placeholderSchlauGenome } from '../../src/policyEvolution/schlauTraining'
import {
  SCHLAU_MAZE_GOAL_PREFIX,
  SCHLAU_MAZE_WORLDS,
  buildSchlauMazeWorld,
  schlauMazeCarId,
  schlauMazeScoreStageId,
} from '../../src/policyEvolution/schlauMaze'
// tools/renn-mcp is CommonJS (no package.json type field); under tsx its exports ride the DEFAULT interop
import * as trainingScoreRunNs from '../renn-mcp/trainingScoreRun'
import type { TrainingScoreRunResult } from '../renn-mcp/trainingScoreRun'

const trainingScoreRunModule = trainingScoreRunNs as typeof trainingScoreRunNs & { default?: typeof trainingScoreRunNs }
const { scoreTrainingWorld } = (trainingScoreRunModule.default ?? trainingScoreRunModule) as typeof trainingScoreRunNs

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'test-results/policy-evolution/schlau-maze')
const MAX_SIM_S = 120

/** One candidate of the trial: the base best (headline driver), the wall drivers, the placeholder reference. */
interface TrialCandidate {
  id: string
  label: string
  source: string
  gen: number | null
  genome: number[]
}

const runBest = (file: string): TrialCandidate => {
  const parsed = JSON.parse(readFileSync(resolve(root, file), 'utf8')) as { best?: { genome?: number[]; gen?: number } }
  const genome = parsed.best?.genome
  if (!genome || genome.length === 0) throw new Error(`${file} has no best.genome`)
  return { id: file.replace(/^.*[/\\]/, '').replace(/\.json$/, ''), label: `${file.replace(/^.*[/\\]/, '')} best (gen ${parsed.best?.gen ?? 0})`, source: file, gen: parsed.best?.gen ?? 0, genome: ensureSchlauGenome(genome) }
}

/** The trial's candidates (fixed order: headline first, reference floor last). */
function trialCandidates(): TrialCandidate[] {
  const placeholder: TrialCandidate = {
    id: 'placeholder',
    label: 'untrained placeholder (H=10)',
    source: 'placeholderSchlauGenome',
    gen: null,
    genome: placeholderSchlauGenome(),
  }
  return [
    runBest('test-results/policy-evolution/schlau.json'),
    runBest('test-results/policy-evolution/schlau-wall-2.json'),
    runBest('test-results/policy-evolution/schlau-wall-1c.json'),
    placeholder,
  ]
}

// --- incremental results --------------------------------------------------------------------------------------------------

interface RouteResult {
  reached: boolean
  seconds: number
  score: number
}
interface WorldResult {
  /** per-route headless results (route order = the world's copies) */
  routes: RouteResult[]
  /** max route score (the meta bestScore rule) */
  best: number
  /** how many of the routes finished (reached the goal slab within 8 m) */
  finishes: number
}
type ResultsFile = Record<string, Record<string, WorldResult>>

function resultsPath(): string {
  return resolve(outDir, 'results.json')
}

function loadResults(): ResultsFile {
  if (!existsSync(resultsPath())) return {}
  const parsed = JSON.parse(readFileSync(resultsPath(), 'utf8')) as { results?: ResultsFile }
  return parsed.results ?? {}
}

function writeResults(results: ResultsFile, candidates: TrialCandidate[]): void {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resultsPath(), JSON.stringify({ schema: 1, policy: 'schlau', worlds: SCHLAU_MAZE_WORLDS.map((s) => s.id), candidates: candidates.map(({ id, label, source, gen }) => ({ id, label, source, gen })), results }, null, 2) + '\n')
  writeFileSync(resolve(outDir, 'RESULTS.md'), resultsMarkdown(results, candidates))
}

function resultsMarkdown(results: ResultsFile, candidates: TrialCandidate[]): string {
  const lines: string[] = [
    '# Schlau on the renn mazes — headless trial (waypoint-sequential goal feed)',
    '',
    'Every candidate drives all ten `schlau_maze_*` worlds (the maze_train geometry + chains, a schlau car per route',
    'copy, the head fed the NEXT chain waypoint as its single goal; reaching a waypoint advances it, the chain end',
    'is the finish). Fresh world per run (defined start), every car simultaneously, up to 120 s sim, per-car score',
    'snapshotted at the goal reach. Score = the maze metric (1 pt/m chain progress + speed bonus - touch penalties,',
    'wall 12/s object 4/s — the same numbers as the v3 maze worlds).',
    '',
  ]
  // the comparison table: per candidate the route finishes + the mean best score, with the v3 maze worlds'
  // baked meta bestScores as the reference row (the v3 policy drives the same chains with the lookahead feed)
  const v3Best = SCHLAU_MAZE_WORLDS.map((w, i) => {
    try {
      return (JSON.parse(readFileSync(resolve(root, `public/exampleWorlds/maze_train_${i + 1}/meta.json`), 'utf8')) as { bestScore?: number | null }).bestScore ?? null
    } catch {
      return null
    }
  })
  lines.push('| candidate | route finishes | mean best score | worlds cleared (all routes) | worlds with zero finishes |')
  lines.push('|---|---:|---:|---:|---:|')
  for (const cand of candidates) {
    const byWorld = results[cand.id] ?? {}
    const cells = SCHLAU_MAZE_WORLDS.map((w) => byWorld[w.id]).filter((c): c is WorldResult => Boolean(c))
    if (cells.length === 0) continue
    const finishes = cells.reduce((a, c) => a + c.finishes, 0)
    const routes = cells.reduce((a, c) => a + c.routes.length, 0)
    lines.push(
      `| ${cand.label} | ${finishes} / ${routes} | ${(cells.reduce((a, c) => a + c.best, 0) / cells.length).toFixed(1)} | ${cells.filter((c) => c.finishes === c.routes.length).length} | ${cells.filter((c) => c.finishes === 0).length} |`,
    )
  }
  if (v3Best.some((v) => v !== null)) {
    lines.push(`| v3 shipped (reference, lookahead feed) | — | ${(v3Best.filter((v): v is number => v !== null).reduce((a, v) => a + v, 0) / v3Best.filter((v): v is number => v !== null).length).toFixed(1)} | — | — |`)
  }
  lines.push('', 'Per-world best score (max over the routes) vs the v3 maze world of the same seed:', '')
  lines.push(`| world | ${candidates.map((c) => c.id).join(' | ')} | v3 |`)
  lines.push(`|---|${candidates.map(() => '---:').join('|')}|---:|`)
  SCHLAU_MAZE_WORLDS.forEach((w, i) => {
    const cells = candidates.map((c) => results[c.id]?.[w.id])
    lines.push(`| ${w.id} | ${cells.map((c) => (c ? c.best.toFixed(1) : '—')).join(' | ')} | ${v3Best[i] ?? '—'} |`)
  })
  lines.push('')
  for (const cand of candidates) {
    const byWorld = results[cand.id] ?? {}
    const cells = SCHLAU_MAZE_WORLDS.map((w) => byWorld[w.id])
    if (cells.every((c) => !c)) continue
    lines.push(`## ${cand.label} (${cand.id}, gen ${cand.gen ?? '—'})`, '')
    lines.push(`| world | routes | finishes | best score | per-route (score${' '}· s) |`)
    lines.push('|---|---:|---:|---:|---|')
    let finishes = 0
    let routes = 0
    for (const [i, w] of SCHLAU_MAZE_WORLDS.entries()) {
      const r = byWorld[w.id]
      if (!r) {
        lines.push(`| ${w.id} | — | — | — | pending |`)
        continue
      }
      finishes += r.finishes
      routes += r.routes.length
      lines.push(`| ${w.id} | ${r.routes.length} | ${r.finishes} | ${r.best.toFixed(1)} | ${r.routes.map((p) => `${p.score.toFixed(1)}${p.reached ? '' : '?'} ${p.seconds.toFixed(0)}s`).join(' · ')} |`)
    }
    lines.push('', `**Finishes: ${finishes} / ${routes} routes.**`, '')
  }
  const measured = Object.values(results).flatMap((byWorld) => Object.values(byWorld))
  if (measured.length > 0) {
    lines.push(
      `Measured so far: ${measured.length} candidate-world cells, ${measured.reduce((a, m) => a + m.finishes, 0)} route finishes of ${measured.reduce((a, m) => a + m.routes.length, 0)} routes.`,
      '',
    )
  }
  lines.push('(? = route did not reach the goal slab; score = the stage watch score at timeout.)', '')
  return lines.join('\n')
}

// --- trial ----------------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const worldFilter = (() => {
    const i = args.indexOf('--worlds')
    return i >= 0 && args[i + 1] ? new Set(args[i + 1]!.split(',').map(Number)) : null
  })()
  const candFilter = (() => {
    const i = args.indexOf('--candidates')
    return i >= 0 && args[i + 1] ? new Set(args[i + 1]!.split(',')) : null
  })()
  const candidates = trialCandidates().filter((c) => !candFilter || candFilter.has(c.id))
  const specs = SCHLAU_MAZE_WORLDS.filter((_, i) => !worldFilter || worldFilter.has(i + 1))
  const results = loadResults()
  const t0 = Date.now()
  for (const cand of candidates) {
    for (const spec of specs) {
      if (!force && results[cand.id]?.[spec.id]) {
        console.log(`[skip] ${cand.id} / ${spec.id} (already measured)`)
        continue
      }
      const tw = Date.now()
      const world = buildSchlauMazeWorld(spec, cand.genome)
      const scoreStages = (world.transformers as Record<string, { params?: { vRef?: number; bonusRate?: number; chains?: number[][][]; walls?: V2[][] } }>)
      const scoreStage0 = scoreStages[schlauMazeScoreStageId(0)]
      const chainsWorld = (scoreStage0?.params?.chains ?? []) as number[][][]
      const wallsWorld = Array.from({ length: chainsWorld.length }, (_, i) => (scoreStages[schlauMazeScoreStageId(i)]?.params?.walls ?? []) as V2[][])
      const runs = await scoreSchlauMazeWorld(world, chainsWorld, wallsWorld, scoreStage0?.params?.vRef ?? 20, scoreStage0?.params?.bonusRate ?? 5)
      const wr: WorldResult = {
        routes: runs.map((r) => ({ reached: r.reached, seconds: r.seconds, score: r.score })),
        best: Math.max(...runs.map((r) => r.score)),
        finishes: runs.filter((r) => r.reached).length,
      }
      results[cand.id] = { ...(results[cand.id] ?? {}), [spec.id]: wr }
      writeResults(results, candidates)
      console.log(
        `[done] ${cand.id} / ${spec.id}: ${wr.finishes}/${wr.routes.length} finishes, best ${wr.best.toFixed(1)} (${((Date.now() - tw) / 1000).toFixed(1)} s wall)`,
      )
    }
  }
  // always refresh the outputs (a full-skip run still regenerates RESULTS.md, e.g. after a markdown change)
  writeResults(results, candidates)
  console.log(`trial complete: ${((Date.now() - t0) / 1000).toFixed(1)} s wall clock`)
}

async function scoreSchlauMazeWorld(
  world: RennWorld,
  chains: number[][][],
  walls: V2[][][],
  vRef: number,
  bonusRate: number,
): Promise<TrainingScoreRunResult[]> {
  return scoreTrainingWorld(world, {
    carId: (i) => schlauMazeCarId(i),
    goalPrefix: SCHLAU_MAZE_GOAL_PREFIX,
    goalReachM: 8,
    watchLabel: 'schlau.score',
    maxSimS: MAX_SIM_S,
    chains,
    walls,
    vRef,
    bonusRate,
  })
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
