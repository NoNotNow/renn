import { useMemo, useState } from 'react'
import {
  type CameraMode,
  type Entity,
  type RennWorld,
  type AvatarFocusSnapshot,
  CAMERA_MODE_CYCLE_ORDER,
  CAMERA_MODE_LABELS,
} from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { theme } from '@/config/theme'
import { sidebarLabelStyle, sidebarRowStyle } from '../sharedStyles'
import { avatarEntityIconLetter, getAvatarRosterEntityIds } from '@/utils/avatarUtils'
import CopyableArea from '../CopyableArea'
import AvatarDialog from '../AvatarDialog'

export type CameraControl = 'free' | 'follow' | 'top' | 'front' | 'right'

const CAMERA_TARGET_VERTICAL_ANGLE_MIN = -45
const CAMERA_TARGET_VERTICAL_ANGLE_MAX = 45

export interface EntityCameraPanelProps {
  entities: Entity[]
  world: RennWorld
  cameraControl: CameraControl
  cameraTarget: string
  cameraMode: CameraMode
  cameraTargetVerticalAngle: number
  onCameraControlChange: (control: CameraControl) => void
  onCameraTargetChange: (target: string) => void
  onCameraModeChange: (mode: CameraMode) => void
  onCameraTargetVerticalAngleChange: (degrees: number) => void
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
  world,
  cameraControl,
  cameraTarget,
  cameraMode,
  cameraTargetVerticalAngle,
  onCameraControlChange,
  onCameraTargetChange,
  onCameraModeChange,
  onCameraTargetVerticalAngleChange,
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
                  htmlFor="camera-target"
                  style={{ ...sidebarLabelStyle, cursor: 'help' }}
                  title="Entity the follow camera looks at (usually a playable avatar)."
                >
                  Target
                </label>
                <select
                  id="camera-target"
                  value={cameraTarget}
                  onChange={(e) => {
                    uiLogger.change('Builder', 'Change camera target', { target: e.target.value })
                    onCameraTargetChange(e.target.value)
                  }}
                  style={{ display: 'block', width: '100%' }}
                >
                  <option value="">— None —</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>{e.name ?? e.id}</option>
                  ))}
                </select>
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
