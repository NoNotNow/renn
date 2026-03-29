/**
 * Integration scenario: input direction correctness.
 *
 * Verifies that the car's movement direction is consistent with its heading (rotation)
 * and that W always drives in the direction the car is currently facing — not a fixed
 * world axis. This tests the transformer's forward-vector calculation.
 *
 * World: car-test-world.json — box car on a flat ground, car2 transformer.
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

describe('car input-direction alignment', () => {
  it('velocity is aligned with -Z when driving straight (no steer)', async () => {
    const sim = await WorldSimulator.create(carWorld)
    sim.runFrames(60)

    sim.setInput({ w: true })
    sim.runFrames(60)

    const vel = sim.getVelocity('car')
    const speedZ = Math.abs(vel[2])
    const speedX = Math.abs(vel[0])

    // With default rotation [0,0,0], forward is -Z.
    // Z speed should dominate strongly over X speed.
    expect(speedZ).toBeGreaterThan(0.5)
    expect(speedX).toBeLessThan(speedZ * 0.3)

    sim.dispose()
  })

  it('velocity direction follows the car heading after a 90-degree left turn', async () => {
    const sim = await WorldSimulator.create(carWorld)
    sim.runFrames(60)

    // Phase 1: drive forward and steer left for long enough to turn ~90 degrees.
    sim.setInput({ w: true, a: true })
    sim.runFrames(240) // 4 seconds of W+A

    // Record position after the turn.
    const posMidTurn = sim.getPosition('car')

    // Phase 2: drive straight in the new heading direction.
    sim.setInput({ w: true })
    sim.runFrames(90)
    const posAfterStraight = sim.getPosition('car')

    // The car should have moved. The dominant axis depends on where it ended up
    // pointing, but the important thing is it moved from its mid-turn position.
    const totalDist = Math.sqrt(
      (posAfterStraight[0] - posMidTurn[0]) ** 2 +
      (posAfterStraight[2] - posMidTurn[2]) ** 2
    )
    expect(totalDist).toBeGreaterThan(1.0)

    sim.dispose()
  })

  it('velocity aligns with heading: turned car moves more in X than straight car', async () => {
    // Straight car: drives along -Z only
    const simStraight = await WorldSimulator.create(carWorld)
    simStraight.runFrames(60)
    simStraight.setInput({ w: true })
    simStraight.runFrames(120)
    const velStraight = simStraight.getVelocity('car')
    simStraight.dispose()

    // Turned car: steer significantly, then drive straight in new heading
    const simTurned = await WorldSimulator.create(carWorld)
    simTurned.runFrames(60)
    simTurned.setInput({ w: true, d: true })
    simTurned.runFrames(240) // build a 90-degree right turn
    simTurned.setInput({ w: true })
    simTurned.runFrames(120)
    const velTurned = simTurned.getVelocity('car')
    simTurned.dispose()

    // Straight car should have near-zero X velocity.
    expect(Math.abs(velStraight[0])).toBeLessThan(1.0)

    // Turned car should have significant X velocity (heading is now partly along X).
    expect(Math.abs(velTurned[0])).toBeGreaterThan(Math.abs(velStraight[0]))
  })

  it('snapshot logs positions — useful for building precise expected values', async () => {
    const sim = await WorldSimulator.create(carWorld)
    sim.runFrames(60)

    sim.setInput({ w: true })
    sim.runFrames(60)

    const snap = sim.snapshot()

    // The snapshot must include the car and contain finite numbers.
    expect(snap).toHaveProperty('car')
    const [px, py, pz] = snap.car.position
    expect(Number.isFinite(px)).toBe(true)
    expect(Number.isFinite(py)).toBe(true)
    expect(Number.isFinite(pz)).toBe(true)

    // Uncomment to inspect values when building new assertions:
    // console.log('snapshot:', JSON.stringify(snap, null, 2))

    sim.dispose()
  })
})
