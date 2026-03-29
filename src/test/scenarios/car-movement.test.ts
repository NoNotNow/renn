/**
 * Integration scenario: car forward movement.
 *
 * Verifies that holding W (throttle) drives the car forward in its facing direction (-Z
 * with default rotation [0,0,0]).
 *
 * World: car-test-world.json — box car on a flat ground plane, car2 transformer.
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

describe('car movement — forward (W)', () => {
  it('moves in the -Z direction when W is held', async () => {
    const sim = await WorldSimulator.create(carWorld)

    // Let car settle firmly on the ground before measuring start position.
    sim.runFrames(60)
    const start = sim.getPosition('car')

    sim.setInput({ w: true })
    sim.runFrames(120) // 2 seconds of throttle
    sim.clearInput()

    const end = sim.getPosition('car')

    // With rotation [0,0,0] the forward vector is [0,0,-1], so Z should decrease.
    expect(end[2]).toBeLessThan(start[2])

    // Lateral (X) and vertical (Y) drift should be negligible.
    expect(Math.abs(end[0] - start[0])).toBeLessThan(1.0)
    expect(Math.abs(end[1] - start[1])).toBeLessThan(0.5)

    sim.dispose()
  })

  it('does not move when no input is given', async () => {
    const sim = await WorldSimulator.create(carWorld)
    sim.runFrames(60)
    const start = sim.getPosition('car')

    sim.runFrames(120)

    const end = sim.getPosition('car')

    // Car should stay roughly in place with no input.
    expect(Math.abs(end[0] - start[0])).toBeLessThan(0.5)
    expect(Math.abs(end[2] - start[2])).toBeLessThan(0.5)

    sim.dispose()
  })

  it('travels further with longer throttle duration', async () => {
    const sim1 = await WorldSimulator.create(carWorld)
    sim1.runFrames(60)
    const start1 = sim1.getPosition('car')
    sim1.setInput({ w: true })
    sim1.runFrames(60)
    const pos1 = sim1.getPosition('car')
    sim1.dispose()

    const sim2 = await WorldSimulator.create(carWorld)
    sim2.runFrames(60)
    const start2 = sim2.getPosition('car')
    sim2.setInput({ w: true })
    sim2.runFrames(180)
    const pos2 = sim2.getPosition('car')
    sim2.dispose()

    const dist1 = Math.abs(pos1[2] - start1[2])
    const dist2 = Math.abs(pos2[2] - start2[2])

    expect(dist2).toBeGreaterThan(dist1)
  })

  it('braking (S) slows a moving car', async () => {
    const sim = await WorldSimulator.create(carWorld)
    sim.runFrames(60)

    // Build up speed.
    sim.setInput({ w: true })
    sim.runFrames(90)

    const velAfterThrottle = sim.getVelocity('car')
    const speedAfterThrottle = Math.abs(velAfterThrottle[2])

    // Apply brake.
    sim.setInput({ s: true })
    sim.runFrames(60)
    const velAfterBrake = sim.getVelocity('car')
    const speedAfterBrake = Math.abs(velAfterBrake[2])

    expect(speedAfterBrake).toBeLessThan(speedAfterThrottle)

    sim.dispose()
  })
})
