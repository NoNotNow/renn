import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const AV_STACK_TRANSFORMER_DIR = resolve(moduleDir, '../../public/global/transformers/av-stack')

/** Logical stage id → source file. Order here is the execution order of the stack. */
export const AV_STACK_STAGE_FILES = {
  ego: 'av-ego.js',
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

export function readAvStackStageCode(logical: AvStackLogicalStage): string {
  return readFileSync(resolve(AV_STACK_TRANSFORMER_DIR, AV_STACK_STAGE_FILES[logical]), 'utf8')
}
