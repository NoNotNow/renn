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
  /** Handbrake force multiplier */
  handbrakeMultiplier?: number
}

const DEFAULT_PARAMS: Required<CarTransformerParams> = {
  acceleration: 15.0,
  steering: 0.3,
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
    const { acceleration, steering, handbrakeMultiplier } = this.params

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

    // NOTE: Friction is handled by Rapier physics (collider friction property)
    // We DO NOT apply manual friction here to avoid double-damping
    // The car will naturally decelerate due to Rapier's friction model

    // Handbrake (strong deceleration force, only when moving)
    if (handbrake > 0 && speed > 0.1) {
      // Handbrake applies a deceleration force opposite to velocity
      const handbrakeForce = velocity
        .clone()
        .normalize()
        .multiplyScalar(-speed * handbrakeMultiplier * acceleration) // Scale with acceleration for consistency
      forceVec.add(handbrakeForce)
    }

    // Steering torque
    // Apply immediately at any speed (not gated by speed threshold)
    // But scale down at very low speeds for stability
    let torque: THREE.Vector3 | undefined
    const steerInput = steerRight - steerLeft
    
    if (steerInput !== 0) {
      // Active steering input: apply torque proportional to speed and steering input
      // At low speeds: reduced steering for stability
      // At high speeds: steering is effective
      const speedFactor = Math.max(0.2, Math.min(1, speed / 10)) // 0.2-1.0 range
      const steerAmount = steerInput * steering * speedFactor
      torque = new THREE.Vector3(0, steerAmount, 0)
    }
    // NOTE: Angular damping is handled by Rapier physics (rigid body angular damping)
    // We DO NOT apply manual counter-torque to avoid double-damping
    // The car will naturally stop rotating due to Rapier's damping

    const output = {
      force: forceVec.length() > 0.01 ? [forceVec.x, forceVec.y, forceVec.z] : undefined,
      torque: torque ? [torque.x, torque.y, torque.z] : undefined,
      earlyExit: false,
    }

    return output
  }
}
