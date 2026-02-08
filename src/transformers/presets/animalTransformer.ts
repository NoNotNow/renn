/**
 * AnimalTransformer: simple wander AI behavior.
 *
 * Moves randomly within a radius, avoiding obstacles.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'

export interface AnimalTransformerParams {
  /** Wander radius */
  wanderRadius?: number
  /** Avoidance distance */
  avoidanceDistance?: number
  /** Movement speed */
  speed?: number
  /** Change direction frequency (seconds) */
  directionChangeInterval?: number
}

const DEFAULT_PARAMS: Required<AnimalTransformerParams> = {
  wanderRadius: 10.0,
  avoidanceDistance: 2.0,
  speed: 2.0,
  directionChangeInterval: 3.0,
}

export class AnimalTransformer extends BaseTransformer {
  readonly type = 'animal'
  private params: Required<AnimalTransformerParams>
  private targetDirection: [number, number, number] = [0, 0, -1]
  private lastDirectionChange = 0

  constructor(
    priority: number = 10,
    params: AnimalTransformerParams = {},
  ) {
    super(priority, true)
    this.params = { ...DEFAULT_PARAMS, ...params }
    this.pickNewDirection()
  }

  setParams(params: Partial<AnimalTransformerParams>): void {
    this.params = { ...this.params, ...params }
  }

  private pickNewDirection(): void {
    const angle = Math.random() * Math.PI * 2
    this.targetDirection = [
      Math.cos(angle),
      0,
      Math.sin(angle),
    ]
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const { speed, directionChangeInterval } = this.params

    // Change direction periodically
    this.lastDirectionChange += dt
    if (this.lastDirectionChange >= directionChangeInterval) {
      this.pickNewDirection()
      this.lastDirectionChange = 0
    }

    // Move towards target direction
    const force: [number, number, number] = [
      this.targetDirection[0] * speed,
      this.targetDirection[1] * speed,
      this.targetDirection[2] * speed,
    ]

    return {
      force,
      earlyExit: false,
    }
  }
}
