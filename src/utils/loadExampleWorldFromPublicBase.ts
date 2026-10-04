/**
 * Browser: fetch example world.json + asset blobs from public/exampleWorlds/<id>/.
 */

import type { RennWorld } from '@/types/world'
import { rehydrateImportedAssetBlob } from '@/utils/rehydrateImportedAssetBlob'

export type LoadedExampleWorldFromPublic = {
  exampleWorldId: string
  world: RennWorld
  assets: Map<string, Blob>
}

function normalizeExampleWorldPublicRoot(baseUrl: string, exampleWorldId: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}exampleWorlds/${encodeURIComponent(exampleWorldId)}/`
}

async function fetchAssetBlob(
  assetRoot: string,
  relPath: string,
  ref: import('@/types/world').AssetRef | undefined,
): Promise<Blob | null> {
  const url = `${assetRoot}${relPath.split('/').map(encodeURIComponent).join('/')}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    let blob = await res.blob()
    blob = await rehydrateImportedAssetBlob(blob, ref, relPath)
    return blob
  } catch {
    return null
  }
}

async function loadExampleWorldAssetsFromPublicRoot(
  assetRoot: string,
  world: RennWorld,
): Promise<Map<string, Blob>> {
  const assets = new Map<string, Blob>()
  const worldAssets = world.assets ?? {}

  for (const [assetId, ref] of Object.entries(worldAssets)) {
    const relPath = ref.path ?? `assets/${assetId}.bin`
    const blob = await fetchAssetBlob(assetRoot, relPath, ref)
    if (blob) assets.set(assetId, blob)
  }

  return assets
}

export async function loadExampleWorldFromPublicBase(
  baseUrl: string,
  exampleWorldId: string,
): Promise<LoadedExampleWorldFromPublic> {
  const trimmed = exampleWorldId.trim()
  if (!trimmed) {
    throw new Error('exampleWorldId is required')
  }
  const assetRoot = normalizeExampleWorldPublicRoot(baseUrl, trimmed)
  // revalidate: GitHub Pages serves max-age=600, so a plain fetch could hand out the previous deploy's world.json
  const buildTag = typeof __BUILD_SHA__ === 'string' ? `?v=${encodeURIComponent(__BUILD_SHA__)}` : ''
  const worldRes = await fetch(`${assetRoot}world.json${buildTag}`, { cache: 'no-cache' })
  if (!worldRes.ok) {
    throw new Error(`Example world not found: ${trimmed}`)
  }
  const world = (await worldRes.json()) as RennWorld
  const assets = await loadExampleWorldAssetsFromPublicRoot(assetRoot, world)
  return { exampleWorldId: trimmed, world, assets }
}
