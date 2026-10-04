#!/usr/bin/env npx tsx
/**
 * Bring the global-library stage code embedded in every public/exampleWorlds/<id>/world.json up to the shipped library
 * (what the Builder does on open via useGlobalLibraryUpgrade). Without this the deployed example world carries stale
 * stage code until a browser upgrades it, i.e. the lab (which applies the library) and the browser can run different code.
 * Writes only when something changed. Part of `npm run sync:global-pipeline`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { updateWorldFromGlobalLibrary } from '../../src/globalPipeline/globalOrigin'
import { avCodeDrift, avStackVersion } from '../../src/globalPipeline/avStackVersion'
import { mergeShippedGlobalBehaviorLibrary } from '../../src/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { buildShippedGlobalBehaviorLibraryBundle } from '../../src/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '../../src/types/globalBehaviorLibrary'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dir = path.join(root, 'public/exampleWorlds')
const lib = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())
for (const id of fs.readdirSync(dir)) {
  const file = path.join(dir, id, 'world.json')
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  const world = JSON.parse(text)
  const { world: next, report } = updateWorldFromGlobalLibrary(world, lib)
  const n = report.updatedStages.length + report.updatedPipes.length
  const drift = avCodeDrift(next, lib)
  if (drift.diverged.length) console.warn(`[${id}] diverged AV stages (edited locally, not upgraded): ${drift.diverged.join(', ')}`)
  if (n === 0 && next === world) continue
  const indent = text.startsWith('{\n  "') ? 2 : 0
  fs.writeFileSync(file, JSON.stringify(next, null, indent || undefined) + (text.endsWith('\n') ? '\n' : ''))
  console.log(`[${id}] upgraded ${report.updatedStages.length} stages, ${report.updatedPipes.length} pipes -> av ${avStackVersion(next)}`)
}
