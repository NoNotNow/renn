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
}

const DEFAULTS = {
  targetEntityId: '',
  speed: 2,
  linear: true,
  angular: true,
}

export class FollowTransformer extends BaseTransformer {
  readonly type = 'follow'
  private params: Required<
    Pick<FollowParams, 'targetEntityId' | 'speed' | 'linear' | 'angular'>
  >
  private getEntityWorldPose: EntityWorldPoseGetter | undefined

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
    this.getEntityWorldPose = getEntityWorldPose
  }

  setParams(params: Partial<FollowParams>): void {
    if (params.targetEntityId !== undefined)
      this.params.targetEntityId = params.targetEntityId
    if (params.speed !== undefined) this.params.speed = params.speed
    if (params.linear !== undefined) this.params.linear = params.linear
    if (params.angular !== undefined) this.params.angular = params.angular
  }

  transform(input: TransformInput, _dt: number): TransformOutput {
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

    const targetPos = linear ? lead.position : input.position
    const targetRot = angular ? lead.rotation : input.rotation

    input.target = {
      pose: {
        position: [targetPos[0], targetPos[1], targetPos[2]],
        rotation: [targetRot[0], targetRot[1], targetRot[2]],
      },
      speed,
    }
    return EMPTY_TRANSFORM_OUTPUT
  }
}
