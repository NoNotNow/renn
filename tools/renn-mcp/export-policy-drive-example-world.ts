#!/usr/bin/env npx tsx
/**
 * Write the policy-drive scenes (shipped evolved policy driving held-out field / slalom / maze courses, one car per course) to
 * public/exampleWorlds/policy_drive_<kind>/ (File -> Example Worlds). Removes the retired combined `policy_drive` world.
 * Source of truth: src/policyEvolution/ (courses, policy stage, shippedPolicy.json). Update the policy: tools/policy-evolution/ship.ts.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildPolicyExampleWorld, POLICY_EXAMPLE_WORLDS } from '../../src/policyEvolution/exampleWorld'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
rmSync(resolve(root, 'public/exampleWorlds/policy_drive'), { recursive: true, force: true })
const written = POLICY_EXAMPLE_WORLDS.map((spec) => {
  const outDir = resolve(root, 'public/exampleWorlds', spec.id)
  const world = buildPolicyExampleWorld(spec)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
  return { exampleWorldId: spec.id, entities: world.entities.length }
})
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, written }, null, 2))
