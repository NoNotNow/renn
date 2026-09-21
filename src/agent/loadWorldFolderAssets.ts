/**
 * Node-only: load asset blobs from a world bundle folder (world.json parent).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { RennWorld } from '@/types/world'
import { rehydrateImportedAssetBlob } from '@/utils/rehydrateImportedAssetBlob'

function assertSafeRelativeAssetPath(relPath: string): void {
  if (path.isAbsolute(relPath) || relPath.split(/[/\\]/).includes('..')) {
    throw new Error(`Unsafe asset path in bundle: ${relPath}`)
  }
}

async function readAssetBlob(
  bundleDir: string,
  relPath: string,
  ref: import('@/types/world').AssetRef | undefined,
): Promise<Blob | null> {
  assertSafeRelativeAssetPath(relPath)
  const fullPath = path.resolve(bundleDir, relPath)
  const resolvedBundle = path.resolve(bundleDir)
  if (fullPath !== resolvedBundle && !fullPath.startsWith(`${resolvedBundle}${path.sep}`)) {
    throw new Error(`Asset path escapes bundle directory: ${relPath}`)
  }
  try {
    const data = await fs.readFile(fullPath)
    let blob = new Blob([data])
    blob = await rehydrateImportedAssetBlob(blob, ref, relPath)
    return blob
  } catch {
    return null
  }
}

export async function loadWorldFolderAssets(
  world: RennWorld,
  bundleDir: string,
): Promise<Map<string, Blob>> {
  const assets = new Map<string, Blob>()
  const worldAssets = world.assets ?? {}

  for (const [assetId, ref] of Object.entries(worldAssets)) {
    const relPath = ref.path ?? `assets/${assetId}.bin`
    const blob = await readAssetBlob(bundleDir, relPath, ref)
    if (blob) assets.set(assetId, blob)
  }

  const assetsDir = path.join(bundleDir, 'assets')
  try {
    const entries = await fs.readdir(assetsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue
      const assetId = entry.name.replace(/\.[^.]+$/, '')
      if (assets.has(assetId)) continue
      const relPath = `assets/${entry.name}`
      const ref = worldAssets[assetId]
      const blob = await readAssetBlob(bundleDir, relPath, ref)
      if (blob) assets.set(assetId, blob)
    }
  } catch {
    // optional assets/
  }

  return assets
}
