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
 * The export orchestration, the thumb/tile renderer (trainingThumbSvg.ts) and the headless --score measurement
 * (trainingScoreRun.ts) are shared with the maze exporter (export-maze-training-worlds.ts): exportTrainingWorlds.ts.
 */
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
} from '../../src/policyEvolution/cruxTraining'
import { exportTrainingWorlds } from './exportTrainingWorlds'

void exportTrainingWorlds({
  name: 'crux training worlds',
  specs: CRUX_TRAINING_WORLDS,
  warmup: warmCruxGate,
  setup: (spec) => {
    const { course, chains } = cruxTrainingSetup(spec)
    return {
      boxes: course.boxes,
      context: chains,
      copies: chains.map((chain, i) => ({
        points: chain.points,
        color: i === 0 ? CRUX_TRAIN_CHAIN_COLORS.base.end : CRUX_TRAIN_CHAIN_COLORS.jitter.start,
        startColor: i === 0 ? CRUX_TRAIN_CHAIN_COLORS.base.start : CRUX_TRAIN_CHAIN_COLORS.jitter.start,
        ox: i * CRUX_TRAIN_SPACING_M,
      })),
    }
  },
  buildWorld: buildCruxTrainingWorld,
  scoreStageId: cruxScoreStageId,
  score: { carId: cruxCarId, goalPrefix: CRUX_GOAL_PREFIX, goalReachM: CRUX_GOAL_REACH_M, watchLabel: 'crux.score' },
  meta: (spec, chains, bestScore, trialCandidate) => cruxTrainingMeta(spec, chains, bestScore, trialCandidate),
  rowsHeader: `${'world'.padEnd(15)} ${'chain'.padStart(5)}  kind  reached  seconds  score`,
  rowOf: (spec, _chains, i, r) =>
    `${spec.id.padEnd(15)} ${String(i).padStart(5)}  ${i === 0 ? 'base' : 'jitt'}  ${r.reached ? 'yes' : 'no '}     ${r.seconds.toFixed(1).padStart(5)} s  ${String(r.score).padStart(4)}`,
}).catch((err) => {
  console.error(err)
  process.exitCode = 1
})
