import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import { updateBindingParams } from '@/utils/pipeNavMutations'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'

/**
 * Small edge-case test world for the AV stack: an open floor, one car at (0, 5) facing −Z, goals and elongated obstacles
 * placed relative to it. Each case describes the geometry; `runEdgeCase` drives it headless from a defined start
 * and reports whether the car arrived, how long it was stuck, and whether it left the floor.
 *
 * Extend `AV_EDGE_CASES` when a new situation gets the car stuck — this is the regression set for "stuck" bugs.
 */
const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())

export interface EdgeObstacle {
  /** Centre in the floor plane. */
  at: [number, number]
  /** Length along its own axis (m) × thickness (m). */
  length: number
  thickness?: number
  /** Yaw in degrees (0 = long axis along X, i.e. a wall across the car's way). */
  yawDeg: number
  height?: number
}

export interface EdgeCase {
  name: string
  goal: [number, number]
  obstacles: EdgeObstacle[]
  /** Car yaw in degrees (0 = facing −Z); positive turns left. */
  carYawDeg?: number
  /** Car start (x, z); default (0, 5). */
  carAt?: [number, number]
  frames?: number
  cruiseSpeed?: number
}

export interface EdgeResult {
  arrived: boolean
  framesToArrive: number | null
  finalDistance: number
  /** Longest stretch (frames) at < 0.3 m/s before arriving. */
  longestStall: number
  minY: number
  path: number
}

export function buildEdgeWorldForDebug(c: EdgeCase) { return buildWorld(c) }

function buildWorld(c: EdgeCase): RennWorld {
  const carYaw = ((c.carYawDeg ?? 0) * Math.PI) / 180
  let world = {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      { id: 'floor', name: 'Floor', bodyType: 'static', shape: { type: 'box', width: 400, height: 1, depth: 400 }, position: [0, -0.5, 0], rotation: [0, 0, 0] },
      {
        id: 'buggy',
        name: 'Buggy',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 2, height: 1, depth: 4 },
        position: [c.carAt?.[0] ?? 0, 0.55, c.carAt?.[1] ?? 5],
        rotation: [0, carYaw, 0],
        mass: 2,
        friction: 0.8,
      },
      ...c.obstacles.map((o, i) => ({
        id: `obs${i}`,
        name: `Obstacle ${i}`,
        bodyType: 'static',
        shape: { type: 'box', width: o.length, height: o.height ?? 3, depth: o.thickness ?? 2 },
        position: [o.at[0], (o.height ?? 3) / 2, o.at[1]],
        rotation: [0, (o.yawDeg * Math.PI) / 180, 0],
      })),
    ],
  } as unknown as RennWorld
  world = copyGlobalPipeIntoWorld(world, library, AV_GLOBAL_STACK_PIPE_ID)
  world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!, 'linked')
  world.transformers!.global_av_mission!.params = { waypoints: [c.goal], acceptRadius: 9, mode: 'stop' }
  return updateBindingParams(world, 'buggy', 0, { cruiseSpeed: c.cruiseSpeed ?? 10 })
}

export async function runEdgeCase(c: EdgeCase): Promise<EdgeResult> {
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(buildWorld(c), 15)
  try {
    const frames = c.frames ?? 2400
    let prev = sim.getPosition('buggy')
    let path = 0
    let stall = 0
    let longestStall = 0
    let minY = Infinity
    let arrivedAt: number | null = null
    for (let f = 0; f < frames; f++) {
      sim.runFrames(1)
      const p = sim.getPosition('buggy')
      path += Math.hypot(p[0] - prev[0], p[2] - prev[2])
      prev = p
      minY = Math.min(minY, p[1])
      const v = sim.getVelocity('buggy')
      const d = Math.hypot(p[0] - c.goal[0], p[2] - c.goal[1])
      if (arrivedAt === null && d < 6) arrivedAt = f
      if (arrivedAt === null) {
        stall = Math.hypot(v[0], v[2]) < 0.3 ? stall + 1 : 0
        longestStall = Math.max(longestStall, stall)
      }
      if (arrivedAt !== null && f - arrivedAt > 120) break
    }
    const p = sim.getPosition('buggy')
    return {
      arrived: arrivedAt !== null,
      framesToArrive: arrivedAt,
      finalDistance: Math.hypot(p[0] - c.goal[0], p[2] - c.goal[1]),
      longestStall,
      minY,
      path,
    }
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

/**
 * A long wall in front of the car, `clearance` metres from its nearest corner (0.05 ≈ pressed against it), oriented `yawDeg`
 * against the X axis (0 = straight across). The car (2 × 4 m at `carYawDeg`, centre `carAt`) never overlaps it: the wall
 * is pushed out along its own normal by the car's extent in that direction (separating-axis placement), so a car turned
 * against a long object touches it with a corner — the situation that used to wedge the stack.
 */
export function wallAgainstCar(opts: { yawDeg: number; carYawDeg?: number; carAt?: [number, number]; clearance?: number; length?: number; thickness?: number }): EdgeObstacle {
  const { yawDeg, carYawDeg = 0, carAt = [0, 5], clearance = 0.05, length = 60, thickness = 2 } = opts
  const a = (yawDeg * Math.PI) / 180
  const cy = (carYawDeg * Math.PI) / 180
  // car forward in (x, z): yaw 0 faces −Z; positive yaw turns left (towards −X)
  const fwd = [-Math.sin(cy), -Math.cos(cy)]
  let nx = Math.sin(a)
  let nz = Math.cos(a)
  if (nx * fwd[0] + nz * fwd[1] < 0) {
    nx = -nx
    nz = -nz
  }
  // extent of the car's footprint along the wall normal
  const left = [-fwd[1], fwd[0]]
  let h = 0
  for (const sl of [-1, 1]) for (const sf of [-1, 1]) {
    const px = sf * 2 * fwd[0] + sl * 1 * left[0]
    const pz = sf * 2 * fwd[1] + sl * 1 * left[1]
    h = Math.max(h, px * nx + pz * nz)
  }
  const off = h + clearance + thickness / 2
  return { at: [carAt[0] + nx * off, carAt[1] + nz * off], length, thickness, yawDeg }
}

/** Kept for the simple yaw-0 car: wall surface `gap` metres from the nose. */
export function wallNearNose(gap: number, yawDeg: number, length = 60, thickness = 2): EdgeObstacle {
  return wallAgainstCar({ yawDeg, clearance: Math.max(0.05, gap - 2 + 2 + 0), length, thickness })
}

/** Long obstacle across / diagonal to the car's way, goal behind it, car pressed against it at various angles. */
export const AV_EDGE_CASES: EdgeCase[] = [
  { name: 'goal to the right, free way (turn on the spot)', goal: [35, -5], obstacles: [] },
  { name: 'goal to the left, free way', goal: [-35, -5], obstacles: [] },
  { name: 'goal behind the car', goal: [0, 45], obstacles: [] },
  { name: 'long wall straight ahead (goal behind it)', goal: [0, -50], obstacles: [{ at: [0, -12], length: 30, yawDeg: 0 }] },
  { name: 'long wall 30° to the car, close', goal: [0, -50], obstacles: [{ at: [0, -6], length: 30, yawDeg: 30 }] },
  { name: 'long wall 45° to the car, close', goal: [0, -50], obstacles: [{ at: [0, -6], length: 30, yawDeg: 45 }] },
  { name: 'long wall 60° to the car, close', goal: [0, -50], obstacles: [{ at: [0, -6], length: 30, yawDeg: 60 }] },
  { name: 'long wall -45° to the car, close', goal: [0, -50], obstacles: [{ at: [0, -6], length: 30, yawDeg: -45 }] },
  { name: 'car turned 40° against a long wall alongside', goal: [0, -50], carYawDeg: 40, obstacles: [{ at: [4, 0], length: 40, yawDeg: 90 }] },
  { name: 'car turned -40° against a long wall alongside', goal: [0, -50], carYawDeg: -40, obstacles: [{ at: [-4, 0], length: 40, yawDeg: 90 }] },
  { name: 'nose into a corner of two long walls', goal: [0, 40], carYawDeg: 0, carAt: [0, 5], obstacles: [{ at: [0, -2], length: 24, yawDeg: 0 }, { at: [10, 6], length: 24, yawDeg: 90 }] },
  { name: 'pressed against a long wall: car -40° / wall 50° (5 cm gap)', goal: [0, -45], carYawDeg: -40, obstacles: [wallAgainstCar({ yawDeg: 50, carYawDeg: -40, clearance: 0.05 })] },
  { name: 'pressed against a long wall: car -20° / wall 70° (5 cm gap)', goal: [0, -45], carYawDeg: -20, obstacles: [wallAgainstCar({ yawDeg: 70, carYawDeg: -20, clearance: 0.05 })] },
  { name: 'pressed against a long wall: car -20° / wall 50° (5 cm gap)', goal: [0, -45], carYawDeg: -20, obstacles: [wallAgainstCar({ yawDeg: 50, carYawDeg: -20, clearance: 0.05 })] },
  { name: 'pressed against a long wall: car 20° / wall 110° (5 cm gap)', goal: [0, -45], carYawDeg: 20, obstacles: [wallAgainstCar({ yawDeg: 110, carYawDeg: 20, clearance: 0.05 })] },
  { name: 'pressed against a long wall: car 40° / wall 130° (5 cm gap)', goal: [0, -45], carYawDeg: 40, obstacles: [wallAgainstCar({ yawDeg: 130, carYawDeg: 40, clearance: 0.05 })] },
  { name: 'low bar (invisible to the lidar) across the way, 6 m', goal: [0, -50], frames: 3000, obstacles: [{ at: [0, -8], length: 6, thickness: 1, yawDeg: 0, height: 0.35 }] },
  { name: 'low bar (invisible to the lidar) across the way, 12 m', goal: [0, -50], frames: 3000, obstacles: [{ at: [0, -8], length: 12, thickness: 1, yawDeg: 0, height: 0.35 }] },
  { name: 'low bar 45° to the car (invisible to the lidar)', goal: [0, -50], frames: 3000, obstacles: [{ at: [0, -8], length: 10, thickness: 1, yawDeg: 45, height: 0.35 }] },
]
