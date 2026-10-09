import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import { buildPolicyExampleWorld } from './exampleWorld'

describe('policy_drive example world', () => {
  it('on disk equals the exporter output (regenerate: npx tsx tools/renn-mcp/export-policy-drive-example-world.ts)', () => {
    const disk = JSON.parse(readFileSync('public/exampleWorlds/policy_drive/world.json', 'utf8'))
    expect(disk).toEqual(JSON.parse(JSON.stringify(buildPolicyExampleWorld())))
  })

  it('all cars drive off on their own', async () => {
    const world = buildPolicyExampleWorld()
    const sim = await WorldSimulator.create(world, 0)
    try {
      const cars = world.entities.filter((e) => e.id.startsWith('policy_car_body')).map((e) => e.id)
      expect(cars.length).toBe(3)
      const start = cars.map((id) => sim.getPosition(id))
      sim.runFrames(Math.round(5 / DEFAULT_DT))
      cars.forEach((id, i) => {
        const p = sim.getPosition(id)
        expect(Math.hypot(p[0] - start[i]![0], p[2] - start[i]![2])).toBeGreaterThan(8)
      })
    } finally {
      sim.dispose()
    }
  }, 60_000)
})
