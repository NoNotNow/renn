import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { padV1Genome } from '@/policyEvolution/policy'

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

/**
 * Weights of the neural drive stage (v2 genome, 272 numbers): `avNeuralWeights.json` (a v2 genome PROMOTED for the AV car after an A/B in the
 * full stack, see plan-policy-in-av-car.md Phase 3) when it exists at library build time, else the shipped v1 genome zero-padded to v2
 * (identical function). Deliberately not `shippedPolicyV2.json`: a policy that wins on the training chains can still be worse inside the AV
 * (measured 2026-10-10: the first v2 net stalled in the crowd cases). Node-only (reads the repo files), like the stage code above.
 */
export function readNeuralStageWeights(): number[] {
  const dir = resolve(moduleDir, '../policyEvolution')
  const promoted = resolve(dir, 'avNeuralWeights.json')
  if (existsSync(promoted)) return (JSON.parse(readFileSync(promoted, 'utf8')) as { genome: number[] }).genome
  return padV1Genome((JSON.parse(readFileSync(resolve(dir, 'shippedPolicy.json'), 'utf8')) as { genome: number[] }).genome)
}
