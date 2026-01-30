/**
 * Resolves asset ID to blob URL for use in Three.js loaders.
 */
export function createAssetResolver(assets: Map<string, Blob>): (assetId: string) => string | null {
  const urlCache = new Map<string, string>()
  return (assetId: string): string | null => {
    const blob = assets.get(assetId)
    if (!blob) return null
    let url = urlCache.get(assetId)
    if (!url) {
      url = URL.createObjectURL(blob)
      urlCache.set(assetId, url)
    }
    return url
  }
}
