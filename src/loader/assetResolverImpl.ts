/**
 * Asset resolver that creates blob URLs for assets.
 * IMPORTANT: Call dispose() when done to revoke blob URLs and prevent memory leaks.
 */
export interface DisposableAssetResolver {
  resolve: (assetId: string) => string | null
  dispose: () => void
}

/**
 * Creates an asset resolver that converts blobs to object URLs.
 * Caches URLs to avoid creating duplicates.
 * 
 * @param assets - Map of asset IDs to Blob objects
 * @returns Object with resolve function and dispose cleanup
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

  return { resolve, dispose }
}

/**
 * Simple resolver function for backward compatibility.
 * WARNING: This version doesn't provide cleanup - blob URLs will leak.
 * Prefer createAssetResolver() which returns a disposable resolver.
 */
export function createSimpleAssetResolver(assets: Map<string, Blob>): (assetId: string) => string | null {
  const resolver = createAssetResolver(assets)
  return resolver.resolve
}
