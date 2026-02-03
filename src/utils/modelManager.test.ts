import { describe, it, expect } from 'vitest'
import { ModelManager } from './modelManager'

describe('ModelManager', () => {
  describe('validateModelFile', () => {
    it('should accept valid GLB file', () => {
      const file = new File([''], 'model.glb', { type: 'model/gltf-binary' })
      const result = ModelManager.validateModelFile(file)
      expect(result.valid).toBe(true)
    })

    it('should reject GLTF files with external dependencies', () => {
      const file = new File([''], 'model.gltf', { type: 'model/gltf+json' })
      const result = ModelManager.validateModelFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('external dependencies')
    })

    it('should accept GLB with application/octet-stream type', () => {
      const file = new File([''], 'model.glb', { type: 'application/octet-stream' })
      const result = ModelManager.validateModelFile(file)
      expect(result.valid).toBe(true)
    })

    it('should reject file with invalid extension', () => {
      const file = new File([''], 'model.obj', { type: 'model/obj' })
      const result = ModelManager.validateModelFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })

    it('should reject file that is too large', () => {
      const largeSize = 101 * 1024 * 1024 // 101MB
      const file = new File([new ArrayBuffer(largeSize)], 'large.glb', { type: 'model/gltf-binary' })
      const result = ModelManager.validateModelFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('File too large')
    })

    it('should accept file at size limit', () => {
      const maxSize = 100 * 1024 * 1024 // 100MB
      const file = new File([new ArrayBuffer(maxSize)], 'max.glb', { type: 'model/gltf-binary' })
      const result = ModelManager.validateModelFile(file)
      expect(result.valid).toBe(true)
    })
  })

  describe('generateAssetId', () => {
    it('should remove file extension', () => {
      const id = ModelManager.generateAssetId('my-model.glb')
      expect(id).toBe('my-model')
    })

    it('should sanitize special characters', () => {
      const id = ModelManager.generateAssetId('my model!@#$.glb')
      expect(id).toBe('my_model')
    })

    it('should replace spaces with underscores', () => {
      const id = ModelManager.generateAssetId('my model name.glb')
      expect(id).toBe('my_model_name')
    })

    it('should collapse multiple underscores', () => {
      const id = ModelManager.generateAssetId('my___model.glb')
      expect(id).toBe('my_model')
    })

    it('should generate timestamp-based ID for empty names', () => {
      const id = ModelManager.generateAssetId('!@#$.glb')
      expect(id).toMatch(/^model_\d+$/)
    })

    it('should handle files without extensions', () => {
      const id = ModelManager.generateAssetId('model')
      expect(id).toBe('model')
    })
  })

  describe('isModelFile', () => {
    it('should identify GLB files', () => {
      const blob = new Blob([''], { type: 'model/gltf-binary' })
      expect(ModelManager.isModelFile(blob)).toBe(true)
    })

    it('should not identify GLTF files (not supported)', () => {
      const blob = new Blob([''], { type: 'model/gltf+json' })
      expect(ModelManager.isModelFile(blob)).toBe(false)
    })

    it('should identify octet-stream files', () => {
      const blob = new Blob([''], { type: 'application/octet-stream' })
      expect(ModelManager.isModelFile(blob)).toBe(true)
    })

    it('should accept empty type', () => {
      const blob = new Blob([''], { type: '' })
      expect(ModelManager.isModelFile(blob)).toBe(true)
    })

    it('should reject image files', () => {
      const blob = new Blob([''], { type: 'image/png' })
      expect(ModelManager.isModelFile(blob)).toBe(false)
    })
  })

  describe('getModelAssets', () => {
    it('should filter model files from assets', () => {
      const assets = new Map<string, Blob>([
        ['model1', new Blob([''], { type: 'model/gltf-binary' })],
        ['texture', new Blob([''], { type: 'image/png' })],
        ['model2', new Blob([''], { type: 'application/octet-stream' })],
      ])
      
      const models = ModelManager.getModelAssets(assets)
      expect(models).toHaveLength(2)
      expect(models.map(m => m.id)).toEqual(['model1', 'model2'])
    })

    it('should sort models alphabetically', () => {
      const assets = new Map<string, Blob>([
        ['zebra', new Blob([''], { type: 'model/gltf-binary' })],
        ['apple', new Blob([''], { type: 'model/gltf-binary' })],
        ['banana', new Blob([''], { type: 'model/gltf-binary' })],
      ])
      
      const models = ModelManager.getModelAssets(assets)
      expect(models.map(m => m.id)).toEqual(['apple', 'banana', 'zebra'])
    })

    it('should return empty array for no models', () => {
      const assets = new Map<string, Blob>([
        ['texture', new Blob([''], { type: 'image/png' })],
      ])
      
      const models = ModelManager.getModelAssets(assets)
      expect(models).toHaveLength(0)
    })

    it('should identify models by file extension in ID', () => {
      const assets = new Map<string, Blob>([
        ['model.glb', new Blob([''], { type: '' })],
        ['another.glb', new Blob([''], { type: '' })],
      ])
      
      const models = ModelManager.getModelAssets(assets)
      expect(models).toHaveLength(2)
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(ModelManager.formatFileSize(500)).toBe('500 B')
    })

    it('should format kilobytes', () => {
      expect(ModelManager.formatFileSize(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(ModelManager.formatFileSize(1572864)).toBe('1.5 MB')
    })

    it('should handle zero', () => {
      expect(ModelManager.formatFileSize(0)).toBe('0 B')
    })

    it('should handle large files', () => {
      expect(ModelManager.formatFileSize(100 * 1024 * 1024)).toBe('100.0 MB')
    })
  })
})
