/**
 * Node-only: load an example world from public/exampleWorlds/<id>/ with assets.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RennWorld } from '@/types/world'
import { prepareWorldForLogicVerification } from '@/agent/prepareWorldForLogicVerification'
import { assertAgentDevExampleWorldId } from '@/agent/agentDevExampleWorlds'
import { loadWorldFolderAssets } from '@/agent/loadWorldFolderAssets'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(MODULE_DIR, '../..')

export type LoadedAgentExampleWorld = {
  exampleWorldId: string
  folderPath: string
  world: RennWorld
  assets: Map<string, Blob>
}

export function resolveAgentExampleWorldDirectory(exampleWorldId: string): string {
  return path.join(REPO_ROOT, 'public', 'exampleWorlds', exampleWorldId)
}

export async function loadAgentExampleWorldFromDisk(
  exampleWorldId: string,
): Promise<LoadedAgentExampleWorld> {
  await assertAgentDevExampleWorldId(exampleWorldId)
  const folderPath = resolveAgentExampleWorldDirectory(exampleWorldId)
  const worldPath = path.join(folderPath, 'world.json')
  const raw = await fs.readFile(worldPath, 'utf8')
  const worldJson: unknown = JSON.parse(raw)
  const world = prepareWorldForLogicVerification(worldJson, { inPlace: true })
  const assets = await loadWorldFolderAssets(world, folderPath)
  return { exampleWorldId, folderPath, world, assets }
}
