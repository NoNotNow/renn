import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import { buildPolicyExampleWorld, POLICY_EXAMPLE_WORLDS } from './exampleWorld'

describe('policy_drive example worlds', () => {
  for (const spec of POLICY_EXAMPLE_WORLDS) {
    it(`${spec.id}: on disk equals the exporter output (regenerate: npx tsx tools/renn-mcp/export-policy-drive-example-world.ts)`, () => {
      const disk = JSON.parse(readFileSync(`public/exampleWorlds/${spec.id}/world.json`, 'utf8'))
      expect(disk).toEqual(JSON.parse(JSON.stringify(buildPolicyExampleWorld(spec))))
    })

    it(`${spec.id}: every car drives off on its own`, async () => {
      const world = buildPolicyExampleWorld(spec)
      const sim = await WorldSimulator.create(world, 0)
      try {
        const cars = world.entities.filter((e) => e.id.startsWith('policy_car_body')).map((e) => e.id)
        expect(cars.length).toBe(spec.courses.length)
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
  }
})
