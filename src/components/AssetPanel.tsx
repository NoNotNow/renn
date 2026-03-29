import { useRef, useState } from 'react'
import type { RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import CopyableArea from './CopyableArea'
import { TextureManager } from '@/utils/textureManager'
import { generateModelPreview } from '@/utils/modelPreview'
import { ModelManager } from '@/utils/modelManager'
import { defaultPersistence } from '@/persistence/indexedDb'
import TextureThumbnail from './TextureThumbnail'
import ModelThumbnail from './ModelThumbnail'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { buildAssetsZipBlob, resolveAssetFilename, triggerBlobDownload } from '@/utils/assetExport'

export interface AssetPanelProps {
  assets: Map<string, Blob>
  world: RennWorld
  onAssetsChange: (assets: Map<string, Blob>) => void
  onWorldChange: (world: RennWorld) => void
}

export default function AssetPanel({ assets, world, onAssetsChange, onWorldChange }: AssetPanelProps) {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isExporting, setIsExporting] = useState(false)

  const assetIds = Array.from(assets.keys())
  const worldAssets = world.assets ?? {}

  const handleUpload = () => {
    uiLogger.click('AssetPanel', 'Upload asset - open file dialog')
    fileInputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    pushUndo()
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
        await defaultPersistence.saveAsset(id, file, previewBlob)
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
    pushUndo()

    // Remove from global store
    try {
      await defaultPersistence.deleteAsset(id)
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

  const handleDownloadAll = async () => {
    uiLogger.click('AssetPanel', 'Download all assets', { count: assetIds.length })
    setIsExporting(true)
    try {
      const zip = await buildAssetsZipBlob(assets, worldAssets)
      triggerBlobDownload(zip, 'assets.zip')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadOne = (id: string, blob: Blob) => {
    uiLogger.click('AssetPanel', 'Download asset', { assetId: id })
    const filename = resolveAssetFilename(id, blob, worldAssets[id])
    triggerBlobDownload(blob, filename)
  }

  const copyPayload = { assetIds, worldAssets }

  return (
    <CopyableArea copyPayload={copyPayload}>
      <div style={{ padding: 8 }}>
        <h3 style={{ margin: '0 0 8px' }}>Assets</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={handleUpload}>Upload</button>
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={assetIds.length === 0 || isExporting}
          >
            {isExporting ? 'Zipping…' : 'Download all'}
          </button>
        </div>
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
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => handleDownloadOne(id, blob)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    background: '#1b2a3a',
                    border: '1px solid #2a4a6b',
                    color: '#d6eaf4',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Download
                </button>
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
              </div>
            </li>
          )
        })}
        </ul>
      </div>
    </CopyableArea>
  )
}
