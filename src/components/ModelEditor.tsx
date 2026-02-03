import { useState } from 'react'
import type { RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { ModelManager } from '@/utils/modelManager'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import ModelDialog from './ModelDialog'
import ModelThumbnail from './ModelThumbnail'
import { sidebarRowStyle, sidebarLabelStyle } from './sharedStyles'

const persistence = createIndexedDbPersistence()

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
                style={{
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  transition: 'opacity 0.15s ease',
                  opacity: disabled ? 0.5 : 1,
                }}
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
                style={{
                  padding: '6px 8px',
                  background: disabled ? '#2a2a2a' : '#3a1b1b',
                  border: disabled ? '1px solid #2f3545' : '1px solid #6b2a2a',
                  color: disabled ? '#666' : '#f4d6d6',
                  borderRadius: 6,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 28,
                }}
              >
                🗑️
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setModelDialogOpen(true)}
              disabled={disabled}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: disabled ? '#2a2a2a' : '#1a1a1a',
                border: '1px solid #2f3545',
                color: disabled ? '#666' : '#e6e9f2',
                borderRadius: 6,
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 12,
                transition: 'background-color 0.15s ease',
              }}
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
          // Validate using ModelManager
          const validation = ModelManager.validateModelFile(file)
          if (!validation.valid) {
            throw new Error(validation.error)
          }
          
          // Save to global store
          await persistence.saveAsset(assetId, file)
          
          // Update in-memory assets Map (this makes it appear in the Asset Panel)
          const nextAssets = new Map(assets)
          nextAssets.set(assetId, file)
          onAssetsChange?.(nextAssets)
          
          // Update world assets reference
          const nextWorldAssets = { ...world.assets, [assetId]: { path: `assets/${file.name}`, type: 'model' } }
          onWorldChange?.({ ...world, assets: nextWorldAssets })
        }}
      />
    </>
  )
}
