#!/usr/bin/env npx tsx
/**
 * Write the policy-drive scenes (shipped evolved policy driving held-out field / slalom / maze courses, one car per course) to
 * public/exampleWorlds/policy_drive_<kind>/ (File -> Example Worlds). Removes the retired combined `policy_drive` world.
 * Also the v2 `policy_chains_<kind>` worlds (shippedPolicyV2.json, one held-out setup, every chain in its own copy).
 * Source of truth: src/policyEvolution/ (courses, policy stage, shippedPolicy.json). Update the policy: tools/policy-evolution/ship.ts.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildPolicyChainsExampleWorld, buildPolicyExampleWorld, POLICY_CHAINS_EXAMPLE_WORLDS, POLICY_EXAMPLE_WORLDS } from '../../src/policyEvolution/exampleWorld'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
rmSync(resolve(root, 'public/exampleWorlds/policy_drive'), { recursive: true, force: true })
const builds = [
  ...POLICY_EXAMPLE_WORLDS.map((spec) => ({ id: spec.id, world: buildPolicyExampleWorld(spec) })),
  ...POLICY_CHAINS_EXAMPLE_WORLDS.map((spec) => ({ id: spec.id, world: buildPolicyChainsExampleWorld(spec) })),
]
const written = builds.map(({ id, world }) => {
  const outDir = resolve(root, 'public/exampleWorlds', id)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
  return { exampleWorldId: id, entities: world.entities.length }
})
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, written }, null, 2))
