import type { RennWorld, FogSettings, Vec3 } from '@/types/world'
import { DEFAULT_FOG } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import NumberInput from '../form/NumberInput'
import { sidebarRowStyle, sidebarLabelStyle, sectionStyle, sectionTitleStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldFogSectionProps {
  world: RennWorld
  edits: WorldPanelEdits
}

export default function WorldFogSection({ world, edits }: WorldFogSectionProps) {
  const { pushUndo, updateWorldSettings } = edits

  const fogRaw = world.world.fog
  const fogEnabled = fogRaw !== undefined && fogRaw !== false
  const fogValues: FogSettings =
    typeof fogRaw === 'object' && fogRaw !== null ? fogRaw : { ...DEFAULT_FOG }
  const skyColor: Vec3 = (world.world.skyColor?.slice(0, 3) as Vec3) ?? DEFAULT_FOG.color
  const fogColor: Vec3 = (fogValues.color?.slice(0, 3) as Vec3) ?? skyColor
  const fogColorHex = colorToHex(fogColor)

  const toggleFog = (enabled: boolean) => {
    pushUndo()
    if (enabled) {
      updateWorldSettings({ fog: { ...DEFAULT_FOG, color: skyColor } })
    } else {
      updateWorldSettings({ fog: false })
    }
  }

  const updateFog = (patch: Partial<FogSettings>) => {
    const base = fogEnabled ? fogValues : { ...DEFAULT_FOG, color: skyColor }
    updateWorldSettings({ fog: { ...base, ...patch } })
  }

  const updateFogColor = (newColor: Vec3) => {
    uiLogger.change('WorldPanel', 'Change fog color', { oldValue: fogColor, newValue: newColor })
    updateFog({ color: newColor })
  }

  return (
    <div style={{ ...sectionStyle, marginTop: 12 }}>
      <div style={sectionTitleStyle}>Fog</div>
      <p style={{ fontSize: 11, color: theme.text.muted, margin: '0 0 8px' }}>
        Linear distance fog fades distant geometry into the fog color. When color is omitted, the sky
        color is used.
      </p>
      <div style={{ ...sidebarRowStyle, marginBottom: 8 }}>
        <label
          htmlFor="fog-enabled"
          style={{ ...sidebarLabelStyle, cursor: 'help' }}
          title="When off, no scene fog. When on, objects fade between Near and Far distance."
        >
          Enabled
        </label>
        <input
          id="fog-enabled"
          type="checkbox"
          checked={fogEnabled}
          onChange={(e) => toggleFog(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
      </div>
      {fogEnabled && (
        <>
          <div style={sidebarRowStyle}>
            <label htmlFor="fog-color" style={sidebarLabelStyle}>
              Color
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="fog-color"
                type="color"
                value={fogColorHex}
                onChange={(e) => {
                  pushUndo()
                  updateFogColor(hexToColor(e.target.value))
                }}
                aria-label="Fog color"
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
                {fogColor.map((c) => c.toFixed(2)).join(', ')}
              </span>
            </div>
          </div>
          <NumberInput
            onBeforeCommit={pushUndo}
            id="fog-near"
            label="Near"
            labelTitle="Distance from the camera where fog begins (world units)."
            value={fogValues.near ?? DEFAULT_FOG.near}
            onChange={(v) => updateFog({ near: v })}
            min={0}
            step={1}
            defaultValue={DEFAULT_FOG.near}
            logComponent="WorldPanel"
          />
          <NumberInput
            onBeforeCommit={pushUndo}
            id="fog-far"
            label="Far"
            labelTitle="Distance from the camera where fog is fully opaque (world units)."
            value={fogValues.far ?? DEFAULT_FOG.far}
            onChange={(v) => updateFog({ far: v })}
            min={1}
            step={5}
            defaultValue={DEFAULT_FOG.far}
            logComponent="WorldPanel"
          />
        </>
      )}
    </div>
  )
}
