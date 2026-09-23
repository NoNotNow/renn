import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RennWorld } from '@/types/world'

const umlenkerCode = readFileSync(
  resolve(process.cwd(), 'tools/renn-mcp/patches/umlenker-v3.js'),
  'utf8',
)

const defaultDirectionCode = readFileSync(
  resolve(process.cwd(), 'tools/renn-mcp/patches/direction-v3.js'),
  'utf8',
)

/** Builder overlay: car → current `input.target` (waypoint or Umlenker aim). */
const TARGET_LINE_VISUALIZER_CODE = `function transform(input, dt, params, state, api) {
  if (!input.target || !input.target.pose || !input.target.pose.position) return {}
  api.visualizeLine(input.position, input.target.pose.position, '#ffcc00')
  return {}
}`

const AUTO_BRAKE_CODE = `function transform(input, dt, params, state, api) {
  if (params && params.id) return {}
  if (input.actions && input.actions._obstacle_escape) return {}
  if (input.actions && input.actions._uml_maneuver) return {}
  if (input.target && input.target.distance && input.target.distance < 10) return {}
  var forward = api.getForwardVector(input.rotation)
  var backward = api.vec.scale(forward, -1)
  var speed = api.vec.getForwardSpeed(input.velocity, forward)
  var frontPosition = api.vec.offsetAlong(input.position, forward, 5)
  var backdPosition = api.vec.offsetAlong(input.position, backward, 5)
  if (speed > 0) {
    var castResult = api.raycastSpread(frontPosition, forward, speed * speed / 300, 2, 8, { visualize: false })
    if (castResult.hit === true && speed > 0.1) {
      var breakSpeed = 1 / (castResult.distance + 1) * ((speed * speed) / 200)
      if (breakSpeed > 1) breakSpeed = 1
      input.actions.brake = breakSpeed
      input.actions.throttle = 0
    }
  } else {
    var castResult = api.raycastSpread(backdPosition, backward, speed * speed / 300, 2, 8, { visualize: false })
    if (castResult.hit === true && speed < -0.1) {
      var breakSpeed = 1 / (castResult.distance + 1) * ((speed * speed) / 200)
      if (breakSpeed > 1) breakSpeed = 1
      input.actions.brake = 0
      input.actions.throttle = breakSpeed
    }
  }
  return {}
}`

export type SelfDrivingCarVariant =
  | 'wallAhead'
  | 'clearPath'
  | 'cubeGoalBehind'
  | 'parkour'
  | 'parkourBeside'

/** Ordered mission — each pose sits **behind** the next obstacle on −Z (Umlenker goal-block pattern). */
export const SELF_DRIVE_PARKOUR_WAYPOINTS = [
  { position: [0, 0.5, -16] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [0, 0.5, -36] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [0, 0.5, -50] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [0, 0.5, -58] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
] as const

/** Short course: cone on centerline; mission ends on **beside** pose (−X flank). */
export const SELF_DRIVE_PARKOUR_BESIDE_WAYPOINTS = [
  { position: [0, 0.5, -11] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
  { position: [8, 0.5, -9] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
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

export type SelfDriveParkourSegmentId = 'seg1_box' | 'seg2_beside_cone' | 'seg3_sphere' | 'full'

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
    default:
      return false
  }
}

export function buildSelfDrivingParkourWorld(
  options: Omit<BuildSelfDrivingCarWorldOptions, 'variant'> = {},
): RennWorld {
  return buildSelfDrivingCarWorld({ ...options, variant: 'parkour' })
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

/** Deterministic wanderer: zero-size perimeter pins goal at center. */
function wandererParams(goalZ: number) {
  return {
    speed: 2,
    jumpDistance: 0,
    linear: true,
    angular: false,
    perimeter: {
      center: [0, 0.5, goalZ] as [number, number, number],
      halfExtents: [0, 0, 0] as [number, number, number],
    },
    positionEpsilon: 20,
    rotationEpsilon: 20,
  }
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
  const parkourPoses =
    variant === 'parkourBeside'
      ? SELF_DRIVE_PARKOUR_BESIDE_WAYPOINTS
      : SELF_DRIVE_PARKOUR_WAYPOINTS
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

  const transformers: RennWorld['transformers'] = {
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
              params: wandererParams(goalZ),
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
    /\n    \/\/ Umlenker owns lateral detours[\s\S]*?needBackOff = false\n    \}/,
    '',
  )
}
