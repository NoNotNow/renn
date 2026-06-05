import { useState, useRef, useCallback, useEffect } from 'react'
import type { RennWorld } from '@/types/world'
import { ModelManager } from '@/utils/modelManager'
import { generateModelPreview } from '@/utils/modelPreview'
import { theme } from '@/config/theme'
import AssetPickerDialogLayout from './assetDialog/AssetPickerDialogLayout'
import ModelThumbnail from './ModelThumbnail'
import { assetDropZoneChrome, assetDropZoneHoverHandlers } from './sharedStyles'

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
  world: _world,
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
    id.toLowerCase().includes(searchQuery.toLowerCase()),
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
    const modelFile = files.find((f) => ModelManager.validateModelFile(f).valid)

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

    const modelFile = Array.from(files).find((f) => ModelManager.validateModelFile(f).valid)

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
    generateModelPreview(uploadPreview.file)
      .then((previewBlob) => {
        if (cancelled) return
        if (!previewBlob) {
          setUploadPreviewUrl(null)
          setIsGeneratingPreview(false)
          return
        }
        url = URL.createObjectURL(previewBlob)
        setUploadPreviewUrl(url)
        setIsGeneratingPreview(false)
      })
      .catch((error) => {
        console.error('Failed to generate preview:', error)
        setUploadPreviewUrl(null)
        setIsGeneratingPreview(false)
      })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [uploadPreview])

  const handleSelectExisting = useCallback(
    (assetId: string) => {
      onSelectModel(assetId)
      onClose()
    },
    [onSelectModel, onClose],
  )

  const handleRemoveModel = useCallback(() => {
    onSelectModel(undefined)
    onClose()
  }, [onSelectModel, onClose])

  const handlePrimaryAction = useCallback(() => {
    if (uploadPreview) {
      void handleConfirmUpload()
      return
    }
    if (selectedModelId) {
      handleSelectExisting(selectedModelId)
    } else {
      onClose()
    }
  }, [uploadPreview, selectedModelId, handleConfirmUpload, handleSelectExisting, onClose])

  const hasSelection = !!selectedModelId
  const primaryEnabled = hasSelection || !!uploadPreview

  return (
    <AssetPickerDialogLayout
      isOpen={isOpen}
      onClose={onClose}
      title="Select 3D Model"
      searchPlaceholder="Search models..."
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      assetList={
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
            Existing Models ({filteredModels.length})
          </h3>
          {filteredModels.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.text.muted,
                fontSize: 14,
              }}
            >
              {searchQuery ? 'No models match your search' : 'No models available'}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                gap: 12,
                padding: '8px 0',
              }}
            >
              {filteredModels.map(({ id, blob }) => {
                const isSelected = selectedModelId === id
                return (
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
                      border: isSelected
                        ? `2px solid ${theme.border.dropZoneActive}`
                        : `1px solid ${theme.border.default}`,
                      background: isSelected ? theme.bg.dropZoneActive : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = theme.bg.surface
                        e.currentTarget.style.borderColor = theme.border.dropZoneHover
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = theme.border.default
                      }
                    }}
                  >
                    <ModelThumbnail assetId={id} blob={blob} size={80} />
                    <span
                      style={{
                        fontSize: 11,
                        color: theme.text.muted,
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
                    <span style={{ fontSize: 10, color: theme.text.disabled }}>
                      {ModelManager.formatFileSize(blob.size)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      }
      uploadPanel={
        <div
          style={{
            width: 200,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 0,
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
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
                border: `1px solid ${theme.border.default}`,
                background: theme.bg.panelAlt,
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
                    border: `1px solid ${theme.border.default}`,
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
                <div style={{ fontSize: 10, color: theme.text.disabled }}>Generating preview...</div>
              )}
              <div style={{ fontSize: 11, color: theme.text.muted, wordBreak: 'break-word' }}>
                {uploadPreview.assetId}
              </div>
              <div style={{ fontSize: 10, color: theme.text.disabled }}>
                {ModelManager.formatFileSize(uploadPreview.file.size)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    background: theme.feedback.successBg,
                    border: `1px solid ${theme.feedback.successBorder}`,
                    color: theme.feedback.successText,
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
                    border: `1px solid ${theme.border.default}`,
                    color: theme.text.muted,
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
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 24,
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                ...assetDropZoneChrome(dragActive),
              }}
              {...assetDropZoneHoverHandlers(dragActive)}
            >
              <div style={{ fontSize: 32 }} aria-hidden>
                ↑
              </div>
              <div style={{ fontSize: 12, color: theme.text.muted, textAlign: 'center' }}>
                {dragActive ? 'Drop model here' : 'Click or drag model to upload'}
              </div>
              <div style={{ fontSize: 10, color: theme.text.disabled, textAlign: 'center' }}>
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
      }
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={handleRemoveModel}
            disabled={!hasSelection}
            style={{
              padding: '8px 16px',
              background: hasSelection ? theme.bg.destructive : theme.bg.surface,
              border: hasSelection
                ? `1px solid ${theme.border.destructive}`
                : `1px solid ${theme.border.default}`,
              color: hasSelection ? theme.text.destructive : theme.text.disabled,
              borderRadius: 6,
              cursor: hasSelection ? 'pointer' : 'not-allowed',
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
                border: `1px solid ${theme.border.default}`,
                color: theme.text.muted,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={!primaryEnabled}
              style={{
                padding: '8px 16px',
                background: primaryEnabled ? theme.feedback.successBg : theme.bg.surface,
                border: primaryEnabled
                  ? `1px solid ${theme.feedback.successBorder}`
                  : `1px solid ${theme.border.default}`,
                color: primaryEnabled ? theme.feedback.successText : theme.text.disabled,
                borderRadius: 6,
                cursor: primaryEnabled ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              {uploadPreview ? 'Upload & Select' : 'Select'}
            </button>
          </div>
        </div>
      }
    />
  )
}
