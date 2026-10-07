import { CAR_PRESET } from '@/input/inputPresets'
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
 *   │   ├─ av_plan_route ─ route + manoeuvre planner (Hybrid-A*: carrot for the local planner, multi-point turns)
 *   │   ├─ av_plan_local ─ motion planner (turn-then-straight paths), speed planner
 *   │   └─ supervisor        (hold at goal)
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
  { key: 'minSpeed', type: 'number', default: 4, description: 'Lowest speed while driving (m/s)' },
  { key: 'obstacleSlowRadius', type: 'number', default: 5, description: 'Obstacles slow the car only within this distance of the hull (m); 0 = off' },
  { key: 'obstacleSlowFactor', type: 'number', default: 0.5, description: 'Speed right next to an obstacle as a fraction of cruiseSpeed' },
  { key: 'comfortDecel', type: 'number', default: 5, description: 'Braking deceleration for obstacles in the path (m/s²)' },
  { key: 'maxLatAccel', type: 'number', default: 9, description: 'Cornering limit: lateral acceleration (m/s²)' },
]

/** Fixture worlds keep their own mission stage (targetPoseInput); `mission` is only used by the global library. */
type FixtureStage = Exclude<AvStackLogicalStage, 'mission' | 'wander'>
const STAGE_META: Record<FixtureStage, { id: string; name: string; priority: number }> = {
  ego: { id: 'av_ego', name: 'AV Ego state', priority: 2 },
  perception: { id: 'av_perception', name: 'AV Perception', priority: 3 },
  waypointViz: { id: 'av_waypoint_viz', name: 'AV Waypoint overlay', priority: 3.1 },
  routePlanner: { id: 'av_route_planner', name: 'AV Route planner', priority: 3.8 },
  motionPlanner: { id: 'av_motion_planner', name: 'AV Motion planner', priority: 4 },
  speedPlanner: { id: 'av_speed_planner', name: 'AV Speed planner', priority: 4.5 },
  supervisor: { id: 'av_supervisor', name: 'AV Supervisor', priority: 4.6 },
  lateral: { id: 'av_control_lateral', name: 'AV Lateral control', priority: 5 },
  longitudinal: { id: 'av_control_longitudinal', name: 'AV Longitudinal control', priority: 5.5 },
  aeb: { id: 'av_aeb', name: 'AV AEB', priority: 7 },
}

export type AvStackOptions = {
  /** Stack-wide params (`binding.params`). */
  params?: Record<string, unknown>
  /** Per-nested-pipe overrides keyed by logical pipe name. */
  layerParams?: Partial<
    Record<'sense' | 'plan' | 'planRoute' | 'planLocal' | 'control' | 'safety', Record<string, unknown>>
  >
  /** Per-stage param overrides (stage registry level). */
  stageParams?: Partial<Record<AvStackLogicalStage, Record<string, unknown>>>
  /** Drop stages (e.g. ablation: run without AEB or supervisor). */
  disable?: AvStackLogicalStage[]
  /**
   * Waypoint acceptance radius (m). A pass-through waypoint must be reachable with the turn radius (~8 m), so
   * the mission's `positionEpsilon` is raised to at least this value. Default 9: a pass that misses a smaller
   * radius by centimetres otherwise sends the car on a loop back to the same waypoint.
   */
  waypointRadius?: number
  /** Arrive/hold radius around the FINAL waypoint (m). Default 5.5 (must be reachable inside the turning circle). */
  goalTolerance?: number
  /** Heading tolerance (deg) for accepting a waypoint; default 180 = position only (a pass-through waypoint must not need a heading). */
  waypointHeadingTolerance?: number
  /** Keep this far (m) from the ground slab edge (virtual walls). Default 3. */
  edgeInset?: number
  /** Add the keyboard `input` stage (priority 1, last member of the stack pipe) that feeds the manual override (`manualOverride` param). */
  manualInput?: boolean
}

/** Replace the pipe3 pipeline on a parkour/cube world with the nested AV stack. */
export function applyAvStack(world: RennWorld, options: AvStackOptions = {}): RennWorld {
  const disabled = new Set(options.disable ?? [])
  const transformers: Record<string, TransformerConfig> = {}
  for (const [id, cfg] of Object.entries(world.transformers ?? {})) {
    if (id === 'tf_mission' && cfg.params) {
      const eps = Number(cfg.params.positionEpsilon ?? 0)
      transformers[id] = { ...cfg, params: {
          ...cfg.params,
          positionEpsilon: Math.max(eps, options.waypointRadius ?? 9),
          rotationEpsilon: options.waypointHeadingTolerance ?? 180,
        },
      }
    } else if (id === 'tf_mission' || id === 'tf_wanderer') transformers[id] = cfg
  }
  // drivable area from the ground slab, inset so the planners keep the car on it
  const ground = world.entities?.find((e) => e.id === 'ground')
  const gShape = ground?.shape as { width?: number; depth?: number } | undefined
  const inset = options.edgeInset ?? 3
  const drivableArea =
    ground && gShape?.width && gShape?.depth && ground.position
      ? [
          ground.position[0] - gShape.width / 2 + inset,
          ground.position[0] + gShape.width / 2 - inset,
          ground.position[2] - gShape.depth / 2 + inset,
          ground.position[2] + gShape.depth / 2 - inset,
        ]
      : undefined
  const missionId = transformers.tf_mission ? 'tf_mission' : 'tf_wanderer'
  const missionPoses = transformers.tf_mission?.params?.poses as Array<{ position: [number, number, number] }> | undefined
  const missionWaypoints = missionPoses?.map((p) => [p.position[0], p.position[2]])
  for (const logical of Object.keys(STAGE_META) as FixtureStage[]) {
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
  if (options.manualInput) {
    transformers.av_input = {
      type: 'input',
      priority: 1,
      enabled: true,
      name: 'AV Manual input (keys)',
      inputMapping: JSON.parse(JSON.stringify(CAR_PRESET)),
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
    av_sense: pipe('av_sense', [st('av_ego'), st('av_perception'), st('av_waypoint_viz')]),
    av_plan_local: pipe('av_plan_local', [st('av_motion_planner'), st('av_speed_planner')]),
    av_plan_route: pipe('av_plan_route', [st('av_route_planner')]),
    av_plan: pipe('av_plan', [sub('av_plan_route'), sub('av_plan_local'), st('av_supervisor')]),
    av_control: pipe('av_control', [st('av_control_lateral'), st('av_control_longitudinal')]),
    av_safety: pipe('av_safety', [st('av_aeb')]),
    [AV_STACK_PIPE_ID]: pipe(
      AV_STACK_PIPE_ID,
      [st(missionId), sub('av_sense'), sub('av_plan'), sub('av_control'), sub('av_safety'), st('tf_car'), ...(options.manualInput ? [st('av_input')] : [])],
      { paramDefs: AV_STACK_PARAM_DEFS },
    ),
  }

  // scope keys: stack root is `stack:0`; member index is the position in the parent pipe.
  const root = 'stack:0'
  const L = options.layerParams ?? {}
  const scopeParams: Record<string, Record<string, unknown>> = {}
  if (L.sense) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:1`] = L.sense
  if (L.plan) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:2`] = L.plan
  if (L.planRoute) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:2/member:av_plan:0`] = L.planRoute
  if (L.planLocal) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:2/member:av_plan:1`] = L.planLocal
  if (L.control) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:3`] = L.control
  if (L.safety) scopeParams[`${root}/member:${AV_STACK_PIPE_ID}:4`] = L.safety

  const binding: TransformerPipeBinding = {
    pipeId: AV_STACK_PIPE_ID,
    enabled: true,
    params: {
      ...(missionWaypoints ? { waypoints: missionWaypoints } : {}),
      ...(drivableArea ? { drivableArea } : {}),
      // arrive/hold inside the acceptance radius: the goal may lie within the turning circle
      goalTolerance: options.goalTolerance ?? 5.5,
      ...(options.params ?? {}),
    },
    ...(Object.keys(scopeParams).length ? { scopeParams } : {}),
  }

  const flat = [...(options.manualInput ? ['av_input'] : []), missionId, 'av_ego', 'av_perception', 'av_waypoint_viz', 'av_route_planner', 'av_motion_planner', 'av_speed_planner', 'av_supervisor', 'av_control_lateral', 'av_control_longitudinal', 'av_aeb', 'tf_car'].filter(
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

type ShowcaseObstacle = {
  id: string
  shape: NonNullable<RennWorld['entities']>[number]['shape']
  position: [number, number, number]
  color: [number, number, number]
}

/** Extra obstacles for the colourful showcase run: a slalom return lane around x≈20 (obstacles alternate ±5 m) plus fillers beside the main lane. */
export const AV_SHOWCASE_OBSTACLES: readonly ShowcaseObstacle[] = [
  { id: 'show_box_red', shape: { type: 'box', width: 4, height: 3, depth: 4 }, position: [25, 1.5, -51], color: [0.9, 0.2, 0.2] },
  { id: 'show_sphere_orange', shape: { type: 'sphere', radius: 2 }, position: [15, 1, -38], color: [1, 0.55, 0.1] },
  { id: 'show_cylinder_yellow', shape: { type: 'cylinder', radius: 2.4, height: 3 }, position: [25, 1.5, -28], color: [0.95, 0.85, 0.15] },
  { id: 'show_cone_green', shape: { type: 'cone', radius: 2, height: 3 }, position: [15, 1.5, -13], color: [0.2, 0.75, 0.3] },
  { id: 'show_pyramid_cyan', shape: { type: 'pyramid', baseSize: 4, height: 3 }, position: [25, 1.5, -4], color: [0.15, 0.8, 0.85] },
  { id: 'show_capsule_blue', shape: { type: 'capsule', radius: 1.2, height: 2.4 }, position: [8, 1.2, -52], color: [0.2, 0.35, 0.95] },
  { id: 'show_box_purple', shape: { type: 'box', width: 3, height: 2.5, depth: 5 }, position: [-9, 1.25, -20], color: [0.6, 0.25, 0.85] },
  { id: 'show_sphere_pink', shape: { type: 'sphere', radius: 1.6 }, position: [-8, 0.8, -36], color: [1, 0.4, 0.7] },
  { id: 'show_cone_lime', shape: { type: 'cone', radius: 1.8, height: 2.6 }, position: [8, 1.3, -24], color: [0.6, 0.9, 0.2] },
  { id: 'show_cylinder_teal', shape: { type: 'cylinder', radius: 1.6, height: 2.6 }, position: [-12, 1.3, -50], color: [0.1, 0.6, 0.55] },
]

/** Return lane after the parkour finish (x≈20 heading +Z), ending back near the start. */
export const AV_SHOWCASE_EXTRA_WAYPOINTS: ReadonlyArray<[number, number, number]> = [
  [20, 0, -62],
  [20, 0, -42],
  [20, 0, -20],
  [20, 0, 0],
  [0, 0, 6],
]

const PARKOUR_COLORS: Record<string, [number, number, number]> = {
  parkour_box_m: [0.85, 0.3, 0.25],
  parkour_sphere_s: [0.95, 0.75, 0.15],
  parkour_cylinder_l: [0.25, 0.55, 0.9],
}

/** Parkour + extra coloured obstacles + longer mission, driven by the AV stack. Not a test fixture. */
export function buildAvShowcaseWorld(base: RennWorld, options: AvStackOptions = {}): RennWorld {
  const poses = (base.transformers?.tf_mission?.params?.poses ?? []) as Array<{ position: number[]; rotation: number[] }>
  const withExtra = [
    ...poses,
    ...AV_SHOWCASE_EXTRA_WAYPOINTS.map((p) => ({ position: [...p], rotation: [0, 0, 0] })),
  ]
  const entities = [
    ...(base.entities ?? []).map((e) =>
      PARKOUR_COLORS[e.id] ? { ...e, material: { color: PARKOUR_COLORS[e.id] } } : e,
    ),
    ...AV_SHOWCASE_OBSTACLES.map((o) => ({
      id: o.id,
      name: o.id.replace('show_', '').replace(/_/g, ' '),
      bodyType: 'static' as const,
      shape: o.shape,
      position: [...o.position] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      material: { color: o.color },
    })),
  ]
  const mission = base.transformers!.tf_mission!
  return applyAvStack(
    {
      ...base,
      entities,
      transformers: { ...base.transformers, tf_mission: { ...mission, params: { ...mission.params, poses: withExtra } } },
    },
    options,
  )
}
