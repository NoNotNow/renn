#!/usr/bin/env npx tsx
/**
 * Write the many-AV-cars scene (economy budget) to public/exampleWorlds/ (File → Example Worlds).
 * Source of truth: buildFleetWorld() from src/test/fixtures/avFleet.ts (open ground, a few low walls, every car on the
 * global AV autopilot pipe with its own wanderer goal stage) + public/global/transformers/av-stack/*.js
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { AV_CAR_SOURCE_ID } from '../../src/test/fixtures/avEvasionArena'
import { buildFleetWorld } from '../../src/test/fixtures/avFleet'

const EXAMPLE_WORLD_ID = 'av_fleet_eco'
const CAR_COUNT = 7

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/exampleWorlds', EXAMPLE_WORLD_ID)
const outPath = resolve(outDir, 'world.json')

const world = buildFleetWorld({ n: CAR_COUNT, layout: 'spread', params: { budget: 'eco' } })
world.world = {
  ...world.world,
  camera: {
    mode: 'thirdPerson',
    target: AV_CAR_SOURCE_ID,
    control: 'follow',
    distance: 40,
    height: 30,
    cameraTargetLag: 120,
    cameraPositionLag: 180,
  },
}

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n')
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, exampleWorldId: EXAMPLE_WORLD_ID, cars: CAR_COUNT, path: outPath }, null, 2))
