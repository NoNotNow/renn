/**
 * Versioned flat texture asset IDs (`stem_editedN.ext`) and dialog grouping.
 */

import type { RennWorld } from '@/types/world'

/** Layer / paint / composite sidecar keys — not shown as user textures in the picker. */
export function isInternalTextureAssetKey(id: string): boolean {
  return (
    id.startsWith('composite_') ||
    id.startsWith('texdoc_') ||
    id.startsWith('texlayer_') ||
    id.startsWith('tex_paint_')
  )
}

export function fileExtNoDotFromImageMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m === 'image/png') return 'png'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/webp') return 'webp'
  if (m === 'image/gif') return 'gif'
  if (m === 'image/bmp') return 'bmp'
  return 'png'
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `stem`, revision `n`, extension without dot (or null if id had no extension segment). */
export function parseEditedTextureAssetId(
  id: string,
): { stem: string; n: number; extNoDot: string | null } | null {
  const m = id.match(/^(.+)_edited(\d+)(?:\.([^.]+))?$/)
  if (!m) return null
  const stem = m[1]!
  const n = Number(m[2])
  const extNoDot = m[3] != null && m[3] !== '' ? m[3]! : null
  if (!Number.isFinite(n) || n < 1) return null
  return { stem, n, extNoDot }
}

/** Sanitize a stem for use in asset keys (matches upload id style). */
export function sanitizeTextureStem(raw: string): string {
  const s = raw
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return s || 'texture'
}

/**
 * Derive edit family from current material map id and source image MIME (simple or `_editedN.ext` keys).
 */
export function inferEditFamilyFromMaterialMapId(
  mapAssetId: string,
  sourceImageMime: string,
): { stem: string; extNoDot: string } {
  const extFromMime = fileExtNoDotFromImageMime(sourceImageMime)
  const parsed = parseEditedTextureAssetId(mapAssetId)
  if (parsed) {
    return {
      stem: sanitizeTextureStem(parsed.stem),
      extNoDot: parsed.extNoDot ?? extFromMime,
    }
  }
  return {
    stem: sanitizeTextureStem(mapAssetId),
    extNoDot: extFromMime,
  }
}

export function nextEditedTextureAssetKey(
  existingKeys: Iterable<string>,
  stem: string,
  extNoDot: string,
): string {
  const safeStem = sanitizeTextureStem(stem)
  const safeExt = extNoDot.replace(/[^a-zA-Z0-9]/g, '') || 'png'
  const re = new RegExp(
    `^${escapeRegExp(safeStem)}_edited(\\d+)(?:\\.${escapeRegExp(safeExt)})?$`,
  )
  let max = 0
  for (const k of existingKeys) {
    const m = k.match(re)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n)) max = Math.max(max, n)
    }
  }
  return `${safeStem}_edited${max + 1}.${safeExt}`
}

export type TextureDialogGroup =
  | { kind: 'single'; id: string }
  | { kind: 'family'; stem: string; versions: Array<{ id: string; n: number }> }

/**
 * Build collapsible groups for the texture picker. Newest `n` first within each family.
 */
export function buildTextureDialogGroups(assetIds: string[]): TextureDialogGroup[] {
  const userIds = assetIds.filter((id) => !isInternalTextureAssetKey(id))
  const familyMap = new Map<string, Array<{ id: string; n: number }>>()
  const singles: string[] = []

  for (const id of userIds) {
    const p = parseEditedTextureAssetId(id)
    if (p) {
      const list = familyMap.get(p.stem) ?? []
      list.push({ id, n: p.n })
      familyMap.set(p.stem, list)
    } else {
      singles.push(id)
    }
  }

  const groups: TextureDialogGroup[] = []
  for (const id of singles.sort((a, b) => a.localeCompare(b))) {
    groups.push({ kind: 'single', id })
  }
  const stems = [...familyMap.keys()].sort((a, b) => a.localeCompare(b))
  for (const stem of stems) {
    const versions = (familyMap.get(stem) ?? []).sort((a, b) => b.n - a.n)
    if (versions.length === 1) {
      groups.push({ kind: 'single', id: versions[0]!.id })
    } else {
      groups.push({ kind: 'family', stem, versions })
    }
  }
  groups.sort((a, b) => {
    const la = a.kind === 'family' ? a.stem : a.id
    const lb = b.kind === 'family' ? b.stem : b.id
    return la.localeCompare(lb)
  })
  return groups
}

/** Count references to an asset from world entities and global texture slots. */
export function countWorldAssetReferences(world: RennWorld, assetId: string): number {
  let n = 0
  for (const e of world.entities ?? []) {
    if (e.material?.map === assetId) n++
    const shapeModel = e.shape && e.shape.type === 'trimesh' ? e.shape.model : undefined
    if (shapeModel === assetId) n++
    if (e.model === assetId) n++
  }
  const sky = world.world?.skybox
  if (sky && typeof sky === 'string' && sky.trim() === assetId) n++
  const soundId = world.world?.sound?.assetId
  if (soundId && typeof soundId === 'string' && soundId.trim() === assetId) n++
  return n
}
