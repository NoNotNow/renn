import { defaultPersistence } from '@/persistence/indexedDb'
import { ModelManager } from '@/utils/modelManager'
import { TextureManager } from '@/utils/textureManager'
import { generateModelPreview } from '@/utils/modelPreview'

export interface UploadModelResult {
  nextAssets: Map<string, Blob>
  worldAssetEntry: { path: string; type: 'model' }
}

/**
 * Validates, persists, and returns updated assets + world asset entry for a model upload.
 * Caller should call onAssetsChange(nextAssets) and onWorldChange({ ...world, assets: { ...world.assets, [assetId]: worldAssetEntry } }).
 */
export async function uploadModel(
  file: File,
  assetId: string,
  assets: Map<string, Blob>
): Promise<UploadModelResult> {
  const validation = ModelManager.validateModelFile(file)
  if (!validation.valid) throw new Error(validation.error)
  const previewBlob = await generateModelPreview(file)
  await defaultPersistence.saveAsset(assetId, file, previewBlob)
  const nextAssets = new Map(assets)
  nextAssets.set(assetId, file)
  return {
    nextAssets,
    worldAssetEntry: { path: `assets/${file.name}`, type: 'model' },
  }
}

export interface UploadTextureResult {
  nextAssets: Map<string, Blob>
  worldAssetEntry: { path: string; type: 'texture' }
}

export interface UploadAudioResult {
  nextAssets: Map<string, Blob>
  worldAssetEntry: { path: string; type: 'audio' }
}

/**
 * Validates, persists, and returns updated assets + world asset entry for a texture upload.
 * Caller should call onAssetsChange(nextAssets) and onWorldChange({ ...world, assets: { ...world.assets, [assetId]: worldAssetEntry } }).
 */
export async function uploadTexture(
  file: File,
  assetId: string,
  assets: Map<string, Blob>
): Promise<UploadTextureResult> {
  const validation = TextureManager.validateTextureFile(file)
  if (!validation.valid) throw new Error(validation.error)
  await defaultPersistence.saveAsset(assetId, file)
  const nextAssets = new Map(assets)
  nextAssets.set(assetId, file)
  return {
    nextAssets,
    worldAssetEntry: { path: `assets/${file.name}`, type: 'texture' },
  }
}

const AUDIO_MIME_PREFIX = 'audio/'
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']

function isLikelyAudioFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith(AUDIO_MIME_PREFIX)) return true
  const lower = file.name.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Validates, persists, and returns updated assets + world asset entry for an audio upload.
 * Caller should call onAssetsChange(nextAssets) and onWorldChange({ ...world, assets: { ...world.assets, [assetId]: worldAssetEntry } }).
 */
export async function uploadAudio(
  file: File,
  assetId: string,
  assets: Map<string, Blob>
): Promise<UploadAudioResult> {
  if (!isLikelyAudioFile(file)) {
    throw new Error('Unsupported audio file. Please upload MP3, WAV, OGG, M4A, AAC, or FLAC.')
  }
  await defaultPersistence.saveAsset(assetId, file)
  const nextAssets = new Map(assets)
  nextAssets.set(assetId, file)
  return {
    nextAssets,
    worldAssetEntry: { path: `assets/${file.name}`, type: 'audio' },
  }
}
