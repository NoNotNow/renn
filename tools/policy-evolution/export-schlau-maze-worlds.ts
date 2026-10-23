#!/usr/bin/env npx tsx
/**
 * export-schlau-maze-worlds: writes the ten SCHLAU MAZE worlds (public/exampleWorlds/schlau_maze_<n>/) — the maze
 * geometry + waypoint chains of the maze_train worlds, driven by the schlau policy through the WAYPOINT-SEQUENTIAL
 * goal feed (schlauMaze.ts: the head gets ONE goal, the next chain waypoint; reaching it advances the goal; the
 * chain end is the finish). Per world: world.json, meta.json (+ tileSvg), route_<i>.svg tiles and thumb.svg, like
 * the maze training-world export.
 *
 * With --score: run each world headless (every car simultaneously, up to 120 s sim, per-car snapshot at the goal
 * reach, watch label 'schlau.score'), write the measured bestScore into meta.json and print the table — the same
 * scoreTrainingWorld measurement as the maze/crux/schlau exporters.
 *
 * Baked genome (precedence, all shape-checked with ensureSchlauGenome / hiddenOfSchlau — a v3 genome must NEVER be
 * baked: same 29 H + 2 length, different layout):
 *   1. RENN_SCHLAU_GENOME_FILE=<file>  — trial a candidate ({ genome } or { best: { genome } }); named in meta.json
 *   2. the shipped schlau policy        — src/policyEvolution/shippedPolicySchlau.json (once L2-B ships one)
 *   3. the base run's best              — test-results/policy-evolution/schlau.json best (the headline driver)
 *   4. the untrained placeholder        — placeholderSchlauGenome()
 *
 * Source of truth: src/policyEvolution/schlauMaze.ts. Re-run after every ship or new best.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RennWorld } from '../../src/types/world'
import type { V2 } from '../../src/avEvolution/eval/geometry'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { ensureSchlauGenome, shippedGenomeSchlau } from '../../src/policyEvolution/exampleWorld'
import {
  MAZE_TRAIN_CHAIN_COLORS,
  MAZE_TRAIN_CHAIN_COLORS_REVERSED,
  MAZE_TRAIN_ROUTES,
  mazeTrainingRoutes,
} from '../../src/policyEvolution/mazeTraining'
import { placeholderSchlauGenome, type SchlauTrainingCandidate } from '../../src/policyEvolution/schlauTraining'
import {
  SCHLAU_MAZE_GOAL_PREFIX,
  SCHLAU_MAZE_WORLDS,
  buildSchlauMazeWorld,
  schlauMazeCarId,
  schlauMazeMeta,
  schlauMazeScoreStageId,
} from '../../src/policyEvolution/schlauMaze'
// tools/renn-mcp is CommonJS (no package.json type field); under tsx its exports ride the DEFAULT interop (the
// same fallback as tools/policy-evolution/export-schlau-candidates.ts)
import * as trainingScoreRunNs from '../renn-mcp/trainingScoreRun'
import type { TrainingScoreRunResult } from '../renn-mcp/trainingScoreRun'
import * as trainingThumbSvgNs from '../renn-mcp/trainingThumbSvg'

const trainingScoreRunModule = trainingScoreRunNs as typeof trainingScoreRunNs & { default?: typeof trainingScoreRunNs }
const { scoreTrainingWorld } = (trainingScoreRunModule.default ?? trainingScoreRunModule) as typeof trainingScoreRunNs
const trainingThumbSvgModule = trainingThumbSvgNs as typeof trainingThumbSvgNs & { default?: typeof trainingThumbSvgNs }
const { thumbSvg } = (trainingThumbSvgModule.default ?? trainingThumbSvgModule) as typeof trainingThumbSvgNs

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MAX_SIM_S = 120
const BASE_RUN_FILE = 'test-results/policy-evolution/schlau.json'

/** The baked genome + the candidate identity named in meta.json (see the header's precedence). */
function bakedGenome(): { genome: number[]; candidate: SchlauTrainingCandidate } {
  const overridePath = process.env.RENN_SCHLAU_GENOME_FILE
  if (overridePath) {
    const parsed = JSON.parse(readFileSync(overridePath, 'utf8')) as { genome?: number[]; best?: { genome?: number[]; gen?: number } }
    const genome = parsed.genome ?? parsed.best?.genome
    if (!genome || genome.length === 0) throw new Error(`RENN_SCHLAU_GENOME_FILE ${overridePath} has no genome`)
    return {
      genome: ensureSchlauGenome(genome),
      candidate: {
        policy: 'schlau',
        label: `${overridePath.replace(/^.*[/\\]/, '').replace(/\.json$/, '')} trial (gen ${parsed.best?.gen ?? 0})`,
        gen: parsed.best?.gen ?? 0,
        source: overridePath,
      },
    }
  }
  const shipped = shippedGenomeSchlau()
  if (shipped) {
    let gen: number | null = null
    try {
      const parsed = JSON.parse(readFileSync('src/policyEvolution/shippedPolicySchlau.json', 'utf8')) as { source?: string }
      const m = /generation (\d+)/.exec(parsed.source ?? '')
      gen = m ? Number(m[1]) : null
    } catch {
      // label falls back to the plain 'schlau shipped'
    }
    return { genome: shipped, candidate: { policy: 'schlau', label: gen !== null ? `schlau shipped (gen ${gen})` : 'schlau shipped', gen, source: 'shippedPolicySchlau.json' } }
  }
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, BASE_RUN_FILE), 'utf8')) as { best?: { genome?: number[]; gen?: number } }
    const genome = parsed.best?.genome
    if (genome && genome.length > 0) {
      return {
        genome: ensureSchlauGenome(genome),
        candidate: { policy: 'schlau', label: `schlau base best (gen ${parsed.best?.gen ?? 0})`, gen: parsed.best?.gen ?? 0, source: BASE_RUN_FILE },
      }
    }
  } catch {
    // no run file yet — fall through to the placeholder
  }
  return { genome: placeholderSchlauGenome(), candidate: { policy: 'schlau', label: 'schlau (untrained placeholder)', gen: null, source: 'placeholder' } }
}

async function main(): Promise<void> {
  const t0 = Date.now()
  const { genome, candidate } = bakedGenome()
  const withScore = process.argv.includes('--score')
  console.log(`schlau maze worlds: baking ${candidate.label}`)
  const rows: string[] = [`${'world'.padEnd(14)} ${'routes'.padStart(5)}  reached            seconds  score`]
  for (const spec of SCHLAU_MAZE_WORLDS) {
    const world = buildSchlauMazeWorld(spec, genome)
    const scoreStages = (world.transformers as Record<string, { params?: { vRef?: number; bonusRate?: number; chains?: number[][][]; walls?: V2[][] } }>)
    const scoreStage0 = scoreStages[schlauMazeScoreStageId(0)]
    const chainsWorld = (scoreStage0?.params?.chains ?? []) as number[][][]
    const wallsWorld = Array.from({ length: chainsWorld.length }, (_, i) => (scoreStages[schlauMazeScoreStageId(i)]?.params?.walls ?? []) as V2[][])
    const outDir = resolve(root, 'public/exampleWorlds', spec.id)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
    let bestScore: number | null = null
    let copyScores: Array<number | null> = chainsWorld.map(() => null)
    if (withScore) {
      const results = await scoreSchlauMazeWorld(world, chainsWorld, wallsWorld, scoreStage0?.params?.vRef ?? 20, scoreStage0?.params?.bonusRate ?? 5)
      bestScore = Math.max(...results.map((r) => r.score))
      copyScores = results.map((r) => r.score)
      results.forEach((r, i) =>
        rows.push(
          `${spec.id.padEnd(14)} ${String(i).padStart(5)}  ${r.reached ? 'yes' : 'no '}      ${String(r.score).padStart(8)}  ${r.seconds.toFixed(1).padStart(5)} s`,
        ),
      )
    }
    const { course, routes, chains } = mazeTrainingRoutes(spec)
    const copies = routes.map((route, i) => ({
      ox: i * MAZE_TRAIN_ROUTES.spacingM,
      chain: chains[i]!,
      color: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.end : MAZE_TRAIN_CHAIN_COLORS.end,
      startColor: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.start,
    }))
    const tileRoutes: Array<{ pts: Array<[number, number]>; score: number | null }> = []
    let tileW = 0
    let tileH = 0
    copies.forEach((copy, i) => {
      const tile = thumbSvg(course.boxes, [{ ox: 0, chain: copy.chain, color: copy.color, startColor: copy.startColor }])
      writeFileSync(resolve(outDir, `route_${i}.svg`), tile.svg)
      tileW = tile.w
      tileH = tile.h
      tileRoutes.push({ pts: tile.frames[0]!.pts, score: copyScores[i] })
    })
    writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ ...schlauMazeMeta(spec, bestScore, candidate), tileSvg: { w: tileW, h: tileH, routes: tileRoutes } }, null, 2) + '\n')
    writeFileSync(resolve(outDir, 'thumb.svg'), thumbSvg(course.boxes, copies).svg)
    console.log(`${spec.id} written (${routes.length} routes)`)
  }
  invalidateAgentDevExampleWorldIdCache()
  console.log(`schlau maze worlds written to public/exampleWorlds/ (--score ${withScore ? 'on' : 'off'})`)
  if (withScore) console.log(rows.join('\n'))
  console.log(`wall clock: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

/** Headless measurement of one schlau maze world (every car simultaneously; fresh world = defined start). */
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
