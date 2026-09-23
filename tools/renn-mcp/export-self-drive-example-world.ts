#!/usr/bin/env npx tsx
/**
 * Write headless self-driving diagnostic world to public/exampleWorlds/ (File → Example Worlds).
 * Source of truth: src/test/fixtures/selfDrivingCarWorld.ts + patch JS files.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildSelfDrivingCarWorld } from '../../src/test/fixtures/selfDrivingCarWorld'

const EXAMPLE_WORLD_ID = 'self_drive_cube'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/exampleWorlds', EXAMPLE_WORLD_ID)
const outPath = resolve(outDir, 'world.json')

const world = buildSelfDrivingCarWorld({ variant: 'cubeGoalBehind' })
world.world = {
  ...world.world,
  camera: { mode: 'follow', target: 'car' },
}

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n')
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, exampleWorldId: EXAMPLE_WORLD_ID, path: outPath }, null, 2))
