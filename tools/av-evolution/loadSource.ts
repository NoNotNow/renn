/* Node-only loader of the evolution source world: raw example world JSON + shipped global library JSON from disk. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareSourceWorld } from '@/avEvolution/eval/evaluator'
import type { ShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'
import type { RennWorld } from '@/types/world'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
/** World that holds the AV car (same one the scripted-scenario fixtures copy it from). */
export const DEFAULT_SOURCE_WORLD_ID = 'self_hunt_flexible'

export function loadSourceWorld(exampleId: string = DEFAULT_SOURCE_WORLD_ID): RennWorld {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'public/exampleWorlds', exampleId, 'world.json'), 'utf8')) as RennWorld
  const bundle = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'public/global/shipped-global-behavior-library.json'), 'utf8')) as ShippedGlobalBehaviorLibraryBundle
  return prepareSourceWorld(raw, bundle)
}
