import { useState } from 'react'
import type { RennWorld, Vec3 } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { useProjectContext } from '@/hooks/useProjectContext'
import { uploadTexture } from '@/utils/assetUpload'
import TextureDialog from '../TextureDialog'
import TextureThumbnail from '../TextureThumbnail'
import { sidebarRowStyle, sidebarLabelStyle, sectionStyle, sectionTitleStyle, secondaryButtonStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldSkySectionProps {
  world: RennWorld
  onWorldChange: (world: RennWorld) => void
  edits: WorldPanelEdits
}

export default function WorldSkySection({ world, onWorldChange, edits }: WorldSkySectionProps) {
  const { pushUndo, updateWorldSettings } = edits
  const { assets, updateAssets } = useProjectContext()
  const [skyTextureDialogOpen, setSkyTextureDialogOpen] = useState(false)

  const skyColor: Vec3 = (world.world.skyColor?.slice(0, 3) as Vec3) ?? [0.4, 0.6, 0.9]
  const skyboxId = world.world.skybox?.trim() ?? ''
  const skyColorHex = colorToHex(skyColor)

  const updateSkyColor = (newColor: Vec3) => {
    uiLogger.change('WorldPanel', 'Change sky color', { oldValue: skyColor, newValue: newColor })
    updateWorldSettings({ skyColor: newColor })
  }

  const clearSkybox = () => {
    uiLogger.change('WorldPanel', 'Clear sky dome texture', {
      oldValue: world.world.skybox,
    })
    const { skybox: _omit, ...restWorld } = world.world
    onWorldChange({ ...world, world: restWorld })
  }

  return (
    <div style={{ ...sectionStyle, marginTop: 12 }}>
      <div style={sectionTitleStyle}>Sky</div>
      <div style={sidebarRowStyle}>
        <label htmlFor="sky-color" style={sidebarLabelStyle}>
          Color
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="sky-color"
            type="color"
            value={skyColorHex}
            onChange={(e) => {
              pushUndo()
              const next = hexToColor(e.target.value)
              updateSkyColor(next)
            }}
            aria-label="Sky color"
            style={{
              width: 28,
              height: 22,
              padding: 0,
              borderRadius: 4,
              border: `1px solid ${theme.border.default}`,
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: 12, color: theme.text.muted }}>
            {skyColor.map((c) => c.toFixed(2)).join(', ')}
          </span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: theme.text.muted, margin: '10px 0 0' }}>
        Sky dome: equirectangular / 360° image (e.g. starfield). Stored as a texture asset;{' '}
        <code style={{ fontSize: 10 }}>world.world.skybox</code> is the asset id.
      </p>
      <div style={{ ...sidebarRowStyle, marginTop: 8, alignItems: 'flex-start' }}>
        <span
          style={{ ...sidebarLabelStyle, cursor: 'help' }}
          title="Equirectangular / 360° environment map id (texture asset). Shown as the sky dome behind the scene."
        >
          Dome texture
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {skyboxId ? (
              <TextureThumbnail assetId={skyboxId} blob={assets.get(skyboxId)} size={48} showName />
            ) : (
              <span style={{ fontSize: 12, color: theme.text.muted }}>None</span>
            )}
            <button
              type="button"
              onClick={() => {
                uiLogger.click('WorldPanel', 'Open sky dome texture dialog', {})
                setSkyTextureDialogOpen(true)
              }}
              style={secondaryButtonStyle}
            >
              {skyboxId ? 'Change…' : 'Choose / upload…'}
            </button>
            {skyboxId ? (
              <button
                type="button"
                onClick={() => {
                  pushUndo()
                  clearSkybox()
                }}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: `1px solid ${theme.border.destructive}`,
                  background: theme.bg.destructive,
                  color: theme.text.destructive,
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <TextureDialog
        isOpen={skyTextureDialogOpen}
        onClose={() => setSkyTextureDialogOpen(false)}
        assets={assets}
        world={world}
        allowVideo={false}
        selectedTextureId={skyboxId || undefined}
        onSelectTexture={(assetId) => {
          pushUndo()
          if (assetId) {
            uiLogger.change('WorldPanel', 'Change sky dome texture', {
              oldValue: world.world.skybox,
              newValue: assetId,
            })
            updateWorldSettings({ skybox: assetId })
          } else {
            clearSkybox()
          }
        }}
        onUploadTexture={async (file, assetId) => {
          pushUndo()
          const { nextAssets, worldAssetEntry } = await uploadTexture(file, assetId, assets)
          updateAssets(() => nextAssets)
          onWorldChange({
            ...world,
            assets: { ...(world.assets ?? {}), [assetId]: worldAssetEntry },
          })
        }}
      />
    </div>
  )
}
