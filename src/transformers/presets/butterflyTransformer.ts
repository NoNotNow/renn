/**
 * ButterflyTransformer: flutter movement pattern.
 *
 * Creates oscillating upward force with horizontal wander.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'

export interface ButterflyTransformerParams {
  /** Flutter frequency (oscillations per second) */
  flutterFrequency?: number
  /** Flight height (target Y position) */
  flightHeight?: number
  /** Wander radius */
  wanderRadius?: number
  /** Flutter force magnitude */
  flutterForce?: number
}

const DEFAULT_PARAMS: Required<ButterflyTransformerParams> = {
  flutterFrequency: 3.0,
  flightHeight: 2.0,
  wanderRadius: 5.0,
  flutterForce: 5.0,
}

export class ButterflyTransformer extends BaseTransformer {
  readonly type = 'butterfly'
  private params: Required<ButterflyTransformerParams>
  private time = 0
  private wanderAngle = Math.random() * Math.PI * 2

  constructor(
    priority: number = 10,
    params: ButterflyTransformerParams = {},
  ) {
    super(priority, true)
    this.params = { ...DEFAULT_PARAMS, ...params }
  }

  setParams(params: Partial<ButterflyTransformerParams>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const { flutterFrequency, flightHeight, flutterForce } = this.params
    const [px, py, pz] = input.position

    this.time += dt

    // Flutter: oscillating upward force
    const flutter = Math.sin(this.time * flutterFrequency * Math.PI * 2)
    const upwardForce = flutterForce * (1 + flutter * 0.5)

    // Maintain flight height
    const heightDiff = flightHeight - py
    const heightForce = heightDiff * 2.0

    // Horizontal wander (slow rotation)
    this.wanderAngle += dt * 0.5
    const wanderX = Math.cos(this.wanderAngle) * 0.5
    const wanderZ = Math.sin(this.wanderAngle) * 0.5

    const force: [number, number, number] = [
      wanderX,
      upwardForce + heightForce,
      wanderZ,
    ]

    return {
      force,
      earlyExit: false,
    }
  }
}
