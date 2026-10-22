#!/usr/bin/env npx tsx
/**
 * Write the six schlau training worlds (the schlau policy driving seeded START -> GOAL tasks, one task per world —
 * all six goal_box, seeds 3001-3006, since the user's all-box decision of 2026-10-23 — with the geodesic path as the world's single guidance chain, in-world
 * scoring + chain rendering) to public/exampleWorlds/schlau_<n>/ (File -> Example Worlds, the Schlau car of the
 * Training dialog). Per world: world.json, meta.json (bestScore null until measured) and a top-down thumb.svg plus the
 * single route_0.svg tile (the geodesic path, like the world layout).
 * With --score: run each world headless (the baked schlau candidate, up to 120 s sim, the one car drives, stop once it
 * is within SCHLAU_GOAL_REACH_M of the goal), snapshot the car's watch score AT the moment it reaches (the in-world
 * stage freezes the score at its finish), write the measured bestScore into meta.json and print the table.
 * The baked genome is the shipped schlau policy (src/policyEvolution/shippedPolicySchlau.json, read at call time) or —
 * until a first net is trained — the deterministic placeholder (placeholderSchlauGenome, a fresh seeded H=10 net).
 * RENN_SCHLAU_GENOME_FILE=<file> trials a candidate ({ genome } or { best: { genome } }) WITHOUT touching the shipped
 * one; the trial is named in meta.json. Schlau genomes are NOT v3-shaped (same 29 H + 2 length, different layout —
 * see schlauPolicy.ts): the shape check is ensureSchlauGenome, never ensureV3Inputs.
 * Source of truth: src/policyEvolution/schlauTraining.ts. Update the policy: write shippedPolicySchlau.json, then re-run.
 * The export orchestration, the thumb/tile renderer (trainingThumbSvg.ts) and the headless --score measurement
 * (trainingScoreRun.ts) are shared with the maze/crux exporters (exportTrainingWorlds.ts).
 */
import { readFileSync } from 'node:fs'
import { ensureSchlauGenome, shippedGenomeSchlau } from '../../src/policyEvolution/exampleWorld'
import {
  SCHLAU_CARROT_COLOR,
  SCHLAU_CHAIN_COLORS,
  SCHLAU_GOAL_PREFIX,
  SCHLAU_GOAL_REACH_M,
  SCHLAU_TRAINING_WORLDS,
  buildSchlauTrainingWorld,
  placeholderSchlauGenome,
  schlauCarId,
  schlauScoreStageId,
  schlauTrainingMeta,
  schlauTrainingSetup,
  shippedSchlauTrainingCandidate,
  trialSchlauTrainingCandidate,
} from '../../src/policyEvolution/schlauTraining'
import { exportTrainingWorlds } from './exportTrainingWorlds'

void exportTrainingWorlds({
  name: 'schlau training worlds',
  specs: SCHLAU_TRAINING_WORLDS,
  genome: () => {
    // RENN_SCHLAU_GENOME_FILE: trial a candidate WITHOUT touching the shipped policy (a set-but-broken override
    // fails loudly — never silently fall back to the shipped/placeholder genome)
    const overridePath = process.env.RENN_SCHLAU_GENOME_FILE
    if (overridePath) {
      const parsed = JSON.parse(readFileSync(overridePath, 'utf8')) as { genome?: number[]; best?: { genome?: number[] } }
      const genome = parsed.genome ?? parsed.best?.genome
      if (!genome || genome.length === 0) throw new Error(`RENN_SCHLAU_GENOME_FILE ${overridePath} has no genome`)
      return { genome: ensureSchlauGenome(genome), trialCandidate: trialSchlauTrainingCandidate(parsed, overridePath) }
    }
    const shipped = shippedGenomeSchlau()
    if (!shipped) return { genome: placeholderSchlauGenome() }
    // a shipped policy is named in meta.json (the dialog shows candidate.label) — read the file for its generation
    let parsed: { source?: string } = {}
    try {
      parsed = JSON.parse(readFileSync('src/policyEvolution/shippedPolicySchlau.json', 'utf8')) as { source?: string }
    } catch {
      // label falls back to the plain 'schlau shipped'
    }
    return { genome: shipped, trialCandidate: shippedSchlauTrainingCandidate(parsed) }
  },
  setup: (spec) => {
    const { task, path } = schlauTrainingSetup(spec)
    return {
      boxes: task.boxes,
      context: path,
      // ONE task per world: the single tile is the geodesic nose -> goal path
      copies: [{ points: path, color: SCHLAU_CARROT_COLOR, startColor: SCHLAU_CHAIN_COLORS.start, ox: 0 }],
    }
  },
  buildWorld: buildSchlauTrainingWorld,
  scoreStageId: schlauScoreStageId,
  score: { carId: schlauCarId, goalPrefix: SCHLAU_GOAL_PREFIX, goalReachM: SCHLAU_GOAL_REACH_M, watchLabel: 'schlau.score' },
  meta: (spec, path, bestScore, trialCandidate) => schlauTrainingMeta(spec, path, bestScore, trialCandidate),
  rowsHeader: `${'world'.padEnd(10)} ${'task'.padStart(10)}  reached  seconds  score`,
  rowOf: (spec, _path, _i, r) =>
    `${spec.id.padEnd(10)} ${spec.kind.padStart(10)}  ${r.reached ? 'yes' : 'no '}     ${r.seconds.toFixed(1).padStart(5)} s  ${String(r.score).padStart(4)}`,
}).catch((err) => {
  console.error(err)
  process.exitCode = 1
})
