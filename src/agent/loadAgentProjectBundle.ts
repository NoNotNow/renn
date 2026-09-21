/**
 * Node-only: load pinned agent project bundles from `src/agent/projects/<id>/`.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RennWorld } from '@/types/world'
import { prepareWorldForLogicVerification } from '@/agent/prepareWorldForLogicVerification'
import { loadWorldFolderAssets } from '@/agent/loadWorldFolderAssets'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

/** Root directory containing one folder per bundle id. */
export const AGENT_PROJECT_BUNDLES_DIR = path.join(MODULE_DIR, 'projects')

const BUNDLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/i

export type LoadedAgentProjectBundle = {
  bundleId: string
  /** Absolute path to the bundle folder (world.json parent). */
  bundlePath: string
  world: RennWorld
  assets: Map<string, Blob>
}

export function isValidAgentProjectBundleId(bundleId: string): boolean {
  return BUNDLE_ID_PATTERN.test(bundleId)
}

export function resolveAgentProjectBundleDirectory(bundleId: string): string {
  if (!isValidAgentProjectBundleId(bundleId)) {
    throw new Error(
      `Invalid bundle id "${bundleId}" — use alphanumeric segments separated by hyphens`,
    )
  }
  const root = path.resolve(AGENT_PROJECT_BUNDLES_DIR)
  const dir = path.resolve(root, bundleId)
  if (dir !== root && !dir.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid bundle id — path traversal rejected')
  }
  return dir
}

/** @deprecated Prefer `prepareWorldForLogicVerification` — kept for bundle import call sites. */
export function prepareImportedWorldDocument(worldJson: unknown): RennWorld {
  return prepareWorldForLogicVerification(worldJson, { inPlace: true })
}

/** Known bundle ids: subdirectories of `projects/` that contain `world.json`. */
export async function listAgentProjectBundleIds(): Promise<string[]> {
  let names: string[]
  try {
    names = await fs.readdir(AGENT_PROJECT_BUNDLES_DIR)
  } catch {
    return []
  }
  const ids: string[] = []
  for (const name of names) {
    if (!isValidAgentProjectBundleId(name)) continue
    const dir = path.join(AGENT_PROJECT_BUNDLES_DIR, name)
    try {
      const stat = await fs.stat(dir)
      if (!stat.isDirectory()) continue
      await fs.access(path.join(dir, 'world.json'))
      ids.push(name)
    } catch {
      // skip incomplete bundles
    }
  }
  return ids.sort()
}

export async function loadAgentProjectBundle(bundleId: string): Promise<LoadedAgentProjectBundle> {
  const bundlePath = resolveAgentProjectBundleDirectory(bundleId)
  const worldPath = path.join(bundlePath, 'world.json')

  let raw: string
  try {
    raw = await fs.readFile(worldPath, 'utf8')
  } catch {
    const known = await listAgentProjectBundleIds()
    const hint =
      known.length > 0 ? ` Known bundles: ${known.join(', ')}.` : ''
    throw new Error(`Agent project bundle not found: "${bundleId}".${hint}`)
  }

  const worldJson: unknown = JSON.parse(raw)
  const world = prepareImportedWorldDocument(worldJson)
  const assets = await loadWorldFolderAssets(world, bundlePath)

  return { bundleId, bundlePath, world, assets }
}
