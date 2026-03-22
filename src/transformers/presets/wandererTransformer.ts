/**
 * wanderer: target source that randomly selects poses within a perimeter cube.
 * Publishes TransformInput.target for kinematicMovement. Configurable speed,
 * jump distance, and linear/angular toggles.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput, TransformTarget } from '@/types/transformer'
import { EMPTY_TRANSFORM_OUTPUT } from '@/types/transformer'
import type { Rotation, Vec3 } from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'

export interface WandererPerimeter {
  center: Vec3
  halfExtents: Vec3
}

export interface WandererParams {
  /** Linear speed (m/s) toward target position. */
  speed?: number
  /** Max distance to next target; 0 = anywhere in cube. */
  jumpDistance?: number
  /** Enable position wandering. */
  linear?: boolean
  /** Enable rotation wandering. */
  angular?: boolean
  /** AABB for wandering region. */
  perimeter?: WandererPerimeter
  /** Reach threshold for position. */
  positionEpsilon?: number
  /** Reach threshold for rotation (rad). */
  rotationEpsilon?: number
}

const DEFAULT_PERIMETER: WandererPerimeter = {
  center: [0, 0, 0],
  halfExtents: [5, 5, 5],
}

const DEFAULTS = {
  speed: 2,
  jumpDistance: 3,
  linear: true,
  angular: true,
  positionEpsilon: 0.05,
  rotationEpsilon: 0.08,
}

function positionReached(a: Vec3, b: Vec3, eps: number): boolean {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= eps
}

function rotationReached(a: Rotation, b: Rotation, epsRad: number): boolean {
  const qa = eulerToQuaternion(a)
  const qb = eulerToQuaternion(b)
  const dot = Math.min(1, Math.abs(qa.dot(qb)))
  const angle = 2 * Math.acos(dot)
  return angle <= epsRad
}

/** Sample uniform random direction on unit sphere. */
function randomDirection(): Vec3 {
  let x: number, y: number, z: number
  let lenSq: number
  do {
    x = 2 * Math.random() - 1
    y = 2 * Math.random() - 1
    z = 2 * Math.random() - 1
    lenSq = x * x + y * y + z * z
  } while (lenSq > 1 || lenSq < 1e-12)
  const len = Math.sqrt(lenSq)
  return [x / len, y / len, z / len]
}

/** Clamp value to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Clamp position to perimeter AABB. */
function clampToPerimeter(pos: Vec3, p: WandererPerimeter): Vec3 {
  const [cx, cy, cz] = p.center
  const [hx, hy, hz] = p.halfExtents
  return [
    clamp(pos[0], cx - hx, cx + hx),
    clamp(pos[1], cy - hy, cy + hy),
    clamp(pos[2], cz - hz, cz + hz),
  ]
}

/** Sample random position in perimeter. */
function samplePositionInPerimeter(p: WandererPerimeter): Vec3 {
  const [cx, cy, cz] = p.center
  const [hx, hy, hz] = p.halfExtents
  return [
    cx + (2 * Math.random() - 1) * hx,
    cy + (2 * Math.random() - 1) * hy,
    cz + (2 * Math.random() - 1) * hz,
  ]
}

/** Sample random position within jumpDistance of current, clamped to perimeter. */
function samplePositionWithJump(
  current: Vec3,
  jumpDistance: number,
  perimeter: WandererPerimeter,
): Vec3 {
  const dir = randomDirection()
  const dist = Math.random() * jumpDistance
  const candidate: Vec3 = [
    current[0] + dir[0] * dist,
    current[1] + dir[1] * dist,
    current[2] + dir[2] * dist,
  ]
  return clampToPerimeter(candidate, perimeter)
}

/** Sample random rotation (Euler [x,y,z] in radians). */
function sampleRandomRotation(): Rotation {
  return [
    (Math.random() - 0.5) * 2 * Math.PI,
    (Math.random() - 0.5) * 2 * Math.PI,
    (Math.random() - 0.5) * 2 * Math.PI,
  ]
}

export class WandererTransformer extends BaseTransformer {
  readonly type = 'wanderer'
  private params: Required<
    Pick<
      WandererParams,
      'speed' | 'jumpDistance' | 'linear' | 'angular' | 'positionEpsilon' | 'rotationEpsilon'
    >
  > & { perimeter: WandererPerimeter }

  private currentTarget: { position: Vec3; rotation: Rotation } | null = null

  constructor(priority: number = 5, params: Partial<WandererParams> = {}) {
    super(priority, true)
    const perimeter = params.perimeter ?? DEFAULT_PERIMETER
    this.params = {
      speed: params.speed ?? DEFAULTS.speed,
      jumpDistance: params.jumpDistance ?? DEFAULTS.jumpDistance,
      linear: params.linear ?? DEFAULTS.linear,
      angular: params.angular ?? DEFAULTS.angular,
      perimeter,
      positionEpsilon: params.positionEpsilon ?? DEFAULTS.positionEpsilon,
      rotationEpsilon: params.rotationEpsilon ?? DEFAULTS.rotationEpsilon,
    }
  }

  setParams(params: Partial<WandererParams>): void {
    if (params.speed !== undefined) this.params.speed = params.speed
    if (params.jumpDistance !== undefined) this.params.jumpDistance = params.jumpDistance
    if (params.linear !== undefined) this.params.linear = params.linear
    if (params.angular !== undefined) this.params.angular = params.angular
    if (params.perimeter !== undefined) this.params.perimeter = params.perimeter
    if (params.positionEpsilon !== undefined)
      this.params.positionEpsilon = params.positionEpsilon
    if (params.rotationEpsilon !== undefined)
      this.params.rotationEpsilon = params.rotationEpsilon
  }

  private pickNewTarget(input: TransformInput): void {
    const { perimeter, jumpDistance, linear, angular } = this.params
    const pos = linear
      ? jumpDistance > 0
        ? samplePositionWithJump(input.position, jumpDistance, perimeter)
        : samplePositionInPerimeter(perimeter)
      : [...input.position]
    const rot = angular ? sampleRandomRotation() : [...input.rotation]
    this.currentTarget = { position: pos, rotation: rot }
  }

  private targetReached(input: TransformInput): boolean {
    if (!this.currentTarget) return true
    const { positionEpsilon, rotationEpsilon, linear, angular } = this.params
    const posReached = !linear || positionReached(input.position, this.currentTarget.position, positionEpsilon)
    const rotReached = !angular || rotationReached(input.rotation, this.currentTarget.rotation, rotationEpsilon)
    return posReached && rotReached
  }

  transform(input: TransformInput, _dt: number): TransformOutput {
    const { speed, linear, angular } = this.params

    if (!this.currentTarget || this.targetReached(input)) {
      this.pickNewTarget(input)
    }

    if (!this.currentTarget) {
      input.target = undefined
      return EMPTY_TRANSFORM_OUTPUT
    }

    const targetPos = linear ? this.currentTarget.position : input.position
    const targetRot = angular ? this.currentTarget.rotation : input.rotation

    input.target = {
      pose: {
        position: [targetPos[0], targetPos[1], targetPos[2]],
        rotation: [targetRot[0], targetRot[1], targetRot[2]],
      },
      speed,
    }
    return EMPTY_TRANSFORM_OUTPUT
  }
}

export const wandererTestExports = {
  positionReached,
  rotationReached,
  samplePositionInPerimeter,
  samplePositionWithJump,
  clampToPerimeter,
}
