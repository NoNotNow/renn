/**
 * CarTransformer2: WASD drive impulses + optional jump (semantic action `jump`, e.g. Space);
 * addRotation for steering. Physics output only while touching another collider.
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
  /** World-space Y impulse applied once per jump press while grounded (Rapier applyImpulse). Default 200. */
  jumpImpulse?: number
}

const DEFAULT_CAR2_PARAMS: Required<CarTransformer2Params> = {
  power: 400,
  steeringIntensity: 0.1,
  steeringSpeed: 0.01,
  lateralGrip: 100,
  lateralToForwardTransfer: 0.2,
  jumpImpulse: 200,
}


export class CarTransformer2 extends BaseTransformer {
  readonly type = 'car2'
  wheelAngle: number = 0 // -1 to 1
  private params: Required<CarTransformer2Params>
  private jumpHeldPrev = false

  constructor(priority: number = 10, params: Partial<CarTransformer2Params> = {}) {
    super(priority, true)
    this.params = { ...DEFAULT_CAR2_PARAMS, ...params }
  }

  setParams(params: Partial<CarTransformer2Params>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, deltaTime: number): TransformOutput {
    this.calculateWheelAngle(input)

    const jumpHeld = this.getAction(input, 'jump') > 0
    const jumpRisingEdge = jumpHeld && !this.jumpHeldPrev
    this.jumpHeldPrev = jumpHeld

    const forwardVector = this.getForwardVector(input.rotation)
    const touching = input.environment.isTouchingObject === true

    if (!touching) {
      return { earlyExit: false }
    }

    const relativeVelocity = this.getLinearVelocityRelativeToSupport(input)
    let impulse = this.setImpulse(input, deltaTime, forwardVector, relativeVelocity)
    const ji = this.params.jumpImpulse
    if (jumpRisingEdge && ji > 0) {
      impulse = this.addVec3(impulse, [0, ji, 0])
    }
    const rotationDelta = this.getRotationDelta(input, deltaTime, this.wheelAngle, relativeVelocity)
    const addRotation = rotationDelta
    return {
      impulse,
      addRotation,
      earlyExit: false,
    }
  }

  /** Linear velocity minus `environment.supportVelocity` when set; else world `input.velocity`. */
  private getLinearVelocityRelativeToSupport(input: TransformInput): Vec3 {
    const s = input.environment.supportVelocity
    if (!s) return input.velocity
    return [
      input.velocity[0] - s[0],
      input.velocity[1] - s[1],
      input.velocity[2] - s[2],
    ]
  }

  private getRotationDelta(
    input: TransformInput,
    deltaTime: number,
    wheelAngle: number,
    relativeVelocity: Vec3,
  ): Vec3 | undefined {
    if (wheelAngle === 0) return undefined
    const forwardDistance = this.getForwardSpeed(relativeVelocity, input) * deltaTime
    const upVector = this.getUpVector(input.rotation)
    const angleRad = forwardDistance * wheelAngle * this.params.steeringIntensity
    return eulerDeltaAroundAxis(input.rotation, upVector, angleRad)
  }

  private getForwardSpeed(relativeVelocity: Vec3, input: TransformInput): number {
    const forward = this.getForwardVector(input.rotation)
    return getForwardSpeedUtil(relativeVelocity, forward)
  }

  private setImpulse(
    input: TransformInput,
    _dt: number,
    forwardVector: Vec3,
    relativeVelocity: Vec3,
  ): Vec3 {
    const forward = this.getAction(input, 'throttle')
    const backward = this.getAction(input, 'brake')
    const gasBreakInput = forward - backward
    const gasBreakForce = scaleVec3(forwardVector, this.params.power * gasBreakInput)
    const sideSpeed = this.getSidewaysVelocity(relativeVelocity, forwardVector)
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

    let force =  left - right;
    if (force === 0) {
      if (this.wheelAngle > 0) force = -1
      else if (this.wheelAngle < 0) force = 1
    }
    this.wheelAngle += force * factor
    this.wheelAngle = clamp(this.wheelAngle, -1, 1)
    if (this.wheelAngle < factor && this.wheelAngle > -factor) this.wheelAngle = 0
  }
}
