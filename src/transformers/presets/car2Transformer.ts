/**
 * CarTransformer2: Maps WASD + handbrake actions outputs impulse and addRotation for precise
 * steering (friction makes torque-based steering imprecise).
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import type { Vec3 } from '@/types/world'
import { clamp } from '@/utils/numberUtils'
import { eulerDeltaAroundAxis } from '@/utils/rotationUtils'
import { getForwardSpeed as getForwardSpeedUtil, scaleVec3 } from '@/utils/vec3'

export interface CarTransformer2Params {
  /** Throttle/brake impulse magnitude. Default 400. */
  power?: number
  /** Yaw per distance per wheel angle (radians per metre). Default 0.1. */
  steeringIntensity?: number
  /** Wheel angle change rate. Default 0.01. */
  steeringSpeed?: number
  /** Sideways grip strength (higher = less sliding). Default 100. */
  lateralGrip?: number
  /** Fraction of lateral grip translated into forward impulse when turning (0–1). Default 0.2. */
  lateralToForwardTransfer?: number
}

const DEFAULT_CAR2_PARAMS: Required<CarTransformer2Params> = {
  power: 400,
  steeringIntensity: 0.1,
  steeringSpeed: 0.01,
  lateralGrip: 100,
  lateralToForwardTransfer: 0.2,
}


export class CarTransformer2 extends BaseTransformer {
  readonly type = 'car2'
  wheelAngle: number = 0 // -1 to 1
  private params: Required<CarTransformer2Params>

  constructor(priority: number = 10, params: Partial<CarTransformer2Params> = {}) {
    super(priority, true)
    this.params = { ...DEFAULT_CAR2_PARAMS, ...params }
  }

  setParams(params: Partial<CarTransformer2Params>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, deltaTime: number): TransformOutput {
    this.calculateWheelAngle(input)

    const forwardVector = this.getForwardVector(input.rotation)
    const touching = input.environment.isTouchingObject === true

    if (!touching) {
      return { earlyExit: false }
    }

    const impulse = this.setImpulse(input, deltaTime, forwardVector)
    const rotationDelta = this.getRotationDelta(input, deltaTime, this.wheelAngle)
    const addRotation = rotationDelta
    return {
      impulse,
      addRotation,
      earlyExit: false,
    }
  }

  private getRotationDelta(input: TransformInput, deltaTime: number, wheelAngle: number): Vec3|undefined {
    if(wheelAngle === 0) return undefined;
    const forwardDistance = this.getForwardSpeed(input) * deltaTime
    const upVector = this.getUpVector(input.rotation)
    const angleRad = forwardDistance * wheelAngle * this.params.steeringIntensity
    return eulerDeltaAroundAxis(input.rotation, upVector, angleRad)
  }

  private getForwardSpeed(input: TransformInput): number {
    const forward = this.getForwardVector(input.rotation)
    return getForwardSpeedUtil(input.velocity, forward)
  }

  private setImpulse(input: TransformInput, _dt: number, forwardVector: Vec3): Vec3 {
    const forward = this.getAction(input, 'throttle')
    const backward = this.getAction(input, 'brake')
    const gasBreakInput = forward - backward
    const gasBreakForce = scaleVec3(forwardVector, this.params.power * gasBreakInput)
    const sideSpeed = this.getSidewaysVelocity(input.velocity, forwardVector)
    const magSide = Math.sqrt(
      sideSpeed[0] ** 2 + sideSpeed[1] ** 2 + sideSpeed[2] ** 2,
    )
    const k = this.params.lateralToForwardTransfer
    const sideForce = scaleVec3(sideSpeed, -this.params.lateralGrip * (1 - k))
    const forwardFromLateral = scaleVec3(
      forwardVector,
      this.params.lateralGrip * magSide * k,
    )
    return this.addVec3(gasBreakForce, this.addVec3(sideForce, forwardFromLateral))
  }

  private getSidewaysVelocity(velocity: Vec3, forward: Vec3): Vec3 {
    const lenSq = forward[0]**2 + forward[1]**2 + forward[2]**2
    const invLen = lenSq > 1e-10 ? 1 / Math.sqrt(lenSq) : 0
    const fx = forward[0] * invLen
    const fy = forward[1] * invLen
    const fz = forward[2] * invLen
    const dot = velocity[0] * fx + velocity[1] * fy + velocity[2] * fz
    return [
      velocity[0] - dot * fx,
      velocity[1] - dot * fy,
      velocity[2] - dot * fz,
    ]
  }

  private calculateWheelAngle(input: TransformInput): void {
    const factor = this.params.steeringSpeed
    const left = this.getAction(input, 'steer_left')
    const right = this.getAction(input, 'steer_right')

    let force = right - left
    if (force === 0) {
      if (this.wheelAngle > 0) force = -1
      else if (this.wheelAngle < 0) force = 1
    }
    this.wheelAngle += force * factor
    this.wheelAngle = clamp(this.wheelAngle, -1, 1)
    if (this.wheelAngle < factor && this.wheelAngle > -factor) this.wheelAngle = 0
  }
}
