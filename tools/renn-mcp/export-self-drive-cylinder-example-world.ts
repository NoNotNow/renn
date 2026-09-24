#!/usr/bin/env npx tsx
/**
 * Minimal cylinder self-driving site → public/exampleWorlds/self_drive_cylinder/
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildSelfDrivingCylinderWorld } from '../../src/test/fixtures/selfDrivingCarWorld'

const EXAMPLE_WORLD_ID = 'self_drive_cylinder'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/exampleWorlds', EXAMPLE_WORLD_ID)
const outPath = resolve(outDir, 'world.json')

const world = buildSelfDrivingCylinderWorld()
world.world = {
  ...world.world,
  debugTargetLineEntityId: 'car',
  camera: {
    mode: 'thirdPerson',
    target: 'car',
    control: 'follow',
    distance: 14,
    height: 6,
    cameraTargetLag: 120,
    cameraPositionLag: 180,
  },
}

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n')
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, exampleWorldId: EXAMPLE_WORLD_ID, path: outPath }, null, 2))
