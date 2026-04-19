import { useState } from 'react'
import type {
  RennWorld,
  Vec3,
  MaterialRef,
  WorldSleepingSettings,
  DistanceCullingSettings,
  SimulationSettings,
} from '@/types/world'
import {
  clampVideoTextureMaxAnisotropy,
  DEFAULT_GRAVITY,
  DEFAULT_SCALE,
  RECOMMENDED_SLEEPING_SETTINGS,
  DEFAULT_DISTANCE_CULLING,
  DEFAULT_SIMULATION,
  DEFAULT_VIDEO_TEXTURE_MAX_ANISOTROPY,
} from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { directionToSpherical, sphericalToDirection } from '@/utils/lightUtils'
import { useProjectContext } from '@/hooks/useProjectContext'
import { uploadTexture } from '@/utils/assetUpload'
import CopyableArea from './CopyableArea'
import Vec3Field from './Vec3Field'
import NumberInput from './form/NumberInput'
import TextureDialog from './TextureDialog'
import TextureThumbnail from './TextureThumbnail'
import {
  sidebarRowStyle,
  sidebarLabelStyle,
  sectionStyle,
  sectionTitleStyle,
  secondaryButtonStyle,
} from './sharedStyles'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { patchFirstPlaneEntity } from '@/utils/worldGroundPatch'
import { theme } from '@/config/theme'

export interface WorldPanelProps {
  world: RennWorld
  onWorldChange: (world: RennWorld) => void
}

export default function WorldPanel({ world, onWorldChange }: WorldPanelProps) {
  const { assets, updateAssets } = useProjectContext()
  const [skyTextureDialogOpen, setSkyTextureDialogOpen] = useState(false)
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

  const gravity: Vec3 = world.world.gravity ?? DEFAULT_GRAVITY
  // Convert Vec3 gravity to single positive number (magnitude of Y)
  const gravityValue = Math.abs(gravity[1])
  const skyColor: Vec3 = (world.world.skyColor?.slice(0, 3) as Vec3) ?? [0.4, 0.6, 0.9]
  const skyboxId = world.world.skybox?.trim() ?? ''
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

  const simulation: SimulationSettings = world.world.simulation ?? {}
  const physicsHz = Math.round(1 / (simulation.fixedDt ?? DEFAULT_SIMULATION.fixedDt))
  const maxCatchUpSteps = simulation.maxStepsPerFrame ?? DEFAULT_SIMULATION.maxStepsPerFrame
  const timeScale = simulation.timeScale ?? DEFAULT_SIMULATION.timeScale

  const updateSimulation = (patch: Partial<SimulationSettings>): void => {
    updateWorldSettings({
      simulation: {
        ...world.world.simulation,
        fixedDt: world.world.simulation?.fixedDt ?? DEFAULT_SIMULATION.fixedDt,
        maxStepsPerFrame:
          world.world.simulation?.maxStepsPerFrame ?? DEFAULT_SIMULATION.maxStepsPerFrame,
        timeScale: world.world.simulation?.timeScale ?? DEFAULT_SIMULATION.timeScale,
        ...patch,
      },
    })
  }

  const updatePhysicsHz = (hz: number): void => {
    const clamped = Math.min(240, Math.max(15, Math.round(hz)))
    const nextFixed = 1 / clamped
    uiLogger.change('WorldPanel', 'Change physics rate (Hz)', { hz: clamped, fixedDt: nextFixed })
    updateSimulation({ fixedDt: nextFixed })
  }

  const updateMaxCatchUpSteps = (n: number): void => {
    const clamped = Math.min(10, Math.max(1, Math.round(n)))
    uiLogger.change('WorldPanel', 'Change max catch-up steps', { maxStepsPerFrame: clamped })
    updateSimulation({ maxStepsPerFrame: clamped })
  }

  const updateTimeScale = (v: number): void => {
    const clamped = Math.min(5, Math.max(0.1, v))
    uiLogger.change('WorldPanel', 'Change time scale', { timeScale: clamped })
    updateSimulation({ timeScale: clamped })
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
    pushUndo()
    uiLogger.change('WorldPanel', 'Set recommended sleeping', {
      oldValue: world.world.sleeping,
      newValue: RECOMMENDED_SLEEPING_SETTINGS,
    })
    updateWorldSettings({ sleeping: { ...RECOMMENDED_SLEEPING_SETTINGS } })
  }

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
      newValue: newColor,
    })

    onWorldChange(
      patchFirstPlaneEntity(world, groundEntity, (e) => ({
        ...e,
        material: {
          ...e.material,
          color: newColor,
        },
      })),
    )
  }

  const updateGroundMaterial = (materialPatch: Partial<MaterialRef>) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update material')
      return
    }

    onWorldChange(
      patchFirstPlaneEntity(world, groundEntity, (e) => ({
        ...e,
        material: {
          ...e.material,
          ...materialPatch,
        },
      })),
    )
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

    onWorldChange(patchFirstPlaneEntity(world, groundEntity, (e) => ({ ...e, friction: newFriction })))
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

    onWorldChange(patchFirstPlaneEntity(world, groundEntity, (e) => ({ ...e, scale: newScale })))
  }

  const skyColorHex = colorToHex(skyColor)
  const dirColorHex = colorToHex(dirColor)
  const ambientColorHex = colorToHex(ambientColor)
  const groundColorHex = colorToHex(groundColor)

  const copyPayload = {
    world: world.world,
    skybox: skyboxId || undefined,
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
        <div style={sectionTitleStyle}>Simulation</div>
        <p style={{ fontSize: 11, color: theme.text.muted, margin: '0 0 8px' }}>
          Fixed physics timestep with catch-up: simulation stays near real time when the display drops frames.
          Max catch-up steps caps work per frame to avoid a spiral of death on very slow hardware.
        </p>
        <NumberInput
          onBeforeCommit={pushUndo}
          id="world-physics-hz"
          label="Physics rate (Hz)"
          labelTitle="Fixed timestep for Rapier: simulation uses fixedDt = 1 / Hz. Higher values react faster and cost more CPU per second of sim time."
          value={physicsHz}
          onChange={updatePhysicsHz}
          min={15}
          max={240}
          step={1}
          defaultValue={60}
          logComponent="WorldPanel"
        />
        <NumberInput
          onBeforeCommit={pushUndo}
          id="world-max-catchup-steps"
          label="Max catch-up steps / frame"
          labelTitle="When a display frame takes longer than one physics step, the engine may run several steps in one frame to catch up. This caps how many, so a slow frame cannot trigger unbounded work (spiral of death)."
          value={maxCatchUpSteps}
          onChange={updateMaxCatchUpSteps}
          min={1}
          max={10}
          step={1}
          defaultValue={DEFAULT_SIMULATION.maxStepsPerFrame}
          logComponent="WorldPanel"
        />
        <NumberInput
          onBeforeCommit={pushUndo}
          id="world-time-scale"
          label="Time scale"
          labelTitle="Multiplies real wall-clock elapsed time before it feeds the physics accumulator. 1 = real time, below 1 = slow motion, above 1 = faster simulation."
          value={timeScale}
          onChange={updateTimeScale}
          min={0.1}
          max={5}
          step={0.1}
          defaultValue={DEFAULT_SIMULATION.timeScale}
          logComponent="WorldPanel"
        />
        <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
          <label
            htmlFor="world-show-frame-stats"
            style={{ ...sidebarLabelStyle, cursor: 'help' }}
            title="Overlays FPS and last-frame milliseconds (physics, scripts, render, etc.) on the scene canvas. Useful for spotting bottlenecks."
          >
            Show frame stats overlay
          </label>
          <input
            id="world-show-frame-stats"
            type="checkbox"
            checked={world.world.showFrameStats === true}
            onChange={(e) => updateWorldSettings({ showFrameStats: e.target.checked })}
            style={{ cursor: 'pointer' }}
          />
        </div>
        <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
          <label
            htmlFor="world-log-depth"
            style={{ ...sidebarLabelStyle, cursor: 'help' }}
            title="Improves depth precision over large near–far ranges so coplanar or intersecting opaque meshes flicker less at a distance. Uses a bit more GPU; turn off if you add custom post-processing that assumes linear depth."
          >
            Logarithmic depth buffer
          </label>
          <input
            id="world-log-depth"
            type="checkbox"
            checked={world.world.logarithmicDepthBuffer !== false}
            onChange={(e) =>
              updateWorldSettings({ logarithmicDepthBuffer: e.target.checked ? true : false })
            }
            style={{ cursor: 'pointer' }}
          />
        </div>
        <NumberInput
          onBeforeCommit={pushUndo}
          id="world-video-anisotropy"
          label="Video texture anisotropy (1–16)"
          labelTitle="Controls anisotropic filtering on material video maps. Higher values keep video detail cleaner at shallow viewing angles; 1 is the cheapest. The GPU may clamp the effective value."
          value={clampVideoTextureMaxAnisotropy(world.world.videoTextureMaxAnisotropy)}
          onChange={(v) => updateWorldSettings({ videoTextureMaxAnisotropy: clampVideoTextureMaxAnisotropy(v) })}
          min={1}
          max={16}
          step={1}
          defaultValue={DEFAULT_VIDEO_TEXTURE_MAX_ANISOTROPY}
          logComponent="WorldPanel"
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Gravity</div>
        <NumberInput onBeforeCommit={pushUndo}
          id="world-gravity"
          label="Strength"
          labelTitle="Magnitude of downward gravity along −Y (scene units per second squared). Uses the absolute value you enter."
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
        <p style={{ fontSize: 11, color: theme.text.muted, margin: '0 0 8px' }}>
          Custom sleep timer: velocities must stay below thresholds for the duration. Negative linear or angular
          threshold disables that check.
        </p>
        <NumberInput onBeforeCommit={pushUndo}
          id="world-sleep-linear"
          label="Linear threshold"
          labelTitle="Speed below which linear motion counts as “still” for the sleep timer. Negative disables the linear-speed check."
          value={sleepingDisplay.linearThreshold}
          onChange={(v) => updateSleeping({ linearThreshold: v })}
          step={0.05}
          defaultValue={RECOMMENDED_SLEEPING_SETTINGS.linearThreshold}
          logComponent="WorldPanel"
        />
        <NumberInput onBeforeCommit={pushUndo}
          id="world-sleep-angular"
          label="Angular threshold (rad/s)"
          labelTitle="Spin rate below which rotation counts as “still”. Negative disables the angular-speed check."
          value={sleepingDisplay.angularThreshold}
          onChange={(v) => updateSleeping({ angularThreshold: v })}
          step={0.05}
          defaultValue={RECOMMENDED_SLEEPING_SETTINGS.angularThreshold}
          logComponent="WorldPanel"
        />
        <NumberInput onBeforeCommit={pushUndo}
          id="world-sleep-time"
          label="Time until sleep (s)"
          labelTitle="Bodies must stay under both enabled thresholds for this long before Rapier may put them to sleep (stop integrating until woken)."
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
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.panel,
              color: theme.text.primary,
              cursor: 'pointer',
            }}
          >
            Set recommended
          </button>
        </div>
      </div>

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
            <NumberInput onBeforeCommit={pushUndo}
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
            <NumberInput onBeforeCommit={pushUndo}
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
                    uiLogger.change('WorldPanel', 'Clear sky dome texture', {
                      oldValue: world.world.skybox,
                    })
                    const { skybox: _omit, ...restWorld } = world.world
                    onWorldChange({ ...world, world: restWorld })
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
              uiLogger.change('WorldPanel', 'Clear sky dome texture', {
                oldValue: world.world.skybox,
              })
              const { skybox: _omit, ...restWorld } = world.world
              onWorldChange({ ...world, world: restWorld })
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

      <div style={{ ...sectionStyle, marginTop: 12 }}>
        <div style={sectionTitleStyle}>Light</div>
        <div style={{ marginTop: 8 }}>
          <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Directional</div>
          <NumberInput onBeforeCommit={pushUndo}
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
          <NumberInput onBeforeCommit={pushUndo}
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
          <NumberInput onBeforeCommit={pushUndo}
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
                    pushUndo()
                    const next = hexToColor(e.target.value)
                    updateGroundColor(next)
                  }}
                  aria-label="Ground color"
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
                  {groundColor.map((c) => c.toFixed(2)).join(', ')}
                </span>
              </div>
            </div>

            {/* Material Properties subsection */}
            <div style={{ marginTop: 12 }}>
              <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Material</div>
              <NumberInput onBeforeCommit={pushUndo}
                id="ground-roughness"
                label="Roughness"
                labelTitle="Ground plane PBR roughness: 0 glossy, 1 diffuse."
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
              <NumberInput onBeforeCommit={pushUndo}
                id="ground-metalness"
                label="Metalness"
                labelTitle="Ground plane metalness: 0 non-metal, 1 fully metallic reflections."
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
              <NumberInput onBeforeCommit={pushUndo}
                id="ground-opacity"
                label="Opacity"
                labelTitle="Alpha for the ground material (1 = opaque)."
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
              <NumberInput onBeforeCommit={pushUndo}
                id="ground-friction"
                label="Friction"
                labelTitle="Contact friction for the ground collider (higher = more grip)."
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
                labelTitle="Non-uniform scale of the ground plane mesh and collider."
                value={groundScale}
                onChange={updateGroundScale}
                step={0.1}
                axisLabels={['X', 'Y', 'Z']}
                idPrefix="ground-scale"
                {...vec3Undo}
              />
            </div>

            {/* Entity info */}
            <div style={{ fontSize: 11, color: theme.text.muted, marginTop: 8 }}>
              Entity: {groundEntity.name ?? groundEntity.id}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 12, color: theme.text.muted, margin: 0 }}>
            No ground entity found. Add a plane entity to edit ground properties.
          </p>
        )}
      </div>
      </CopyableArea>
    </div>
  )
}
