import type { RennWorld, DistanceCullingSettings } from '@/types/world'
import { DEFAULT_DISTANCE_CULLING } from '@/types/world'
import NumberInput from '../form/NumberInput'
import { sidebarRowStyle, sidebarLabelStyle, sectionStyle, sectionTitleStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldDistanceCullingSectionProps {
  world: RennWorld
  edits: WorldPanelEdits
}

export default function WorldDistanceCullingSection({
  world,
  edits,
}: WorldDistanceCullingSectionProps) {
  const { pushUndo, updateWorldSettings } = edits

  const cullingRaw = world.world.distanceCulling
  /** Omitted or object = on; `false` = user disabled. */
  const cullingEnabled = cullingRaw !== false
  const cullingValues: DistanceCullingSettings =
    typeof cullingRaw === 'object' && cullingRaw !== null ? cullingRaw : DEFAULT_DISTANCE_CULLING

  const toggleCulling = (enabled: boolean) => {
    pushUndo()
    if (enabled) {
      updateWorldSettings({ distanceCulling: { ...DEFAULT_DISTANCE_CULLING } })
    } else {
      updateWorldSettings({ distanceCulling: false })
    }
  }

  const updateCulling = (patch: Partial<DistanceCullingSettings>) => {
    const base = cullingValues
    updateWorldSettings({ distanceCulling: { ...base, ...patch } })
  }

  return (
    <div style={{ ...sectionStyle, marginTop: 12 }}>
      <div style={sectionTitleStyle}>Distance Culling</div>
      <p style={{ fontSize: 11, color: theme.text.muted, margin: '0 0 8px' }}>
        On by default. Objects are hidden when beyond Max Distance <strong>or</strong> when their
        apparent size/distance ratio is below Min ratio (camera to object center).
      </p>
      <div style={{ ...sidebarRowStyle, marginBottom: 8 }}>
        <label
          htmlFor="culling-enabled"
          style={{ ...sidebarLabelStyle, cursor: 'help' }}
          title="When off, no distance-based hiding. When on, objects beyond max distance or too small on screen can be culled."
        >
          Enabled
        </label>
        <input
          id="culling-enabled"
          type="checkbox"
          checked={cullingEnabled}
          onChange={(e) => toggleCulling(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
      </div>
      {cullingEnabled && (
        <>
          <NumberInput
            onBeforeCommit={pushUndo}
            id="culling-max-distance"
            label="Max distance"
            labelTitle="Objects farther than this from the camera (world units) may be hidden."
            value={cullingValues.maxDistance}
            onChange={(v) => updateCulling({ maxDistance: v })}
            min={1}
            step={5}
            defaultValue={DEFAULT_DISTANCE_CULLING.maxDistance}
            logComponent="WorldPanel"
          />
          <NumberInput
            onBeforeCommit={pushUndo}
            id="culling-min-ratio"
            label="Min size/distance ratio"
            labelTitle="Screen-space size gate: if apparent size divided by distance is below this, the object may be culled even inside max distance."
            value={cullingValues.minSizeDistanceRatio}
            onChange={(v) => updateCulling({ minSizeDistanceRatio: v })}
            min={0.001}
            step={0.005}
            defaultValue={DEFAULT_DISTANCE_CULLING.minSizeDistanceRatio}
            logComponent="WorldPanel"
          />
          <div style={{ ...sidebarRowStyle, marginBottom: 8, alignItems: 'flex-start' }}>
            <label
              htmlFor="culling-sleep"
              style={{ ...sidebarLabelStyle, cursor: 'help' }}
              title="When culled, optionally freeze physics and skip transformers/scripts until the object is visible again (saves CPU)."
            >
              Sleep culled
            </label>
            <div style={{ flex: 1 }}>
              <input
                id="culling-sleep"
                type="checkbox"
                checked={cullingValues.sleepCulled === true}
                onChange={(e) => {
                  pushUndo()
                  updateCulling({ sleepCulled: e.target.checked })
                }}
                style={{ cursor: 'pointer' }}
              />
              <p style={{ fontSize: 10, color: theme.text.dim, margin: '4px 0 0' }}>
                Freeze physics for culled objects and skip their transformers and scripts until visible again.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
