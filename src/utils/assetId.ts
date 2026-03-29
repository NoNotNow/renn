/**
 * Shared asset ID generation from filenames (models, textures, etc.).
 */

/**
 * Generates an asset ID from a filename: strips extension, sanitizes characters.
 * @param filename - Original filename
 * @param emptyFallbackPrefix - Prefix for timestamp ID when sanitization yields empty (e.g. "model", "texture")
 */
export function generateAssetIdFromFilename(filename: string, emptyFallbackPrefix: string): string {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
  const sanitized = nameWithoutExt
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!sanitized) {
    return `${emptyFallbackPrefix}_${Date.now()}`
  }
  return sanitized
}
