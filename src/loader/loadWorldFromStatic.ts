/**
 * Load world and assets from static files (e.g. public/world/).
 * Used for GitHub Pages deployment where IndexedDB and upload are not available.
 */
import type { RennWorld } from '@/types/world'
import { validateWorldDocument } from '@/schema/validate'
import { migrateWorldScripts } from '@/scripts/migrateWorld'

const ASSET_EXTS = ['.bin', '.png', '.jpg', '.jpeg', '.glb', '.gltf']

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const lower = contentType.toLowerCase().split(';')[0].trim()
  return lower === 'text/html' || lower === 'application/xhtml+xml'
}

/**
 * Fetches a URL as Blob only if the response is not an HTML fallback (SPA shell).
 * Vite dev returns 200 + text/html for missing files; those must not be stored as assets.
 */
async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const headerType = res.headers.get('content-type')
    if (isHtmlContentType(headerType)) {
      console.warn('[loadWorldFromStatic] Rejected HTML response (likely SPA fallback):', url, headerType)
      return null
    }
    const blob = await res.blob()
    if (isHtmlContentType(blob.type)) {
      console.warn('[loadWorldFromStatic] Rejected blob with HTML type:', url, blob.type)
      return null
    }
    return blob
  } catch {
    return null
  }
}

/**
 * Candidate URLs for a static asset.
 * Export-style paths (assets/<assetId>.<ext>) are tried first so stale ref.path
 * entries do not win before valid shipped assets.
 */
function resolveAssetPaths(
  baseUrl: string,
  assetId: string,
  refPath?: string
): string[] {
  const candidates: string[] = []
  const base = baseUrl.replace(/\/$/, '') + '/world/'

  for (const ext of ASSET_EXTS) {
    candidates.push(base + 'assets/' + assetId + ext)
  }
  if (refPath) {
    const normalized = refPath.replace(/\s/g, '_').replace(/~/g, '_')
    candidates.push(base + refPath)
    candidates.push(base + normalized)
  }
  return candidates
}

/** Collect asset IDs referenced in entities (material.map, entity.model, shape.model for trimesh) */
function collectReferencedAssetIds(world: RennWorld): Set<string> {
  const ids = new Set<string>()
  for (const entity of world.entities ?? []) {
    const map = entity.material?.map
    if (map && typeof map === 'string') ids.add(map)
    const shapeModel = entity.shape && entity.shape.type === 'trimesh' ? entity.shape.model : undefined
    if (shapeModel && typeof shapeModel === 'string') ids.add(shapeModel)
    const entityModel = entity.model
    if (entityModel && typeof entityModel === 'string') ids.add(entityModel)
  }
  for (const id of Object.keys(world.assets ?? {})) {
    ids.add(id)
  }
  return ids
}

/**
 * Load world.json and all referenced assets from static URLs.
 * Loads assets from world.assets and those referenced by entities (material.map, shape.model).
 * Tries assets/assetId.<ext> first (export format), then ref.path variants.
 */
export async function loadWorldFromStatic(
  baseUrl: string
): Promise<{ world: RennWorld; assets: Map<string, Blob> } | null> {
  const worldUrl = baseUrl.replace(/\/$/, '') + '/world/world.json'
  try {
    const res = await fetch(worldUrl)
    if (!res.ok) return null
    const raw = await res.json()
    migrateWorldScripts(raw)
    validateWorldDocument(raw)
    const world = raw as RennWorld

    const assets = new Map<string, Blob>()
    const assetRefs = world.assets ?? {}
    const allIds = collectReferencedAssetIds(world)

    for (const assetId of allIds) {
      if (assets.has(assetId)) continue
      const ref = assetRefs[assetId]
      const paths = resolveAssetPaths(baseUrl, assetId, ref?.path)
      for (const path of paths) {
        const blob = await fetchBlob(path)
        if (blob) {
          assets.set(assetId, blob)
          break
        }
      }
    }

    return { world, assets }
  } catch (err) {
    console.warn('[loadWorldFromStatic] Failed to load static world:', err)
    return null
  }
}
