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
 * The export orchestration, the thumb/tile renderer (trainingThumbSvg.ts) and the headless --score measurement
 * (trainingScoreRun.ts) are shared with the crux exporter (export-crux-training-worlds.ts): exportTrainingWorlds.ts.
 */
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
} from '../../src/policyEvolution/mazeTraining'
import { exportTrainingWorlds } from './exportTrainingWorlds'

void exportTrainingWorlds({
  name: 'maze training worlds',
  specs: MAZE_TRAINING_WORLDS,
  setup: (spec) => {
    const { course, routes, chains } = mazeTrainingRoutes(spec)
    return {
      course,
      context: routes,
      copies: routes.map((route, i) => ({
        points: chains[i]!,
        color: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.end,
        startColor: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.start,
        ox: i * MAZE_TRAIN_ROUTES.spacingM,
      })),
    }
  },
  buildWorld: buildMazeTrainingWorld,
  scoreStageId: mazeScoreStageId,
  score: { carId: mazeCarId, goalPrefix: MAZE_GOAL_PREFIX, goalReachM: MAZE_GOAL_REACH_M, watchLabel: 'maze.score' },
  meta: (spec, routes, bestScore, trialCandidate) => mazeTrainingMeta(spec, routes, bestScore, trialCandidate),
  rowsHeader: `${'world'.padEnd(13)} ${'route'.padStart(5)}  dir  reached  seconds  score`,
  rowOf: (spec, routes, i, r) =>
    `${spec.id.padEnd(13)} ${String(i).padStart(5)}  ${routes[i]!.reversed ? 'rev' : 'fwd'}  ${r.reached ? 'yes' : 'no '}     ${r.seconds.toFixed(1).padStart(5)} s  ${String(r.score).padStart(4)}`,
}).catch((err) => {
  console.error(err)
  process.exitCode = 1
})
