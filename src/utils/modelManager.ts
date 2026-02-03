/**
 * Utility class for 3D model-related operations.
 * Handles validation, ID generation, and asset filtering for GLB/GLTF models.
 */
export class ModelManager {
  private static readonly MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
  private static readonly ALLOWED_MODEL_TYPES = [
    'model/gltf-binary',
    'application/octet-stream',
  ]
  private static readonly ALLOWED_EXTENSIONS = ['.glb']
  private static readonly DISCOURAGED_EXTENSIONS = ['.gltf']

  /**
   * Validates a model file before upload.
   * @param file - The file to validate
   * @returns Validation result with error message if invalid
   */
  static validateModelFile(file: File): { valid: boolean; error?: string; warning?: string } {
    // Check for discouraged extensions (GLTF with external dependencies)
    const hasDiscouragedExtension = this.DISCOURAGED_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )
    if (hasDiscouragedExtension) {
      return {
        valid: false,
        error: `GLTF files with external dependencies are not supported. Please use GLB format (self-contained binary format). You can convert GLTF to GLB using tools like Blender or online converters.`,
      }
    }

    // Check file extension
    const hasValidExtension = this.ALLOWED_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )
    if (!hasValidExtension) {
      return {
        valid: false,
        error: `Invalid file type. Only GLB format is supported.`,
      }
    }

    // Check file type (MIME type)
    if (!this.ALLOWED_MODEL_TYPES.includes(file.type) && !hasValidExtension) {
      return {
        valid: false,
        error: `Invalid file type. Only GLB format is supported.`,
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
      return `model_${Date.now()}`
    }
    
    return sanitized
  }

  /**
   * Checks if a blob is a 3D model file.
   * @param blob - The blob to check
   * @returns True if the blob is a 3D model
   */
  static isModelFile(blob: Blob): boolean {
    return this.ALLOWED_MODEL_TYPES.includes(blob.type) || blob.type === ''
  }

  /**
   * Filters assets to only include 3D model files.
   * @param assets - Map of asset IDs to Blobs
   * @returns Array of model assets with id and blob
   */
  static getModelAssets(assets: Map<string, Blob>): Array<{ id: string; blob: Blob }> {
    const modelAssets: Array<{ id: string; blob: Blob }> = []
    
    for (const [id, blob] of assets.entries()) {
      // Check by MIME type or by file extension in the ID
      if (
        this.isModelFile(blob) ||
        this.ALLOWED_EXTENSIONS.some((ext) => id.toLowerCase().endsWith(ext))
      ) {
        modelAssets.push({ id, blob })
      }
    }
    
    return modelAssets.sort((a, b) => a.id.localeCompare(b.id))
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
}
