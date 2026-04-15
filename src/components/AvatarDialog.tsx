import { useEffect, useMemo, useState } from 'react'
import type { Entity, RennWorld, EntityPreferredCamera, AvatarFocusSnapshot } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import type { CameraMode } from '@/types/world'
import Modal from './Modal'
import Switch from './Switch'
import TransformerEditor from './TransformerEditor'
import EntityScriptEditor from './EntityScriptEditor'
import CollapsibleSection from './CollapsibleSection'
import { CAMERA_MODE_CYCLE_ORDER, CAMERA_MODE_LABELS } from '@/types/world'
import { fieldLabelStyle, secondaryButtonStyleDisabled, sidebarTextInputStyle } from './sharedStyles'
import { theme } from '@/config/theme'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { uiLogger } from '@/utils/uiLogger'
import { validateEntityAvatarConfig, normalizeAvatarDraft } from '@/utils/entityAvatarValidation'
import { jsonTextareaRows } from '@/utils/jsonTextareaRows'
import { avatarEntityIconLetter, getAvatarRosterEntityIds } from '@/utils/avatarUtils'

function extractJsonErrorPosition(message: string): number | null {
  const m = /position (\d+)/i.exec(message)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function lineColFromPosition(text: string, pos: number): { line: number; col: number; lineText: string } {
  // pos is an absolute character index inside the string.
  // JSON.parse's message is usually 0-based.
  const before = text.slice(0, pos)
  const parts = before.split('\n')
  const line = parts.length
  const col = parts[parts.length - 1]!.length + 1
  const lineStart = before.lastIndexOf('\n') + 1
  const lineEnd = text.indexOf('\n', pos)
  const end = lineEnd >= 0 ? lineEnd : text.length
  const lineText = text.slice(lineStart, end)
  return { line, col, lineText }
}

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
  const transformers: TransformerConfig[] = entity?.transformers ?? []

  const currentAvatarEnabled = entity?.avatar?.enabled !== false

  const [draftAvatarJson, setDraftAvatarJson] = useState<string>(() => avatarJsonString(entity ?? { id: entityId } as Entity))
  const [jsonParseError, setJsonParseError] = useState<string | null>(null)
  const [jsonParseValid, setJsonParseValid] = useState<boolean>(true)
  const [parsedDraft, setParsedDraft] = useState<unknown>(null)

  useEffect(() => {
    if (!entity) return
    setDraftAvatarJson(avatarJsonString(entity))
    setJsonParseError(null)
    setJsonParseValid(true)
    setParsedDraft(entity.avatar ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, isOpen])

  const avatarJsonValidation = useMemo(() => {
    if (!jsonParseValid) return { ok: false, error: jsonParseError ?? 'Invalid JSON.' }
    const parsed = parsedDraft
    if (parsed === null) return { ok: true, error: null as string | null }
    const v = validateEntityAvatarConfig(parsed)
    if (v.valid) return { ok: true, error: null as string | null }
    return { ok: false, error: v.errors.join('\n') }
  }, [jsonParseValid, jsonParseError, parsedDraft])

  const onApplyAvatarJson = () => {
    if (!entity) return
    if (!avatarJsonValidation.ok) return
    const normalized = normalizeAvatarDraft(parsedDraft)
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

  const pos = jsonParseError ? extractJsonErrorPosition(jsonParseError) : null
  const { line, col, lineText } = pos != null ? lineColFromPosition(draftAvatarJson, pos) : { line: 0, col: 0, lineText: '' }

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              value={draftAvatarJson}
              onChange={(e) => {
                const next = e.target.value
                setDraftAvatarJson(next)
                try {
                  const parsed = JSON.parse(next) as unknown
                  setJsonParseValid(true)
                  setJsonParseError(null)
                  setParsedDraft(parsed)
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err)
                  setJsonParseValid(false)
                  setJsonParseError(msg)
                  setParsedDraft(null)
                }
              }}
              rows={jsonTextareaRows(draftAvatarJson)}
              style={{
                margin: 0,
                padding: 8,
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 4,
                fontSize: 11,
                overflow: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre',
                resize: 'vertical',
                width: '100%',
                boxSizing: 'border-box',
                color: jsonParseValid ? '#c4cbd8' : '#f87171',
                border: jsonParseValid ? '1px solid #2f3545' : '1px solid #dc2626',
              }}
              spellCheck={false}
              data-testid="avatar-json-textarea"
            />

            {!jsonParseValid && jsonParseError ? (
              <div style={{ fontSize: 10, color: '#f87171' }}>
                <div>Invalid JSON: {jsonParseError}</div>
                {pos != null ? (
                  <pre style={{ margin: '8px 0 0', color: '#f87171', fontFamily: 'monospace' }}>
                    {`Line ${line}, Col ${col}\n${lineText}\n${' '.repeat(Math.max(0, col - 1))}^`}
                  </pre>
                ) : null}
              </div>
            ) : null}

            {jsonParseValid && avatarJsonValidation.ok === false ? (
              <div style={{ fontSize: 10, color: '#f87171' }}>
                <div>Avatar config does not match schema:</div>
                <pre style={{ margin: '6px 0 0', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  {avatarJsonValidation.error ?? ''}
                </pre>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={onApplyAvatarJson}
                disabled={!avatarJsonValidation.ok}
                style={{
                  padding: '6px 12px',
                  background: avatarJsonValidation.ok ? '#1e3a5f' : '#2a2a2a',
                  border: '1px solid #3b6ea8',
                  color: avatarJsonValidation.ok ? '#93c5fd' : '#666',
                  borderRadius: 6,
                  cursor: avatarJsonValidation.ok ? 'pointer' : 'not-allowed',
                  fontSize: 12,
                }}
                aria-label="Apply avatar JSON"
                data-testid="avatar-json-apply"
              >
                Apply
              </button>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Transformers" defaultCollapsed>
          <TransformerEditor
            transformers={transformers}
            onChange={(next) => applyUpdate({ transformers: next })}
            disabled={false}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Scripts" defaultCollapsed={false}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#9aa4b2' }}>
            Select a script snippet, edit code, apply changes, or use Manage scripts to attach and detach snippets from this
            avatar.
          </p>
          <EntityScriptEditor
            key={entityId}
            world={world}
            entityId={entityId}
            onWorldChange={onWorldChange}
            showHeadingRow={false}
            editorHeightPx={280}
          />
        </CollapsibleSection>
      </div>
    </Modal>
  )
}

