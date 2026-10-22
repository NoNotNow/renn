#!/usr/bin/env npx tsx
/**
 * Write the two schlau example worlds (schlau_open / schlau_box — the schlau car driving one holdout-adjacent
 * start -> goal task each, seeds 2001/2002, NOT the training seeds 3001-3006) to public/exampleWorlds/
 * (File -> Example Worlds). Unlike the schlau TRAINING worlds (schlau_1..6, excluded from the global menu), these
 * ids stay in the global File -> Example Worlds menu — drivable outside the training dialog.
 * Per world: world.json only (example worlds carry no meta.json). The baked genome is the shipped schlau policy
 * (src/policyEvolution/shippedPolicySchlau.json) or — until a first net is trained — the deterministic placeholder
 * (placeholderSchlauGenome). Re-run after every ship.
 * Source of truth: src/policyEvolution/exampleWorld.ts (SCHLAU_EXAMPLE_WORLDS / buildSchlauExampleWorld).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildSchlauExampleWorld, SCHLAU_EXAMPLE_WORLDS } from '../../src/policyEvolution/exampleWorld'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const builds = SCHLAU_EXAMPLE_WORLDS.map((spec) => ({ id: spec.id, world: buildSchlauExampleWorld(spec) }))
const written = builds.map(({ id, world }) => {
  const outDir = resolve(root, 'public/exampleWorlds', id)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
  return { exampleWorldId: id, entities: world.entities.length }
})
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, written }, null, 2))
