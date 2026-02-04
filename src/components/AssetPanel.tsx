import { useRef } from 'react'
import type { RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { TextureManager } from '@/utils/textureManager'
import { generateModelPreview } from '@/utils/modelPreview'
import { ModelManager } from '@/utils/modelManager'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import TextureThumbnail from './TextureThumbnail'
import ModelThumbnail from './ModelThumbnail'

const persistence = createIndexedDbPersistence()

export interface AssetPanelProps {
  assets: Map<string, Blob>
  world: RennWorld
  onAssetsChange: (assets: Map<string, Blob>) => void
  onWorldChange: (world: RennWorld) => void
}

export default function AssetPanel({ assets, world, onAssetsChange, onWorldChange }: AssetPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const assetIds = Array.from(assets.keys())
  const worldAssets = world.assets ?? {}

  const handleUpload = () => {
    uiLogger.click('AssetPanel', 'Upload asset - open file dialog')
    fileInputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const fileDetails = Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type }))
    uiLogger.upload('AssetPanel', 'Upload asset files', { fileCount: files.length, files: fileDetails })
    const next = new Map(assets)
    const nextWorldAssets = { ...worldAssets }
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const id = file.name.replace(/\.[^.]+$/, '') || `asset_${Date.now()}_${i}`
      const isImage = file.type.startsWith('image')
      next.set(id, file)
      nextWorldAssets[id] = { path: `assets/${file.name}`, type: isImage ? 'texture' : 'model' }
      
      // Save to global store immediately
      try {
        const previewBlob = isImage ? null : await generateModelPreview(file)
        await persistence.saveAsset(id, file, previewBlob)
      } catch (err) {
        console.error(`Failed to save asset ${id}:`, err)
      }
    }
    onAssetsChange(next)
    onWorldChange({ ...world, assets: nextWorldAssets })
    e.target.value = ''
  }

  const handleRemove = async (id: string) => {
    // Warn user that this is a global asset
    if (!confirm('This asset is available to all projects. Delete it from the global library?')) {
      return
    }
    
    uiLogger.delete('AssetPanel', 'Remove asset', { assetId: id })
    
    // Remove from global store
    try {
      await persistence.deleteAsset(id)
    } catch (err) {
      console.error(`Failed to delete asset ${id}:`, err)
    }
    
    // Update local state
    const next = new Map(assets)
    next.delete(id)
    const nextWorldAssets = { ...worldAssets }
    delete nextWorldAssets[id]
    onAssetsChange(next)
    onWorldChange({ ...world, assets: nextWorldAssets })
  }

  return (
    <div style={{ padding: 8 }}>
      <h3 style={{ margin: '0 0 8px' }}>Assets</h3>
      <button type="button" onClick={handleUpload}>Upload</button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.glb,.gltf"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {assetIds.map((id) => {
          const blob = assets.get(id)
          if (!blob) return null
          const isImage = TextureManager.isImageFile(blob)
          const isModel = ModelManager.isModelFile(blob)
          
          return (
            <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {isModel && !isImage ? (
                <ModelThumbnail assetId={id} blob={blob} size={40} />
              ) : (
                <TextureThumbnail assetId={id} blob={blob} size={40} />
              )}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }}>{id}</span>
                <span style={{ fontSize: 10, color: '#666' }}>{TextureManager.formatFileSize(blob.size)}</span>
              </div>
              <button 
                type="button" 
                onClick={() => handleRemove(id)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  background: '#3a1b1b',
                  border: '1px solid #6b2a2a',
                  color: '#f4d6d6',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
