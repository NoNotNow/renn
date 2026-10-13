#!/usr/bin/env npx tsx
/**
 * Write the ten maze training worlds (the shipped v3 policy driving seeded 6x6 mazes, one maze copy per training
 * route — several routes through the maze, some of them in reverse direction — on tapered guidance chains, in-world
 * scoring + chain rendering) to public/exampleWorlds/maze_train_<n>/ (File -> Example Worlds, Maze Training dialog).
 * Per world: world.json, meta.json (bestScore null until measured) and a top-down thumb.svg (one maze frame per route
 * copy side by side, like the world layout; forward chains orange, reversed chains blue).
 * With --score: run each world headless (shipped v3 candidate, up to 120 s sim, all cars drive simultaneously, stop
 * once EVERY car is within MAZE_GOAL_REACH_M of its goal), snapshot each car's watch score AT the moment it reaches
 * (the in-world stage freezes the score at its finish), write the measured bestScore (max over all route cars)
 * into meta.json and print the per-car table. meta.json also carries `tileSvg` (per-route chain polylines in route_<i>.svg
 * pixel space + per-route scores) for the dialog's per-route tiles.
 * Source of truth: src/policyEvolution/mazeTraining.ts. Update the policy: tools/policy-evolution/ship.ts, then re-run.
 * The thumb/tile renderer (trainingThumbSvg.ts) and the headless --score measurement (trainingScoreRun.ts) are shared
 * with the crux exporter (export-crux-training-worlds.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { shippedGenomeV3 } from '../../src/policyEvolution/exampleWorld'
import {
  MAZE_GOAL_PREFIX,
  MAZE_GOAL_REACH_M,
  MAZE_TRAINING_WORLDS,
  MAZE_TRAIN_CHAIN_COLORS,
  MAZE_TRAIN_CHAIN_COLORS_REVERSED,
  MAZE_TRAIN_ROUTES,
  buildMazeTrainingWorld,
  mazeCarId,
  mazeScoreStageId,
  mazeTrainingMeta,
  mazeTrainingRoutes,
  trialMazeTrainingCandidate,
} from '../../src/policyEvolution/mazeTraining'
import type { MazeTrainingCandidate } from '../../src/policyEvolution/mazeTraining'
import type { V2 } from '../../src/avEvolution/eval/geometry'
import { scoreTrainingWorld } from './trainingScoreRun'
import { thumbSvg } from './trainingThumbSvg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const withScore = process.argv.includes('--score')
const MAX_SIM_S = 120

const t0 = Date.now()

async function main(): Promise<void> {
  const genome = shippedGenomeV3()
  if (!genome) throw new Error('shippedPolicyV3.json not shipped yet (tools/policy-evolution/ship.ts)')
  // when trialing via RENN_V3_GENOME_FILE (shippedGenomeV3 reads the same file), name the candidate in meta.json
  // (the dialog shows candidate.label) instead of silently labelling a trial as the shipped policy
  const overridePath = process.env.RENN_V3_GENOME_FILE
  const trialCandidate: MazeTrainingCandidate | undefined = overridePath
    ? trialMazeTrainingCandidate(JSON.parse(readFileSync(overridePath, 'utf8')) as { best?: { gen?: number }; source?: string }, overridePath)
    : undefined
  const rows: string[] = [`${'world'.padEnd(13)} ${'route'.padStart(5)}  dir  reached  seconds  score`]
  for (const spec of MAZE_TRAINING_WORLDS) {
    const { course, routes, chains } = mazeTrainingRoutes(spec)
    const world = buildMazeTrainingWorld(spec, genome)
    const scoreStages = (world.transformers as Record<string, { params?: { vRef?: number; bonusRate?: number; chains?: number[][][]; walls?: V2[][] } }>)
    const scoreStage0 = scoreStages[mazeScoreStageId(0)]
    const chainsWorld = (scoreStage0?.params?.chains ?? []) as number[][][]
    // the line-of-sight gate walls live on each route's own score stage (shifted to its maze copy)
    const wallsWorld = Array.from({ length: chainsWorld.length }, (_, i) => (scoreStages[mazeScoreStageId(i)]?.params?.walls ?? []) as V2[][])
    const outDir = resolve(root, 'public/exampleWorlds', spec.id)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
    let bestScore: number | null = null
    let routeScores: Array<number | null> = routes.map(() => null)
    if (withScore) {
      const results = await scoreTrainingWorld(world, {
        carId: mazeCarId,
        goalPrefix: MAZE_GOAL_PREFIX,
        goalReachM: MAZE_GOAL_REACH_M,
        watchLabel: 'maze.score',
        maxSimS: MAX_SIM_S,
        chains: chainsWorld,
        walls: wallsWorld,
        vRef: scoreStage0?.params?.vRef ?? 20,
        bonusRate: scoreStage0?.params?.bonusRate ?? 5,
      })
      bestScore = Math.max(...results.map((r) => r.score))
      routeScores = results.map((r) => r.score)
      results.forEach((r, i) => {
        rows.push(`${spec.id.padEnd(13)} ${String(i).padStart(5)}  ${routes[i]!.reversed ? 'rev' : 'fwd'}  ${r.reached ? 'yes' : 'no '}     ${r.seconds.toFixed(1).padStart(5)} s  ${String(r.score).padStart(4)}`)
      })
    }
    // per-route tiles: individually clickable in the dialog (select the run's target vector); every tile svg shares
    // one pixel size, and the dialog overlays the live active-vector highlight on tileSvg.routes[i].pts
    const tileRoutes: Array<{ pts: Array<[number, number]>; score: number | null }> = []
    let tileW = 0
    let tileH = 0
    routes.forEach((route, i) => {
      const tile = thumbSvg(course.boxes, [
        {
          ox: 0,
          chain: chains[i]!,
          color: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.end,
          startColor: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.start,
        },
      ])
      writeFileSync(resolve(outDir, `route_${i}.svg`), tile.svg)
      tileW = tile.w
      tileH = tile.h
      tileRoutes.push({ pts: tile.frames[0]!.pts, score: routeScores[i] })
    })
    const tileSvg = { w: tileW, h: tileH, routes: tileRoutes }
    writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ ...mazeTrainingMeta(spec, routes, bestScore, trialCandidate), tileSvg }, null, 2) + '\n')
    writeFileSync(
      resolve(outDir, 'thumb.svg'),
      thumbSvg(
        course.boxes,
        routes.map((route, i) => ({
          ox: i * MAZE_TRAIN_ROUTES.spacingM,
          chain: chains[i]!,
          color: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.end,
          startColor: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.start,
        })),
      ).svg,
    )
  }
  invalidateAgentDevExampleWorldIdCache()
  console.log(`maze training worlds written to public/exampleWorlds/ (--score ${withScore ? 'on' : 'off'})`)
  if (withScore) console.log(rows.join('\n'))
  console.log(`wall clock: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
