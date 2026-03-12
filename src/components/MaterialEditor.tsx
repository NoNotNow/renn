import { useState } from 'react'
import type { Vec3, MaterialRef, RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { clampUnit } from '@/utils/numberUtils'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { uploadTexture } from '@/utils/assetUpload'
import NumberInput from './form/NumberInput'
import SelectInput from './form/SelectInput'
import Vec3Field from './Vec3Field'
import TextureDialog from './TextureDialog'
import TextureThumbnail from './TextureThumbnail'
import { sidebarRowStyle, sidebarLabelStyle, thumbnailButtonStyle, thumbnailButtonStyleDisabled, removeButtonStyle, removeButtonStyleDisabled, secondaryButtonStyle, secondaryButtonStyleDisabled } from './sharedStyles'

export interface MaterialEditorProps {
  entityId: string
  material: MaterialRef | undefined
  assets: Map<string, Blob>
  world: RennWorld
  onMaterialChange: (material: MaterialRef) => void
  onWorldChange?: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  disabled?: boolean
}

export default function MaterialEditor({
  entityId,
  material,
  assets,
  world,
  onMaterialChange,
  onWorldChange,
  onAssetsChange,
  disabled = false,
}: MaterialEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [textureDialogOpen, setTextureDialogOpen] = useState(false)
  
  const color: Vec3 = (material?.color ?? [0.7, 0.7, 0.7]).slice(0, 3) as Vec3
  const roughness = material?.roughness ?? 0.5
  const metalness = material?.metalness ?? 0
  const opacity = material?.opacity ?? 1
  const colorHex = colorToHex(color)
  
  const hasTexture = !!material?.map
  const mapRepeat = material?.mapRepeat ?? [1, 1, 0]
  const mapWrapS = material?.mapWrapS ?? 'repeat'
  const mapWrapT = material?.mapWrapT ?? 'repeat'
  const mapOffset = material?.mapOffset ?? [0, 0, 0]
  const mapRotation = material?.mapRotation ?? 0

  return (
    <>
      <h4 style={{ margin: '12px 0 8px' }}>Material</h4>
      <div style={sidebarRowStyle}>
        <label htmlFor={`${entityId}-material-color`} style={sidebarLabelStyle}>
          Color
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id={`${entityId}-material-color`}
            type="color"
            value={colorHex}
            onChange={(e) => {
              const next = hexToColor(e.target.value)
              uiLogger.change('PropertyPanel', 'Change color', { entityId, oldValue: color, newValue: next })
              onMaterialChange({ ...material, color: next })
            }}
            aria-label="Material color"
            style={{
              width: 28,
              height: 22,
              padding: 0,
              borderRadius: 4,
              border: '1px solid #2f3545',
              background: 'transparent',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            disabled={disabled}
          />
          <span style={{ fontSize: 12, color: '#9aa4b2' }}>
            {color.map((c) => clampUnit(c).toFixed(2)).join(', ')}
          </span>
        </div>
      </div>
      
      <div style={sidebarRowStyle}>
        <label style={sidebarLabelStyle}>Texture</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {material?.map && assets.get(material.map) ? (
            <>
              <button
                type="button"
                onClick={() => setTextureDialogOpen(true)}
                disabled={disabled}
                title="Click to change texture"
                style={{ ...thumbnailButtonStyle, ...(disabled && thumbnailButtonStyleDisabled) }}
                onMouseEnter={(e) => {
                  if (!disabled) e.currentTarget.style.opacity = '0.8'
                }}
                onMouseLeave={(e) => {
                  if (!disabled) e.currentTarget.style.opacity = '1'
                }}
              >
                <TextureThumbnail assetId={material.map} blob={assets.get(material.map)} size={32} />
              </button>
              <button
                type="button"
                onClick={() => {
                  uiLogger.change('PropertyPanel', 'Remove texture', { entityId, oldValue: material?.map })
                  onMaterialChange({ ...material, map: undefined })
                }}
                disabled={disabled}
                title="Remove texture"
                style={{ ...removeButtonStyle, ...(disabled && removeButtonStyleDisabled) }}
              >
                🗑️
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setTextureDialogOpen(true)}
              disabled={disabled}
              style={{ ...secondaryButtonStyle, ...(disabled && secondaryButtonStyleDisabled) }}
              onMouseEnter={(e) => {
                if (!disabled) e.currentTarget.style.background = '#222'
              }}
              onMouseLeave={(e) => {
                if (!disabled) e.currentTarget.style.background = '#1a1a1a'
              }}
            >
              Add Texture
            </button>
          )}
        </div>
      </div>

      <TextureDialog
        isOpen={textureDialogOpen}
        onClose={() => setTextureDialogOpen(false)}
        assets={assets}
        world={world}
        selectedTextureId={material?.map}
        onSelectTexture={(assetId) => {
          uiLogger.change('PropertyPanel', 'Change texture', { entityId, oldValue: material?.map, newValue: assetId })
          onMaterialChange({ ...material, map: assetId })
        }}
        onUploadTexture={async (file: File, assetId: string) => {
          const { nextAssets, worldAssetEntry } = await uploadTexture(file, assetId, assets)
          onAssetsChange?.(nextAssets)
          onWorldChange?.({ ...world, assets: { ...world.assets, [assetId]: worldAssetEntry } })
        }}
      />
      
      {hasTexture && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: 'transparent',
              border: '1px solid #2f3545',
              color: '#9aa4b2',
              borderRadius: 4,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 11,
              textAlign: 'left',
            }}
            disabled={disabled}
          >
            {showAdvanced ? '▼' : '▶'} Advanced Texture Settings
          </button>
          
          {showAdvanced && (
            <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: '2px solid #2f3545' }}>
              <Vec3Field
                label="UV Repeat"
                value={mapRepeat}
                onChange={(v) => {
                  uiLogger.change('PropertyPanel', 'Change texture repeat', { entityId, oldValue: mapRepeat, newValue: v })
                  onMaterialChange({ ...material, mapRepeat: v })
                }}
                min={0.1}
                max={10}
                step={0.1}
                axisLabels={['U', 'V', '']}
                idPrefix={`${entityId}-mapRepeat`}
                disabled={disabled}
              />
              
              <SelectInput
                id={`${entityId}-mapWrapS`}
                label="Wrap S"
                value={mapWrapS}
                onChange={(value) => {
                  uiLogger.change('PropertyPanel', 'Change texture wrap S', { entityId, oldValue: mapWrapS, newValue: value })
                  onMaterialChange({ ...material, mapWrapS: value as 'repeat' | 'clampToEdge' | 'mirroredRepeat' })
                }}
                options={[
                  { value: 'repeat', label: 'Repeat' },
                  { value: 'clampToEdge', label: 'Clamp to Edge' },
                  { value: 'mirroredRepeat', label: 'Mirrored Repeat' },
                ]}
                disabled={disabled}
                entityId={entityId}
                propertyName="mapWrapS"
              />
              
              <SelectInput
                id={`${entityId}-mapWrapT`}
                label="Wrap T"
                value={mapWrapT}
                onChange={(value) => {
                  uiLogger.change('PropertyPanel', 'Change texture wrap T', { entityId, oldValue: mapWrapT, newValue: value })
                  onMaterialChange({ ...material, mapWrapT: value as 'repeat' | 'clampToEdge' | 'mirroredRepeat' })
                }}
                options={[
                  { value: 'repeat', label: 'Repeat' },
                  { value: 'clampToEdge', label: 'Clamp to Edge' },
                  { value: 'mirroredRepeat', label: 'Mirrored Repeat' },
                ]}
                disabled={disabled}
                entityId={entityId}
                propertyName="mapWrapT"
              />
              
              <Vec3Field
                label="UV Offset"
                value={mapOffset}
                onChange={(v) => {
                  uiLogger.change('PropertyPanel', 'Change texture offset', { entityId, oldValue: mapOffset, newValue: v })
                  onMaterialChange({ ...material, mapOffset: v })
                }}
                min={-1}
                max={1}
                step={0.01}
                axisLabels={['U', 'V', '']}
                idPrefix={`${entityId}-mapOffset`}
                disabled={disabled}
              />
              
              <NumberInput
                id={`${entityId}-mapRotation`}
                label="Rotation (degrees)"
                value={(mapRotation * 180) / Math.PI}
                onChange={(value) => {
                  const radians = (value * Math.PI) / 180
                  uiLogger.change('PropertyPanel', 'Change texture rotation', { entityId, oldValue: mapRotation, newValue: radians })
                  onMaterialChange({ ...material, mapRotation: radians })
                }}
                min={0}
                max={360}
                step={1}
                defaultValue={0}
                disabled={disabled}
                entityId={entityId}
                propertyName="mapRotation"
              />
            </div>
          )}
        </div>
      )}
      
      <NumberInput
        id={`${entityId}-opacity`}
        label="Opacity"
        value={opacity}
        onChange={(value) => {
          uiLogger.change('PropertyPanel', 'Change opacity', { entityId, oldValue: opacity, newValue: value })
          onMaterialChange({ ...material, opacity: value })
        }}
        min={0}
        max={1}
        step={0.05}
        defaultValue={1}
        disabled={disabled}
        entityId={entityId}
        propertyName="opacity"
      />
      <NumberInput
        id={`${entityId}-roughness`}
        label="Roughness"
        value={roughness}
        onChange={(value) => onMaterialChange({ ...material, roughness: value })}
        min={0}
        max={1}
        step={0.1}
        defaultValue={0.5}
        disabled={disabled}
        entityId={entityId}
        propertyName="roughness"
      />
      <NumberInput
        id={`${entityId}-metalness`}
        label="Metalness"
        value={metalness}
        onChange={(value) => onMaterialChange({ ...material, metalness: value })}
        min={0}
        max={1}
        step={0.1}
        defaultValue={0}
        disabled={disabled}
        entityId={entityId}
        propertyName="metalness"
      />
    </>
  )
}
