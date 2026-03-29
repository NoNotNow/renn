/**
 * Helpers for downloading individual assets and bundling all assets into a ZIP.
 * Used by AssetPanel (per-row download, bulk download) and re-used by exportProject.
 */
import type { AssetRef } from '@/types/world'

/** Infer a file extension from a Blob's MIME type. */
export function inferAssetExtension(blob: Blob): string {
  const mime = blob instanceof Blob ? blob.type : ''
  if (mime.includes('png') || mime.includes('jpeg') || mime.includes('jpg') || mime.includes('gif') || mime.includes('webp') || mime.includes('bmp')) {
    // Prefer exact PNG, fallback to extension derived from mime
    if (mime.includes('png')) return 'png'
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
    if (mime.includes('gif')) return 'gif'
    if (mime.includes('webp')) return 'webp'
    if (mime.includes('bmp')) return 'bmp'
  }
  if (mime.includes('glb') || mime.includes('gltf-binary') || mime.includes('octet-stream')) return 'glb'
  if (mime.includes('gltf')) return 'gltf'
  if (mime.includes('audio') || mime.includes('mpeg')) return 'mp3'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'bin'
}

/**
 * Resolve a download filename for a single asset.
 * Prefers the original filename encoded in `worldAssetRef.path` (e.g. "assets/hero.png" → "hero.png"),
 * falls back to `${assetId}.${ext}`.
 */
export function resolveAssetFilename(assetId: string, blob: Blob, ref?: AssetRef): string {
  if (ref?.path) {
    const basename = ref.path.replace(/^assets\//, '')
    if (basename && basename !== ref.path) return basename
    // path doesn't start with assets/ but might still be a plain filename
    const slash = ref.path.lastIndexOf('/')
    const name = slash >= 0 ? ref.path.slice(slash + 1) : ref.path
    if (name) return name
  }
  return `${assetId}.${inferAssetExtension(blob)}`
}

/**
 * Add all assets into a JSZip folder (in-place). De-duplicates filenames with `_2`, `_3`, etc.
 * Returns the set of filenames written (useful for callers that need to know what ended up in the folder).
 */
export async function addAssetsToZipFolder(
  folder: import('jszip'),
  assets: Map<string, Blob>,
  worldAssets: Record<string, AssetRef> = {},
): Promise<void> {
  const usedNames = new Set<string>()
  for (const [id, blob] of assets) {
    const preferred = resolveAssetFilename(id, blob, worldAssets[id])
    const filename = deduplicateFilename(preferred, usedNames)
    usedNames.add(filename)
    const data = blob instanceof Blob
      ? (typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob)
      : (blob as unknown as ArrayBuffer)
    folder.file(filename, data)
  }
}

/**
 * Build a ZIP blob containing all assets under `assets/`, using original filenames where available.
 * Deduplicates colliding filenames by appending `_2`, `_3`, etc. before the extension.
 */
export async function buildAssetsZipBlob(
  assets: Map<string, Blob>,
  worldAssets: Record<string, AssetRef> = {},
): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const folder = zip.folder('assets')!
  await addAssetsToZipFolder(folder, assets, worldAssets)
  return zip.generateAsync({ type: 'blob' })
}

/** Append `_2`, `_3`, … before extension until the name is unique in `used`. */
function deduplicateFilename(name: string, used: Set<string>): string {
  if (!used.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot >= 0 ? name.slice(0, dot) : name
  const ext = dot >= 0 ? name.slice(dot) : ''
  let counter = 2
  let candidate = `${stem}_${counter}${ext}`
  while (used.has(candidate)) {
    counter++
    candidate = `${stem}_${counter}${ext}`
  }
  return candidate
}

/** Trigger a browser download for a Blob. Cleans up the object URL after a tick. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
