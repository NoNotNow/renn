/**
 * Utility class for texture-related operations.
 * Handles validation, ID generation, thumbnail creation, and asset filtering.
 */
export class TextureManager {
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  private static readonly ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp']
  private static readonly thumbnailUrlCache = new Map<Blob, string>()

  /**
   * Validates a texture file before upload.
   * @param file - The file to validate
   * @returns Validation result with error message if invalid
   */
  static validateTextureFile(file: File): { valid: boolean; error?: string } {
    // Check file type
    if (!this.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed types: ${this.ALLOWED_IMAGE_TYPES.join(', ')}`,
      }
    }

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${Math.round(this.MAX_FILE_SIZE / 1024 / 1024)}MB`,
      }
    }

    return { valid: true }
  }

  /**
   * Generates a unique asset ID from a filename.
   * Removes extension and sanitizes the name.
   * @param filename - The original filename
   * @returns A sanitized asset ID
   */
  static generateAssetId(filename: string): string {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
    
    // Sanitize: remove special characters, replace spaces with underscores
    const sanitized = nameWithoutExt
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
    
    // If empty after sanitization, generate a timestamp-based ID
    if (!sanitized) {
      return `texture_${Date.now()}`
    }
    
    return sanitized
  }

  /**
   * Creates an object URL for a blob thumbnail.
   * Caches URLs to avoid creating duplicates.
   * @param blob - The blob to create a URL for
   * @returns Object URL string
   */
  static createThumbnailUrl(blob: Blob): string {
    let url = this.thumbnailUrlCache.get(blob)
    if (!url) {
      url = URL.createObjectURL(blob)
      this.thumbnailUrlCache.set(blob, url)
    }
    
    return url
  }

  /**
   * Revokes a thumbnail URL to free memory.
   * @param url - The object URL to revoke
   */
  static revokeThumbnailUrl(url: string): void {
    try {
      URL.revokeObjectURL(url)
      // Remove from cache
      for (const [key, cachedUrl] of this.thumbnailUrlCache.entries()) {
        if (cachedUrl === url) {
          this.thumbnailUrlCache.delete(key)
          break
        }
      }
    } catch (error) {
      console.warn('Failed to revoke thumbnail URL:', error)
    }
  }

  /**
   * Filters assets to only include texture/image files.
   * @param assets - Map of asset IDs to Blobs
   * @returns Array of texture assets with id and blob
   */
  static getTextureAssets(assets: Map<string, Blob>): Array<{ id: string; blob: Blob }> {
    const textureAssets: Array<{ id: string; blob: Blob }> = []
    
    for (const [id, blob] of assets.entries()) {
      if (this.isImageFile(blob)) {
        textureAssets.push({ id, blob })
      }
    }
    
    return textureAssets.sort((a, b) => a.id.localeCompare(b.id))
  }

  /**
   * Checks if a blob is an image file.
   * @param blob - The blob to check
   * @returns True if the blob is an image
   */
  static isImageFile(blob: Blob): boolean {
    return blob.type.startsWith('image/')
  }

  /**
   * Formats file size for display.
   * @param bytes - File size in bytes
   * @returns Formatted string (e.g., "1.5 MB")
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Cleans up all cached thumbnail URLs.
   * Should be called when the application is closing or when clearing assets.
   */
  static cleanupThumbnailUrls(): void {
    for (const url of this.thumbnailUrlCache.values()) {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.warn('Failed to revoke thumbnail URL during cleanup:', error)
      }
    }
    this.thumbnailUrlCache.clear()
  }
}
