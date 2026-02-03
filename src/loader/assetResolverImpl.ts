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
 * Creates an asset resolver that converts blobs to object URLs.
 * Caches URLs to avoid creating duplicates.
 * 
 * @param assets - Map of asset IDs to Blob objects
 * @returns Object with resolve function, loadTexture function, and dispose cleanup
 */
export function createAssetResolver(assets: Map<string, Blob>): DisposableAssetResolver {
  const urlCache = new Map<string, string>()

  const resolve = (assetId: string): string | null => {
    const blob = assets.get(assetId)
    if (!blob) return null
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
    const url = resolve(assetId)
    if (!url) return null
    
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
      console.error(`Failed to load texture for asset ${assetId}:`, error)
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
  }

  return { resolve, loadTexture, loadModel, dispose }
}

/**
 * Simple resolver function for backward compatibility.
 * WARNING: This version doesn't provide cleanup - blob URLs will leak.
 * Prefer createAssetResolver() which returns a disposable resolver.
 * 
 * @deprecated Use createAssetResolver() and call dispose() when done to prevent memory leaks
 */
export function createSimpleAssetResolver(assets: Map<string, Blob>): (assetId: string) => string | null {
  const resolver = createAssetResolver(assets)
  // Store resolver reference to enable cleanup if needed
  ;(createSimpleAssetResolver as any)._lastResolver = resolver
  return resolver.resolve
}

/**
 * Cleanup method for the last simple resolver created.
 * This is a workaround for the deprecated createSimpleAssetResolver.
 */
export function disposeLastSimpleResolver(): void {
  const resolver = (createSimpleAssetResolver as any)._lastResolver
  if (resolver) {
    resolver.dispose()
    ;(createSimpleAssetResolver as any)._lastResolver = null
  }
}
