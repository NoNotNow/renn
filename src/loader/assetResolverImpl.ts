import * as THREE from 'three'
import type { GLTF } from './assetResolver'

/**
 * Asset resolver that creates blob URLs for assets.
 * IMPORTANT: Call dispose() when done to revoke blob URLs and prevent memory leaks.
 */
export interface DisposableAssetResolver {
  resolve: (assetId: string) => string | null
  loadTexture: (assetId: string, loader: THREE.TextureLoader) => Promise<THREE.Texture | null>
  loadModel: (assetId: string, loader: any) => Promise<GLTF | null>
  dispose: () => void
}

/**
 * Resolver that reads the current assets map on each resolve (e.g. SceneView `assets` prop updates).
 */
export function createAssetResolverFromGetter(getAssets: () => Map<string, Blob>): DisposableAssetResolver {
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
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => resolve(texture),
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

  const loadModel = async (assetId: string, loader: any): Promise<GLTF | null> => {
    const url = resolve(assetId)
    if (!url) return null
    
    try {
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.load(
          url,
          (gltf: GLTF) => resolve(gltf),
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

  return { resolve, loadTexture, loadModel, dispose }
}

/**
 * Creates an asset resolver for a fixed map reference (tests, one-off loads).
 * Prefer {@link createAssetResolverFromGetter} when the map is replaced over time.
 */
export function createAssetResolver(assets: Map<string, Blob>): DisposableAssetResolver {
  return createAssetResolverFromGetter(() => assets)
}
