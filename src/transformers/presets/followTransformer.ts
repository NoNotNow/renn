/**
 * follow: target source that tracks another entity's world pose each frame.
 * Publishes TransformInput.target for kinematicMovement. Configurable lead id,
 * speed, and linear/angular toggles (same semantics as wanderer).
 */

import { BaseTransformer } from '../transformer'
import type {
  EntityWorldPoseGetter,
  TransformInput,
  TransformOutput,
} from '@/types/transformer'
import { EMPTY_TRANSFORM_OUTPUT } from '@/types/transformer'

export interface FollowParams {
  /** Entity id to follow (world item id). Empty / self / missing → no target. */
  targetEntityId?: string
  /** Linear speed (m/s) toward target position. */
  speed?: number
  /** When true, target position tracks the lead entity. */
  linear?: boolean
  /** When true, target rotation tracks the lead entity. */
  angular?: boolean
  /** Pursuit: aim `leadTime` seconds ahead of the followed entity (finite-difference velocity, planar). 0 = aim at it. */
  leadTime?: number
  /** Goal contract (see AV stack): `false` = keep cruising through the goal (no arrival braking / hold); omitted = single final goal. */
  isFinal?: boolean
}

const DEFAULTS = {
  targetEntityId: '',
  speed: 2,
  linear: true,
  angular: true,
}

export class FollowTransformer extends BaseTransformer {
  readonly type = 'follow'
  private readonly params: Required<
    Pick<FollowParams, 'targetEntityId' | 'speed' | 'linear' | 'angular'>
  >
  private readonly extra: { leadTime: number; isFinal: boolean | undefined } = { leadTime: 0, isFinal: undefined }
  private prevLead: { id: string; x: number; z: number } | null = null
  private leadVel: [number, number] = [0, 0]
  private readonly getEntityWorldPose: EntityWorldPoseGetter | undefined

  constructor(
    priority: number = 5,
    params: Partial<FollowParams> = {},
    getEntityWorldPose?: EntityWorldPoseGetter,
  ) {
    super(priority, true)
    this.params = {
      targetEntityId: params.targetEntityId ?? DEFAULTS.targetEntityId,
      speed: params.speed ?? DEFAULTS.speed,
      linear: params.linear ?? DEFAULTS.linear,
      angular: params.angular ?? DEFAULTS.angular,
    }
    this.extra.leadTime = Math.max(0, params.leadTime ?? 0)
    this.extra.isFinal = params.isFinal
    this.getEntityWorldPose = getEntityWorldPose
  }

  setParams(params: Partial<FollowParams>): void {
    if (params.targetEntityId !== undefined)
      this.params.targetEntityId = params.targetEntityId
    if (params.speed !== undefined) this.params.speed = params.speed
    if (params.linear !== undefined) this.params.linear = params.linear
    if (params.angular !== undefined) this.params.angular = params.angular
    if (params.leadTime !== undefined) this.extra.leadTime = Math.max(0, params.leadTime)
    if ('isFinal' in params) this.extra.isFinal = params.isFinal
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const { targetEntityId, speed, linear, angular } = this.params

    if (!targetEntityId || targetEntityId === input.entityId) {
      input.target = undefined
      return EMPTY_TRANSFORM_OUTPUT
    }

    const lead = this.getEntityWorldPose?.(targetEntityId) ?? null
    if (!lead) {
      input.target = undefined
      return EMPTY_TRANSFORM_OUTPUT
    }

    let targetPos: readonly number[] = linear ? lead.position : input.position
    if (linear && this.extra.leadTime > 0) {
      const prev = this.prevLead
      if (prev && prev.id === targetEntityId && dt > 1e-6) {
        // low-pass the finite-difference velocity (physics jitter)
        const vx = (lead.position[0] - prev.x) / dt
        const vz = (lead.position[2] - prev.z) / dt
        this.leadVel = [this.leadVel[0] * 0.8 + vx * 0.2, this.leadVel[1] * 0.8 + vz * 0.2]
      }
      this.prevLead = { id: targetEntityId, x: lead.position[0], z: lead.position[2] }
      targetPos = [
        lead.position[0] + this.leadVel[0] * this.extra.leadTime,
        lead.position[1],
        lead.position[2] + this.leadVel[1] * this.extra.leadTime,
      ]
    }
    const targetRot = angular ? lead.rotation : input.rotation

    input.target = {
      pose: {
        position: [targetPos[0], targetPos[1], targetPos[2]],
        rotation: [targetRot[0], targetRot[1], targetRot[2]],
      },
      speed,
      label: 'follow',
      ...(this.extra.isFinal !== undefined ? { isFinal: this.extra.isFinal } : {}),
    }
    return { targetLabel: 'follow' }
  }
}
