/**
 * Reversal counting shared by the evolution episode and the scripted-scenario runner (one definition).
 *
 * A reversal is a sign flip of the signed forward speed, counting only samples with |v| > REVERSAL_MIN_SPEED (1 m/s):
 * the last sign seen above the threshold is remembered and a new sample above the threshold with the other sign is one
 * reversal. Dips through zero that never exceed 1 m/s the other way are NOT reversals (hysteresis). A K-turn costs 2-3.
 * `reverseFrames` counts samples with v < -REVERSAL_MIN_SPEED (multiply by dt for "seconds spent reversing").
 */
export const REVERSAL_MIN_SPEED = 1

export class ReversalCounter {
  count = 0
  reverseFrames = 0
  private sign = 0

  push(fwd: number): void {
    if (Math.abs(fwd) <= REVERSAL_MIN_SPEED) return
    const sg = fwd > 0 ? 1 : -1
    if (this.sign !== 0 && sg !== this.sign) this.count++
    this.sign = sg
    if (sg < 0) this.reverseFrames++
  }
}
