import type { AssetRef } from '@/types/world'
import { inferAssetExtension } from '@/utils/assetExport'
import { VideoManager, isVideoAssetPath } from '@/utils/videoManager'

async function readBlobSliceAsArrayBuffer(blob: Blob, start: number, end: number): Promise<ArrayBuffer> {
  const slice = blob.slice(start, end)
  if (typeof slice.arrayBuffer === 'function') {
    return await slice.arrayBuffer()
  }
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(slice)
  })
}

function fileExtFromPath(p: string): string {
  const base = p.replace(/^.*\//, '')
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot).toLowerCase() : ''
}

/**
 * MIME to assign to blobs read from ZIP (JSZip often yields `application/octet-stream` or empty type).
 * Uses `world.assets` ref and/or the zip entry path so video maps load via VideoTexture, not TextureLoader.
 */
export function resolveImportMimeType(
  blob: Blob,
  ref: AssetRef | undefined,
  zipRelativePath: string,
): string | undefined {
  const path = ref?.path ?? zipRelativePath
  const ext = fileExtFromPath(path)
  const current = (blob.type || '').toLowerCase()
  const looksBinaryButTyped =
    current &&
    current !== 'application/octet-stream' &&
    !current.startsWith('text/')

  if (ref?.type === 'video' || isVideoAssetPath(path)) {
    if (looksBinaryButTyped && current.startsWith('video/')) return undefined
    if (ext === '.webm') return 'video/webm'
    if (ext === '.mov' || ext === '.qt') return 'video/quicktime'
    if (ext === '.ogv') return 'video/ogg'
    return 'video/mp4'
  }
  if (ref?.type === 'texture' || ref?.type === 'cubeTexture') {
    if (looksBinaryButTyped && current.startsWith('image/')) return undefined
    if (ext === '.png') return 'image/png'
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.gif') return 'image/gif'
    if (ext === '.bmp') return 'image/bmp'
    return 'image/png'
  }
  if (ref?.type === 'audio') {
    if (looksBinaryButTyped && current.startsWith('audio/')) return undefined
    if (ext === '.wav') return 'audio/wav'
    if (ext === '.ogg') return 'audio/ogg'
    if (ext === '.m4a') return 'audio/mp4'
    if (ext === '.aac') return 'audio/aac'
    if (ext === '.flac') return 'audio/flac'
    return 'audio/mpeg'
  }
  if (ref?.type === 'model') {
    if (ext === '.gltf') return 'model/gltf+json'
    if (ext === '.glb') return 'model/gltf-binary'
    if (looksBinaryButTyped && (current.includes('gltf') || current === 'model/gltf-binary')) return undefined
    return 'model/gltf-binary'
  }
  // No ref (or minimal ref): infer from zip path only
  if (isVideoAssetPath(path)) {
    if (ext === '.webm') return 'video/webm'
    if (ext === '.mov') return 'video/quicktime'
    return 'video/mp4'
  }
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) {
    if (ext === '.png') return 'image/png'
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.gif') return 'image/gif'
    if (ext === '.bmp') return 'image/bmp'
  }
  if (ext === '.glb') return 'model/gltf-binary'
  if (ext === '.gltf') return 'model/gltf+json'
  if (['.mp3', '.mpeg'].includes(ext)) return 'audio/mpeg'
  if (ext === '.wav') return 'audio/wav'
  return undefined
}

export async function rehydrateImportedAssetBlob(
  blob: Blob,
  ref: AssetRef | undefined,
  zipRelativePath: string,
): Promise<Blob> {
  const mime = resolveImportMimeType(blob, ref, zipRelativePath)
  if (!mime || blob.type === mime) return blob
  const buf =
    typeof blob.arrayBuffer === 'function'
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as ArrayBuffer)
          reader.onerror = () => reject(reader.error)
          reader.readAsArrayBuffer(blob)
        })
  return new Blob([buf], { type: mime })
}

/** Registry entry for an exported blob that had no `world.assets` row (e.g. map-only reference). */
export async function synthesizeAssetRefForExport(assetId: string, blob: Blob): Promise<AssetRef> {
  if (VideoManager.isVideoBlob(blob)) {
    const ext = inferAssetExtension(blob)
    return { type: 'video', path: `assets/${assetId}.${ext}` }
  }
  const head = new Uint8Array(await readBlobSliceAsArrayBuffer(blob, 0, 12))
  if (head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    return { type: 'video', path: `assets/${assetId}.mp4` }
  }
  if (blob.type.startsWith('image/')) {
    const ext = inferAssetExtension(blob)
    return { type: 'texture', path: `assets/${assetId}.${ext}` }
  }
  if (blob.type.startsWith('audio/')) {
    const ext = inferAssetExtension(blob)
    return { type: 'audio', path: `assets/${assetId}.${ext}` }
  }
  const ext = inferAssetExtension(blob)
  return { type: 'model', path: `assets/${assetId}.${ext}` }
}
