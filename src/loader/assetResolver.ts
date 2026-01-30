/**
 * Resolves asset ID to URL or Blob for loading textures/models.
 * Implementations: in-memory map (builder), IndexedDB (persistence), or server URLs.
 */
export type AssetResolver = (assetId: string) => Promise<string | Blob | null> | (string | Blob | null)
