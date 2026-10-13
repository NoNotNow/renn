#!/usr/bin/env npx tsx
/**
 * Write the 25 crux training worlds (the shipped v3 policy driving the accepted crux band of the v3cruxnose run —
 * 15 train + 10 holdout setups, classes NC1 fast corner / NC2 start swing, one tiny crux copy PER ACCEPTED CHAIN
 * (base path + jittered variants, the same chains the training episodes run) with in-world scoring + chain rendering)
 * to public/exampleWorlds/crux_train_<n>/ and crux_holdout_<n>/ (File -> Example Worlds, Training Crux dialog).
 * Per world: world.json, meta.json (bestScore null until measured) and a top-down thumb.svg (one crux frame per
 * chain copy side by side, like the world layout; base chain orange, jittered variants blue).
 * With --score: run each world headless (shipped v3 candidate, up to 120 s sim, all cars drive simultaneously, stop
 * once EVERY car is within CRUX_GOAL_REACH_M of its goal), snapshot each car's watch score AT the moment it reaches
 * (the in-world stage freezes the score at its finish), write the measured bestScore (max over all chain cars)
 * into meta.json and print the per-chain table. meta.json also carries `tileSvg` (per-chain polylines in
 * route_<i>.svg pixel space + per-chain scores) for the dialog's per-chain tiles.
 * The chain enumeration runs the pure-pursuit acceptance gate, so the physics engine is warmed first (warmCruxGate).
 * Source of truth: src/policyEvolution/cruxTraining.ts. Update the policy: tools/policy-evolution/ship.ts, then re-run.
 * The thumb/tile renderer (trainingThumbSvg.ts) and the headless --score measurement (trainingScoreRun.ts) are shared
 * with the maze exporter (export-maze-training-worlds.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { shippedGenomeV3 } from '../../src/policyEvolution/exampleWorld'
import { warmCruxGate } from '../../src/policyEvolution/cruxChains'
import {
  CRUX_GOAL_PREFIX,
  CRUX_GOAL_REACH_M,
  CRUX_TRAINING_WORLDS,
  CRUX_TRAIN_CHAIN_COLORS,
  CRUX_TRAIN_SPACING_M,
  buildCruxTrainingWorld,
  cruxCarId,
  cruxScoreStageId,
  cruxTrainingMeta,
  cruxTrainingSetup,
  trialCruxTrainingCandidate,
} from '../../src/policyEvolution/cruxTraining'
import type { TrainingCandidate } from '../../src/policyEvolution/cruxTraining'
import type { V2 } from '../../src/avEvolution/eval/geometry'
import { scoreTrainingWorld } from './trainingScoreRun'
import { thumbSvg } from './trainingThumbSvg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const withScore = process.argv.includes('--score')
const MAX_SIM_S = 120

const t0 = Date.now()

async function main(): Promise<void> {
  // the chain enumeration gates every candidate chain through a synchronous pursuit episode (WorldSimulator.createSync)
  await warmCruxGate()
  const genome = shippedGenomeV3()
  if (!genome) throw new Error('shippedPolicyV3.json not shipped yet (tools/policy-evolution/ship.ts)')
  // when trialing via RENN_V3_GENOME_FILE (shippedGenomeV3 reads the same file), name the candidate in meta.json
  // (the dialog shows candidate.label) instead of silently labelling a trial as the shipped policy
  const overridePath = process.env.RENN_V3_GENOME_FILE
  const trialCandidate: TrainingCandidate | undefined = overridePath
    ? trialCruxTrainingCandidate(JSON.parse(readFileSync(overridePath, 'utf8')) as { best?: { gen?: number }; source?: string }, overridePath)
    : undefined
  const rows: string[] = [`${'world'.padEnd(15)} ${'chain'.padStart(5)}  kind  reached  seconds  score`]
  for (const spec of CRUX_TRAINING_WORLDS) {
    const { course, chains } = cruxTrainingSetup(spec)
    const world = buildCruxTrainingWorld(spec, genome)
    const scoreStages = (world.transformers as Record<string, { params?: { vRef?: number; bonusRate?: number; chains?: number[][][]; walls?: V2[][] } }>)
    const scoreStage0 = scoreStages[cruxScoreStageId(0)]
    const chainsWorld = (scoreStage0?.params?.chains ?? []) as number[][][]
    // the line-of-sight gate walls live on each chain's own score stage (shifted to its crux copy)
    const wallsWorld = Array.from({ length: chainsWorld.length }, (_, i) => (scoreStages[cruxScoreStageId(i)]?.params?.walls ?? []) as V2[][])
    const outDir = resolve(root, 'public/exampleWorlds', spec.id)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
    let bestScore: number | null = null
    let chainScores: Array<number | null> = chains.map(() => null)
    if (withScore) {
      const results = await scoreTrainingWorld(world, {
        carId: cruxCarId,
        goalPrefix: CRUX_GOAL_PREFIX,
        goalReachM: CRUX_GOAL_REACH_M,
        watchLabel: 'crux.score',
        maxSimS: MAX_SIM_S,
        chains: chainsWorld,
        walls: wallsWorld,
        vRef: scoreStage0?.params?.vRef ?? 20,
        bonusRate: scoreStage0?.params?.bonusRate ?? 5,
      })
      bestScore = Math.max(...results.map((r) => r.score))
      chainScores = results.map((r) => r.score)
      results.forEach((r, i) => {
        rows.push(`${spec.id.padEnd(15)} ${String(i).padStart(5)}  ${i === 0 ? 'base' : 'jitt'}  ${r.reached ? 'yes' : 'no '}     ${r.seconds.toFixed(1).padStart(5)} s  ${String(r.score).padStart(4)}`)
      })
    }
    // per-chain tiles: individually clickable in the dialog (select the run's target vector); every tile svg shares
    // one pixel size, and the dialog overlays the live active-vector highlight on tileSvg.routes[i].pts
    const tileRoutes: Array<{ pts: Array<[number, number]>; score: number | null }> = []
    let tileW = 0
    let tileH = 0
    chains.forEach((_, i) => {
      const tile = thumbSvg(course.boxes, [
        {
          ox: 0,
          chain: chains[i]!.points,
          color: i === 0 ? CRUX_TRAIN_CHAIN_COLORS.base.end : CRUX_TRAIN_CHAIN_COLORS.jitter.start,
          startColor: i === 0 ? CRUX_TRAIN_CHAIN_COLORS.base.start : CRUX_TRAIN_CHAIN_COLORS.jitter.start,
        },
      ])
      writeFileSync(resolve(outDir, `route_${i}.svg`), tile.svg)
      tileW = tile.w
      tileH = tile.h
      tileRoutes.push({ pts: tile.frames[0]!.pts, score: chainScores[i] })
    })
    const tileSvg = { w: tileW, h: tileH, routes: tileRoutes }
    writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ ...cruxTrainingMeta(spec, chains, bestScore, trialCandidate), tileSvg }, null, 2) + '\n')
    writeFileSync(
      resolve(outDir, 'thumb.svg'),
      thumbSvg(
        course.boxes,
        chains.map((_, i) => ({
          ox: i * CRUX_TRAIN_SPACING_M,
          chain: chains[i]!.points,
          color: i === 0 ? CRUX_TRAIN_CHAIN_COLORS.base.end : CRUX_TRAIN_CHAIN_COLORS.jitter.start,
          startColor: i === 0 ? CRUX_TRAIN_CHAIN_COLORS.base.start : CRUX_TRAIN_CHAIN_COLORS.jitter.start,
        })),
      ).svg,
    )
  }
  invalidateAgentDevExampleWorldIdCache()
  console.log(`crux training worlds written to public/exampleWorlds/ (--score ${withScore ? 'on' : 'off'})`)
  if (withScore) console.log(rows.join('\n'))
  console.log(`wall clock: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
