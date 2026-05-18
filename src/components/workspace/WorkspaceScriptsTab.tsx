import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { RennWorld, ScriptDef, ScriptEvent } from '@/types/world'
import type { WorkspaceMonacoPayload, WorkspaceTarget } from '@/types/workspace'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import WorkspaceGlobalScriptPanel from '@/components/workspace/WorkspaceGlobalScriptPanel'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { getScriptDef } from '@/scripts/scriptDef'
import { uiLogger } from '@/utils/uiLogger'
import { theme } from '@/config/theme'

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

const SCRIPT_EVENTS: ScriptEvent[] = ['onSpawn', 'onUpdate', 'onCollision', 'onTimer']

const manageScriptsButtonStyle: CSSProperties = {
  padding: '6px 12px',
  background: theme.button.selectable,
  border: `1px solid ${theme.button.selectableBorder}`,
  color: theme.text.primary,
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
}

const monoSelectStyle: CSSProperties = {
  minWidth: 160,
  padding: '6px 8px',
  borderRadius: 6,
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  fontSize: 12,
}

const compactSelectStyle: CSSProperties = {
  padding: '4px 6px',
  borderRadius: 4,
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  fontSize: 12,
}

const intervalInputStyle: CSSProperties = {
  width: 64,
  padding: 4,
  borderRadius: 4,
  border: `1px solid ${theme.border.default}`,
  background: theme.bg.panelAlt,
  color: theme.text.primary,
}

function getEntitiesUsingScript(world: RennWorld, scriptId: string): { id: string; name?: string }[] {
  return world.entities.filter((e) => e.scripts?.includes(scriptId)).map((e) => ({ id: e.id, name: e.name }))
}

function scriptIdsIntersectionForEntities(entities: { scripts?: string[] }[]): string[] {
  if (entities.length === 0) return []
  let common = new Set(entities[0]!.scripts ?? [])
  for (let i = 1; i < entities.length; i++) {
    const next = new Set(entities[i]!.scripts ?? [])
    common = new Set([...common].filter((id) => next.has(id)))
  }
  return [...common]
}

export interface WorkspaceScriptsTabProps {
  world: RennWorld
  selectedEntityIds: string[]
  entry: WorkspaceTarget | null | undefined
  workspaceOpen: boolean
  onWorldChange: (world: RennWorld) => void
  setMonacoPayload: (payload: WorkspaceMonacoPayload) => void
  monacoSlot: ReactNode
  /** Opens Organize scoped to scripts on the current entity selection (replaces legacy Script dialog). */
  onOpenOrganizeScripts: () => void
  globalLibrary?: GlobalBehaviorLibrary
  onGlobalLibraryChange?: (next: GlobalBehaviorLibrary) => void
  onSelectEntity?: (id: string) => void
}

/** Scripts Workspace body: assigned script chips, event controls, shared Monaco. */
export default function WorkspaceScriptsTab(props: WorkspaceScriptsTabProps) {
  if (
    props.entry?.itemSource === 'global' &&
    props.entry.itemId &&
    props.globalLibrary &&
    props.onGlobalLibraryChange
  ) {
    return (
      <WorkspaceGlobalScriptPanel
        anchorItemId={props.entry.itemId}
        globalScripts={props.globalLibrary.scripts}
        onGlobalScriptsChange={(scripts) => props.onGlobalLibraryChange!({ ...props.globalLibrary!, scripts })}
        world={props.world}
        setMonacoPayload={props.setMonacoPayload}
        monacoSlot={props.monacoSlot}
      />
    )
  }
  return <WorkspaceScriptsTabEntity {...props} />
}

function WorkspaceScriptsTabEntity({
  world,
  selectedEntityIds,
  entry,
  workspaceOpen,
  onWorldChange,
  setMonacoPayload,
  monacoSlot,
  onOpenOrganizeScripts,
  onSelectEntity,
}: WorkspaceScriptsTabProps) {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()

  const scripts = world.scripts ?? {}
  const scriptIds = Object.keys(scripts)
  const selectedEntities = selectedEntityIds
    .map((id) => world.entities.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => e != null)
  const entityScriptIds = scriptIdsIntersectionForEntities(selectedEntities)

  const attachedScriptIdsOrdered = entityScriptIds.filter((id) => scripts[id] != null)
  const dropdownOptions =
    selectedEntityIds.length > 0
      ? [...attachedScriptIdsOrdered, ...scriptIds.filter((id) => !entityScriptIds.includes(id))]
      : scriptIds

  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const selectionValid = selectedId && scriptIds.includes(selectedId)
    if (selectionValid) return
    if (selectedEntityIds.length > 0 && attachedScriptIdsOrdered.length > 0) {
      setSelectedId(attachedScriptIdsOrdered[0]!)
    } else if (scriptIds.length > 0) {
      setSelectedId(scriptIds[0]!)
    } else {
      setSelectedId(null)
    }
  }, [selectedEntityIds.join(','), attachedScriptIdsOrdered.join(','), scriptIds.join(','), selectedId])

  useEffect(() => {
    if (!workspaceOpen || entry?.tab !== 'scripts' || !entry.itemId) return
    if (!scriptIds.includes(entry.itemId)) return
    setSelectedId(entry.itemId)
  }, [workspaceOpen, entry?.tab, entry?.itemId, scriptIds.join(',')])

  const def = selectedId ? getScriptDef(scripts, selectedId) : null
  const source = def?.source ?? ''
  const event = def?.event ?? 'onUpdate'
  const interval = def?.event === 'onTimer' ? def.interval : 1

  const [draftSource, setDraftSource] = useState(source)
  useLayoutEffect(() => {
    setDraftSource(source)
  }, [selectedId, source])

  const handleApply = () => {
    if (!selectedId) return
    pushUndo()
    uiLogger.change('WorkspaceScriptsTab', 'Apply script', { scriptId: selectedId, contentLength: draftSource.length })
    const current = getScriptDef(scripts, selectedId)
    const nextDef: ScriptDef =
      current?.event === 'onTimer'
        ? { event: 'onTimer', interval: current.interval, source: draftSource }
        : { event: (current?.event ?? 'onUpdate') as 'onSpawn' | 'onUpdate' | 'onCollision', source: draftSource }
    onWorldChange({
      ...world,
      scripts: { ...scripts, [selectedId]: nextDef },
    })
  }

  const isDirty = draftSource !== source

  const handleEventChange = (newEvent: ScriptEvent) => {
    if (!selectedId) return
    pushUndo()
    const current = getScriptDef(scripts, selectedId)
    const nextDef: ScriptDef =
      newEvent === 'onTimer'
        ? { event: 'onTimer', interval: current?.event === 'onTimer' ? current.interval : 1, source: current?.source ?? '' }
        : { event: newEvent, source: current?.source ?? '' }
    onWorldChange({ ...world, scripts: { ...scripts, [selectedId]: nextDef } })
  }

  const handleIntervalChange = (seconds: number) => {
    if (!selectedId || event !== 'onTimer') return
    pushUndo()
    const current = getScriptDef(scripts, selectedId)
    if (current?.event !== 'onTimer') return
    onWorldChange({
      ...world,
      scripts: { ...scripts, [selectedId]: { event: 'onTimer', interval: Math.max(0.001, seconds), source: current.source } },
    })
  }

  const handleAdd = () => {
    const id = prompt('Script ID:', `script_${Date.now()}`)
    if (!id) return
    if (scripts[id]) {
      alert('A script with this ID already exists.')
      return
    }
    pushUndo()
    uiLogger.click('WorkspaceScriptsTab', 'Add new script', { scriptId: id })
    const nextScripts = { ...scripts, [id]: { event: 'onUpdate' as const, source: '// ctx.log(ctx.entity.id);' } }
    const idSet = new Set(selectedEntityIds)
    const nextEntities =
      selectedEntityIds.length > 0
        ? world.entities.map((e) => (idSet.has(e.id) ? { ...e, scripts: [...(e.scripts ?? []), id] } : e))
        : world.entities
    onWorldChange({
      ...world,
      scripts: nextScripts,
      entities: nextEntities,
    })
    setSelectedId(id)
  }

  const handleDetachFromEntity = () => {
    if (!selectedId || selectedEntityIds.length === 0) return
    pushUndo()
    if (!entityScriptIds.includes(selectedId)) return
    uiLogger.click('WorkspaceScriptsTab', 'Detach script from entities', {
      scriptId: selectedId,
      entityIds: selectedEntityIds,
    })
    const nextEntityScripts = entityScriptIds.filter((sid) => sid !== selectedId)
    const idSet = new Set(selectedEntityIds)
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        idSet.has(e.id) ? { ...e, scripts: nextEntityScripts } : e,
      ),
    })
    const remaining = attachedScriptIdsOrdered.filter((sid) => sid !== selectedId)
    setSelectedId(remaining[0] ?? scriptIds.filter((k) => k !== selectedId)[0] ?? null)
  }

  const isAttachedToSelectedEntity =
    selectedEntityIds.length > 0 && Boolean(selectedId && entityScriptIds.includes(selectedId))
  const entitiesUsingSelectedScript = selectedId ? getEntitiesUsingScript(world, selectedId) : []
  const isSharedScript = entitiesUsingSelectedScript.length > 1

  const handleDraftChange = useCallback((text: string) => {
    setDraftSource(text)
  }, [])

  const entityDisplayName =
    selectedEntities.length === 0
      ? 'Entity'
      : selectedEntities.length === 1
        ? selectedEntities[0]!.name ?? selectedEntities[0]!.id
        : `${selectedEntities.length} entities`

  const noEntity = selectedEntityIds.length === 0

  const hasScriptSelection = Boolean(selectedId && scripts[selectedId] != null)

  useLayoutEffect(() => {
    if (noEntity && !hasScriptSelection) {
      setMonacoPayload({
        kind: 'placeholder',
        value: '// Select an entity in the builder to edit scripts.\n',
        onChange: () => {},
        disabled: true,
        refreshKey: 0,
      })
      return
    }
    if (!hasScriptSelection) {
      setMonacoPayload({
        kind: 'placeholder',
        value: '// Add or attach a script, then select it above.\n',
        onChange: () => {},
        disabled: true,
        refreshKey: 0,
      })
      return
    }
    setMonacoPayload({
      kind: 'script-js',
      value: draftSource,
      onChange: handleDraftChange,
      disabled: false,
      refreshKey: strHash(selectedId ?? ''),
      scriptEvent: event,
    })
  }, [noEntity, hasScriptSelection, draftSource, handleDraftChange, event, setMonacoPayload, selectedId])

  const chipBase: CSSProperties = {
    padding: '5px 10px',
    borderRadius: 999,
    fontSize: 12,
    border: `1px solid ${theme.border.default}`,
    cursor: 'pointer',
    background: theme.bg.panelAlt,
    color: theme.text.primary,
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '0 0 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          borderBottom: `1px solid ${theme.border.default}`,
        }}
      >
        {selectedEntityIds.length > 0 ?
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.text.primary }}>Scripts · {entityDisplayName}</h3>
            <button type="button" onClick={() => onOpenOrganizeScripts()} style={manageScriptsButtonStyle}>
              Manage
            </button>
          </div>
        : <p style={{ margin: 0, fontSize: 13, color: theme.text.muted }}>Select an entity to attach and edit scripts.</p>
        }

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.text.muted, marginRight: 4 }}>Attached</span>
          {attachedScriptIdsOrdered.length === 0 ?
            <span style={{ fontSize: 12, color: theme.text.muted }}>No scripts attached</span>
          : attachedScriptIdsOrdered.map((id) => {
              const active = id === selectedId
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`workspace-script-chip-${id}`}
                  title={id}
                  onClick={() => {
                    uiLogger.click('WorkspaceScriptsTab', 'Select script chip', { scriptId: id })
                    setSelectedId(id)
                  }}
                  style={{
                    ...chipBase,
                    borderColor: active ? theme.accent : theme.border.default,
                    background: active ? 'rgba(43, 53, 80, 0.45)' : theme.bg.panelAlt,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {id}
                </button>
              )
            })
          }
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: theme.text.muted }}>
            Active
            <select
              value={selectedId ?? ''}
              onChange={(e) => {
                uiLogger.select('WorkspaceScriptsTab', 'Select script', { scriptId: e.target.value })
                setSelectedId(e.target.value || null)
              }}
              style={{ ...monoSelectStyle, marginLeft: 6 }}
              data-testid="workspace-script-select"
            >
              <option value="">— Select script —</option>
              {selectedEntityIds.length > 0 && attachedScriptIdsOrdered.length > 0 && (
                <optgroup label={selectedEntityIds.length > 1 ? 'On all selected' : 'Attached'}>
                  {attachedScriptIdsOrdered.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </optgroup>
              )}
              {dropdownOptions.filter((id) => !attachedScriptIdsOrdered.includes(id)).length > 0 && (
                <optgroup label={selectedEntityIds.length > 0 ? 'Other scripts' : 'All scripts'}>
                  {dropdownOptions
                    .filter((id) => !attachedScriptIdsOrdered.includes(id))
                    .map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </label>

          {def && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Event
                <select
                  value={event}
                  onChange={(e) => handleEventChange(e.target.value as ScriptEvent)}
                  style={compactSelectStyle}
                  data-testid="workspace-script-event"
                >
                  {SCRIPT_EVENTS.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </label>
              {event === 'onTimer' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Interval (s)
                  <input
                    type="number"
                    min={0.001}
                    step={0.1}
                    value={interval}
                    onChange={(e) => handleIntervalChange(Number(e.target.value))}
                    style={intervalInputStyle}
                  />
                </label>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleAdd}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.surface,
              color: theme.text.primary,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Add script
          </button>
          <button
            type="button"
            onClick={handleDetachFromEntity}
            disabled={!selectedId || selectedEntityIds.length === 0 || !isAttachedToSelectedEntity}
            title={
              selectedEntityIds.length === 0
                ? 'Select an entity first'
                : !isAttachedToSelectedEntity
                  ? selectedEntityIds.length > 1
                    ? 'Not attached to all selected entities'
                    : 'This script is not attached to the selected entity'
                  : 'Remove from selected entities (definition stays in world)'
            }
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background:
                selectedId && selectedEntityIds.length > 0 && isAttachedToSelectedEntity
                  ? theme.feedback.destructiveSelectedBg
                  : theme.bg.surface,
              color:
                selectedId && selectedEntityIds.length > 0 && isAttachedToSelectedEntity
                  ? theme.feedback.destructiveSelectedText
                  : theme.text.disabled,
              cursor:
                selectedId && selectedEntityIds.length > 0 && isAttachedToSelectedEntity ? 'pointer' : 'not-allowed',
              fontSize: 12,
            }}
          >
            Detach
          </button>
          {selectedId && (
            <button
              type="button"
              onClick={handleApply}
              disabled={!isDirty}
              title="Apply source to the world"
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${theme.feedback.successBorder}`,
                background: isDirty ? theme.feedback.successBg : theme.bg.surface,
                color: isDirty ? theme.feedback.successText : theme.text.disabled,
                cursor: isDirty ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
              data-testid="workspace-script-apply"
            >
              Apply
            </button>
          )}
        </div>
      </div>

      {isSharedScript && selectedId && (
        <div
          style={{
            flexShrink: 0,
            padding: '10px 12px',
            marginTop: 10,
            borderRadius: 6,
            background: 'rgba(74, 158, 255, 0.12)',
            border: '1px solid rgba(74, 158, 255, 0.35)',
            color: theme.text.infoSubtle,
            fontSize: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0 4px',
          }}
          role="status"
          data-testid="workspace-shared-script-banner"
        >
          <span>This script is shared. Used by:</span>
          {entitiesUsingSelectedScript.map((e, i) => (
            <span key={e.id}>
              <button
                type="button"
                onClick={() => onSelectEntity?.(e.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  fontSize: 'inherit',
                  color: onSelectEntity ? theme.accent : 'inherit',
                  cursor: onSelectEntity ? 'pointer' : 'default',
                  textDecoration: onSelectEntity ? 'underline' : 'none',
                  textAlign: 'left',
                }}
                title={`Select entity: ${e.name ?? e.id} (${e.id})`}
              >
                {e.name ?? e.id}
              </button>
              {i < entitiesUsingSelectedScript.length - 1 ? ',' : ''}
            </span>
          ))}
          <span>. Changes affect all of them.</span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 12 }}>{monacoSlot}</div>
    </div>
  )
}
