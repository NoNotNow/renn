/**
 * CharacterTransformer: ground-based character movement.
 *
 * Handles:
 * - Forward/backward movement
 * - Strafe (sideways movement)
 * - Jump (only when grounded)
 * - Turn (rotation)
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import * as THREE from 'three'

export interface CharacterTransformerParams {
  /** Walking speed (force magnitude) */
  walkSpeed?: number
  /** Jump impulse magnitude */
  jumpForce?: number
  /** Turn speed (angular velocity) */
  turnSpeed?: number
}

const DEFAULT_PARAMS: Required<CharacterTransformerParams> = {
  walkSpeed: 5.0,
  jumpForce: 8.0,
  turnSpeed: 2.0,
}

export class CharacterTransformer extends BaseTransformer {
  readonly type = 'character'
  private params: Required<CharacterTransformerParams>

  constructor(
    priority: number = 10,
    params: CharacterTransformerParams = {},
  ) {
    super(priority, true)
    this.params = { ...DEFAULT_PARAMS, ...params }
  }

  setParams(params: Partial<CharacterTransformerParams>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const { walkSpeed, jumpForce, turnSpeed } = this.params

    // Get actions
    const forward = this.getAction(input, 'forward')
    const backward = this.getAction(input, 'backward')
    const strafeLeft = this.getAction(input, 'strafe_left')
    const strafeRight = this.getAction(input, 'strafe_right')
    const jump = this.getAction(input, 'jump')
    const turn = this.getAction(input, 'turn')

    // Current rotation
    const [rx, ry, rz] = input.rotation
    const euler = new THREE.Euler(rx, ry, rz, 'XYZ')

    // Forward direction
    const forwardDir = new THREE.Vector3(0, 0, -1)
    forwardDir.applyEuler(euler)

    // Right direction (for strafe)
    const rightDir = new THREE.Vector3(1, 0, 0)
    rightDir.applyEuler(euler)

    // Movement force
    const moveForce = new THREE.Vector3(0, 0, 0)
    moveForce.add(forwardDir.multiplyScalar((forward - backward) * walkSpeed))
    moveForce.add(rightDir.multiplyScalar((strafeRight - strafeLeft) * walkSpeed))

    // Jump impulse (only when grounded)
    let jumpImpulse: THREE.Vector3 | undefined
    if (jump > 0 && input.environment.isGrounded) {
      jumpImpulse = new THREE.Vector3(0, jumpForce * jump, 0)
    }

    // Turn torque (around Y axis)
    const turnTorque = new THREE.Vector3(0, turn * turnSpeed, 0)

    return {
      force: moveForce.length() > 0 ? [moveForce.x, moveForce.y, moveForce.z] : undefined,
      impulse: jumpImpulse ? [jumpImpulse.x, jumpImpulse.y, jumpImpulse.z] : undefined,
      torque: Math.abs(turn) > 0.01 ? [turnTorque.x, turnTorque.y, turnTorque.z] : undefined,
      earlyExit: false,
    }
  }
}
