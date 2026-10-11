import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hiddenOfLength, N_IN_V2, N_IN_V3, padV1Genome, padV2Genome } from '@/policyEvolution/policy'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const AV_STACK_TRANSFORMER_DIR = resolve(moduleDir, '../../public/global/transformers/av-stack')

/** Logical stage id → source file. Order here is the execution order of the stack. */
export const AV_STACK_STAGE_FILES = {
  ego: 'av-ego.js',
  mission: 'av-mission.js',
  wander: 'av-wander.js',
  perception: 'av-perception.js',
  waypointViz: 'av-waypoint-viz.js',
  routePlanner: 'av-route-planner.js',
  motionPlanner: 'av-motion-planner.js',
  speedPlanner: 'av-speed-planner.js',
  neural: 'av-neural.js',
  supervisor: 'av-supervisor.js',
  lateral: 'av-control-lateral.js',
  longitudinal: 'av-control-longitudinal.js',
  aeb: 'av-aeb.js',
} as const

export type AvStackLogicalStage = keyof typeof AV_STACK_STAGE_FILES

export function avStackChecksum(): string {
  const all = (Object.keys(AV_STACK_STAGE_FILES) as AvStackLogicalStage[]).map((k) => readAvStackStageCode(k)).join('\n')
  return createHash('sha256').update(all).digest('hex').slice(0, 12)
}

export function readAvStackStageCode(logical: AvStackLogicalStage): string {
  return readFileSync(resolve(AV_STACK_TRANSFORMER_DIR, AV_STACK_STAGE_FILES[logical]), 'utf8')
}

/** Zero-pad a legacy 24-input (v2-shaped) genome onto the two touch inputs: identical function, 26-input layout (29 H + 2). */
function ensureTouchInputs(genome: number[]): number[] {
  if (hiddenOfLength(genome.length, N_IN_V3)) return genome
  if (hiddenOfLength(genome.length, N_IN_V2)) return padV2Genome(genome)
  throw new Error(`neural stage weights of ${genome.length} numbers fit neither the 26-input (29 H + 2) nor the legacy 24-input (27 H + 2) layout`)
}

/**
 * Weights of the neural drive stage (26 inputs, legacy 24-input files zero-padded onto the touch inputs — identical function):
 * `avNeuralWeights.json` (a v2 genome PROMOTED for the AV car after an A/B in the full stack, see plan-policy-in-av-car.md Phase 3) when it
 * exists at library build time, else the shipped v1 genome zero-padded to v2 and on to the touch inputs (identical function).
 * Deliberately not `shippedPolicyV2.json`: a policy that wins on the training chains can still be worse inside the AV
 * (measured 2026-10-10: the first v2 net stalled in the crowd cases). Node-only (reads the repo files), like the stage code above.
 */
export function readNeuralStageWeights(): number[] {
  const dir = resolve(moduleDir, '../policyEvolution')
  const promoted = resolve(dir, 'avNeuralWeights.json')
  if (existsSync(promoted)) return ensureTouchInputs((JSON.parse(readFileSync(promoted, 'utf8')) as { genome: number[] }).genome)
  return padV2Genome(padV1Genome((JSON.parse(readFileSync(resolve(dir, 'shippedPolicy.json'), 'utf8')) as { genome: number[] }).genome))
}

/**
 * Default weights of the v3 policy (`neuralPolicy: 'v3'`, H = 24): `avNeuralWeightsV3.json`, GENERATED from `shippedPolicyV3.json` by
 * `tools/policy-evolution/export-av-neural-stage.ts` (so `npm run sync:global-pipeline` alone picks up a new `ship.ts` result). Falls back to
 * `shippedPolicyV3.json` itself when the generated file is missing. Legacy 24-input files are zero-padded onto the touch inputs
 * (identical function). An explicit `neuralWeights` param still wins in the stage.
 */
export function readNeuralStageWeightsV3(): number[] {
  const dir = resolve(moduleDir, '../policyEvolution')
  const generated = resolve(dir, 'avNeuralWeightsV3.json')
  const file = existsSync(generated) ? generated : resolve(dir, 'shippedPolicyV3.json')
  return ensureTouchInputs((JSON.parse(readFileSync(file, 'utf8')) as { genome: number[] }).genome)
}
