import { useState } from 'react'
import type { RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { uploadModel } from '@/utils/assetUpload'
import ModelDialog from './ModelDialog'
import ModelThumbnail from './ModelThumbnail'
import { sidebarRowStyle, sidebarLabelStyle, thumbnailButtonStyle, thumbnailButtonStyleDisabled, removeButtonStyle, removeButtonStyleDisabled, secondaryButtonStyle, secondaryButtonStyleDisabled } from './sharedStyles'

export interface ModelEditorProps {
  entityId: string
  model: string | undefined
  assets: Map<string, Blob>
  world: RennWorld
  onModelChange: (model: string | undefined) => void
  onWorldChange?: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  disabled?: boolean
}

export default function ModelEditor({
  entityId,
  model,
  assets,
  world,
  onModelChange,
  onWorldChange,
  onAssetsChange,
  disabled = false,
}: ModelEditorProps) {
  const [modelDialogOpen, setModelDialogOpen] = useState(false)

  return (
    <>
      <h4 style={{ margin: '12px 0 8px' }}>3D Model</h4>
      <div style={sidebarRowStyle}>
        <label style={sidebarLabelStyle}>Model</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {model && assets.get(model) ? (
            <>
              <button
                type="button"
                onClick={() => setModelDialogOpen(true)}
                disabled={disabled}
                title="Click to change model"
                style={{ ...thumbnailButtonStyle, ...(disabled && thumbnailButtonStyleDisabled) }}
                onMouseEnter={(e) => {
                  if (!disabled) e.currentTarget.style.opacity = '0.8'
                }}
                onMouseLeave={(e) => {
                  if (!disabled) e.currentTarget.style.opacity = '1'
                }}
              >
                <ModelThumbnail assetId={model} blob={assets.get(model)} size={32} />
              </button>
              <button
                type="button"
                onClick={() => {
                  uiLogger.change('PropertyPanel', 'Remove model', { entityId, oldValue: model })
                  onModelChange(undefined)
                }}
                disabled={disabled}
                title="Remove model"
                style={{ ...removeButtonStyle, ...(disabled && removeButtonStyleDisabled) }}
              >
                🗑️
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setModelDialogOpen(true)}
              disabled={disabled}
              style={{ ...secondaryButtonStyle, ...(disabled && secondaryButtonStyleDisabled) }}
              onMouseEnter={(e) => {
                if (!disabled) e.currentTarget.style.background = '#222'
              }}
              onMouseLeave={(e) => {
                if (!disabled) e.currentTarget.style.background = '#1a1a1a'
              }}
            >
              Add Model
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#666', marginTop: 4, paddingLeft: 8 }}>
        Visual model (physics uses shape)
      </div>

      <ModelDialog
        isOpen={modelDialogOpen}
        onClose={() => setModelDialogOpen(false)}
        assets={assets}
        world={world}
        selectedModelId={model}
        onSelectModel={(assetId) => {
          uiLogger.change('PropertyPanel', 'Change model', { entityId, oldValue: model, newValue: assetId })
          onModelChange(assetId)
        }}
        onUploadModel={async (file: File, assetId: string) => {
          const { nextAssets, worldAssetEntry } = await uploadModel(file, assetId, assets)
          onAssetsChange?.(nextAssets)
          onWorldChange?.({ ...world, assets: { ...world.assets, [assetId]: worldAssetEntry } })
        }}
      />
    </>
  )
}
