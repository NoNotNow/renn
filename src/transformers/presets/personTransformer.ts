/**
 * PersonTransformer: WASD walk/run with forward impulse and in-place turning.
 * Turning is implemented as a physics torque around the entity's local up axis.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import type { Vec3 } from '@/types/world'
import { createTorqueAroundAxis, getForwardSpeed as getForwardSpeedUtil, scaleVec3, vec3Length } from '@/utils/vec3'

export interface PersonTransformerParams {
  /** Impulse magnitude when walking. Default 200. */
  walkForce?: number
  /** Impulse magnitude when running. Default 350. */
  runForce?: number
  /** Max forward/backward speed when walking. Default 4. */
  maxWalkSpeed?: number
  /** Max forward/backward speed when running. Default 8. */
  maxRunSpeed?: number
  /** Yaw rate in rad/s per unit turn input. Limits only rotation speed, not total turn angle. Default 2. */
  turnSpeed?: number
}

const DEFAULT_PERSON_PARAMS: Required<PersonTransformerParams> = {
  walkForce: 200,
  runForce: 350,
  maxWalkSpeed: 4,
  maxRunSpeed: 8,
  turnSpeed: 2,
}

export class PersonTransformer extends BaseTransformer {
  readonly type = 'person'
  private params: Required<PersonTransformerParams>

  constructor(priority: number = 10, params: Partial<PersonTransformerParams> = {}) {
    super(priority, true)
    this.params = { ...DEFAULT_PERSON_PARAMS, ...params }
  }

  setParams(params: Partial<PersonTransformerParams>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, deltaTime: number): TransformOutput {
    const forwardVector = this.getForwardVector(input.rotation)
    const upVector = this.getUpVector(input.rotation)
    const touching = input.environment.isTouchingObject === true

    if (!touching) {
      return { earlyExit: false }
    }

    const impulse = this.getMovementImpulse(input, forwardVector)
    const torque = this.getTorque(input, upVector, deltaTime)

    return {
      impulse,
      torque,
      earlyExit: false,
    }
  }

  private getMovementImpulse(input: TransformInput, forwardVector: Vec3): Vec3 | undefined {
    const forward = this.getAction(input, 'forward')
    const backward = this.getAction(input, 'backward')
    const run = this.getAction(input, 'run')
    const moveInput = forward - backward
    if (moveInput === 0) return undefined

    const forwardSpeed = getForwardSpeedUtil(input.velocity, forwardVector)
    const maxSpeed = run ? this.params.maxRunSpeed : this.params.maxWalkSpeed
    const targetSpeed = moveInput * maxSpeed
    const force = run ? this.params.runForce : this.params.walkForce

    const shouldApply =
      (targetSpeed > 0 && forwardSpeed < targetSpeed) ||
      (targetSpeed < 0 && forwardSpeed > targetSpeed)
    if (!shouldApply) return undefined

    return scaleVec3(forwardVector, force * Math.sign(moveInput))
  }

  private getTorque(input: TransformInput, upVector: Vec3, deltaTime: number): Vec3 | undefined {
    const turnInput = this.getAction(input, 'turn_left') - this.getAction(input, 'turn_right');
    if (turnInput === 0) return undefined

    // Don't exceed max angular velocity magnitude (rough global guard).
    const angularVelocityMag = vec3Length(input.angularVelocity)
    if (angularVelocityMag > this.params.turnSpeed) return undefined

    // Target angular velocity around the entity's local "up" axis.
    const desiredAngularVelocityAlongUp = turnInput * this.params.turnSpeed
    const currentAngularVelocityAlongUp =
      input.angularVelocity[0] * upVector[0] +
      input.angularVelocity[1] * upVector[1] +
      input.angularVelocity[2] * upVector[2]

    // Simple P controller: torque = required angular acceleration (assuming unit inertia).
    const angularVelError = desiredAngularVelocityAlongUp - currentAngularVelocityAlongUp
    const dt = Math.max(deltaTime, 1e-6)
    const torqueMagnitude = angularVelError / dt

    if (Math.abs(torqueMagnitude) < 1e-6) return undefined
    return createTorqueAroundAxis(upVector, torqueMagnitude)
  }
}
