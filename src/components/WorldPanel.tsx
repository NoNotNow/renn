import type { RennWorld, Vec3, MaterialRef, WorldSleepingSettings } from '@/types/world'
import { DEFAULT_GRAVITY, DEFAULT_SCALE, RECOMMENDED_SLEEPING_SETTINGS } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { directionToSpherical, sphericalToDirection } from '@/utils/lightUtils'
import CopyableArea from './CopyableArea'
import Vec3Field from './Vec3Field'
import NumberInput from './form/NumberInput'
import { sidebarRowStyle, sidebarLabelStyle, sectionStyle, sectionTitleStyle } from './sharedStyles'

export interface WorldPanelProps {
  world: RennWorld
  onWorldChange: (world: RennWorld) => void
}

export default function WorldPanel({ world, onWorldChange }: WorldPanelProps) {
  const gravity: Vec3 = world.world.gravity ?? DEFAULT_GRAVITY
  // Convert Vec3 gravity to single positive number (magnitude of Y)
  const gravityValue = Math.abs(gravity[1])
  const skyColor: Vec3 = (world.world.skyColor?.slice(0, 3) as Vec3) ?? [0.4, 0.6, 0.9]
  const dirDirection: Vec3 = world.world.directionalLight?.direction ?? [1, 2, 1]
  const dirColor: Vec3 = (world.world.directionalLight?.color?.slice(0, 3) as Vec3) ?? [1, 0.98, 0.9]
  const dirIntensity = world.world.directionalLight?.intensity ?? 1.2
  const ambientColor: Vec3 = (world.world.ambientLight?.slice(0, 3) as Vec3) ?? [0.3, 0.3, 0.35]
  const { azimuth, elevation } = directionToSpherical(dirDirection)

  // Find the first plane entity (ground)
  const groundEntity = world.entities.find((e) => e.shape?.type === 'plane')
  const groundColor: Vec3 = groundEntity?.material?.color 
    ? (groundEntity.material.color.slice(0, 3) as Vec3)
    : [0.3, 0.5, 0.3]
  const groundRoughness = groundEntity?.material?.roughness ?? 0.5
  const groundMetalness = groundEntity?.material?.metalness ?? 0
  const groundOpacity = groundEntity?.material?.opacity ?? 1
  const groundFriction = groundEntity?.friction ?? 0.5
  const groundScale: Vec3 = groundEntity?.scale ?? DEFAULT_SCALE

  const updateWorldSettings = (patch: Partial<typeof world.world>) => {
    onWorldChange({
      ...world,
      world: {
        ...world.world,
        ...patch,
      },
    })
  }

  const updateGravity = (value: number) => {
    const newGravity: Vec3 = [0, -Math.abs(value), 0]
    uiLogger.change('WorldPanel', 'Change gravity', { oldValue: gravity, newValue: newGravity })
    updateWorldSettings({ gravity: newGravity })
  }

  const sleepingDisplay: WorldSleepingSettings =
    world.world.sleeping ?? RECOMMENDED_SLEEPING_SETTINGS

  const updateSleeping = (patch: Partial<WorldSleepingSettings>) => {
    const base = world.world.sleeping ?? RECOMMENDED_SLEEPING_SETTINGS
    const next: WorldSleepingSettings = { ...base, ...patch }
    uiLogger.change('WorldPanel', 'Change world sleeping', {
      oldValue: world.world.sleeping,
      newValue: next,
    })
    updateWorldSettings({ sleeping: next })
  }

  const setRecommendedSleeping = () => {
    uiLogger.change('WorldPanel', 'Set recommended sleeping', {
      oldValue: world.world.sleeping,
      newValue: RECOMMENDED_SLEEPING_SETTINGS,
    })
    updateWorldSettings({ sleeping: { ...RECOMMENDED_SLEEPING_SETTINGS } })
  }

  const updateSkyColor = (newColor: Vec3) => {
    uiLogger.change('WorldPanel', 'Change sky color', { oldValue: skyColor, newValue: newColor })
    updateWorldSettings({ skyColor: newColor })
  }

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

  const updateGroundColor = (newColor: Vec3) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update color')
      return
    }
    
    uiLogger.change('WorldPanel', 'Change ground color', { 
      entityId: groundEntity.id, 
      oldValue: groundColor, 
      newValue: newColor 
    })
    
    // Update the ground entity's material color
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === groundEntity.id
          ? {
              ...e,
              material: {
                ...e.material,
                color: newColor,
              },
            }
          : e
      ),
    })
  }

  const updateGroundMaterial = (materialPatch: Partial<MaterialRef>) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update material')
      return
    }
    
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === groundEntity.id
          ? {
              ...e,
              material: {
                ...e.material,
                ...materialPatch,
              },
            }
          : e
      ),
    })
  }

  const updateGroundFriction = (newFriction: number) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update friction')
      return
    }
    
    uiLogger.change('WorldPanel', 'Change ground friction', {
      entityId: groundEntity.id,
      oldValue: groundFriction,
      newValue: newFriction,
    })
    
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === groundEntity.id ? { ...e, friction: newFriction } : e
      ),
    })
  }

  const updateGroundScale = (newScale: Vec3) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update scale')
      return
    }
    
    uiLogger.change('WorldPanel', 'Change ground scale', {
      entityId: groundEntity.id,
      oldValue: groundScale,
      newValue: newScale,
    })
    
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === groundEntity.id ? { ...e, scale: newScale } : e
      ),
    })
  }

  const skyColorHex = colorToHex(skyColor)
  const dirColorHex = colorToHex(dirColor)
  const ambientColorHex = colorToHex(ambientColor)
  const groundColorHex = colorToHex(groundColor)

  const copyPayload = {
    world: world.world,
    groundEntity: groundEntity
      ? {
          id: groundEntity.id,
          name: groundEntity.name,
          scale: groundScale,
          material: {
            color: groundColor,
            roughness: groundRoughness,
            metalness: groundMetalness,
            opacity: groundOpacity,
          },
          friction: groundFriction,
        }
      : null,
  }

  return (
    <div style={{ padding: 10 }}>
      <CopyableArea copyPayload={copyPayload}>
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Gravity</div>
        <NumberInput
          id="world-gravity"
          label="Strength"
          value={gravityValue}
          onChange={updateGravity}
          min={0}
          step={0.1}
          defaultValue={9.81}
          logComponent="WorldPanel"
        />
      </div>

      <div style={{ ...sectionStyle, marginTop: 12 }}>
        <div style={sectionTitleStyle}>Sleep</div>
        <p style={{ fontSize: 11, color: '#9aa4b2', margin: '0 0 8px' }}>
          Custom sleep timer: velocities must stay below thresholds for the duration. Negative linear or angular
          threshold disables that check.
        </p>
        <NumberInput
          id="world-sleep-linear"
          label="Linear threshold"
          value={sleepingDisplay.linearThreshold}
          onChange={(v) => updateSleeping({ linearThreshold: v })}
          step={0.05}
          defaultValue={RECOMMENDED_SLEEPING_SETTINGS.linearThreshold}
          logComponent="WorldPanel"
        />
        <NumberInput
          id="world-sleep-angular"
          label="Angular threshold (rad/s)"
          value={sleepingDisplay.angularThreshold}
          onChange={(v) => updateSleeping({ angularThreshold: v })}
          step={0.05}
          defaultValue={RECOMMENDED_SLEEPING_SETTINGS.angularThreshold}
          logComponent="WorldPanel"
        />
        <NumberInput
          id="world-sleep-time"
          label="Time until sleep (s)"
          value={sleepingDisplay.timeUntilSleep}
          onChange={(v) => updateSleeping({ timeUntilSleep: v })}
          min={0}
          step={0.1}
          defaultValue={RECOMMENDED_SLEEPING_SETTINGS.timeUntilSleep}
          logComponent="WorldPanel"
        />
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={setRecommendedSleeping}
            style={{
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid #2f3545',
              background: '#1a1f2e',
              color: '#e6e9ef',
              cursor: 'pointer',
            }}
          >
            Set recommended
          </button>
        </div>
      </div>

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
                const next = hexToColor(e.target.value)
                updateSkyColor(next)
              }}
              aria-label="Sky color"
              style={{
                width: 28,
                height: 22,
                padding: 0,
                borderRadius: 4,
                border: '1px solid #2f3545',
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: 12, color: '#9aa4b2' }}>
              {skyColor.map((c) => c.toFixed(2)).join(', ')}
            </span>
          </div>
        </div>
      </div>

      <div style={{ ...sectionStyle, marginTop: 12 }}>
        <div style={sectionTitleStyle}>Light</div>
        <div style={{ marginTop: 8 }}>
          <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Directional</div>
          <NumberInput
            id="light-azimuth"
            label="Azimuth (deg)"
            value={Math.round(azimuth * 10) / 10}
            onChange={(v) => updateLightAngle(v, elevation)}
            min={0}
            max={360}
            step={1}
            defaultValue={45}
            logComponent="WorldPanel"
          />
          <NumberInput
            id="light-elevation"
            label="Elevation (deg)"
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
                onChange={(e) => updateDirectionalLight({ color: hexToColor(e.target.value) })}
                aria-label="Directional light color"
                style={{
                  width: 28,
                  height: 22,
                  padding: 0,
                  borderRadius: 4,
                  border: '1px solid #2f3545',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 12, color: '#9aa4b2' }}>
                {dirColor.map((c) => c.toFixed(2)).join(', ')}
              </span>
            </div>
          </div>
          <NumberInput
            id="light-intensity"
            label="Intensity"
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
                onChange={(e) => updateAmbientLight(hexToColor(e.target.value))}
                aria-label="Ambient light color"
                style={{
                  width: 28,
                  height: 22,
                  padding: 0,
                  borderRadius: 4,
                  border: '1px solid #2f3545',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 12, color: '#9aa4b2' }}>
                {ambientColor.map((c) => c.toFixed(2)).join(', ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...sectionStyle, marginTop: 12 }}>
        <div style={sectionTitleStyle}>Ground</div>
        {groundEntity ? (
          <>
            {/* Color */}
            <div style={sidebarRowStyle}>
              <label htmlFor="ground-color" style={sidebarLabelStyle}>
                Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="ground-color"
                  type="color"
                  value={groundColorHex}
                  onChange={(e) => {
                    const next = hexToColor(e.target.value)
                    updateGroundColor(next)
                  }}
                  aria-label="Ground color"
                  style={{
                    width: 28,
                    height: 22,
                    padding: 0,
                    borderRadius: 4,
                    border: '1px solid #2f3545',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: 12, color: '#9aa4b2' }}>
                  {groundColor.map((c) => c.toFixed(2)).join(', ')}
                </span>
              </div>
            </div>

            {/* Material Properties subsection */}
            <div style={{ marginTop: 12 }}>
              <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Material</div>
              <NumberInput
                id="ground-roughness"
                label="Roughness"
                value={groundRoughness}
                onChange={(value) => {
                  uiLogger.change('WorldPanel', 'Change ground roughness', {
                    entityId: groundEntity.id,
                    oldValue: groundRoughness,
                    newValue: value,
                  })
                  updateGroundMaterial({ roughness: value })
                }}
                min={0}
                max={1}
                step={0.1}
                defaultValue={0.5}
                entityId={groundEntity.id}
                propertyName="roughness"
                logComponent="WorldPanel"
              />
              <NumberInput
                id="ground-metalness"
                label="Metalness"
                value={groundMetalness}
                onChange={(value) => {
                  uiLogger.change('WorldPanel', 'Change ground metalness', {
                    entityId: groundEntity.id,
                    oldValue: groundMetalness,
                    newValue: value,
                  })
                  updateGroundMaterial({ metalness: value })
                }}
                min={0}
                max={1}
                step={0.1}
                defaultValue={0}
                entityId={groundEntity.id}
                propertyName="metalness"
                logComponent="WorldPanel"
              />
              <NumberInput
                id="ground-opacity"
                label="Opacity"
                value={groundOpacity}
                onChange={(value) => {
                  uiLogger.change('WorldPanel', 'Change ground opacity', {
                    entityId: groundEntity.id,
                    oldValue: groundOpacity,
                    newValue: value,
                  })
                  updateGroundMaterial({ opacity: value })
                }}
                min={0}
                max={1}
                step={0.05}
                defaultValue={1}
                entityId={groundEntity.id}
                propertyName="opacity"
                logComponent="WorldPanel"
              />
            </div>

            {/* Physics Properties subsection */}
            <div style={{ marginTop: 12 }}>
              <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Physics</div>
              <NumberInput
                id="ground-friction"
                label="Friction"
                value={groundFriction}
                onChange={updateGroundFriction}
                min={0}
                max={1}
                step={0.1}
                defaultValue={0.5}
                entityId={groundEntity.id}
                propertyName="friction"
                logComponent="WorldPanel"
              />
            </div>

            {/* Transform Properties subsection */}
            <div style={{ marginTop: 12 }}>
              <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Transform</div>
              <Vec3Field
                label="Scale"
                value={groundScale}
                onChange={updateGroundScale}
                step={0.1}
                axisLabels={['X', 'Y', 'Z']}
                idPrefix="ground-scale"
              />
            </div>

            {/* Entity info */}
            <div style={{ fontSize: 11, color: '#9aa4b2', marginTop: 8 }}>
              Entity: {groundEntity.name ?? groundEntity.id}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 12, color: '#9aa4b2', margin: 0 }}>
            No ground entity found. Add a plane entity to edit ground properties.
          </p>
        )}
      </div>
      </CopyableArea>
    </div>
  )
}
