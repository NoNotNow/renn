/**
 * Integration: car2 on a kinematic moving platform — steer without throttle should not
 * yaw the car relative to the world (no forward speed relative to support).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { initRapier } from '@/physics/rapierPhysics'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import movingPlatformCarWorldJson from '../worlds/moving-platform-car-world.json'
import type { RennWorld } from '@/types/world'
import { rapierQuaternionToEuler } from '@/utils/rotationUtils'

const movingPlatformCarWorld = movingPlatformCarWorldJson as unknown as RennWorld

beforeAll(async () => {
  await initRapier()
})

function yawFromSim(sim: WorldSimulator, entityId: string): number {
  const q = sim.getRotation(entityId)
  return rapierQuaternionToEuler(q)[1]
}

describe('moving platform — car2 steer without throttle', () => {
  it('keeps yaw nearly fixed and tracks platform motion in X while only steering right', async () => {
    const sim = await WorldSimulator.create(movingPlatformCarWorld, 30)

    sim.runFrames(40)
    const yaw0 = yawFromSim(sim, 'car')
    const carX0 = sim.getPosition('car')[0]
    const platX0 = sim.getPosition('platform')[0]

    sim.setInput({ d: true })
    sim.runFrames(150)
    sim.clearInput()

    const yaw1 = yawFromSim(sim, 'car')
    const carX1 = sim.getPosition('car')[0]
    const platX1 = sim.getPosition('platform')[0]

    const carDx = carX1 - carX0
    const platDx = platX1 - platX0

    expect(Math.abs(yaw1 - yaw0)).toBeLessThan(0.12)
    expect(Math.abs(carDx - platDx)).toBeLessThan(1.2)
    expect(sim.getPosition('car')[1]).toBeGreaterThan(0.15)

    sim.dispose()
  })
})
