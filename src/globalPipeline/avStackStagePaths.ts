import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
