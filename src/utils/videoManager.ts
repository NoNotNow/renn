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

  /**
   * Async validation: rejects HTML stubs and obvious non-MP4 content for `.mp4` / `video/mp4` picks.
   * Call from upload / conversion entry points (browser can mis-report MIME for renamed files).
   */
  static async validateVideoFileContent(file: File): Promise<{ valid: boolean; error?: string }> {
    const base = this.validateVideoFile(file)
    if (!base.valid) return base

    const slice = file.slice(0, 64)
    const buf =
      typeof slice.arrayBuffer === 'function'
        ? await slice.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as ArrayBuffer)
            reader.onerror = () => reject(reader.error)
            reader.readAsArrayBuffer(slice)
          })
    const head = new Uint8Array(buf)
    const asText = new TextDecoder('utf-8', { fatal: false }).decode(head).trimStart()
    if (asText.startsWith('<!DOCTYPE') || asText.startsWith('<html')) {
      return {
        valid: false,
        error:
          'This file is not a video (it looks like a web page). Download the actual video file, not an HTML redirect.',
      }
    }

    const lower = file.name.toLowerCase()
    const mp4Like =
      lower.endsWith('.mp4') ||
      lower.endsWith('.m4v') ||
      file.type.toLowerCase().includes('mp4')
    if (mp4Like && head.length >= 8) {
      const brand = String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!)
      if (brand !== 'ftyp' && brand !== 'styp') {
        return {
          valid: false,
          error: 'File does not look like a valid MP4 (missing ISO ftyp header).',
        }
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
