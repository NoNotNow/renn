import type { RennWorld, Vec3 } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { directionToSpherical, sphericalToDirection } from '@/utils/lightUtils'
import NumberInput from '../form/NumberInput'
import { sidebarRowStyle, sidebarLabelStyle, sectionStyle, sectionTitleStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldLightSectionProps {
  world: RennWorld
  edits: WorldPanelEdits
}

export default function WorldLightSection({ world, edits }: WorldLightSectionProps) {
  const { pushUndo, updateWorldSettings } = edits

  const dirDirection: Vec3 = world.world.directionalLight?.direction ?? [1, 2, 1]
  const dirColor: Vec3 = (world.world.directionalLight?.color?.slice(0, 3) as Vec3) ?? [1, 0.98, 0.9]
  const dirIntensity = world.world.directionalLight?.intensity ?? 1.2
  const ambientColor: Vec3 = (world.world.ambientLight?.slice(0, 3) as Vec3) ?? [0.3, 0.3, 0.35]
  const { azimuth, elevation } = directionToSpherical(dirDirection)
  const dirColorHex = colorToHex(dirColor)
  const ambientColorHex = colorToHex(ambientColor)
  const shadowsEnabled = world.world.shadowsEnabled !== false

  const updateDirectionalLight = (patch: { direction?: Vec3; color?: Vec3; intensity?: number }) => {
    const current = world.world.directionalLight ?? {}
    const next = { ...current, ...patch }
    uiLogger.change('WorldPanel', 'Change directional light', { oldValue: current, newValue: next })
    updateWorldSettings({ directionalLight: next })
  }

  const updateLightAngle = (azimuthDeg: number, elevationDeg: number) => {
    const clampedEl = Math.max(0, Math.min(90, elevationDeg))
    const newDirection = sphericalToDirection(azimuthDeg % 360, clampedEl)
    updateDirectionalLight({ direction: newDirection })
  }

  const updateAmbientLight = (newColor: Vec3) => {
    uiLogger.change('WorldPanel', 'Change ambient light', { oldValue: ambientColor, newValue: newColor })
    updateWorldSettings({ ambientLight: newColor })
  }

  return (
    <div style={{ ...sectionStyle, marginTop: 12 }}>
      <div style={sectionTitleStyle}>Light</div>
      <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
        <label
          htmlFor="world-shadows-enabled"
          style={{ ...sidebarLabelStyle, cursor: 'help' }}
          title="Enables shadow maps from the directional (sun) light. Turning off saves GPU on large scenes."
        >
          Shadows
        </label>
        <input
          id="world-shadows-enabled"
          type="checkbox"
          checked={shadowsEnabled}
          onChange={(e) => {
            const enabled = e.target.checked
            uiLogger.change('WorldPanel', 'Toggle shadows', { enabled })
            updateWorldSettings({ shadowsEnabled: enabled ? true : false })
          }}
          style={{ cursor: 'pointer' }}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Directional</div>
        <NumberInput
          onBeforeCommit={pushUndo}
          id="light-azimuth"
          label="Azimuth (deg)"
          labelTitle="Horizontal angle of the directional light around the vertical axis (0–360°)."
          value={Math.round(azimuth * 10) / 10}
          onChange={(v) => updateLightAngle(v, elevation)}
          min={0}
          max={360}
          step={1}
          defaultValue={45}
          logComponent="WorldPanel"
        />
        <NumberInput
          onBeforeCommit={pushUndo}
          id="light-elevation"
          label="Elevation (deg)"
          labelTitle="Vertical angle of the light above the horizon (0° = horizontal, 90° = straight down)."
          value={Math.round(elevation * 10) / 10}
          onChange={(v) => updateLightAngle(azimuth, v)}
          min={0}
          max={90}
          step={1}
          defaultValue={55}
          logComponent="WorldPanel"
        />
        <div style={sidebarRowStyle}>
          <label htmlFor="dir-light-color" style={sidebarLabelStyle}>
            Color
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="dir-light-color"
              type="color"
              value={dirColorHex}
              onChange={(e) => {
                pushUndo()
                updateDirectionalLight({ color: hexToColor(e.target.value) })
              }}
              aria-label="Directional light color"
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
              {dirColor.map((c) => c.toFixed(2)).join(', ')}
            </span>
          </div>
        </div>
        <NumberInput
          onBeforeCommit={pushUndo}
          id="light-intensity"
          label="Intensity"
          labelTitle="Brightness multiplier for the directional (sun) light before color is applied."
          value={dirIntensity}
          onChange={(v) => updateDirectionalLight({ intensity: v })}
          min={0}
          step={0.1}
          defaultValue={1.2}
          logComponent="WorldPanel"
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Ambient</div>
        <div style={sidebarRowStyle}>
          <label htmlFor="ambient-light-color" style={sidebarLabelStyle}>
            Color
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="ambient-light-color"
              type="color"
              value={ambientColorHex}
              onChange={(e) => {
                pushUndo()
                updateAmbientLight(hexToColor(e.target.value))
              }}
              aria-label="Ambient light color"
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
              {ambientColor.map((c) => c.toFixed(2)).join(', ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
