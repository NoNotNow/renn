import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Entity, RennWorld, EntityPreferredCamera, AvatarFocusSnapshot } from '@/types/world'
import type { CameraMode } from '@/types/world'
import Modal from './Modal'
import Switch from './Switch'
import Workspace from './Workspace'
import CollapsibleSection from './CollapsibleSection'
import ValidatedJsonTextarea, { type JsonContentValidation } from './ValidatedJsonTextarea'
import { CAMERA_MODE_CYCLE_ORDER, CAMERA_MODE_LABELS } from '@/types/world'
import { fieldLabelStyle, secondaryButtonStyleDisabled, sidebarTextInputStyle } from './sharedStyles'
import { theme } from '@/config/theme'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { uiLogger } from '@/utils/uiLogger'
import { normalizeAvatarDraft } from '@/utils/entityAvatarValidation'
import { avatarEntityIconLetter, getAvatarRosterEntityIds } from '@/utils/avatarUtils'
import type { WorkspaceTarget } from '@/types/workspace'

export interface AvatarDialogProps {
  isOpen: boolean
  onClose: () => void
  world: RennWorld
  entityId: string
  onWorldChange: (world: RennWorld) => void
  /** Follow camera target (play mode / sidebar). When set with {@link onCameraTargetChange}, roster chips appear. */
  cameraTarget?: string
  onCameraTargetChange?: (entityId: string) => void
  /** Switch which entity this dialog edits when a roster chip is chosen (e.g. Builder sidebar state). */
  onEditingEntityIdChange?: (entityId: string) => void
  /** Builder: capture live follow/orbit camera for “set as default”. */
  onRequestAvatarFocusSnapshot?: () => AvatarFocusSnapshot | null
  /** Builder camera control; “set default” only when follow (matches runtime camera). */
  cameraControl?: 'free' | 'follow' | 'top' | 'front' | 'right'
}

function avatarJsonString(entity: Entity): string {
  if (!entity.avatar) return 'null'
  return JSON.stringify(entity.avatar, null, 2)
}

export default function AvatarDialog({
  isOpen,
  onClose,
  world,
  entityId,
  onWorldChange,
  cameraTarget,
  onCameraTargetChange,
  onEditingEntityIdChange,
  onRequestAvatarFocusSnapshot,
  cameraControl,
}: AvatarDialogProps) {
  const undo = useEditorUndo()

  const entity = useMemo(() => world.entities.find((e) => e.id === entityId) ?? null, [world, entityId])

  const avatarRosterEntityIds = useMemo(() => getAvatarRosterEntityIds(world.entities), [world.entities])
  const avatarRosterEntities = useMemo(() => {
    const byId = new Map(world.entities.map((e) => [e.id, e] as const))
    return avatarRosterEntityIds.map((id) => byId.get(id)!).filter((e) => Boolean(e))
  }, [avatarRosterEntityIds, world.entities])

  const avatarRosterFocusEntityId = useMemo(() => {
    if (cameraTarget && avatarRosterEntityIds.includes(cameraTarget)) return cameraTarget
    return avatarRosterEntityIds[0] ?? null
  }, [cameraTarget, avatarRosterEntityIds])

  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceEntry, setWorkspaceEntry] = useState<WorkspaceTarget | null>(null)

  const openWorkspace = useCallback((tab: 'transformers' | 'scripts', itemId?: string) => {
    setWorkspaceEntry({ entityId, tab, itemId })
    setWorkspaceOpen(true)
  }, [entityId])

  const currentAvatarEnabled = entity?.avatar?.enabled !== false

  const [avatarJsonSeed, setAvatarJsonSeed] = useState<string>(() =>
    avatarJsonString(entity ?? ({ id: entityId } as Entity)),
  )

  useEffect(() => {
    if (!entity) return
    setAvatarJsonSeed(avatarJsonString(entity))
    // Re-seed only when switching entities or reopening the dialog so the
    // textarea preserves unapplied edits while the dialog stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, isOpen])

  const validateAvatarJson = (parsed: unknown): JsonContentValidation => {
    const normalized = normalizeAvatarDraft(parsed)
    if (normalized.error) return { ok: false, error: normalized.error }
    return { ok: true }
  }

  const onApplyAvatarJson = (parsed: unknown) => {
    if (!entity) return
    const normalized = normalizeAvatarDraft(parsed)
    if (normalized.error) return
    undo?.pushBeforeEdit()
    uiLogger.change('AvatarDialog', 'Apply avatar JSON', { entityId })
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === entityId ? { ...e, avatar: normalized.avatar } : e,
      ),
    })
  }

  const applyUpdate = (patch: Partial<Entity>) => {
    if (!entity) return
    undo?.pushBeforeEdit()
    uiLogger.change('AvatarDialog', 'Update avatar/transformers', { entityId })
    onWorldChange({
      ...world,
      entities: world.entities.map((e) => (e.id === entityId ? { ...e, ...patch } : e)),
    })
  }

  if (!isOpen || !entity) return null

  const canSetDefaultCamera =
    Boolean(onRequestAvatarFocusSnapshot) && cameraControl === 'follow' && entity.avatar?.enabled !== false

  const onSetDefaultCamera = () => {
    if (!onRequestAvatarFocusSnapshot || !canSetDefaultCamera) return
    const snap = onRequestAvatarFocusSnapshot()
    if (!snap) return
    undo?.pushBeforeEdit()
    uiLogger.change('AvatarDialog', 'Set preferred camera from live view', { entityId })
    const nextPref: EntityPreferredCamera = {
      ...(entity.avatar?.preferredCamera ?? {}),
      mode: snap.mode,
      control: snap.control,
      distance: snap.distance,
      height: snap.height,
      fov: snap.mode === 'firstPerson' ? snap.effectiveFovDegrees : snap.fov,
      orbitYaw: snap.orbitYaw,
      orbitPitch: snap.orbitPitch,
      orbitDistance: snap.orbitDistance,
      targetVerticalAngle: snap.targetVerticalAngle ?? 0,
    }
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === entityId
          ? {
              ...e,
              avatar: {
                ...(e.avatar ?? { enabled: true }),
                enabled: true,
                preferredCamera: nextPref,
              },
            }
          : e,
      ),
    })
  }

  const preferredMode: CameraMode =
    entity.avatar?.preferredCamera?.mode ?? world.world.camera?.mode ?? 'follow'

  const preferredDistanceValue: number | '' =
    entity.avatar?.preferredCamera?.distance ?? ''

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Avatar · ${entity.name ?? entity.id}`} width={760} height={900}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {onCameraTargetChange && avatarRosterEntities.length > 0 ? (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.section,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: theme.text.muted,
                marginBottom: 8,
                cursor: 'help',
              }}
              title="Which playable avatar the builder camera follows; does not change which entity you are editing until you pick from the roster."
            >
              Camera focus
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {avatarRosterEntities.map((e) => {
                const active = e.id === avatarRosterFocusEntityId
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      uiLogger.change('AvatarDialog', 'Select avatar roster', { targetId: e.id })
                      onCameraTargetChange(e.id)
                      onEditingEntityIdChange?.(e.id)
                    }}
                    title={`Follow target: ${e.name ?? e.id}`}
                    aria-label={`Select avatar ${e.name ?? e.id}`}
                    aria-pressed={active}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: active ? theme.button.pick : theme.bg.input,
                      border: active ? `1px solid ${theme.booster.tileSelectBorder}` : `1px solid ${theme.border.default}`,
                      color: theme.text.primary,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    {avatarEntityIconLetter(e)}
                  </button>
                )
              })}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.45, color: theme.hint }}>
              Choose which avatar the viewport follows. Editing below applies to the entity named in the title.
            </p>
          </div>
        ) : null}

        <CollapsibleSection
          title="Playable & camera defaults"
          titleTooltip="Turn the entity into a player-controlled avatar and set default follow camera mode and distance for play mode."
          defaultCollapsed={false}
        >
          <Switch
            labelTitle="When on, this entity can be selected as the runtime player and receives avatar-specific camera defaults."
            checked={currentAvatarEnabled}
            onChange={(checked) => {
              applyUpdate({
                avatar: checked
                  ? { ...(entity.avatar ?? { enabled: true }), enabled: true }
                  : undefined,
              })
            }}
            label="Playable avatar"
          />

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label
                  style={{ ...fieldLabelStyle, cursor: 'help' }}
                  title="Camera behavior when this avatar is active in play (orbit, first person, chase, etc.)."
                >
                  Preferred camera mode
                </label>
                <select
                  value={preferredMode}
                  onChange={(e) => {
                    const mode = e.target.value as CameraMode
                    applyUpdate({
                      avatar: {
                        ...(entity.avatar ?? { enabled: true }),
                        enabled: true,
                        preferredCamera: {
                          ...(entity.avatar?.preferredCamera ?? {}),
                          mode,
                        },
                      },
                    })
                  }}
                  disabled={entity.avatar?.enabled === false}
                  style={{
                    ...sidebarTextInputStyle,
                    padding: '8px 10px',
                    background: theme.bg.input,
                    border: `1px solid ${theme.border.default}`,
                    color: theme.text.primary,
                  }}
                >
                  {CAMERA_MODE_CYCLE_ORDER.map((m) => (
                    <option key={m} value={m}>
                      {CAMERA_MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ width: 180, minWidth: 140 }}>
                <label
                  style={{ ...fieldLabelStyle, cursor: 'help' }}
                  title="Follow/third-person camera distance; leave empty to inherit the world’s default camera distance."
                >
                  Preferred distance
                </label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={preferredDistanceValue}
                  placeholder="World default"
                  disabled={entity.avatar?.enabled === false}
                  onChange={(e) => {
                    const raw = e.target.value
                    const nextPref: EntityPreferredCamera = {
                      ...(entity.avatar?.preferredCamera ?? {}),
                    }
                    if (raw === '') {
                      delete nextPref.distance
                    } else {
                      nextPref.distance = Number(raw)
                    }
                    applyUpdate({
                      avatar: {
                        ...(entity.avatar ?? { enabled: true }),
                        enabled: true,
                        preferredCamera: nextPref,
                      },
                    })
                  }}
                  style={{
                    ...sidebarTextInputStyle,
                    background: theme.bg.input,
                    border: `1px solid ${theme.border.default}`,
                    color: theme.text.primary,
                  }}
                />
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                border: `1px solid ${theme.border.default}`,
                background: 'rgba(35, 40, 54, 0.45)',
              }}
            >
              <div style={{ fontSize: 12, color: theme.text.secondary, marginBottom: 8 }}>
                Saved view for this avatar
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 11, lineHeight: 1.5, color: theme.hint }}>
                When you switch to this avatar (or return after visiting another), the camera uses the saved orbit and
                distance if no live session memory exists yet.
              </p>
              <button
                type="button"
                disabled={!canSetDefaultCamera}
                onClick={onSetDefaultCamera}
                aria-label="Set current camera as default"
                data-testid="avatar-set-default-camera"
                style={{
                  ...(canSetDefaultCamera ? {} : secondaryButtonStyleDisabled),
                  width: '100%',
                  padding: '9px 14px',
                  fontWeight: 500,
                  border: `1px solid ${canSetDefaultCamera ? theme.button.applyBorder : theme.border.default}`,
                  background: canSetDefaultCamera ? theme.button.apply : theme.bg.surface,
                  color: canSetDefaultCamera ? theme.text.primary : theme.text.disabled,
                  cursor: canSetDefaultCamera ? 'pointer' : 'not-allowed',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                Set current camera as default
              </button>
              {!onRequestAvatarFocusSnapshot ? (
                <p style={{ margin: '8px 0 0', fontSize: 10, color: theme.text.muted }}>Unavailable in this context.</p>
              ) : cameraControl !== 'follow' ? (
                <p style={{ margin: '8px 0 0', fontSize: 10, color: theme.text.muted }}>
                  Switch the Builder camera to <strong style={{ color: theme.text.secondary }}>Follow</strong> to capture
                  the orbit you see in the viewport.
                </p>
              ) : null}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Avatar JSON (advanced)" defaultCollapsed>
          <ValidatedJsonTextarea
            value={avatarJsonSeed}
            validate={validateAvatarJson}
            onApply={onApplyAvatarJson}
            applyLabel="Apply"
            textareaTestId="avatar-json-textarea"
            applyTestId="avatar-json-apply"
          />
        </CollapsibleSection>

        <CollapsibleSection title="Transformers" defaultCollapsed>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: theme.text.secondary }}>
            {entity.transformers && entity.transformers.length > 0
              ? `${entity.transformers.length} transformer${entity.transformers.length > 1 ? 's' : ''} attached.`
              : 'No transformers attached.'}
          </p>
          {entity.transformers && entity.transformers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {entity.transformers.map((tid) => {
                const def = world.transformers?.[tid]
                return (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => openWorkspace('transformers', tid)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${theme.border.default}`,
                      background: theme.bg.surface,
                      color: theme.text.primary,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <strong>{def?.name ?? def?.type ?? tid}</strong>
                    <span style={{ color: theme.text.muted, fontSize: 11, marginLeft: 6 }}>{tid}</span>
                  </button>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => openWorkspace('transformers')}
            style={{
              padding: '7px 12px',
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.surface,
              color: theme.text.primary,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Open Workspace — Transformers
          </button>
        </CollapsibleSection>

        <CollapsibleSection title="Scripts" defaultCollapsed={false}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: theme.text.secondary }}>
            {entity.scripts && entity.scripts.length > 0
              ? `${entity.scripts.length} script${entity.scripts.length > 1 ? 's' : ''} attached.`
              : 'No scripts attached.'}
          </p>
          {entity.scripts && entity.scripts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {entity.scripts.map((sid) => {
                const def = world.scripts?.[sid]
                return (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => openWorkspace('scripts', sid)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${theme.border.default}`,
                      background: theme.bg.surface,
                      color: theme.text.primary,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <strong>{sid}</strong>
                    {def?.event && (
                      <span style={{ color: theme.text.muted, fontSize: 11, marginLeft: 6 }}>{def.event}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => openWorkspace('scripts')}
            style={{
              padding: '7px 12px',
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.surface,
              color: theme.text.primary,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Open Workspace — Scripts
          </button>
        </CollapsibleSection>
      </div>
      <Workspace
        open={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
        entry={workspaceEntry}
        world={world}
        selectedEntityIds={[entityId]}
        onWorldChange={onWorldChange}
      />
    </Modal>
  )
}

