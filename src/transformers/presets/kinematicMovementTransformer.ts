/**
 * kinematicMovement: reads TransformInput.target and emits TransformOutput.setPose
 * by linear translation at target.speed (m/s) and slerp rotation with an internal max rate.
 * Does not read angular speed from target — rotation policy is local to this transformer.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import { EMPTY_TRANSFORM_OUTPUT } from '@/types/transformer'
import type { Rotation, Vec3 } from '@/types/world'
import { eulerToQuaternion, quaternionToEuler } from '@/utils/rotationUtils'
import { vec3Length } from '@/utils/vec3'

export interface KinematicMovementParams {
  /** Max rotation rate (rad/s) toward target pose.rotation. Not related to target.speed. */
  maxRotationRate?: number
}

const DEFAULT_MAX_ROTATION_RATE = Math.PI * 2

export class KinematicMovementTransformer extends BaseTransformer {
  readonly type = 'kinematicMovement'
  private maxRotationRate: number

  constructor(priority: number = 6, params: Partial<KinematicMovementParams> = {}) {
    super(priority, true)
    this.maxRotationRate = params.maxRotationRate ?? DEFAULT_MAX_ROTATION_RATE
  }

  setParams(params: Partial<KinematicMovementParams>): void {
    if (params.maxRotationRate !== undefined) this.maxRotationRate = params.maxRotationRate
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const target = input.target
    if (!target) {
      return EMPTY_TRANSFORM_OUTPUT
    }

    const t = Math.max(dt, 1e-6)
    const { position: fromPos, rotation: fromRot } = input
    const {
      position: toPos,
      rotation: toRot,
    } = target.pose
    const linearSpeed = target.speed

    const newPos = stepLinearPosition(fromPos, toPos, linearSpeed, t)

    const qFrom = eulerToQuaternion(fromRot)
    const qTo = eulerToQuaternion(toRot)
    const dot = Math.min(1, Math.abs(qFrom.dot(qTo)))
    const angle = 2 * Math.acos(dot)
    const maxStep = this.maxRotationRate * t
    const tRot = angle <= 1e-9 ? 1 : Math.min(1, maxStep / angle)
    qFrom.slerp(qTo, tRot)
    const newRot = quaternionToEuler(qFrom)

    return {
      setPose: { position: newPos, rotation: newRot },
      earlyExit: false,
    }
  }
}

/** Move along chord toward `to` at `maxStep` length per frame. */
export function stepLinearPosition(
  from: Vec3,
  to: Vec3,
  linearSpeed: number,
  dt: number,
): Vec3 {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = vec3Length([dx, dy, dz])
  const maxStep = linearSpeed * dt
  if (dist <= 1e-9) {
    return [to[0], to[1], to[2]]
  }
  if (dist <= maxStep) {
    return [to[0], to[1], to[2]]
  }
  const s = maxStep / dist
  return [from[0] + dx * s, from[1] + dy * s, from[2] + dz * s]
}
