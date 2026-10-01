import type { WandererParams } from '@/transformers/presets/wandererTransformer'
import type { Vec3 } from '@/types/world'

/**
 * World JSON Vec3 order: **[x, y, z]** with **Y up** (same as `entity.position`, gravity `[0, -100, 0]`).
 * Wanderer `perimeter.center` / `halfExtents` use the same order.
 * Floor-top driving: targets and roam centers on the **floor plane** (`y = DEFAULT_WANDER_FLOOR_Y`, typically **0**);
 * use **halfExtents[1] = 0** to roam on XZ only. Entity `position.y` (e.g. ~0.55) stays above the floor for physics.
 */
export const DEFAULT_WANDER_FLOOR_Y = 0

/** @deprecated Use `DEFAULT_WANDER_FLOOR_Y`. */
export const DEFAULT_WANDER_GROUND_Y = DEFAULT_WANDER_FLOOR_Y

/** Single fixed goal (zero halfExtents). */
export function pinnedGoalWandererParams(center: Vec3, overrides?: Partial<WandererParams>): WandererParams {
  return {
    speed: 2,
    jumpDistance: 0,
    linear: true,
    angular: false,
    perimeter: {
      center: [...center] as Vec3,
      halfExtents: [0, 0, 0],
    },
    positionEpsilon: 20,
    rotationEpsilon: 20,
    ...overrides,
  }
}

/** Self-drive cube / diagnostic: goal behind obstacle on −Z. */
export function selfDrivePinnedGoalWandererParams(goalZ: number): WandererParams {
  return pinnedGoalWandererParams([0, DEFAULT_WANDER_FLOOR_Y, goalZ])
}

/** Open-world roam on XZ; Y locked to `centerY` (default floor plane). */
export function horizontalArenaWandererParams(
  halfExtentX: number,
  halfExtentZ: number,
  options: {
    centerX?: number
    centerY?: number
    centerZ?: number
    jumpDistance?: number
    positionEpsilon?: number
  } = {},
): WandererParams {
  const {
    centerX = 0,
    centerY = DEFAULT_WANDER_FLOOR_Y,
    centerZ = 0,
    jumpDistance = 900,
    positionEpsilon = 30,
  } = options
  return {
    speed: 2,
    jumpDistance,
    linear: true,
    angular: false,
    perimeter: {
      center: [centerX, centerY, centerZ],
      halfExtents: [halfExtentX, 0, halfExtentZ],
    },
    positionEpsilon,
    rotationEpsilon: 20,
  }
}

/** Normalize legacy wanderer JSON (e.g. center Y=0.5 box-center height) to floor-plane driving. */
export function normalizeWandererParamsYUp(params: WandererParams): WandererParams {
  if (!params.perimeter) return params
  const center = [...params.perimeter.center] as Vec3
  if (params.perimeter.halfExtents[1] === 0 && center[1] === 0.5) {
    center[1] = DEFAULT_WANDER_FLOOR_Y
  }
  return {
    ...params,
    perimeter: {
      center,
      halfExtents: [...params.perimeter.halfExtents] as Vec3,
    },
  }
}
