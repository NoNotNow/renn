import { useEffect, useMemo, useState } from 'react'
import type { Entity, RennWorld, EntityAvatarConfig } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import type { CameraMode } from '@/types/world'
import Modal from './Modal'
import Switch from './Switch'
import TransformerEditor from './TransformerEditor'
import EntityScriptEditor from './EntityScriptEditor'
import CollapsibleSection from './CollapsibleSection'
import { CAMERA_MODE_CYCLE_ORDER, CAMERA_MODE_LABELS } from '@/types/world'
import { fieldLabelStyle, sidebarTextInputStyle } from './sharedStyles'
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

  const preferredMode: CameraMode =
    entity.avatar?.preferredCamera?.mode ?? world.world.camera?.mode ?? 'follow'

  const preferredDistanceValue: number | '' =
    entity.avatar?.preferredCamera?.distance ?? ''

  const pos = jsonParseError ? extractJsonErrorPosition(jsonParseError) : null
  const { line, col, lineText } = pos != null ? lineColFromPosition(draftAvatarJson, pos) : { line: 0, col: 0, lineText: '' }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Avatar: ${entity.name ?? entity.id}`} width={720} height={880}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {onCameraTargetChange && avatarRosterEntities.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: '#9aa4b2', minWidth: 54 }}>Avatars</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                    title={`Camera target: ${e.name ?? e.id}`}
                    aria-label={`Select avatar ${e.name ?? e.id}`}
                    aria-pressed={active}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      background: active ? '#2a2d45' : 'rgba(0,0,0,0.2)',
                      border: active ? '1px solid #4a9eff' : '1px solid #2f3545',
                      color: '#e6e9f2',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {avatarEntityIconLetter(e)}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <CollapsibleSection title="Playable + Preferred Camera" defaultCollapsed={false}>
          <Switch
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

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabelStyle}>Preferred camera mode</label>
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
                  style={{ ...sidebarTextInputStyle, padding: '6px 8px' }}
                >
                  {CAMERA_MODE_CYCLE_ORDER.map((m) => (
                    <option key={m} value={m}>
                      {CAMERA_MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ width: 180 }}>
                <label style={fieldLabelStyle}>Preferred distance</label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={preferredDistanceValue}
                  placeholder="World default"
                  disabled={entity.avatar?.enabled === false}
                  onChange={(e) => {
                    const raw = e.target.value
                    const nextPref: NonNullable<EntityAvatarConfig['preferredCamera']> = {
                      ...(entity.avatar?.preferredCamera ?? {}),
                    }
                    if (raw === '') {
                      delete (nextPref as any).distance
                    } else {
                      ;(nextPref as any).distance = Number(raw)
                    }
                    applyUpdate({
                      avatar: {
                        ...(entity.avatar ?? { enabled: true }),
                        enabled: true,
                        preferredCamera: nextPref,
                      },
                    })
                  }}
                  style={sidebarTextInputStyle}
                />
              </div>
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

