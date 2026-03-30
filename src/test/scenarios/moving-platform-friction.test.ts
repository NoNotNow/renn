/**
 * Integration: kinematic platform driven by targetPoseInput + kinematicMovement
 * carries a dynamic box via contact friction (Rapier next-kinematic pose).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { initRapier } from '@/physics/rapierPhysics'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import movingPlatformWorldJson from '../worlds/moving-platform-box-world.json'
import type { RennWorld } from '@/types/world'

const movingPlatformWorld = movingPlatformWorldJson as unknown as RennWorld

beforeAll(async () => {
  await initRapier()
})

describe('moving platform — dynamic box friction', () => {
  it('crate gains horizontal velocity in the platform travel direction while the platform moves', async () => {
    const sim = await WorldSimulator.create(movingPlatformWorld, 30)

    sim.runFrames(45)
    const start = sim.getPosition('crate')

    sim.runFrames(120)

    const end = sim.getPosition('crate')
    const vel = sim.getVelocity('crate')

    const dx = end[0] - start[0]
    const dz = end[2] - start[2]

    // Platform shuttles on X between -4 and 4; crate should move with it (not stay at X≈0).
    expect(Math.abs(dx)).toBeGreaterThan(0.8)

    // Should not fall through.
    expect(end[1]).toBeGreaterThan(0.2)

    // Horizontal motion dominated by X; little drift on Z.
    expect(Math.abs(dz)).toBeLessThan(1.5)

    // Some forward motion along X reflected in velocity (not stuck at rest in X).
    expect(Math.abs(vel[0])).toBeGreaterThan(0.05)

    sim.dispose()
  })
})
