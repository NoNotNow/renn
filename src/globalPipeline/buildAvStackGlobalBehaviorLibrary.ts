import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { PipeParamDef, TransformerDef, TransformerPipe } from '@/types/transformer'
import { flattenPipeStageIds } from '@/utils/transformerPipeResolve'
import { readAvStackStageCode, type AvStackLogicalStage } from '@/globalPipeline/avStackStagePaths'
import { SHIPPED_GLOBAL_AV_PREFIX } from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'

/**
 * Organize → Global entries for the industry-style AV stack (nested pipes, see agent-context/feature-av-stack.md).
 *
 *   global_av_stack      full vehicle: mission + autopilot + car2 actuator  → assign to one object and it drives
 *   global_av_autopilot  sense / plan / control / safety only (bring your own target source and actuator)
 *   (nested)             global_av_sense, global_av_plan (route + local), global_av_control, global_av_safety
 */
const P = SHIPPED_GLOBAL_AV_PREFIX

export const AV_GLOBAL_STACK_PIPE_ID = `${P}stack`
export const AV_GLOBAL_AUTOPILOT_PIPE_ID = `${P}autopilot`
export const AV_GLOBAL_WANDER_STACK_PIPE_ID = `${P}stack_wander`

type StageMeta = { id: string; name: string; priority: number }
const STAGES: Record<AvStackLogicalStage, StageMeta> = {
  mission: { id: `${P}mission`, name: 'AV Mission (waypoints)', priority: 2.5 },
  wander: { id: `${P}wander`, name: 'AV Wander (random goals)', priority: 2.5 },
  ego: { id: `${P}ego`, name: 'AV Ego state', priority: 2 },
  perception: { id: `${P}perception`, name: 'AV Perception', priority: 3 },
  waypointViz: { id: `${P}waypoint_viz`, name: 'AV Waypoint overlay', priority: 3.1 },
  routePlanner: { id: `${P}route_planner`, name: 'AV Route planner', priority: 3.8 },
  motionPlanner: { id: `${P}motion_planner`, name: 'AV Motion planner', priority: 4 },
  speedPlanner: { id: `${P}speed_planner`, name: 'AV Speed planner', priority: 4.5 },
  supervisor: { id: `${P}supervisor`, name: 'AV Supervisor', priority: 4.6 },
  lateral: { id: `${P}control_lateral`, name: 'AV Lateral control', priority: 5 },
  longitudinal: { id: `${P}control_longitudinal`, name: 'AV Longitudinal control', priority: 5.5 },
  aeb: { id: `${P}aeb`, name: 'AV AEB', priority: 7 },
}
const CAR_ID = `${P}car`

export const AV_GLOBAL_PARAM_DEFS: PipeParamDef[] = [
  { key: 'cruiseSpeed', label: 'Cruise speed (m/s)', type: 'number', default: 10 },
  { key: 'vehicleWidth', label: 'Vehicle width (m)', type: 'number', default: 2 },
  { key: 'vehicleLength', label: 'Vehicle length (m)', type: 'number', default: 4 },
  { key: 'safetyMargin', label: 'Safety margin (m)', type: 'number', default: 0.5 },
  { key: 'maxCurvature', label: 'Max curvature 1/m (min turn radius)', type: 'number', default: 0.115 },
  { key: 'minSpeed', label: 'Minimum speed while driving (m/s)', type: 'number', default: 4 },
  { key: 'obstacleSlowRadius', label: 'Obstacles slow the car only within (m) — 0 = off', type: 'number', default: 5 },
  { key: 'obstacleSlowFactor', label: 'Speed right next to an obstacle (× cruise)', type: 'number', default: 0.5 },
  { key: 'comfortDecel', label: 'Braking for obstacles in the path (m/s²)', type: 'number', default: 5 },
  { key: 'maxLatAccel', label: 'Cornering limit, lateral accel (m/s²)', type: 'number', default: 9 },
  { key: 'goalTolerance', label: 'Final goal hold radius (m)', type: 'number', default: 5.5 },
  { key: 'debugDraw', label: 'Draw debug vectors (Builder visualize mode)', type: 'boolean', default: true },
]

function stageDefs(): Record<string, TransformerDef> {
  const out: Record<string, TransformerDef> = {}
  for (const logical of Object.keys(STAGES) as AvStackLogicalStage[]) {
    const meta = STAGES[logical]
    out[meta.id] = {
      type: 'custom',
      priority: meta.priority,
      enabled: true,
      name: meta.name,
      code: readAvStackStageCode(logical),
      ...(logical === 'wander'
        ? { params: { acceptRadius: 9, minDistance: 25, maxDistance: 60, giveUpAfter: 45, speed: 10 } }
        : {}),
      ...(logical === 'mission'
        ? {
            // demo square so a freshly assigned object visibly drives; edit waypoints [[x, z], ...] for your world
            params: { waypoints: [[0, -30], [25, -30], [25, 0], [0, 0]], acceptRadius: 9, mode: 'loop' },
          }
        : {}),
    } as TransformerDef
  }
  out[CAR_ID] = {
    type: 'car2',
    priority: 8,
    enabled: true,
    name: 'AV Car actuator',
    params: { power: 340, steeringIntensity: 0.13, steeringSpeed: 0.48, lateralGrip: 150 },
  } as TransformerDef
  return out
}

export function buildAvStackGlobalBehaviorLibrary(): GlobalBehaviorLibrary {
  const transformers = stageDefs()
  const st = (id: string) => ({ kind: 'stage' as const, stageId: id })
  const sub = (id: string) => ({ kind: 'pipe' as const, pipeId: id })

  const raw: Record<string, { name: string; members: TransformerPipe['members']; paramDefs?: PipeParamDef[] }> = {
    [`${P}sense`]: { name: 'AV Sense (ego, perception, overlay)', members: [st(STAGES.ego.id), st(STAGES.perception.id), st(STAGES.waypointViz.id)] },
    [`${P}plan_route`]: { name: 'AV Route planner', members: [st(STAGES.routePlanner.id)] },
    [`${P}plan_local`]: { name: 'AV Local planner', members: [st(STAGES.motionPlanner.id), st(STAGES.speedPlanner.id)] },
    [`${P}plan`]: { name: 'AV Plan', members: [sub(`${P}plan_route`), sub(`${P}plan_local`), st(STAGES.supervisor.id)] },
    [`${P}control`]: { name: 'AV Control', members: [st(STAGES.lateral.id), st(STAGES.longitudinal.id)] },
    [`${P}safety`]: { name: 'AV Safety (AEB)', members: [st(STAGES.aeb.id)] },
    [AV_GLOBAL_AUTOPILOT_PIPE_ID]: {
      name: 'AV Autopilot (sense, plan, control, safety)',
      members: [sub(`${P}sense`), sub(`${P}plan`), sub(`${P}control`), sub(`${P}safety`)],
      paramDefs: AV_GLOBAL_PARAM_DEFS,
    },
    [AV_GLOBAL_WANDER_STACK_PIPE_ID]: {
      name: 'AV Stack (random goals + autopilot + car)',
      members: [st(STAGES.wander.id), sub(AV_GLOBAL_AUTOPILOT_PIPE_ID), st(CAR_ID)],
      paramDefs: AV_GLOBAL_PARAM_DEFS,
    },
    [AV_GLOBAL_STACK_PIPE_ID]: {
      name: 'AV Stack (mission + autopilot + car)',
      members: [st(STAGES.mission.id), sub(AV_GLOBAL_AUTOPILOT_PIPE_ID), st(CAR_ID)],
      paramDefs: AV_GLOBAL_PARAM_DEFS,
    },
  }

  const registry: Record<string, TransformerPipe> = {}
  for (const [id, def] of Object.entries(raw)) {
    registry[id] = { id, name: def.name, stageIds: [], stages: [], members: def.members, ...(def.paramDefs ? { paramDefs: def.paramDefs } : {}) }
  }
  // legacy flat leaf lists + stage snapshots, derived from the manifold
  for (const id of Object.keys(registry)) {
    const flat = flattenPipeStageIds(registry, id)
    registry[id] = {
      ...registry[id]!,
      stageIds: flat,
      stages: flat.map((sid) => JSON.parse(JSON.stringify(transformers[sid]))),
    }
  }
  return { transformers, scripts: {}, transformerPipes: registry }
}
