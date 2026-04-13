/**
 * Video file validation and helpers for map assets (material video textures).
 */
import type { AssetRef, RennWorld } from '@/types/world'
import { generateAssetIdFromFilename } from '@/utils/assetId'
import { isInternalTextureAssetKey } from '@/utils/textureAssetVersioning'

const VIDEO_MIME_PREFIX = 'video/'

const VIDEO_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.m4v',
  '.ogv',
  '.wmv',
]

export class VideoManager {
  /** Pre-conversion upload cap (matches plan). */
  static readonly MAX_FILE_SIZE = 100 * 1024 * 1024

  static isVideoFile(file: File): boolean {
    if (file.type.toLowerCase().startsWith(VIDEO_MIME_PREFIX)) return true
    const lower = file.name.toLowerCase()
    return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))
  }

  static isVideoBlob(blob: Blob): boolean {
    return blob.type.toLowerCase().startsWith(VIDEO_MIME_PREFIX)
  }

  static validateVideoFile(file: File): { valid: boolean; error?: string } {
    if (!this.isVideoFile(file)) {
      return {
        valid: false,
        error: 'Invalid file type. Please upload a video file (MP4, WebM, MOV, etc.).',
      }
    }
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${Math.round(this.MAX_FILE_SIZE / 1024 / 1024)}MB`,
      }
    }
    return { valid: true }
  }

  static generateAssetId(filename: string): string {
    return generateAssetIdFromFilename(filename, 'video')
  }
}

/**
 * Whether an asset id should load as a Three.js VideoTexture (world metadata or blob MIME).
 */
export function isVideoMapAsset(
  assetId: string,
  worldAssets: Record<string, AssetRef> | undefined,
  assets: Map<string, Blob>,
): boolean {
  const ref = worldAssets?.[assetId]
  if (ref?.type === 'video') return true
  const blob = assets.get(assetId)
  return blob ? VideoManager.isVideoBlob(blob) : false
}

/** User-selectable video map assets for the texture picker (excludes compositor internal keys). */
export function listVideoMapPickerAssets(
  assets: Map<string, Blob>,
  world: RennWorld,
): Array<{ id: string; blob: Blob }> {
  const worldAssets = world.assets ?? {}
  const out: Array<{ id: string; blob: Blob }> = []
  for (const [id, blob] of assets.entries()) {
    if (isInternalTextureAssetKey(id)) continue
    if (worldAssets[id]?.type === 'video' || VideoManager.isVideoBlob(blob)) {
      out.push({ id, blob })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}
