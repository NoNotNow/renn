#!/usr/bin/env npx tsx
/**
 * Write the parkour course driven by the nested AV stack to public/exampleWorlds/ (File → Example Worlds).
 * Source of truth: buildAvShowcaseWorld(buildSelfDrivingParkourWorld()) + public/global/transformers/av-stack/*.js
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildAvShowcaseWorld } from '../../src/test/fixtures/avStackWorld'
import { buildSelfDrivingParkourWorld } from '../../src/test/fixtures/selfDrivingCarWorld'

const EXAMPLE_WORLD_ID = 'self_drive_av'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/exampleWorlds', EXAMPLE_WORLD_ID)
const outPath = resolve(outDir, 'world.json')

const world = buildAvShowcaseWorld(buildSelfDrivingParkourWorld())
world.world = {
  ...world.world,
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
