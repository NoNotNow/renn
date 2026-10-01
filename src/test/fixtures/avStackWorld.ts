import { readAvStackStageCode, type AvStackLogicalStage } from '@/globalPipeline/avStackStagePaths'
import type { PipeParamDef, TransformerConfig, TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { RennWorld } from '@/types/world'

/**
 * Industry-style autonomy stack as **nested pipes** (manifolds):
 *
 *   av_stack
 *   ├─ tf_mission                (waypoint source)
 *   ├─ av_sense      ─ ego, perception
 *   ├─ av_plan
 *   │   ├─ av_plan_local ─ motion planner (arc sampling), speed planner
 *   │   ├─ supervisor        (health watchdog → needManeuver, hold at goal)
 *   │   └─ av_plan_tight ─ manoeuvre planner (Hybrid-A*, forward/reverse multi-point turn)
 *   ├─ av_control    ─ lateral (curvature tracking), longitudinal (speed PI)
 *   ├─ av_safety     ─ AEB monitor
 *   └─ tf_car        (actuator: car2)
 *
 * Same-key param merge: `binding.params` configure the whole stack, `binding.scopeParams`
 * override a single nested pipe (scope key `stack:0/member:<parentPipeId>:<memberIndex>[/…]`).
 */
export const AV_STACK_PIPE_ID = 'av_stack'

export const AV_STACK_PARAM_DEFS: PipeParamDef[] = [
  { key: 'cruiseSpeed', type: 'number', default: 8, description: 'Target cruise speed (m/s)' },
  { key: 'vehicleWidth', type: 'number', default: 2, description: 'Footprint width (m)' },
  { key: 'vehicleLength', type: 'number', default: 4, description: 'Footprint length (m)' },
  { key: 'safetyMargin', type: 'number', default: 0.5, description: 'Hard collision margin around footprint (m)' },
  { key: 'maxCurvature', type: 'number', default: 0.115, description: 'Max path curvature 1/m (min turn radius)' },
]

const STAGE_META: Record<AvStackLogicalStage, { id: string; name: string; priority: number }> = {
  ego: { id: 'av_ego', name: 'AV Ego state', priority: 2 },
  perception: { id: 'av_perception', name: 'AV Perception', priority: 3 },
  motionPlanner: { id: 'av_motion_planner', name: 'AV Motion planner', priority: 4 },
  speedPlanner: { id: 'av_speed_planner', name: 'AV Speed planner', priority: 4.5 },
  supervisor: { id: 'av_supervisor', name: 'AV Supervisor', priority: 4.6 },
  maneuverPlanner: { id: 'av_maneuver_planner', name: 'AV Maneuver planner', priority: 4.7 },
  lateral: { id: 'av_control_lateral', name: 'AV Lateral control', priority: 5 },
  longitudinal: { id: 'av_control_longitudinal', name: 'AV Longitudinal control', priority: 5.5 },
  aeb: { id: 'av_aeb', name: 'AV AEB', priority: 7 },
}

export type AvStackOptions = {
  /** Stack-wide params (`binding.params`). */
  params?: Record<string, unknown>
  /** Per-nested-pipe overrides keyed by logical pipe name. */
  layerParams?: Partial<
    Record<'sense' | 'plan' | 'planLocal' | 'planTight' | 'control' | 'safety', Record<string, unknown>>
  >
  /** Per-stage param overrides (stage registry level). */
  stageParams?: Partial<Record<AvStackLogicalStage, Record<string, unknown>>>
  /** Drop stages (e.g. ablation: run without AEB or supervisor). */
  disable?: AvStackLogicalStage[]
}

/** Replace the pipe3 pipeline on a parkour/cube world with the nested AV stack. */
export function applyAvStack(world: RennWorld, options: AvStackOptions = {}): RennWorld {
  const disabled = new Set(options.disable ?? [])
  const transformers: Record<string, TransformerConfig> = {}
  for (const [id, cfg] of Object.entries(world.transformers ?? {})) {
    if (id === 'tf_mission' || id === 'tf_wanderer') transformers[id] = cfg
  }
  const missionId = transformers.tf_mission ? 'tf_mission' : 'tf_wanderer'
  for (const logical of Object.keys(STAGE_META) as AvStackLogicalStage[]) {
    const meta = STAGE_META[logical]
    transformers[meta.id] = {
      type: 'custom',
      priority: meta.priority,
      enabled: !disabled.has(logical),
      name: meta.name,
      code: readAvStackStageCode(logical),
      ...(options.stageParams?.[logical] ? { params: options.stageParams[logical] } : {}),
    } as TransformerConfig
  }
  transformers.tf_car = {
    type: 'car2',
    priority: 8,
    enabled: true,
    params: { power: 340, steeringIntensity: 0.13, steeringSpeed: 0.48, lateralGrip: 150 },
  } as TransformerConfig

  const pipe = (id: string, members: TransformerPipe['members'], extra: Partial<TransformerPipe> = {}): TransformerPipe => ({
    id,
    name: id,
    stageIds: [],
    stages: [],
    members,
    ...extra,
  })
  const st = (stageId: string) => ({ kind: 'stage' as const, stageId })
  const sub = (pipeId: string) => ({ kind: 'pipe' as const, pipeId })

  const pipes: Record<string, TransformerPipe> = {
    av_sense: pipe('av_sense', [st('av_ego'), st('av_perception')]),
    av_plan_local: pipe('av_plan_local', [st('av_motion_planner'), st('av_speed_planner')]),
    av_plan_tight: pipe('av_plan_tight', [st('av_maneuver_planner')]),
    av_plan: pipe('av_plan', [sub('av_plan_local'), st('av_supervisor'), sub('av_plan_tight')]),
    av_control: pipe('av_control', [st('av_control_lateral'), st('av_control_longitudinal')]),
    av_safety: pipe('av_safety', [st('av_aeb')]),
    [AV_STACK_PIPE_ID]: pipe(
      AV_STACK_PIPE_ID,
      [st(missionId), sub('av_sense'), sub('av_plan'), sub('av_control'), sub('av_safety'), st('tf_car')],
      { paramDefs: AV_STACK_PARAM_DEFS },
    ),
  }

  // scope keys: stack root is `stack:0`; member index is the position in the parent pipe.
  const root = 'stack:0'
  const L = options.layerParams ?? {}
  const scopeParams: Record<string, Record<string, unknown>> = {}
  if (L.sense) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:1`] = L.sense
  if (L.plan) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:2`] = L.plan
  if (L.planLocal) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:2/member:av_plan:0`] = L.planLocal
  if (L.planTight) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:2/member:av_plan:2`] = L.planTight
  if (L.control) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:3`] = L.control
  if (L.safety) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:4`] = L.safety

  const binding: TransformerPipeBinding = {
    pipeId: AV_STACK_PIPE_ID,
    enabled: true,
    params: options.params ?? {},
    ...(Object.keys(scopeParams).length ? { scopeParams } : {}),
  }

  const flat = [missionId, 'av_ego', 'av_perception', 'av_motion_planner', 'av_speed_planner', 'av_supervisor', 'av_maneuver_planner', 'av_control_lateral', 'av_control_longitudinal', 'av_aeb', 'tf_car'].filter(
    (id) => transformers[id]?.enabled !== false,
  )
  return {
    ...world,
    entities: world.entities?.map((e) =>
      e.id === 'car' ? { ...e, transformers: flat, transformerPipeStack: [binding] } : e,
    ),
    transformers,
    transformerPipes: pipes,
  }
}
