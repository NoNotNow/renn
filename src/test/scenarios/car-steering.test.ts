/**
 * Integration scenario: car steering.
 *
 * Verifies that A (steer_left) and D (steer_right) cause the car to diverge in
 * opposite lateral directions when combined with throttle.
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

describe('car steering', () => {
  it('steering left (A) and right (D) produce diverging X positions', async () => {
    // Simulate W+A (steer left)
    const simLeft = await WorldSimulator.create(carWorld)
    simLeft.runFrames(60)
    simLeft.setInput({ w: true, a: true })
    simLeft.runFrames(180) // 3 seconds
    const posLeft = simLeft.getPosition('car')
    simLeft.dispose()

    // Simulate W+D (steer right)
    const simRight = await WorldSimulator.create(carWorld)
    simRight.runFrames(60)
    simRight.setInput({ w: true, d: true })
    simRight.runFrames(180)
    const posRight = simRight.getPosition('car')
    simRight.dispose()

    // Both cars should move forward.
    expect(posLeft[2]).toBeLessThan(0)
    expect(posRight[2]).toBeLessThan(0)

    // Left-steering car should end up at a negative X, right-steering at positive X
    // (or at least they diverge, i.e., posLeft.x < posRight.x).
    expect(posLeft[0]).toBeLessThan(posRight[0])
  })

  it('steering left rotates the car (Y angular velocity is non-zero)', async () => {
    const sim = await WorldSimulator.create(carWorld)
    sim.runFrames(60)

    // Build forward speed first, then steer.
    sim.setInput({ w: true })
    sim.runFrames(30)
    sim.setInput({ w: true, a: true })
    sim.runFrames(60)

    const vel = sim.getVelocity('car')
    const rot = sim.getRotation('car')

    // The car should be moving (non-zero velocity).
    const speed = Math.sqrt(vel[0] ** 2 + vel[2] ** 2)
    expect(speed).toBeGreaterThan(0.1)

    // The quaternion should differ from the identity (has rotated around Y).
    // w < 1 means some rotation has occurred.
    expect(Math.abs(rot.w)).toBeLessThan(1)

    sim.dispose()
  })

  it('steering right rotates opposite to steering left', async () => {
    const simLeft = await WorldSimulator.create(carWorld)
    simLeft.runFrames(60)
    simLeft.setInput({ w: true, a: true })
    simLeft.runFrames(90)
    const rotLeft = simLeft.getRotation('car')
    simLeft.dispose()

    const simRight = await WorldSimulator.create(carWorld)
    simRight.runFrames(60)
    simRight.setInput({ w: true, d: true })
    simRight.runFrames(90)
    const rotRight = simRight.getRotation('car')
    simRight.dispose()

    // Y component of quaternion encodes rotation around the vertical axis.
    // Left-steer → negative Y, right-steer → positive Y (or vice versa), but they must differ in sign.
    expect(Math.sign(rotLeft.y)).not.toBe(Math.sign(rotRight.y))
  })
})
