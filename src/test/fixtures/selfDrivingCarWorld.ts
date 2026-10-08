import { readSelfDrivingStageCode } from '@/globalPipeline/selfDrivingCarStagePaths'
import { selfDrivePinnedGoalWandererParams } from '@/globalPipeline/wandererPerimeterParams'
import type { RennWorld } from '@/types/world'

const umlenkerCode = readSelfDrivingStageCode('umlenker')
const defaultDirectionCode = readSelfDrivingStageCode('direction')
const TARGET_LINE_VISUALIZER_CODE = readSelfDrivingStageCode('targetLine')
const AUTO_BRAKE_CODE = readSelfDrivingStageCode('autoBrake')

export type SelfDrivingCarVariant =
  | 'wallAhead'
  | 'clearPath'
  | 'cubeGoalBehind'
  | 'parkour'
  | 'parkourBeside'

/** Ordered mission — each pose sits **behind** the next obstacle on −Z (Umlenker goal-block pattern). */
export const SELF_DRIVE_PARKOUR_WAYPOINTS = [
  { position: [0, 0, -16] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [0, 0, -36] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [0, 0, -50] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [0, 0, -58] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
] as const

/** Short course: cone on centerline; mission ends on **beside** pose (−X flank). */
export const SELF_DRIVE_PARKOUR_BESIDE_WAYPOINTS = [
  { position: [0, 0, -11] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [8, 0, -9] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
] as const

export const SELF_DRIVE_PARKOUR_BESIDE_OBSTACLES: readonly ParkourObstacleSpec[] = [
  {
    id: 'beside_cone_m',
    name: 'Beside gate cone (M)',
    shape: { type: 'cone', radius: 2.4, height: 2.8 },
    position: [0, 1.4, -7],
  },
  {
    id: 'beside_capsule_s',
    name: 'Beside gate capsule (S)',
    shape: { type: 'capsule', radius: 1.4, height: 2 },
    position: [5, 1, -7],
  },
] as const

export type SelfDriveParkourSegmentId =
  | 'seg1_box'
  | 'seg2_beside_cone'
  | 'seg3_sphere'
  | 'seg4_cylinder'
  | 'full'

/** Approach pose for parkour cylinder L (z=−42): mission already past box/sphere legs. */
export const SELF_DRIVE_PARKOUR_CYLINDER_APPROACH = {
  /** Just past sphere leg (seg3 depth); room to build speed before cylinder L. */
  carPosition: [0, 0.55, -31] as [number, number, number],
  carRotation: [0, 0, 0] as [number, number, number],
  /** Target pose behind cylinder (z=−50) only — box/sphere legs omitted. */
  missionWaypointStartIndex: 2,
  cylinderCenterZ: -42,
} as const

/** Within uml lookahead of cylinder L — cold start stall repro (Play hug approach). */
export const SELF_DRIVE_PARKOUR_CYLINDER_TIGHT = {
  carPosition: [0, 0.55, -36] as [number, number, number],
  carRotation: [0, 0, 0] as [number, number, number],
  /** Skip wp at z=−36 (on top of spawn) — umlenker bails when distTrue < 5. */
  missionWaypointStartIndex: 2,
  cylinderCenterZ: -42,
} as const

/** Nose-on-cylinder contact; direction `frontDist≈0` while uml lateral aim. */
export const SELF_DRIVE_PARKOUR_CYLINDER_HUG = {
  carPosition: [0, 0.55, -40.5] as [number, number, number],
  carRotation: [0, 0, 0] as [number, number, number],
  missionWaypointStartIndex: 2,
  cylinderCenterZ: -42,
} as const

/** Frame budgets @ 60Hz — segment runs use partial pass; `full` matches integration test. */
export const SELF_DRIVE_PARKOUR_SEGMENTS: Readonly<
  Record<
    SelfDriveParkourSegmentId,
    { frames: number; label: string; waypointIndex: number; fullCourse?: boolean }
  >
> = {
  seg1_box: { frames: 520, label: 'Past box toward wp1', waypointIndex: 0 },
  seg2_beside_cone: { frames: 920, label: 'Beside cone lateral gate', waypointIndex: 1 },
  seg3_sphere: { frames: 1050, label: 'Through sphere leg', waypointIndex: 2 },
  seg4_cylinder: {
    frames: 550,
    label: 'Past cylinder L toward wp3',
    waypointIndex: 2,
  },
  full: {
    frames: 1400,
    label: 'Full course',
    waypointIndex: SELF_DRIVE_PARKOUR_WAYPOINTS.length - 1,
    fullCourse: true,
  },
}

export const SELF_DRIVE_PARKOUR = {
  ground: { width: 100, depth: 110, position: [0, -0.5, -18] as [number, number, number] },
  /** Final waypoint index for pass checks. */
  finalWaypointIndex: SELF_DRIVE_PARKOUR_WAYPOINTS.length - 1,
} as const

export type ParkourObstacleSpec = {
  id: string
  name: string
  shape:
    | { type: 'box'; width: number; height: number; depth: number }
    | { type: 'sphere'; radius: number }
    | { type: 'pyramid'; baseSize: number; height: number }
    | { type: 'cylinder'; radius: number; height: number }
    | { type: 'cone'; radius: number; height: number }
    | { type: 'capsule'; radius: number; height: number }
  position: [number, number, number]
}

/** Three obstacles — mixed shapes and scales (S/M). */
export const SELF_DRIVE_PARKOUR_OBSTACLES: readonly ParkourObstacleSpec[] = [
  {
    id: 'parkour_box_m',
    name: 'Parkour box (M)',
    shape: { type: 'box', width: 6, height: 3, depth: 6 },
    position: [0, 1.5, -10],
  },
  {
    id: 'parkour_sphere_s',
    name: 'Parkour sphere (S)',
    shape: { type: 'sphere', radius: 2.2 },
    position: [0, 1.1, -28],
  },
  {
    id: 'parkour_cylinder_l',
    name: 'Parkour cylinder (L)',
    shape: { type: 'cylinder', radius: 3.4, height: 3.8 },
    position: [0, 1.9, -42],
  },
] as const

export type GoalBehindObstacleShape = 'box' | 'sphere' | 'pyramid' | 'cylinder'

/** Fixed spawn — every diagnostic run resets to this state via fresh WorldSimulator.create. */
export const SELF_DRIVE_SPAWN = {
  carPosition: [0, 0.55, 3] as [number, number, number],
  carRotation: [0, 0, 0] as [number, number, number],
  goalZ: -32,
  cubeCenter: [0, 1.5, -10] as [number, number, number],
} as const

/** Wide enough for flank (|x|≈40) and goal approach (z≈-32) without falling off edge. */
export const SELF_DRIVE_GROUND = {
  width: 100,
  depth: 80,
  position: [0, -0.5, 0] as [number, number, number],
} as const

/**
 * Headless spawn matrix (margins documented for L1 review).
 * |x| ≤ 1.2, |yaw| ≤ 0.18 rad — stay inside ground patch with room to flank.
 */
export const SELF_DRIVE_SPAWN_MATRIX = {
  center: {
    carPosition: [0, 0.55, 3] as [number, number, number],
    carRotation: [0, 0, 0] as [number, number, number],
    obstacleShape: 'box' as GoalBehindObstacleShape,
  },
  left1: {
    carPosition: [-1, 0.55, 3] as [number, number, number],
    carRotation: [0, 0, 0] as [number, number, number],
    obstacleShape: 'box' as GoalBehindObstacleShape,
  },
  right1: {
    carPosition: [1, 0.55, 3] as [number, number, number],
    carRotation: [0, 0, 0] as [number, number, number],
    obstacleShape: 'box' as GoalBehindObstacleShape,
  },
  yawLeft: {
    carPosition: [0, 0.55, 3] as [number, number, number],
    carRotation: [0, 0.12, 0] as [number, number, number],
    obstacleShape: 'box' as GoalBehindObstacleShape,
  },
  yawRight: {
    carPosition: [0, 0.55, 3] as [number, number, number],
    carRotation: [0, -0.12, 0] as [number, number, number],
    obstacleShape: 'box' as GoalBehindObstacleShape,
  },
  sphere: {
    carPosition: [0, 0.55, 3] as [number, number, number],
    carRotation: [0, 0, 0] as [number, number, number],
    obstacleShape: 'sphere' as GoalBehindObstacleShape,
  },
  pyramid: {
    carPosition: [0, 0.55, 3] as [number, number, number],
    carRotation: [0, 0, 0] as [number, number, number],
    obstacleShape: 'pyramid' as GoalBehindObstacleShape,
  },
  cylinder: {
    carPosition: [0, 0.55, 3] as [number, number, number],
    carRotation: [0, 0, 0] as [number, number, number],
    obstacleShape: 'cylinder' as GoalBehindObstacleShape,
  },
} as const

export type SelfDriveSpawnId = keyof typeof SELF_DRIVE_SPAWN_MATRIX

/** Pose-only spawn ids for parkour (shape keys in `SELF_DRIVE_SPAWN_MATRIX` are cube-scene only). */
export const SELF_DRIVE_PARKOUR_SPAWN_IDS = [
  'center',
  'left1',
  'right1',
  'yawLeft',
  'yawRight',
] as const satisfies readonly SelfDriveSpawnId[]

export type SelfDriveParkourSpawnId = (typeof SELF_DRIVE_PARKOUR_SPAWN_IDS)[number]

export type BuildSelfDrivingCarWorldOptions = {
  variant: SelfDrivingCarVariant
  spawnId?: SelfDriveSpawnId
  obstacleShape?: GoalBehindObstacleShape
  carPosition?: [number, number, number]
  carRotation?: [number, number, number]
  /** Override direction stage code (red-check / experiments). */
  directionCode?: string
  /** Unique direction stage id so headless sim does not reuse cached code from another variant. */
  directionStageId?: string
  /** Inserts a stage that sets `_uml_maneuver` before direction (red-check only). */
  forceUmlManeuverFlag?: boolean
  /** Parkour only: drop earlier mission poses (defined-start segment runs). */
  missionWaypointStartIndex?: number
}

function goalBehindObstacleEntity(
  shape: GoalBehindObstacleShape,
  center: readonly [number, number, number],
): NonNullable<RennWorld['entities']>[number] {
  const [cx, cy, cz] = center
  const base = {
    id: 'obstacle',
    name: 'Obstacle',
    bodyType: 'static' as const,
    position: [cx, cy, cz] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
  }
  switch (shape) {
    case 'sphere':
      return { ...base, shape: { type: 'sphere', radius: 3.1 } }
    case 'pyramid':
      return { ...base, shape: { type: 'pyramid', baseSize: 6, height: 3.5 } }
    case 'cylinder':
      return { ...base, shape: { type: 'cylinder', radius: 3.1, height: 3.5 } }
    case 'box':
    default:
      return { ...base, id: 'cube', name: 'Cube', shape: { type: 'box', width: 6, height: 3, depth: 6 } }
  }
}

export function selfDriveGrounded(pos: [number, number, number]): boolean {
  return pos[1] > -0.55 && pos[1] < 2.5
}

export function selfDriveGoalDistance(pos: [number, number, number], goalZ: number): number {
  return Math.abs(pos[2] - goalZ)
}

/** Shared headless acceptance for go-around scenarios (after warmup). */
export function selfDriveGoAroundPass(params: {
  startPos: [number, number, number]
  endPos: [number, number, number]
  obstacleCenterZ: number
}): boolean {
  const { startPos, endPos, obstacleCenterZ } = params
  const passedFlank = Math.abs(endPos[0]) > 2.5
  const passedObstacle = endPos[2] < obstacleCenterZ - 3.5
  const progress = endPos[2] < startPos[2] - 4
  return passedFlank && passedObstacle && progress && selfDriveGrounded(endPos)
}

/** Long sim window: stay grounded while closing on wanderer goal after flank. */
function horizontalDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dx = a[0] - b[0]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dz * dz)
}

/** Parkour course: flank evidence, deep progress, near final waypoint. */
export function selfDriveParkourPass(params: {
  startPos: [number, number, number]
  endPos: [number, number, number]
  maxAbsX?: number
  finalWaypoint?: [number, number, number]
  maxFinalHorizDist?: number
  minDepthProgress?: number
}): boolean {
  const {
    startPos,
    endPos,
    maxAbsX = 0,
    finalWaypoint = SELF_DRIVE_PARKOUR_WAYPOINTS[SELF_DRIVE_PARKOUR.finalWaypointIndex].position,
    maxFinalHorizDist = 14,
    minDepthProgress = 48,
  } = params
  const flankEvidence = Math.abs(endPos[0]) > 2.5 || maxAbsX > 2.5
  const depthProgress = startPos[2] - endPos[2] >= minDepthProgress
  const nearFinish = horizontalDistance(endPos, finalWaypoint) <= maxFinalHorizDist
  return flankEvidence && depthProgress && nearFinish && selfDriveGrounded(endPos)
}

/** Partial course acceptance for spawn/segment matrix (defined start each case). */
/** Beside-gate mini course (cone + capsule, lateral middle waypoint). */
export function selfDriveParkourBesideGatePass(params: {
  startPos: [number, number, number]
  endPos: [number, number, number]
  maxAbsX?: number
  maxFinalHorizDist?: number
}): boolean {
  const { startPos, endPos, maxAbsX = 0, maxFinalHorizDist = 10.5 } = params
  const flank = Math.abs(endPos[0]) > 2.5 || maxAbsX > 2.5
  const besideWp =
    SELF_DRIVE_PARKOUR_BESIDE_WAYPOINTS[SELF_DRIVE_PARKOUR_BESIDE_WAYPOINTS.length - 1].position
  const besideOffset = Math.abs(endPos[0]) >= 4
  const depth = startPos[2] - endPos[2] >= 8
  const nearBesidePose = horizontalDistance(endPos, besideWp) <= maxFinalHorizDist
  return flank && besideOffset && depth && nearBesidePose && selfDriveGrounded(endPos)
}

export function selfDriveParkourSegmentPass(params: {
  segmentId: SelfDriveParkourSegmentId
  startPos: [number, number, number]
  endPos: [number, number, number]
  maxAbsX?: number
}): boolean {
  const { segmentId, startPos, endPos, maxAbsX = 0 } = params
  if (!selfDriveGrounded(endPos)) return false
  const flank = Math.abs(endPos[0]) > 2.5 || maxAbsX > 2.5
  const depth = startPos[2] - endPos[2]

  if (segmentId === 'full') {
    return selfDriveParkourPass({ startPos, endPos, maxAbsX })
  }

  const wp = SELF_DRIVE_PARKOUR_WAYPOINTS[SELF_DRIVE_PARKOUR_SEGMENTS[segmentId].waypointIndex]
    .position

  switch (segmentId) {
    case 'seg1_box':
      return flank && endPos[2] < -9 && depth >= 8
    case 'seg2_beside_cone':
      return selfDriveParkourBesideGatePass({ startPos, endPos, maxAbsX })
    case 'seg3_sphere':
      return flank && endPos[2] < -30 && horizontalDistance(endPos, wp) <= 12 && depth >= 28
    case 'seg4_cylinder': {
      const pastCylinder = endPos[2] < SELF_DRIVE_PARKOUR_CYLINDER_APPROACH.cylinderCenterZ - 2.5
      const towardBehindWp = horizontalDistance(endPos, wp) <= 14 && depth >= 5
      return flank && pastCylinder && towardBehindWp
    }
    default:
      return false
  }
}

export type SelfDriveParkourCylinderStartId = 'approach' | 'tight' | 'hug'

export function selfDrivingParkourCylinderStart(
  startId: SelfDriveParkourCylinderStartId,
): Pick<
  BuildSelfDrivingCarWorldOptions,
  'carPosition' | 'carRotation' | 'missionWaypointStartIndex' | 'variant'
> {
  const spec =
    startId === 'tight'
      ? SELF_DRIVE_PARKOUR_CYLINDER_TIGHT
      : startId === 'hug'
        ? SELF_DRIVE_PARKOUR_CYLINDER_HUG
        : SELF_DRIVE_PARKOUR_CYLINDER_APPROACH
  return {
    variant: 'parkour',
    carPosition: [...spec.carPosition],
    carRotation: [...spec.carRotation],
    missionWaypointStartIndex: spec.missionWaypointStartIndex,
  }
}

export function selfDrivingParkourSegmentWorldOptions(
  segmentId: SelfDriveParkourSegmentId,
  cylinderStart: SelfDriveParkourCylinderStartId = 'approach',
): Pick<
  BuildSelfDrivingCarWorldOptions,
  'carPosition' | 'carRotation' | 'missionWaypointStartIndex' | 'variant'
> {
  if (segmentId === 'seg4_cylinder') {
    return selfDrivingParkourCylinderStart(cylinderStart)
  }
  return { variant: 'parkour' }
}

export function buildSelfDrivingParkourWorld(
  options: Omit<BuildSelfDrivingCarWorldOptions, 'variant'> = {},
): RennWorld {
  return buildSelfDrivingCarWorld({ ...options, variant: 'parkour' })
}

/** Minimal cylinder problem site: ground + cylinder L + car (mission wp behind). */
/** Seeded nudges for cylinder tight stall search (deterministic headless). */
export function perturbSelfDriveCylinderTight(seed: number): Pick<
  BuildSelfDrivingCarWorldOptions,
  'carPosition' | 'carRotation'
> {
  const base = SELF_DRIVE_PARKOUR_CYLINDER_TIGHT
  const s = seed >>> 0
  const dx = ((s % 7) - 3) * 0.12
  const dz = (((s / 7) | 0) % 5 - 2) * 0.18
  const dyaw = (((s / 35) | 0) % 5 - 2) * 0.06
  return {
    carPosition: [base.carPosition[0] + dx, base.carPosition[1], base.carPosition[2] + dz],
    carRotation: [0, base.carRotation[1] + dyaw, 0],
  }
}

export function buildSelfDrivingCylinderWorld(
  options: Omit<BuildSelfDrivingCarWorldOptions, 'variant'> = {},
): RennWorld {
  const world = buildSelfDrivingParkourWorld({
    ...selfDrivingParkourCylinderStart('tight'),
    ...options,
  })
  const keep = new Set(['ground', 'car', 'parkour_cylinder_l'])
  return {
    ...world,
    entities: world.entities?.filter((entity) => keep.has(entity.id)),
  }
}

export function buildSelfDrivingParkourBesideWorld(
  options: Omit<BuildSelfDrivingCarWorldOptions, 'variant'> = {},
): RennWorld {
  return buildSelfDrivingCarWorld({ ...options, variant: 'parkourBeside' })
}

export function selfDriveLongRunPass(params: {
  startPos: [number, number, number]
  endPos: [number, number, number]
  obstacleCenterZ: number
  goalZ: number
  minGoalProgress?: number
  /** Peak lateral offset during run (car may re-center after flank). */
  maxAbsX?: number
}): boolean {
  const { startPos, endPos, obstacleCenterZ, goalZ, minGoalProgress = 18, maxAbsX = 0 } = params
  const flankEvidence = Math.abs(endPos[0]) > 2.5 || maxAbsX > 2.5
  const passedObstacle = endPos[2] < obstacleCenterZ - 3.5
  const goalProgress =
    selfDriveGoalDistance(startPos, goalZ) - selfDriveGoalDistance(endPos, goalZ) >= minGoalProgress
  return flankEvidence && passedObstacle && goalProgress && selfDriveGrounded(endPos)
}

function wandererParams(goalZ: number) {
  return selfDrivePinnedGoalWandererParams(goalZ)
}

export function buildSelfDrivingCarWorld(options: BuildSelfDrivingCarWorldOptions): RennWorld {
  const {
    variant,
    spawnId,
    obstacleShape: obstacleShapeOverride,
    carPosition: carPositionOverride,
    carRotation: carRotationOverride,
    directionCode = defaultDirectionCode,
    directionStageId = 'tf_direction',
    forceUmlManeuverFlag = false,
    missionWaypointStartIndex = 0,
  } = options
  const matrixRow = spawnId ? SELF_DRIVE_SPAWN_MATRIX[spawnId] : undefined
  const carPosition = carPositionOverride ?? matrixRow?.carPosition ?? SELF_DRIVE_SPAWN.carPosition
  const carRotation = carRotationOverride ?? matrixRow?.carRotation ?? SELF_DRIVE_SPAWN.carRotation
  const obstacleShape =
    obstacleShapeOverride ?? matrixRow?.obstacleShape ?? ('box' satisfies GoalBehindObstacleShape)
  const goalZ = SELF_DRIVE_SPAWN.goalZ
  const isParkourMission = variant === 'parkour' || variant === 'parkourBeside'
  const groundSpec = isParkourMission ? SELF_DRIVE_PARKOUR.ground : SELF_DRIVE_GROUND
  const missionStageId = 'tf_mission'
  const targetStageId = isParkourMission ? missionStageId : 'tf_wanderer'
  const parkourPosesRaw =
    variant === 'parkourBeside'
      ? SELF_DRIVE_PARKOUR_BESIDE_WAYPOINTS
      : SELF_DRIVE_PARKOUR_WAYPOINTS
  const parkourPoses =
    missionWaypointStartIndex > 0
      ? parkourPosesRaw.slice(missionWaypointStartIndex)
      : parkourPosesRaw
  const parkourObstacles =
    variant === 'parkourBeside' ? SELF_DRIVE_PARKOUR_BESIDE_OBSTACLES : SELF_DRIVE_PARKOUR_OBSTACLES

  const entities: RennWorld['entities'] = [
    {
      id: 'ground',
      name: 'Ground',
      bodyType: 'static',
      shape: {
        type: 'box',
        width: groundSpec.width,
        height: 1,
        depth: groundSpec.depth,
      },
      position: [...groundSpec.position],
      rotation: [0, 0, 0],
    },
    {
      id: 'car',
      name: 'SelfDriver',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 2, height: 1, depth: 4 },
      position: [...carPosition],
      rotation: [...carRotation],
      mass: 2,
      friction: 0.8,
      transformers: forceUmlManeuverFlag
        ? [
            targetStageId,
            'tf_umlenker',
            'tf_uml_flag',
            'tf_target_line',
            directionStageId,
            'tf_autobrake',
            'tf_car',
          ]
        : [targetStageId, 'tf_umlenker', 'tf_target_line', directionStageId, 'tf_autobrake', 'tf_car'],
      transformerPipeStack: [{ pipeId: 'pipe3', enabled: true }],
    },
  ]

  if (variant === 'wallAhead') {
    entities.push({
      id: 'wall',
      name: 'Wall',
      bodyType: 'static',
      shape: { type: 'box', width: 8, height: 4, depth: 2 },
      position: [0, 1, -5.2],
      rotation: [0, 0, 0],
    })
  }

  if (variant === 'cubeGoalBehind') {
    entities.push(goalBehindObstacleEntity(obstacleShape, SELF_DRIVE_SPAWN.cubeCenter))
  }

  if (variant === 'parkour' || variant === 'parkourBeside') {
    for (const spec of parkourObstacles) {
      entities.push({
        id: spec.id,
        name: spec.name,
        bodyType: 'static',
        shape: spec.shape,
        position: [...spec.position],
        rotation: [0, 0, 0],
      })
    }
  }

  const stageIds = forceUmlManeuverFlag
    ? ([
        targetStageId,
        'tf_umlenker',
        'tf_uml_flag',
        'tf_target_line',
        directionStageId,
        'tf_autobrake',
        'tf_car',
      ] as const)
    : ([
        targetStageId,
        'tf_umlenker',
        'tf_target_line',
        directionStageId,
        'tf_autobrake',
        'tf_car',
      ] as const)

  const transformers: Record<string, NonNullable<RennWorld['transformers']>[string]> = {
      ...(isParkourMission
        ? {
            [missionStageId]: {
              type: 'targetPoseInput' as const,
              priority: 1,
              enabled: true,
              name: variant === 'parkourBeside' ? 'BesideGateMission' : 'ParkourMission',
              params: {
                speed: 2,
                mode: 'stopAtEnd' as const,
                positionEpsilon: 4,
                rotationEpsilon: 20,
                poses: parkourPoses.map((wp) => ({
                  position: [...wp.position],
                  rotation: [...wp.rotation],
                })),
              },
            },
          }
        : {
            tf_wanderer: {
              type: 'wanderer' as const,
              priority: 1,
              enabled: true,
              name: 'Wanderer',
              params: wandererParams(goalZ) as Record<string, unknown>,
            },
          }),
      tf_umlenker: {
        type: 'custom',
        priority: 4,
        enabled: true,
        name: 'Umlenker',
        code: umlenkerCode,
      },
      tf_target_line: {
        type: 'custom',
        priority: 4.8,
        enabled: true,
        name: 'TargetLine',
        code: TARGET_LINE_VISUALIZER_CODE,
      },
      [directionStageId]: {
        type: 'custom',
        priority: 5,
        enabled: true,
        name: 'direction',
        code: directionCode,
      },
      tf_autobrake: {
        type: 'custom',
        priority: 7,
        enabled: true,
        name: 'AutoBrake',
        code: AUTO_BRAKE_CODE,
      },
      tf_car: {
        type: 'car2',
        priority: 8,
        enabled: true,
        params: { power: 340, steeringIntensity: 0.13, steeringSpeed: 0.48, lateralGrip: 150 },
      },
    }

  if (forceUmlManeuverFlag) {
    transformers.tf_uml_flag = {
      type: 'custom',
      priority: 4.5,
      enabled: true,
      name: 'UmlFlagProbe',
      code: `function transform(input, dt, params, state, api) {
  input.actions._uml_maneuver = 1
  return {}
}`,
    }
  }

  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities,
    transformers,
    transformerPipes: {
      pipe3: {
        id: 'pipe3',
        name: 'pipe3',
        stageIds: [...stageIds],
        stages: [],
        members: stageIds.map((stageId) => ({ kind: 'stage', stageId })),
      },
    },
  }
}

export function stripDirectionUmlDeferral(directionCode: string): string {
  return directionCode.replace(
    /\n {4}\/\/ Umlenker owns lateral detours[\s\S]*?needBackOff = false\n {4}\}/,
    '\n    needBackOff = needBackOff',
  )
}
