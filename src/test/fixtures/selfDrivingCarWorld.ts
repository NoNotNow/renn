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

export type SelfDrivingCarVariant = 'wallAhead' | 'clearPath' | 'cubeGoalBehind'

export type GoalBehindObstacleShape = 'box' | 'sphere' | 'pyramid' | 'cylinder'

/** Fixed spawn — every diagnostic run resets to this state via fresh WorldSimulator.create. */
export const SELF_DRIVE_SPAWN = {
  carPosition: [0, 0.55, 3] as [number, number, number],
  carRotation: [0, 0, 0] as [number, number, number],
  goalZ: -32,
  cubeCenter: [0, 1.5, -10] as [number, number, number],
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
  const grounded = endPos[1] > -0.55 && endPos[1] < 2.5
  return passedFlank && passedObstacle && progress && grounded
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
  const entities: RennWorld['entities'] = [
    {
      id: 'ground',
      name: 'Ground',
      bodyType: 'static',
      shape: { type: 'box', width: 40, height: 1, depth: 40 },
      position: [0, -0.5, 0],
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
        ? ['tf_wanderer', 'tf_umlenker', 'tf_uml_flag', directionStageId, 'tf_autobrake', 'tf_car']
        : [
            'tf_wanderer',
            'tf_umlenker',
            directionStageId,
            'tf_autobrake',
            'tf_car',
          ],
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

  const stageIds = forceUmlManeuverFlag
    ? ([
        'tf_wanderer',
        'tf_umlenker',
        'tf_uml_flag',
        directionStageId,
        'tf_autobrake',
        'tf_car',
      ] as const)
    : (['tf_wanderer', 'tf_umlenker', directionStageId, 'tf_autobrake', 'tf_car'] as const)

  const transformers: RennWorld['transformers'] = {
      tf_wanderer: {
        type: 'wanderer',
        priority: 1,
        enabled: true,
        name: 'Wanderer',
        params: wandererParams(goalZ),
      },
      tf_umlenker: {
        type: 'custom',
        priority: 4,
        enabled: true,
        name: 'Umlenker',
        code: umlenkerCode,
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
