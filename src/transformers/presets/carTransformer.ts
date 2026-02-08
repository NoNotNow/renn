/**
 * CarTransformer: vehicle physics with steering.
 *
 * Handles:
 * - Throttle/brake
 * - Steering (turns vehicle)
 * - Handbrake
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import * as THREE from 'three'

export interface CarTransformerParams {
  /** Acceleration force */
  acceleration?: number
  /** Steering sensitivity */
  steering?: number
  /** Friction coefficient */
  friction?: number
  /** Handbrake force multiplier */
  handbrakeMultiplier?: number
}

const DEFAULT_PARAMS: Required<CarTransformerParams> = {
  acceleration: 15.0,
  steering: 1.2,
  friction: 0.8,
  handbrakeMultiplier: 2.0,
}

export class CarTransformer extends BaseTransformer {
  readonly type = 'car'
  private params: Required<CarTransformerParams>

  constructor(
    priority: number = 10,
    params: CarTransformerParams = {},
  ) {
    super(priority, true)
    this.params = { ...DEFAULT_PARAMS, ...params }
  }

  setParams(params: Partial<CarTransformerParams>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const { acceleration, steering, friction, handbrakeMultiplier } = this.params

    // Get actions
    const throttle = this.getAction(input, 'throttle')
    const brake = this.getAction(input, 'brake')
    const steerLeft = this.getAction(input, 'steer_left')
    const steerRight = this.getAction(input, 'steer_right')
    const handbrake = this.getAction(input, 'handbrake')

    // Current rotation and velocity
    const [rx, ry, rz] = input.rotation
    const euler = new THREE.Euler(rx, ry, rz, 'XYZ')
    const [vx, vy, vz] = input.velocity
    const velocity = new THREE.Vector3(vx, vy, vz)
    const speed = velocity.length()

    // Forward direction
    const forwardDir = new THREE.Vector3(0, 0, -1)
    forwardDir.applyEuler(euler)

    // Throttle/brake force
    const throttleForce = (throttle - brake) * acceleration
    const forceVec = forwardDir.multiplyScalar(throttleForce)

    // Friction (opposes velocity)
    if (speed > 0.1) {
      const frictionForce = velocity.clone().normalize().multiplyScalar(-speed * friction)
      forceVec.add(frictionForce)
    }

    // Handbrake (strong friction)
    if (handbrake > 0 && speed > 0.1) {
      const handbrakeForce = velocity
        .clone()
        .normalize()
        .multiplyScalar(-speed * friction * handbrakeMultiplier)
      forceVec.add(handbrakeForce)
    }

    // Steering torque (only when moving)
    let torque: THREE.Vector3 | undefined
    if (speed > 0.1) {
      const steerAmount = (steerRight - steerLeft) * steering * (speed / 10) // More steering at speed
      torque = new THREE.Vector3(0, steerAmount, 0)
    }

    const output = {
      force: forceVec.length() > 0.01 ? [forceVec.x, forceVec.y, forceVec.z] : undefined,
      torque: torque && Math.abs(torque.y) > 0.01 ? [torque.x, torque.y, torque.z] : undefined,
      earlyExit: false,
    }

    return output
  }
}
