import * as THREE from 'three'
import type { GLTF } from './assetResolver'

export interface AssetResolverOptions {
  /** When true, {@link loadVideoTexture} is used for material maps instead of {@link loadTexture}. */
  isVideoAsset?: (assetId: string) => boolean
}

/**
 * Asset resolver that creates blob URLs for assets.
 * IMPORTANT: Call dispose() when done to revoke blob URLs and prevent memory leaks.
 */
export interface DisposableAssetResolver {
  resolve: (assetId: string) => string | null
  loadTexture: (assetId: string, loader: THREE.TextureLoader) => Promise<THREE.Texture | null>
  loadVideoTexture: (assetId: string) => Promise<THREE.VideoTexture | null>
  isVideoAsset: (assetId: string) => boolean
  loadModel: (assetId: string, loader: any) => Promise<GLTF | null>
  dispose: () => void
}

/**
 * Resolver that reads the current assets map on each resolve (e.g. SceneView `assets` prop updates).
 */
export function createAssetResolverFromGetter(
  getAssets: () => Map<string, Blob>,
  options?: AssetResolverOptions,
): DisposableAssetResolver {
  const isVideoAsset = options?.isVideoAsset ?? (() => false)
  const urlCache = new Map<string, string>()
  /** Same id may receive a new Blob instance (e.g. texture paint overwrite); revoke stale URLs. */
  const blobRefById = new Map<string, Blob>()

  const resolve = (assetId: string): string | null => {
    const assets = getAssets()
    const blob = assets.get(assetId)
    if (!blob) {
      const staleUrl = urlCache.get(assetId)
      if (staleUrl) {
        try {
          URL.revokeObjectURL(staleUrl)
        } catch {
          /* ignore */
        }
        urlCache.delete(assetId)
      }
      blobRefById.delete(assetId)
      return null
    }

    const prevBlob = blobRefById.get(assetId)
    if (prevBlob !== undefined && prevBlob !== blob) {
      const staleUrl = urlCache.get(assetId)
      if (staleUrl) {
        try {
          URL.revokeObjectURL(staleUrl)
        } catch {
          /* ignore */
        }
        urlCache.delete(assetId)
      }
    }
    blobRefById.set(assetId, blob)

    let url = urlCache.get(assetId)
    if (!url) {
      try {
        url = URL.createObjectURL(blob)
        urlCache.set(assetId, url)
      } catch (error) {
        console.error(`Failed to create object URL for asset ${assetId}:`, error)
        return null
      }
    }
    return url
  }

  const loadTexture = async (assetId: string, loader: THREE.TextureLoader): Promise<THREE.Texture | null> => {
    const blob = getAssets().get(assetId)
    if (!blob) {
      console.warn(`[AssetResolver] Texture asset not in map: ${assetId}`)
      return null
    }
    const url = resolve(assetId)
    if (!url) return null
    const blobInfo = { size: blob.size, type: blob.type || '(empty)' }
    try {
      const texture = await new Promise<THREE.Texture>((resolveTex, reject) => {
        loader.load(
          url,
          (texture) => resolveTex(texture),
          undefined,
          (error) => reject(error)
        )
      })
      return texture
    } catch (error) {
      console.error(`Failed to load texture for asset ${assetId} (blob ${blobInfo.size} bytes, type ${blobInfo.type}):`, error)
      return null
    }
  }

  const loadVideoTexture = async (assetId: string): Promise<THREE.VideoTexture | null> => {
    const blob = getAssets().get(assetId)
    if (!blob) {
      console.warn(`[AssetResolver] Video asset not in map: ${assetId}`)
      return null
    }
    const url = resolve(assetId)
    if (!url) return null
    try {
      const video = document.createElement('video')
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.crossOrigin = 'anonymous'
      video.src = url
      await new Promise<void>((res, rej) => {
        const onErr = (): void => {
          cleanup()
          rej(new Error(`video load failed for ${assetId}`))
        }
        const cleanup = (): void => {
          video.removeEventListener('loadeddata', onReady)
          video.removeEventListener('error', onErr)
        }
        const onReady = (): void => {
          cleanup()
          res()
        }
        video.addEventListener('loadeddata', onReady, { once: true })
        video.addEventListener('error', onErr, { once: true })
        video.load()
      })
      await video.play().catch(() => {
        /* autoplay may require mute; already muted */
      })
      const tex = new THREE.VideoTexture(video)
      tex.colorSpace = THREE.SRGBColorSpace
      return tex
    } catch (error) {
      console.error(`Failed to load video texture for asset ${assetId}:`, error)
      return null
    }
  }

  const loadModel = async (assetId: string, loader: any): Promise<GLTF | null> => {
    const url = resolve(assetId)
    if (!url) return null

    try {
      const gltf = await new Promise<GLTF>((resolveGltf, reject) => {
        loader.load(
          url,
          (gltf: GLTF) => resolveGltf(gltf),
          undefined,
          (error: any) => reject(error)
        )
      })
      return gltf
    } catch (error) {
      console.error(`Failed to load model for asset ${assetId}:`, error)
      return null
    }
  }

  const dispose = (): void => {
    for (const url of urlCache.values()) {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('Failed to revoke object URL:', error)
      }
    }
    urlCache.clear()
    blobRefById.clear()
  }

  return { resolve, loadTexture, loadVideoTexture, isVideoAsset, loadModel, dispose }
}

/**
 * Creates an asset resolver for a fixed map reference (tests, one-off loads).
 * Prefer {@link createAssetResolverFromGetter} when the map is replaced over time.
 */
export function createAssetResolver(
  assets: Map<string, Blob>,
  options?: AssetResolverOptions,
): DisposableAssetResolver {
  return createAssetResolverFromGetter(() => assets, options)
}
