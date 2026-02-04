import { useState, useRef, useCallback, useEffect } from 'react'
import type { RennWorld } from '@/types/world'
import { ModelManager } from '@/utils/modelManager'
import { generateModelPreview } from '@/utils/modelPreview'
import Modal from './Modal'
import ModelThumbnail from './ModelThumbnail'

export interface ModelDialogProps {
  isOpen: boolean
  onClose: () => void
  assets: Map<string, Blob>
  world: RennWorld
  selectedModelId?: string
  onSelectModel: (assetId: string | undefined) => void
  onUploadModel: (file: File, assetId: string) => Promise<void>
}

export default function ModelDialog({
  isOpen,
  onClose,
  assets,
  world,
  selectedModelId,
  onSelectModel,
  onUploadModel,
}: ModelDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{ file: File; assetId: string } | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const modelAssets = ModelManager.getModelAssets(assets)
  const filteredModels = modelAssets.filter(({ id }) =>
    id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    const modelFile = files.find((f) => {
      const validation = ModelManager.validateModelFile(f)
      return validation.valid
    })
    
    if (modelFile) {
      const validation = ModelManager.validateModelFile(modelFile)
      if (validation.valid) {
        const assetId = ModelManager.generateAssetId(modelFile.name)
        setUploadPreview({ file: modelFile, assetId })
      } else {
        alert(validation.error)
      }
    }
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    const modelFile = Array.from(files).find((f) => {
      const validation = ModelManager.validateModelFile(f)
      return validation.valid
    })
    
    if (modelFile) {
      const validation = ModelManager.validateModelFile(modelFile)
      if (validation.valid) {
        const assetId = ModelManager.generateAssetId(modelFile.name)
        setUploadPreview({ file: modelFile, assetId })
      } else {
        alert(validation.error)
      }
    }
    e.target.value = ''
  }, [])

  const handleConfirmUpload = useCallback(async () => {
    if (!uploadPreview) return

    try {
      await onUploadModel(uploadPreview.file, uploadPreview.assetId)
      onSelectModel(uploadPreview.assetId)
      setUploadPreview(null)
      onClose()
    } catch (error) {
      console.error('Failed to upload model:', error)
      alert('Failed to upload model. Please try again.')
    }
  }, [uploadPreview, onUploadModel, onSelectModel, onClose])

  useEffect(() => {
    let cancelled = false
    let url: string | null = null

    if (!uploadPreview) {
      setUploadPreviewUrl(null)
      setIsGeneratingPreview(false)
      return
    }

    setIsGeneratingPreview(true)
    generateModelPreview(uploadPreview.file).then((previewBlob) => {
      if (cancelled) return
      if (!previewBlob) {
        setUploadPreviewUrl(null)
        setIsGeneratingPreview(false)
        return
      }
      url = URL.createObjectURL(previewBlob)
      setUploadPreviewUrl(url)
      setIsGeneratingPreview(false)
    }).catch((error) => {
      console.error('Failed to generate preview:', error)
      setUploadPreviewUrl(null)
      setIsGeneratingPreview(false)
    })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [uploadPreview])

  const handleSelectExisting = useCallback((assetId: string) => {
    onSelectModel(assetId)
    onClose()
  }, [onSelectModel, onClose])

  const handleRemoveModel = useCallback(() => {
    onSelectModel(undefined)
    onClose()
  }, [onSelectModel, onClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select 3D Model"
      width={800}
      height={600}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
        {/* Search bar */}
        <div>
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              background: '#1a1a1a',
              border: '1px solid #2f3545',
              color: '#e6e9f2',
              fontSize: 14,
            }}
          />
        </div>

        {/* Main content area */}
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Left: Model grid */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#e6e9f2' }}>
              Existing Models ({filteredModels.length})
            </h3>
            {filteredModels.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9aa4b2',
                  fontSize: 14,
                }}
              >
                {searchQuery ? 'No models match your search' : 'No models available'}
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gap: 12,
                  padding: '8px 0',
                }}
              >
                {filteredModels.map(({ id, blob }) => (
                  <div
                    key={id}
                    onClick={() => handleSelectExisting(id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: 8,
                      borderRadius: 6,
                      border: selectedModelId === id ? '2px solid #4a9eff' : '1px solid #2f3545',
                      background: selectedModelId === id ? '#1e2a3a' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedModelId !== id) {
                        e.currentTarget.style.background = '#2a2a2a'
                        e.currentTarget.style.borderColor = '#3f4f5f'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedModelId !== id) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = '#2f3545'
                      }
                    }}
                  >
                    <ModelThumbnail assetId={id} blob={blob} size={80} />
                    <span
                      style={{
                        fontSize: 11,
                        color: '#9aa4b2',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%',
                      }}
                      title={id}
                    >
                      {id}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: '#666',
                      }}
                    >
                      {ModelManager.formatFileSize(blob.size)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Upload area */}
          <div
            style={{
              width: 200,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e6e9f2' }}>
              Upload Model
            </h3>
            
            {uploadPreview ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #2f3545',
                  background: '#1a1a1a',
                }}
              >
                {uploadPreviewUrl ? (
                  <img
                    src={uploadPreviewUrl}
                    alt={uploadPreview.assetId}
                    style={{
                      width: 120,
                      height: 120,
                      objectFit: 'cover',
                      borderRadius: 4,
                      border: '1px solid #2f3545',
                    }}
                  />
                ) : (
                  <ModelThumbnail
                    assetId={uploadPreview.assetId}
                    blob={uploadPreview.file}
                    size={120}
                  />
                )}
                {isGeneratingPreview && (
                  <div style={{ fontSize: 10, color: '#666' }}>
                    Generating preview...
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#9aa4b2', wordBreak: 'break-word' }}>
                  {uploadPreview.assetId}
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>
                  {ModelManager.formatFileSize(uploadPreview.file.size)}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleConfirmUpload}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      background: '#2d4a2d',
                      border: '1px solid #4a6a4a',
                      color: '#a4d4a4',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadPreview(null)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      background: 'transparent',
                      border: '1px solid #2f3545',
                      color: '#9aa4b2',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  padding: 24,
                  borderRadius: 6,
                  border: `2px dashed ${dragActive ? '#4a9eff' : '#2f3545'}`,
                  background: dragActive ? '#1e2a3a' : '#1a1a1a',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  minHeight: 200,
                }}
                onMouseEnter={(e) => {
                  if (!dragActive) {
                    e.currentTarget.style.borderColor = '#3f4f5f'
                    e.currentTarget.style.background = '#222'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!dragActive) {
                    e.currentTarget.style.borderColor = '#2f3545'
                    e.currentTarget.style.background = '#1a1a1a'
                  }
                }}
              >
                <div style={{ fontSize: 32 }}>📤</div>
                <div style={{ fontSize: 12, color: '#9aa4b2', textAlign: 'center' }}>
                  {dragActive ? 'Drop model here' : 'Click or drag model to upload'}
                </div>
                <div style={{ fontSize: 10, color: '#666', textAlign: 'center' }}>
                  GLB only (self-contained format)
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".glb"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 16,
            borderTop: '1px solid #2f3545',
          }}
        >
          <button
            type="button"
            onClick={handleRemoveModel}
            disabled={!selectedModelId}
            style={{
              padding: '8px 16px',
              background: selectedModelId ? '#3a1b1b' : '#2a2a2a',
              border: selectedModelId ? '1px solid #6b2a2a' : '1px solid #2f3545',
              color: selectedModelId ? '#f4d6d6' : '#666',
              borderRadius: 6,
              cursor: selectedModelId ? 'pointer' : 'not-allowed',
              fontSize: 12,
            }}
          >
            Remove Model
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #2f3545',
                color: '#9aa4b2',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedModelId) {
                  handleSelectExisting(selectedModelId)
                } else {
                  onClose()
                }
              }}
              disabled={!selectedModelId && !uploadPreview}
              style={{
                padding: '8px 16px',
                background: selectedModelId || uploadPreview ? '#2d4a2d' : '#2a2a2a',
                border: selectedModelId || uploadPreview ? '1px solid #4a6a4a' : '1px solid #2f3545',
                color: selectedModelId || uploadPreview ? '#a4d4a4' : '#666',
                borderRadius: 6,
                cursor: selectedModelId || uploadPreview ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              {uploadPreview ? 'Upload & Select' : 'Select'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
