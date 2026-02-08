/**
 * AirplaneTransformer: simulates airplane flight physics.
 *
 * Handles:
 * - Thrust (forward force)
 * - Lift (proportional to velocity)
 * - Drag (opposes velocity)
 * - Pitch/Yaw/Roll (rotational control)
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import * as THREE from 'three'

export interface AirplaneTransformerParams {
  /** Thrust force magnitude */
  thrustForce?: number
  /** Lift coefficient (multiplies velocity for lift) */
  liftCoefficient?: number
  /** Drag coefficient (multiplies velocity squared for drag) */
  dragCoefficient?: number
  /** Maximum speed (clamps velocity) */
  maxSpeed?: number
  /** Rotational control sensitivity */
  pitchSensitivity?: number
  yawSensitivity?: number
  rollSensitivity?: number
}

const DEFAULT_PARAMS: Required<AirplaneTransformerParams> = {
  thrustForce: 50.0,
  liftCoefficient: 2.5,
  dragCoefficient: 0.1,
  maxSpeed: 100.0,
  pitchSensitivity: 5.0,
  yawSensitivity: 5.0,
  rollSensitivity: 5.0,
}

export class AirplaneTransformer extends BaseTransformer {
  readonly type = 'airplane'
  private params: Required<AirplaneTransformerParams>

  constructor(
    priority: number = 10,
    params: AirplaneTransformerParams = {},
  ) {
    super(priority, true)
    this.params = { ...DEFAULT_PARAMS, ...params }
  }

  /**
   * Update parameters.
   */
  setParams(params: Partial<AirplaneTransformerParams>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const {
      thrustForce,
      liftCoefficient,
      dragCoefficient,
      maxSpeed,
      pitchSensitivity,
      yawSensitivity,
      rollSensitivity,
    } = this.params

    // Get actions
    const thrust = this.getAction(input, 'thrust')
    const brake = this.getAction(input, 'brake')
    const pitch = this.getAction(input, 'pitch')
    const yaw = this.getAction(input, 'yaw')
    const rollLeft = this.getAction(input, 'roll_left')
    const rollRight = this.getAction(input, 'roll_right')
    const boost = this.getAction(input, 'boost')

    // Current velocity
    const [vx, vy, vz] = input.velocity
    const velocity = new THREE.Vector3(vx, vy, vz)
    const speed = velocity.length()

    // Forward direction (from rotation)
    const [rx, ry, rz] = input.rotation
    const euler = new THREE.Euler(rx, ry, rz, 'XYZ')
    const forward = new THREE.Vector3(0, 0, -1)
    forward.applyEuler(euler)

    // Thrust force (forward direction)
    const thrustVec = forward.clone().multiplyScalar(
      (thrust - brake) * thrustForce * (1 + boost * 0.5),
    )

    // Lift (perpendicular to velocity, upward component)
    let liftVec = new THREE.Vector3(0, 0, 0)
    if (speed > 0.1) {
      const liftMagnitude = speed * liftCoefficient
      // Lift acts upward relative to velocity direction
      const up = new THREE.Vector3(0, 1, 0)
      const liftDirection = up.clone().sub(
        velocity.clone().normalize().multiplyScalar(velocity.normalize().dot(up)),
      )
      if (liftDirection.length() > 0.01) {
        liftDirection.normalize()
        liftVec = liftDirection.multiplyScalar(liftMagnitude)
      } else {
        // Pure vertical flight - lift straight up
        liftVec = up.multiplyScalar(liftMagnitude)
      }
    }

    // Drag (opposes velocity)
    let dragVec = new THREE.Vector3(0, 0, 0)
    if (speed > 0.1) {
      const dragMagnitude = speed * speed * dragCoefficient
      dragVec = velocity.clone().normalize().multiplyScalar(-dragMagnitude)
    }

    // Wind effect
    if (input.environment.wind) {
      const [wx, wy, wz] = input.environment.wind
      dragVec.add(new THREE.Vector3(wx, wy, wz))
    }

    // Total force
    const totalForce = new THREE.Vector3()
      .add(thrustVec)
      .add(liftVec)
      .add(dragVec)

    // Rotational control (torques)
    const torque = new THREE.Vector3(
      pitch * pitchSensitivity, // pitch around X
      yaw * yawSensitivity, // yaw around Y
      (rollRight - rollLeft) * rollSensitivity, // roll around Z
    )

    return {
      force: [
        totalForce.x,
        totalForce.y,
        totalForce.z,
      ],
      torque: [torque.x, torque.y, torque.z],
      earlyExit: false,
    }
  }
}
