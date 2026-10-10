#!/usr/bin/env npx tsx
/**
 * Write the neural-drive crowd scene (AV car of `self_hunt_flexible` in a parked-car gauntlet, `neuralMode: 'auto'`) to
 * public/exampleWorlds/av_neural_crowd/ (File -> Example Worlds). Source of truth: src/test/fixtures/avCrowdCases.ts (same builder as the headless cases).
 * Rerun after `npm run sync:global-pipeline` / library changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { AV_CAR_SOURCE_WORLD } from '../../src/test/fixtures/avEvasionArena'
import { buildNeuralCrowdExampleWorld } from '../../src/test/fixtures/avCrowdCases'
import { loadLabWorld } from '../../src/test/avLab/lab'

const EXAMPLE_WORLD_ID = 'av_neural_crowd'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/exampleWorlds', EXAMPLE_WORLD_ID)
const outPath = resolve(outDir, 'world.json')

const world = buildNeuralCrowdExampleWorld(loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD }))

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n')
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, exampleWorldId: EXAMPLE_WORLD_ID, entities: world.entities.length, path: outPath }, null, 2))
