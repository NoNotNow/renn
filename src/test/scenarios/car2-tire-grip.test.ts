/**
 * Integration: car2 tire grip vs slip threshold (physics + transformer chain).
 *
 * - A very high tireGripSlipSpeedThreshold keeps full lateralGrip until lateral speed
 *   exceeds that value; the default threshold (2) reduces grip once magSide > 2.
 * - lateralGrip still sets how strong correction is: very low lateralGrip slides even when
 *   the slip threshold never triggers (e.g. threshold 2000 with lateralGrip 10).
 *
 * World base: car-test-world.json
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { initRapier } from '@/physics/rapierPhysics'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import carWorldJson from '../worlds/car-test-world.json'
import type { RennWorld } from '@/types/world'

const carWorld = carWorldJson as unknown as RennWorld

beforeAll(async () => {
  await initRapier()
})

function cloneWorldWithCar2Params(
  base: RennWorld,
  params: Record<string, unknown>,
): RennWorld {
  const world = structuredClone(base) as RennWorld
  const car = world.entities.find((e) => e.id === 'car')
  const cfg = car?.transformers?.find((t) => t.type === 'car2')
  if (!cfg) {
    throw new Error('car2 transformer missing on car entity')
  }
  cfg.params = { ...(cfg.params ?? {}), ...params }
  return world
}

/** Lateral |X| after warmup + W+steer (magnitude of sideways travel from origin line). */
async function lateralExcursionAfterSteer(world: RennWorld): Promise<number> {
  const sim = await WorldSimulator.create(world)
  sim.runFrames(60)
  sim.setInput({ w: true, a: true })
  sim.runFrames(200)
  const x = sim.getPosition('car')[0]
  sim.dispose()
  return Math.abs(x)
}

describe('car2 tire grip (integration)', () => {
  it('high tireGripSlipSpeedThreshold yields less lateral slide than default slip (same lateralGrip)', async () => {
    const highThresholdWorld = cloneWorldWithCar2Params(carWorld, {
      lateralGrip: 100,
      lateralToForwardTransfer: 0.2,
      tireGripSlipSpeedThreshold: 2000,
      lateralGripSlipScale: 0.3,
    })
    const defaultSlipWorld = cloneWorldWithCar2Params(carWorld, {
      lateralGrip: 100,
      lateralToForwardTransfer: 0.2,
      tireGripSlipSpeedThreshold: 2,
      lateralGripSlipScale: 0.3,
    })

    const absXHigh = await lateralExcursionAfterSteer(highThresholdWorld)
    const absXDefault = await lateralExcursionAfterSteer(defaultSlipWorld)

    expect(absXDefault).toBeGreaterThan(absXHigh * 1.15)
  })

  it('low lateralGrip slides at slow speeds even when tireGripSlipSpeedThreshold is huge', async () => {
    const lowGripWorld = cloneWorldWithCar2Params(carWorld, {
      power: 700,
      steeringIntensity: 0.05,
      steeringSpeed: 0.01,
      lateralGrip: 10,
      lateralToForwardTransfer: 0.2,
      tireGripSlipSpeedThreshold: 2000,
      lateralGripSlipScale: 0.3,
      jumpImpulse: 200,
    })
    const strongGripWorld = cloneWorldWithCar2Params(carWorld, {
      power: 700,
      steeringIntensity: 0.05,
      steeringSpeed: 0.01,
      lateralGrip: 100,
      lateralToForwardTransfer: 0.2,
      tireGripSlipSpeedThreshold: 2000,
      lateralGripSlipScale: 0.3,
      jumpImpulse: 200,
    })

    const absXLow = await lateralExcursionAfterSteer(lowGripWorld)
    const absXStrong = await lateralExcursionAfterSteer(strongGripWorld)

    expect(absXLow).toBeGreaterThan(absXStrong * 1.5)
  })
})
