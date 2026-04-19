import { useState } from 'react'
import type { Vec3, MaterialRef, RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { clampUnit } from '@/utils/numberUtils'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { saveVideoMapBlob, uploadTexture } from '@/utils/assetUpload'
import NumberInput from './form/NumberInput'
import SelectInput from './form/SelectInput'
import Vec3Field from './Vec3Field'
import TextureDialog from './TextureDialog'
import { MapMediaThumbnail } from './VideoThumbnail'
import {
  sidebarRowStyle,
  sidebarLabelStyle,
  thumbnailButtonStyle,
  thumbnailButtonStyleDisabled,
  entityPanelIconButtonStyle,
  removeButtonStyle,
  removeButtonStyleDisabled,
  secondaryPickIconButtonStyle,
  secondaryPickIconButtonHoverHandlers,
} from './sharedStyles'
import { EntityPanelIcons } from './EntityPanelIcons'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { theme } from '@/config/theme'

export interface MaterialEditorProps {
  entityId: string
  material: MaterialRef | undefined
  assets: Map<string, Blob>
  world: RennWorld
  onMaterialChange: (material: MaterialRef) => void
  onWorldChange?: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  disabled?: boolean
  /** When set, shows a control to open the layered texture compositor. */
  onOpenTextureStudio?: () => void | Promise<void>
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
  onOpenTextureStudio,
}: MaterialEditorProps) {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()
  const vec3Undo =
    undo != null
      ? {
          onScrubStart: () => undo.notifyScrubStart(),
          onScrubEnd: (hadScrub: boolean) => undo.notifyScrubEnd(hadScrub),
          onBeforeCommit: pushUndo,
        }
      : {}

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
              pushUndo()
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
              border: `1px solid ${theme.border.default}`,
              background: 'transparent',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            disabled={disabled}
          />
          <span style={{ fontSize: 12, color: theme.text.muted }}>
            {color.map((c) => clampUnit(c).toFixed(2)).join(', ')}
          </span>
        </div>
      </div>
      
      <div style={sidebarRowStyle}>
        <label
          style={{ ...sidebarLabelStyle, cursor: 'help' }}
          title="Optional color map (image or video) multiplied with the base color. Uses the project asset id."
        >
          Texture
        </label>
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
                <MapMediaThumbnail assetId={material.map} blob={assets.get(material.map)} size={32} />
              </button>
              <button
                type="button"
                onClick={() => {
                  pushUndo()
                  uiLogger.change('PropertyPanel', 'Remove texture', { entityId, oldValue: material?.map })
                  onMaterialChange({ ...material, map: undefined })
                }}
                disabled={disabled}
                title="Remove texture"
                aria-label="Remove texture"
                style={{ ...removeButtonStyle, ...(disabled && removeButtonStyleDisabled), ...entityPanelIconButtonStyle }}
              >
                {EntityPanelIcons.trash}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setTextureDialogOpen(true)}
              disabled={disabled}
              title="Add texture"
              aria-label="Add texture"
              style={secondaryPickIconButtonStyle(disabled)}
              {...secondaryPickIconButtonHoverHandlers(disabled)}
            >
              {EntityPanelIcons.image}
            </button>
          )}
        </div>
      </div>

      {onOpenTextureStudio ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              void onOpenTextureStudio()
            }}
            disabled={disabled}
            aria-label="Open texture maker"
            data-testid="material-open-texture-maker"
            style={{
              ...entityPanelIconButtonStyle,
              width: '100%',
              justifyContent: 'center',
              padding: '6px 8px',
              fontSize: 11,
              background: theme.button.primary,
              border: `1px solid ${theme.button.primaryBorder}`,
              color: theme.text.primary,
              ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' as const } : {}),
            }}
          >
            Texture maker…
          </button>
        </div>
      ) : null}

      <TextureDialog
        isOpen={textureDialogOpen}
        onClose={() => setTextureDialogOpen(false)}
        assets={assets}
        world={world}
        selectedTextureId={material?.map}
        allowVideo
        onSelectTexture={(assetId) => {
          pushUndo()
          uiLogger.change('PropertyPanel', 'Change texture', { entityId, oldValue: material?.map, newValue: assetId })
          onMaterialChange({ ...material, map: assetId })
        }}
        onUploadTexture={async (file: File, assetId: string) => {
          pushUndo()
          const { nextAssets, worldAssetEntry } = await uploadTexture(file, assetId, assets)
          onAssetsChange?.(nextAssets)
          onWorldChange?.({ ...world, assets: { ...world.assets, [assetId]: worldAssetEntry } })
        }}
        onCommitConvertedVideo={async (blob: Blob, assetId: string) => {
          pushUndo()
          const { nextAssets, worldAssetEntry } = await saveVideoMapBlob(blob, assetId, assets)
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
              border: `1px solid ${theme.border.default}`,
              color: theme.text.muted,
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
            <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: `2px solid ${theme.border.default}` }}>
              <Vec3Field
                label="UV Repeat"
                labelTitle="How many times the texture repeats along U and V on the surface. The third value is reserved for advanced mapping."
                value={mapRepeat}
                onChange={(v) => {
                  uiLogger.change('PropertyPanel', 'Change texture repeat', { entityId, oldValue: mapRepeat, newValue: v })
                  onMaterialChange({ ...material, mapRepeat: v })
                }}
                min={0.1}
                step={0.1}
                axisLabels={['U', 'V', '']}
                idPrefix={`${entityId}-mapRepeat`}
                disabled={disabled}
                {...vec3Undo}
              />
              
              <SelectInput
                id={`${entityId}-mapWrapS`}
                label="Wrap S"
                labelTitle="Horizontal texture wrap mode: repeat tiles the map; clamp pins edge texels; mirrored repeat tiles with flipped copies."
                value={mapWrapS}
                onBeforeCommit={pushUndo}
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
                labelTitle="Vertical texture wrap mode (same options as Wrap S, along the V direction)."
                value={mapWrapT}
                onBeforeCommit={pushUndo}
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
                labelTitle="Shifts the texture in UV space before repeat is applied (typically U and V in 0–1 range)."
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
                {...vec3Undo}
              />
              
              <NumberInput onBeforeCommit={pushUndo}
                id={`${entityId}-mapRotation`}
                label="Rotation (degrees)"
                labelTitle="Rotates the UV coordinates around the surface origin before sampling the map."
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
      
      <NumberInput onBeforeCommit={pushUndo}
        id={`${entityId}-opacity`}
        label="Opacity"
        labelTitle="Surface alpha: 1 is fully opaque, 0 is fully transparent (rendering depends on depth/material settings)."
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
      <NumberInput onBeforeCommit={pushUndo}
        id={`${entityId}-roughness`}
        label="Roughness"
        labelTitle="Micro-surface scatter: 0 is mirror-like, 1 is fully diffuse (PBR roughness)."
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
      <NumberInput onBeforeCommit={pushUndo}
        id={`${entityId}-metalness`}
        label="Metalness"
        labelTitle="0 = dielectric (plastic, paint), 1 = metal (colored by base color and environment reflections)."
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
