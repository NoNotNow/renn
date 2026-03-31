import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { RennWorld, ScriptDef, ScriptEvent } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { ctxDeclFor, CTX_EXTRA_LIB_URI } from '@/scripts/scriptCtxDecl'
import CopyableArea from './CopyableArea'
import ScriptDialog from './ScriptDialog'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { getScriptDef } from '@/scripts/scriptDef'

const SCRIPT_EVENTS: ScriptEvent[] = ['onSpawn', 'onUpdate', 'onCollision', 'onTimer']

function getEntitiesUsingScript(world: RennWorld, scriptId: string): { id: string; name?: string }[] {
  return world.entities.filter((e) => e.scripts?.includes(scriptId)).map((e) => ({ id: e.id, name: e.name }))
}

function scriptIdsIntersectionForEntities(
  entities: { scripts?: string[] }[]
): string[] {
  if (entities.length === 0) return []
  let common = new Set(entities[0]!.scripts ?? [])
  for (let i = 1; i < entities.length; i++) {
    const next = new Set(entities[i]!.scripts ?? [])
    common = new Set([...common].filter((id) => next.has(id)))
  }
  return [...common]
}

export interface ScriptPanelMultiSelectProps {
  world: RennWorld
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
}

/** Multi-entity script editing (intersection of attached scripts). */
export default function ScriptPanelMultiSelect({ world, selectedEntityIds, onWorldChange }: ScriptPanelMultiSelectProps) {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()
  const scripts = world.scripts ?? {}
  const scriptIds = Object.keys(scripts)
  const selectedEntities = selectedEntityIds
    .map((id) => world.entities.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => e != null)
  const entityScriptIds = scriptIdsIntersectionForEntities(selectedEntities)

  // When entities are selected, show shared attached scripts first; otherwise all scripts.
  const attachedScriptIdsOrdered = entityScriptIds.filter((id) => scripts[id] != null)
  const dropdownOptions = selectedEntityIds.length > 0
    ? [...attachedScriptIdsOrdered, ...scriptIds.filter((id) => !entityScriptIds.includes(id))]
    : scriptIds

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const extraLibRef = useRef<{ dispose(): void } | null>(null)

  // Sync selectedId only when selection is empty or script was removed from world
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

  const def = selectedId ? getScriptDef(scripts, selectedId) : null
  const source = def?.source ?? ''
  const event = def?.event ?? 'onUpdate'
  const interval = def?.event === 'onTimer' ? def.interval : 1

  const [draftSource, setDraftSource] = useState(source)
  useEffect(() => {
    setDraftSource(source)
  }, [selectedId, source])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    extraLibRef.current?.dispose()
    const content = ctxDeclFor(event)
    extraLibRef.current = monaco.languages.typescript.javascriptDefaults.addExtraLib(content, CTX_EXTRA_LIB_URI)
    return () => {
      extraLibRef.current?.dispose()
      extraLibRef.current = null
    }
  }, [event])

  const handleEditorMount = (_editor: unknown, monaco: Monaco) => {
    monacoRef.current = monaco
    extraLibRef.current?.dispose()
    const content = ctxDeclFor(event)
    extraLibRef.current = monaco.languages.typescript.javascriptDefaults.addExtraLib(content, CTX_EXTRA_LIB_URI)
  }

  const handleEditorChange = (value: string | undefined) => {
    setDraftSource(value ?? '')
  }

  const handleApply = () => {
    if (!selectedId) return
    pushUndo()
    uiLogger.change('ScriptPanel', 'Apply script', { scriptId: selectedId, contentLength: draftSource.length })
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
    uiLogger.click('ScriptPanel', 'Add new script', { scriptId: id })
    const nextScripts = { ...scripts, [id]: { event: 'onUpdate' as const, source: '// ctx.log(ctx.entity.id);' } }
    const idSet = new Set(selectedEntityIds)
    const nextEntities =
      selectedEntityIds.length > 0
        ? world.entities.map((e) =>
            idSet.has(e.id) ? { ...e, scripts: [...(e.scripts ?? []), id] } : e
          )
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
    uiLogger.click('ScriptPanel', 'Detach script from entities', { scriptId: selectedId, entityIds: selectedEntityIds })
    const nextEntityScripts = entityScriptIds.filter((sid) => sid !== selectedId)
    const idSet = new Set(selectedEntityIds)
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        idSet.has(e.id) ? { ...e, scripts: nextEntityScripts } : e
      ),
    })
    const remaining = attachedScriptIdsOrdered.filter((sid) => sid !== selectedId)
    setSelectedId(remaining[0] ?? scriptIds.filter((k) => k !== selectedId)[0] ?? null)
  }

  const isAttachedToSelectedEntity =
    selectedEntityIds.length > 0 && selectedId && entityScriptIds.includes(selectedId)
  const entitiesUsingSelectedScript = selectedId ? getEntitiesUsingScript(world, selectedId) : []
  const isSharedScript = entitiesUsingSelectedScript.length > 1

  const handleEntityScriptsChange = (nextScriptIds: string[]) => {
    if (selectedEntityIds.length === 0) return
    const idSet = new Set(selectedEntityIds)
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        idSet.has(e.id) ? { ...e, scripts: nextScriptIds } : e
      ),
    })
  }

  const entityDisplayName =
    selectedEntities.length === 0
      ? 'Entity'
      : selectedEntities.length === 1
        ? selectedEntities[0]!.name ?? selectedEntities[0]!.id
        : `${selectedEntities.length} entities`

  const copyPayload = {
    scripts: world.scripts,
    selectedEntityIds,
    entityScriptIds,
  }

  return (
    <CopyableArea
      copyPayload={copyPayload}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', minWidth: 280, overflow: 'visible' }}>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid #2f3545' }}>
        {selectedEntityIds.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e6e9f2' }}>
              Scripts for {entityDisplayName}
            </h3>
            <button
              type="button"
              onClick={() => setScriptDialogOpen(true)}
              style={{
                padding: '6px 12px',
                background: '#2a3a4a',
                border: '1px solid #3f4f5f',
                color: '#e6e9f2',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Manage scripts
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#9aa4b2' }}>Select an entity to edit its scripts</p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedId ?? ''}
            onChange={(e) => {
              uiLogger.select('ScriptPanel', 'Select script', { scriptId: e.target.value })
              setSelectedId(e.target.value || null)
            }}
            style={{
              minWidth: 140,
              padding: '6px 8px',
              borderRadius: 6,
              background: '#1a1a1a',
              border: '1px solid #2f3545',
              color: '#e6e9f2',
              fontSize: 12,
            }}
          >
            <option value="">— Select script —</option>
            {selectedEntityIds.length > 0 && attachedScriptIdsOrdered.length > 0 && (
              <optgroup label="On all selected">
                {attachedScriptIdsOrdered.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </optgroup>
            )}
            {dropdownOptions.filter((id) => !attachedScriptIdsOrdered.includes(id)).length > 0 && (
              <optgroup label={selectedEntityIds.length > 0 ? 'Other scripts' : 'All scripts'}>
                {dropdownOptions.filter((id) => !attachedScriptIdsOrdered.includes(id)).map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </optgroup>
            )}
          </select>
          {def && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Event
                <select
                  value={event}
                  onChange={(e) => handleEventChange(e.target.value as ScriptEvent)}
                  style={{
                    padding: '4px 6px',
                    borderRadius: 4,
                    background: '#1a1a1a',
                    border: '1px solid #2f3545',
                    color: '#e6e9f2',
                    fontSize: 12,
                  }}
                >
                  {SCRIPT_EVENTS.map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
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
                    style={{ width: 64, padding: 4, borderRadius: 4, border: '1px solid #2f3545', background: '#1a1a1a', color: '#e6e9f2' }}
                  />
                </label>
              )}
            </>
          )}
          <button type="button" onClick={handleAdd} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #2f3545', background: '#2a2a2a', color: '#e6e9f2', cursor: 'pointer', fontSize: 12 }}>
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
                  ? 'This script is not attached to all selected entities'
                  : 'Remove this script from all selected entities (script stays in world)'
            }
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #2f3545',
              background: selectedId && selectedEntityIds.length > 0 && isAttachedToSelectedEntity ? '#3a2a2a' : '#2a2a2a',
              color: selectedId && selectedEntityIds.length > 0 && isAttachedToSelectedEntity ? '#e6c0c0' : '#666',
              cursor: selectedId && selectedEntityIds.length > 0 && isAttachedToSelectedEntity ? 'pointer' : 'not-allowed',
              fontSize: 12,
            }}
          >
            Detach from entity
          </button>
          {selectedId && (
            <button
              type="button"
              onClick={handleApply}
              disabled={!isDirty}
              title="Apply script changes to the world (reloads scene)"
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #4a6a4a',
                background: isDirty ? '#2d4a2d' : '#2a2a2a',
                color: isDirty ? '#a4d4a4' : '#666',
                cursor: isDirty ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              Apply
            </button>
          )}
        </div>
      </div>

      {isSharedScript && selectedId && (
        <div
          style={{
            padding: '8px 12px',
            margin: '8px 8px 0',
            borderRadius: 6,
            background: 'rgba(74, 158, 255, 0.12)',
            border: '1px solid rgba(74, 158, 255, 0.35)',
            color: '#a8c8f0',
            fontSize: 12,
          }}
          role="status"
        >
          This script is shared. Used by: {entitiesUsingSelectedScript.map((e) => e.name ?? e.id).join(', ')}. Changes affect all of them.
        </div>
      )}

      <div
        className="script-editor-container"
        style={{ flex: 1, minHeight: 200, minWidth: 280, width: '100%', overflow: 'visible' }}
      >
        <Editor
          height="100%"
          language="javascript"
          theme="vs-dark"
          value={draftSource}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{ minimap: { enabled: false } }}
        />
      </div>

      {selectedEntityIds.length > 0 && (
        <ScriptDialog
          isOpen={scriptDialogOpen}
          onClose={() => setScriptDialogOpen(false)}
          world={world}
          selectedEntityIds={selectedEntityIds}
          entityScriptIds={entityScriptIds}
          onChange={handleEntityScriptsChange}
          onWorldChange={onWorldChange}
        />
      )}
    </div>
    </CopyableArea>
  )
}
