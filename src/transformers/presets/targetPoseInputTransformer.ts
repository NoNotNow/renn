/**
 * targetPoseInput: waypoint sequencer that publishes TransformInput.target only
 * (pose + linear speed). Does not choose kinematic vs physics — downstream movers interpret target.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput, TransformTarget } from '@/types/transformer'
import { EMPTY_TRANSFORM_OUTPUT } from '@/types/transformer'
import type { Rotation, Vec3 } from '@/types/world'
import {
  positionReached,
  rotationReached,
  poseReached,
} from '@/utils/transformTargetReach'

export type WaypointMode = 'cycle' | 'pingPong' | 'stopAtEnd'

export interface TargetPoseWaypoint {
  position: Vec3
  rotation: Rotation
}

export interface TargetPoseInputParams {
  /** Waypoints in order. Empty = no target output. */
  poses?: TargetPoseWaypoint[]
  /** Linear speed (m/s) toward current waypoint position. */
  speed?: number
  mode?: WaypointMode
  positionEpsilon?: number
  rotationEpsilon?: number
}

const DEFAULTS: Required<
  Pick<TargetPoseInputParams, 'speed' | 'mode' | 'positionEpsilon' | 'rotationEpsilon'>
> = {
  speed: 2,
  mode: 'cycle',
  positionEpsilon: 0.05,
  rotationEpsilon: 0.08,
}

export class TargetPoseInputTransformer extends BaseTransformer {
  readonly type = 'targetPoseInput'
  private params: Required<
    Pick<TargetPoseInputParams, 'speed' | 'mode' | 'positionEpsilon' | 'rotationEpsilon'>
  > & { poses: TargetPoseWaypoint[] }

  private index = 0
  private pingPongDir: 1 | -1 = 1
  /** After reaching final waypoint in stopAtEnd, do not advance further. */
  private stopLatched = false

  constructor(priority: number = 5, params: Partial<TargetPoseInputParams> = {}) {
    super(priority, true)
    const poses = params.poses ?? []
    this.params = {
      poses,
      speed: params.speed ?? DEFAULTS.speed,
      mode: params.mode ?? DEFAULTS.mode,
      positionEpsilon: params.positionEpsilon ?? DEFAULTS.positionEpsilon,
      rotationEpsilon: params.rotationEpsilon ?? DEFAULTS.rotationEpsilon,
    }
  }

  setParams(params: Partial<TargetPoseInputParams>): void {
    if (params.poses !== undefined) {
      this.params.poses = params.poses
      this.index = 0
      this.pingPongDir = 1
      this.stopLatched = false
    }
    if (params.speed !== undefined) this.params.speed = params.speed
    if (params.mode !== undefined) this.params.mode = params.mode
    if (params.positionEpsilon !== undefined) this.params.positionEpsilon = params.positionEpsilon
    if (params.rotationEpsilon !== undefined) this.params.rotationEpsilon = params.rotationEpsilon
  }

  /** Call only when current waypoint is reached. */
  private advanceIndexAfterReach(n: number): void {
    if (n <= 0) return
    const { mode } = this.params
    if (mode === 'stopAtEnd') {
      if (this.index >= n - 1) {
        this.stopLatched = true
        return
      }
      this.index++
      return
    }
    if (mode === 'cycle') {
      this.index = (this.index + 1) % n
      return
    }
    // pingPong
    if (n === 1) return
    let next = this.index + this.pingPongDir
    if (next >= n) {
      this.pingPongDir = -1
      next = n - 2
    } else if (next < 0) {
      this.pingPongDir = 1
      next = 1
    }
    this.index = next
  }

  transform(input: TransformInput, _dt: number): TransformOutput {
    const { poses, speed, mode, positionEpsilon, rotationEpsilon } = this.params
    if (poses.length === 0) {
      input.target = undefined
      return EMPTY_TRANSFORM_OUTPUT
    }

    const n = poses.length
    if (mode === 'stopAtEnd' && this.stopLatched) {
      input.target = this.toTarget(poses[n - 1], speed)
      return EMPTY_TRANSFORM_OUTPUT
    }

    const wp = poses[this.index]
    if (poseReached(input.position, input.rotation, wp, positionEpsilon, rotationEpsilon)) {
      this.advanceIndexAfterReach(n)
    }

    const active = poses[this.index]
    input.target = this.toTarget(active, speed)
    return EMPTY_TRANSFORM_OUTPUT
  }

  private toTarget(wp: TargetPoseWaypoint, speed: number): TransformTarget {
    return {
      pose: {
        position: [wp.position[0], wp.position[1], wp.position[2]],
        rotation: [wp.rotation[0], wp.rotation[1], wp.rotation[2]],
      },
      speed,
    }
  }
}

/** Exported for tests: reach detection without instantiating the full transformer. */
export const targetPoseInputTestExports = {
  positionReached,
  rotationReached,
  poseReached,
}
