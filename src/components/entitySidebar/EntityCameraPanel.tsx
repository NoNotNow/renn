import { useMemo, useState } from 'react'
import {
  type CameraMode,
  type Entity,
  type FluidOrbitDirection,
  type RennWorld,
  type AvatarFocusSnapshot,
  CAMERA_LAG_MAX,
  CAMERA_LAG_MIN,
  CAMERA_MODE_CYCLE_ORDER,
  CAMERA_MODE_LABELS,
  FLUID_ORBIT_DISTANCE_MAX,
  FLUID_ORBIT_DISTANCE_MIN,
  FLUID_ORBIT_HEIGHT_MAX,
  FLUID_ORBIT_HEIGHT_MIN,
  FLUID_ORBIT_SPEED_MAX_DEG,
  FLUID_ORBIT_SPEED_MIN_DEG,
} from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { theme } from '@/config/theme'
import { sidebarLabelStyle, sidebarRowStyle } from '../sharedStyles'
import { avatarEntityIconLetter, getAvatarRosterEntityIds } from '@/utils/avatarUtils'
import CopyableArea from '../CopyableArea'
import AvatarDialog from '../AvatarDialog'
import EntitySearchPicker from '@/components/entitySearch/EntitySearchPicker'

export type CameraControl = 'free' | 'follow' | 'top' | 'front' | 'right'

const CAMERA_TARGET_VERTICAL_ANGLE_MIN = -45
const CAMERA_TARGET_VERTICAL_ANGLE_MAX = 45

interface CameraLagSliderProps {
  id: string
  label: string
  title: string
  value: number
  logEvent: string
  onChange: (lag: number) => void
}

function CameraLagSlider({ id, label, title, value, logEvent, onChange }: CameraLagSliderProps) {
  return (
    <div style={sidebarRowStyle}>
      <label htmlFor={id} style={{ ...sidebarLabelStyle, cursor: 'help' }} title={title}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <input
          id={id}
          type="range"
          min={CAMERA_LAG_MIN}
          max={CAMERA_LAG_MAX}
          step={1}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value)
            uiLogger.change('Builder', logEvent, { lag: next })
            onChange(next)
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <span style={{ fontSize: 12, color: theme.text.muted, width: 36, textAlign: 'right' }}>
          {value}
        </span>
      </div>
    </div>
  )
}

export interface EntityCameraPanelProps {
  entities: Entity[]
  entityWorkHistory?: readonly string[]
  world: RennWorld
  cameraControl: CameraControl
  cameraTarget: string
  cameraMode: CameraMode
  cameraTargetVerticalAngle: number
  fluidOrbitSpeed: number
  fluidOrbitDirection: FluidOrbitDirection
  fluidOrbitHeight: number
  fluidOrbitDistance: number
  cameraTargetLag: number
  cameraPositionLag: number
  onCameraControlChange: (control: CameraControl) => void
  onCameraTargetChange: (target: string) => void
  onCameraModeChange: (mode: CameraMode) => void
  onCameraTargetVerticalAngleChange: (degrees: number) => void
  onFluidOrbitSpeedChange: (degreesPerSecond: number) => void
  onFluidOrbitDirectionChange: (direction: FluidOrbitDirection) => void
  onFluidOrbitHeightChange: (height: number) => void
  onFluidOrbitDistanceChange: (distance: number) => void
  onCameraTargetLagChange: (lag: number) => void
  onCameraPositionLagChange: (lag: number) => void
  onWorldChange: (world: RennWorld) => void
  /** Builder: read live follow/orbit state for "save as default" in Avatar dialog. */
  getAvatarFocusSnapshot?: () => AvatarFocusSnapshot | null
  onSelectEntity?: (id: string | null) => void
}

/**
 * "Camera" tab content for the left sidebar. Owns the avatar dialog open
 * state because it is the only consumer.
 */
export default function EntityCameraPanel({
  entities,
  entityWorkHistory = [],
  world,
  cameraControl,
  cameraTarget,
  cameraMode,
  cameraTargetVerticalAngle,
  fluidOrbitSpeed,
  fluidOrbitDirection,
  fluidOrbitHeight,
  fluidOrbitDistance,
  cameraTargetLag,
  cameraPositionLag,
  onCameraControlChange,
  onCameraTargetChange,
  onCameraModeChange,
  onCameraTargetVerticalAngleChange,
  onFluidOrbitSpeedChange,
  onFluidOrbitDirectionChange,
  onFluidOrbitHeightChange,
  onFluidOrbitDistanceChange,
  onCameraTargetLagChange,
  onCameraPositionLagChange,
  onWorldChange,
  getAvatarFocusSnapshot,
  onSelectEntity,
}: EntityCameraPanelProps) {
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [avatarDialogEntityId, setAvatarDialogEntityId] = useState<string | null>(null)

  const avatarRosterEntityIds = useMemo(() => getAvatarRosterEntityIds(entities), [entities])
  const avatarRosterEntities = useMemo(() => {
    const byId = new Map(entities.map((e) => [e.id, e] as const))
    return avatarRosterEntityIds.map((id) => byId.get(id)!).filter((e) => Boolean(e))
  }, [avatarRosterEntityIds, entities])

  const avatarRosterFocusEntityId = useMemo(() => {
    if (cameraTarget && avatarRosterEntityIds.includes(cameraTarget)) return cameraTarget
    return avatarRosterEntityIds[0] ?? null
  }, [cameraTarget, avatarRosterEntityIds])

  return (
    <>
      <CopyableArea
        copyPayload={{
          control: cameraControl,
          target: cameraTarget,
          mode: cameraMode,
          targetVerticalAngle: cameraTargetVerticalAngle,
          fluidOrbitSpeed,
          fluidOrbitDirection,
          fluidOrbitHeight,
          fluidOrbitDistance,
          cameraTargetLag,
          cameraPositionLag,
        }}
      >
        <>
          <div style={sidebarRowStyle}>
            <label
              htmlFor="camera-control"
              style={{ ...sidebarLabelStyle, cursor: 'help' }}
              title="Free fly with WASD; Follow orbits a target entity; Top/Front/Right are axis-aligned views."
            >
              Control
            </label>
            <select
              id="camera-control"
              value={cameraControl}
              onChange={(e) => {
                const value = e.target.value as CameraControl
                uiLogger.change('Builder', 'Change camera control', { control: value })
                onCameraControlChange(value)
              }}
              style={{ display: 'block', width: '100%' }}
            >
              <option value="free">Free (WASD)</option>
              <option value="follow">Follow</option>
              <option value="top">Top</option>
              <option value="front">Front</option>
              <option value="right">Right</option>
            </select>
          </div>
          {cameraControl === 'follow' && (
            <>
              {avatarRosterEntities.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div
                    style={{ fontSize: 12, color: theme.text.muted, minWidth: 54, cursor: 'help' }}
                    title="Entities marked playable (avatar). Click a letter to focus the follow camera; Edit opens avatar settings."
                  >
                    Avatars
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {avatarRosterEntities.map((e) => {
                      const active = e.id === avatarRosterFocusEntityId
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onCameraTargetChange(e.id)}
                          title={`Camera target: ${e.name ?? e.id}`}
                          aria-label={`Select avatar ${e.name ?? e.id}`}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            background: active ? theme.bg.primarySubtle : theme.bg.inactiveTile,
                            border: `1px solid ${active ? theme.border.dropZoneActive : theme.border.default}`,
                            color: theme.text.primary,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {avatarEntityIconLetter(e)}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    aria-label="Edit avatar settings"
                    onClick={() => {
                      if (!avatarRosterFocusEntityId) return
                      setAvatarDialogEntityId(avatarRosterFocusEntityId)
                      setAvatarDialogOpen(true)
                    }}
                    disabled={!avatarRosterFocusEntityId}
                    style={{
                      marginLeft: 'auto',
                      padding: '6px 10px',
                      fontSize: 12,
                      background: theme.bg.dropZoneActive,
                      border: `1px solid ${theme.button.infoBorder}`,
                      color: theme.text.accentBlue,
                      borderRadius: 6,
                      cursor: avatarRosterFocusEntityId ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Edit
                  </button>
                </div>
              ) : null}
              <div style={sidebarRowStyle}>
                <label
                  style={{ ...sidebarLabelStyle, cursor: 'help' }}
                  title="Entity the follow camera looks at (usually a playable avatar)."
                >
                  Target
                </label>
                <EntitySearchPicker
                  entities={entities}
                  entityWorkHistory={entityWorkHistory}
                  selectedEntityId={cameraTarget || null}
                  onSelectEntity={(id) => {
                    uiLogger.change('Builder', 'Change camera target', { target: id })
                    onCameraTargetChange(id)
                  }}
                  variant="panel"
                  placeholder="Search follow target…"
                  testId="camera-target-search"
                />
                {cameraTarget ?
                  <button
                    type="button"
                    onClick={() => {
                      uiLogger.change('Builder', 'Change camera target', { target: '' })
                      onCameraTargetChange('')
                    }}
                    style={{
                      marginTop: 6,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: theme.text.muted,
                      fontSize: 11,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear target
                  </button>
                : null}
              </div>
              <div style={sidebarRowStyle}>
                <label
                  htmlFor="camera-mode"
                  style={{ ...sidebarLabelStyle, cursor: 'help' }}
                  title="Follow camera behavior: orbit, first-person, chase, etc. (same modes as world default unless overridden per avatar)."
                >
                  Mode
                </label>
                <select
                  id="camera-mode"
                  value={cameraMode}
                  onChange={(e) => {
                    uiLogger.change('Builder', 'Change camera mode', { mode: e.target.value })
                    onCameraModeChange(e.target.value as CameraMode)
                  }}
                  style={{ display: 'block', width: '100%' }}
                >
                  {CAMERA_MODE_CYCLE_ORDER.map((mode) => (
                    <option key={mode} value={mode}>
                      {CAMERA_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>
              <div style={sidebarRowStyle}>
                <label
                  htmlFor="camera-target-vertical-angle"
                  style={{ ...sidebarLabelStyle, cursor: 'help' }}
                  title="Vertical angle between camera–target ray and world up (degrees). Positive tilts view up so the subject sits lower in frame."
                >
                  Vertical angle
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                  <input
                    id="camera-target-vertical-angle"
                    type="range"
                    min={CAMERA_TARGET_VERTICAL_ANGLE_MIN}
                    max={CAMERA_TARGET_VERTICAL_ANGLE_MAX}
                    step={1}
                    value={cameraTargetVerticalAngle}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      uiLogger.change('Builder', 'Change camera target vertical angle', { degrees: next })
                      onCameraTargetVerticalAngleChange(next)
                    }}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <span style={{ fontSize: 12, color: theme.text.muted, width: 36, textAlign: 'right' }}>
                    {cameraTargetVerticalAngle}°
                  </span>
                </div>
              </div>
              <CameraLagSlider
                id="camera-target-lag"
                label="Target lag"
                title="How slowly the follow pivot catches up to the target entity (0 = instant, higher = heavier/laggier). Applies to all follow modes including first person."
                value={cameraTargetLag}
                logEvent="Change camera target lag"
                onChange={onCameraTargetLagChange}
              />
              <CameraLagSlider
                id="camera-position-lag"
                label="Position lag"
                title="How slowly the camera position catches up (orbit point or first-person eye height; 0 = instant, higher = heavier/laggier)."
                value={cameraPositionLag}
                logEvent="Change camera position lag"
                onChange={onCameraPositionLagChange}
              />
              {cameraMode === 'fluid' ? (
                <>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="fluid-orbit-speed"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Fluid mode: automatic horizontal orbit speed around the target (degrees per second). Mouse drag does not steer; scroll/pinch still zooms."
                    >
                      Orbit speed
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <input
                        id="fluid-orbit-speed"
                        type="range"
                        min={FLUID_ORBIT_SPEED_MIN_DEG}
                        max={FLUID_ORBIT_SPEED_MAX_DEG}
                        step={1}
                        value={fluidOrbitSpeed}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          uiLogger.change('Builder', 'Change fluid orbit speed', { degreesPerSecond: next })
                          onFluidOrbitSpeedChange(next)
                        }}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <span style={{ fontSize: 12, color: theme.text.muted, width: 44, textAlign: 'right' }}>
                        {fluidOrbitSpeed}°/s
                      </span>
                    </div>
                  </div>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="fluid-orbit-distance"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Fluid mode: orbit radius from the target pivot (world units). Scroll/pinch can still zoom live."
                    >
                      Orbit distance
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <input
                        id="fluid-orbit-distance"
                        type="range"
                        min={FLUID_ORBIT_DISTANCE_MIN}
                        max={FLUID_ORBIT_DISTANCE_MAX}
                        step={1}
                        value={fluidOrbitDistance}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          uiLogger.change('Builder', 'Change fluid orbit distance', { distance: next })
                          onFluidOrbitDistanceChange(next)
                        }}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <span style={{ fontSize: 12, color: theme.text.muted, width: 36, textAlign: 'right' }}>
                        {fluidOrbitDistance}
                      </span>
                    </div>
                  </div>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="fluid-orbit-height"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Fluid mode: camera height above the target pivot (world units). Higher values orbit further above the subject."
                    >
                      Orbit height
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <input
                        id="fluid-orbit-height"
                        type="range"
                        min={FLUID_ORBIT_HEIGHT_MIN}
                        max={FLUID_ORBIT_HEIGHT_MAX}
                        step={0.5}
                        value={fluidOrbitHeight}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          uiLogger.change('Builder', 'Change fluid orbit height', { height: next })
                          onFluidOrbitHeightChange(next)
                        }}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <span style={{ fontSize: 12, color: theme.text.muted, width: 36, textAlign: 'right' }}>
                        {fluidOrbitHeight}
                      </span>
                    </div>
                  </div>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="fluid-orbit-direction"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Reverse the automatic orbit direction."
                    >
                      Orbit direction
                    </label>
                    <select
                      id="fluid-orbit-direction"
                      value={fluidOrbitDirection}
                      onChange={(e) => {
                        const next = Number(e.target.value) as FluidOrbitDirection
                        uiLogger.change('Builder', 'Change fluid orbit direction', { direction: next })
                        onFluidOrbitDirectionChange(next)
                      }}
                      style={{ display: 'block', width: '100%' }}
                    >
                      <option value={1}>Default</option>
                      <option value={-1}>Reverse</option>
                    </select>
                  </div>
                </>
              ) : null}
            </>
          )}
        </>
      </CopyableArea>
      {avatarDialogOpen && avatarDialogEntityId ? (
        <AvatarDialog
          isOpen={avatarDialogOpen}
          onClose={() => {
            setAvatarDialogOpen(false)
            setAvatarDialogEntityId(null)
          }}
          world={world}
          entityId={avatarDialogEntityId}
          onWorldChange={onWorldChange}
          cameraTarget={cameraTarget}
          onCameraTargetChange={onCameraTargetChange}
          onEditingEntityIdChange={(id) => setAvatarDialogEntityId(id)}
          onRequestAvatarFocusSnapshot={getAvatarFocusSnapshot}
          cameraControl={cameraControl}
          onSelectEntity={onSelectEntity}
        />
      ) : null}
    </>
  )
}
