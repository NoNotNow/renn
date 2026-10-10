import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import { chainEpisodeKeys } from './chains'
import { runPolicyEpisode } from './episode'
import { buildPolicyChainsExampleWorld, buildPolicyExampleWorld, CHAIN_MARKER_PREFIX, POLICY_CHAINS_EXAMPLE_WORLDS, POLICY_EXAMPLE_WORLDS, shippedGenomeV2 } from './exampleWorld'

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

describe('policy_chains example worlds (v2: same setup, one car per chain)', () => {
  for (const spec of POLICY_CHAINS_EXAMPLE_WORLDS) {
    it(`${spec.id}: on disk equals the exporter output`, () => {
      const disk = JSON.parse(readFileSync(`public/exampleWorlds/${spec.id}/world.json`, 'utf8'))
      expect(disk).toEqual(JSON.parse(JSON.stringify(buildPolicyChainsExampleWorld(spec))))
    })

    it(`${spec.id}: markers float clear of rays (0.5 m) and cars`, () => {
      const markers = buildPolicyChainsExampleWorld(spec).entities.filter((e) => e.id.startsWith(CHAIN_MARKER_PREFIX))
      expect(markers.length).toBeGreaterThan(5)
      for (const m of markers) expect(m.position![1] - 0.15).toBeGreaterThan(6)
    })

    it(`${spec.id}: every car leaves its start; per-chain outcomes recorded`, async () => {
      const world = buildPolicyChainsExampleWorld(spec)
      const keys = chainEpisodeKeys(spec.setupKey)
      expect(keys.length).toBeGreaterThanOrEqual(2)
      const sim = await WorldSimulator.create(world, 0)
      try {
        const cars = world.entities.filter((e) => e.id.startsWith('policy_car_body')).map((e) => e.id)
        expect(cars.length).toBe(keys.length)
        const start = cars.map((id) => sim.getPosition(id))
        sim.runFrames(Math.round(8 / DEFAULT_DT))
        cars.forEach((id, i) => {
          const p = sim.getPosition(id)
          expect(Math.hypot(p[0] - start[i]![0], p[2] - start[i]![2])).toBeGreaterThan(8)
        })
      } finally {
        sim.dispose()
      }
      // same episode rules as training (noise 0 = the world as shipped); outcomes are reported, not asserted to be finishes
      const rows: string[] = []
      for (const key of keys) {
        const m = await runPolicyEpisode(shippedGenomeV2(), key, { noise: 0 })
        rows.push(`${key} ${m.outcome} ${(m.progress / (m.length ?? 1)).toFixed(2)} of ${(m.length ?? 0).toFixed(0)} m in ${m.timeS.toFixed(1)} s`)
      }
      console.log(`[chains] ${spec.id}\n  ${rows.join('\n  ')}`)
    }, 300_000)
  }
})
