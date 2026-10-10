#!/usr/bin/env npx tsx
/**
 * Write the neural-drive crowd scene (AV car of `self_hunt_flexible` in a parked-car gauntlet, `neuralMode: 'auto'`) to
 * public/exampleWorlds/av_neural_crowd/ (File -> Example Worlds); also `av_neural_v3` (v3 policy + reversing). Optional argv[2] = one world id. Source of truth: src/test/fixtures/avCrowdCases.ts (same builder as the headless cases).
 * Rerun after `npm run sync:global-pipeline` / library changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { AV_CAR_SOURCE_WORLD } from '../../src/test/fixtures/avEvasionArena'
import { buildNeuralCrowdExampleWorld, buildNeuralV3ExampleWorld } from '../../src/test/fixtures/avCrowdCases'
import { loadLabWorld } from '../../src/test/avLab/lab'

/** Example worlds this exporter owns: id -> builder (from the lab-loaded AV source world). */
const WORLDS: Record<string, (source: ReturnType<typeof loadLabWorld>) => ReturnType<typeof buildNeuralCrowdExampleWorld>> = {
  av_neural_crowd: buildNeuralCrowdExampleWorld,
  av_neural_v3: buildNeuralV3ExampleWorld,
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const only = process.argv[2]
const ids = Object.keys(WORLDS).filter((id) => !only || id === only)
if (!ids.length) throw new Error(`unknown example world '${only}' (known: ${Object.keys(WORLDS).join(', ')})`)
const source = loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD })
for (const id of ids) {
  const world = WORLDS[id]!(source)
  const outDir = resolve(root, 'public/exampleWorlds', id)
  const outPath = resolve(outDir, 'world.json')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n')
  console.log(JSON.stringify({ ok: true, exampleWorldId: id, entities: world.entities.length, path: outPath }))
}
invalidateAgentDevExampleWorldIdCache()
