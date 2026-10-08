#!/usr/bin/env npx tsx
/**
 * Write the policy-drive scene (shipped evolved policy driving a held-out field course and a held-out slalom course, one car each)
 * to public/exampleWorlds/policy_drive/ (File -> Example Worlds).
 * Source of truth: src/policyEvolution/ (courses, policy stage, shippedPolicy.json). Update the policy: tools/policy-evolution/ship.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildPolicyExampleWorld, POLICY_EXAMPLE_WORLD_ID } from '../../src/policyEvolution/exampleWorld'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/exampleWorlds', POLICY_EXAMPLE_WORLD_ID)
const outPath = resolve(outDir, 'world.json')
const world = buildPolicyExampleWorld()

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n')
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, exampleWorldId: POLICY_EXAMPLE_WORLD_ID, entities: world.entities.length, path: outPath }, null, 2))
