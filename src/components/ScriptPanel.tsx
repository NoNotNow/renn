import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { RennWorld, ScriptDef, ScriptEvent } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { ctxDeclFor, CTX_EXTRA_LIB_URI } from '@/scripts/scriptCtxDecl'

const SCRIPT_EVENTS: ScriptEvent[] = ['onSpawn', 'onUpdate', 'onCollision', 'onTimer']

function getDef(scripts: Record<string, ScriptDef>, id: string): ScriptDef | null {
  const raw = scripts[id]
  if (raw == null) return null
  if (typeof raw === 'string') return { event: 'onUpdate', source: raw }
  return raw
}

export interface ScriptPanelProps {
  world: RennWorld
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
}

export default function ScriptPanel({ world, selectedEntityId, onWorldChange }: ScriptPanelProps) {
  const scripts = world.scripts ?? {}
  const scriptIds = Object.keys(scripts)
  const [selectedId, setSelectedId] = useState<string | null>(scriptIds[0] ?? null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const extraLibRef = useRef<{ dispose(): void } | null>(null)

  const def = selectedId ? getDef(scripts, selectedId) : null
  const source = def?.source ?? ''
  const event = def?.event ?? 'onUpdate'
  const interval = def?.event === 'onTimer' ? def.interval : 1

  // Draft source: local state while typing; only committed to world on Apply
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
    uiLogger.change('ScriptPanel', 'Apply script', { scriptId: selectedId, contentLength: draftSource.length })
    const current = getDef(scripts, selectedId)
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
    const current = getDef(scripts, selectedId)
    const nextDef: ScriptDef =
      newEvent === 'onTimer'
        ? { event: 'onTimer', interval: current?.event === 'onTimer' ? current.interval : 1, source: current?.source ?? '' }
        : { event: newEvent, source: current?.source ?? '' }
    onWorldChange({ ...world, scripts: { ...scripts, [selectedId]: nextDef } })
  }

  const handleIntervalChange = (seconds: number) => {
    if (!selectedId || event !== 'onTimer') return
    const current = getDef(scripts, selectedId)
    if (current?.event !== 'onTimer') return
    onWorldChange({
      ...world,
      scripts: { ...scripts, [selectedId]: { event: 'onTimer', interval: Math.max(0.001, seconds), source: current.source } },
    })
  }

  const handleAdd = () => {
    const id = prompt('Script ID:', `script_${Date.now()}`)
    if (!id) return
    uiLogger.click('ScriptPanel', 'Add new script', { scriptId: id })
    const nextScripts = { ...scripts, [id]: { event: 'onUpdate' as const, source: '// ctx.log(ctx.entity.id);' } }
    const nextEntities =
      selectedEntityId
        ? world.entities.map((e) =>
            e.id === selectedEntityId
              ? { ...e, scripts: [...(e.scripts ?? []), id] }
              : e
          )
        : world.entities
    onWorldChange({
      ...world,
      scripts: nextScripts,
      entities: nextEntities,
    })
    setSelectedId(id)
  }

  const handleRemove = () => {
    if (!selectedId) return
    uiLogger.delete('ScriptPanel', 'Remove script', { scriptId: selectedId })
    const next = { ...scripts }
    delete next[selectedId]
    onWorldChange({ ...world, scripts: next })
    setSelectedId(scriptIds.filter((k) => k !== selectedId)[0] ?? null)
  }

  const selectedEntity = selectedEntityId
    ? world.entities.find((e) => e.id === selectedEntityId)
    : null
  const isAttachedToSelectedEntity =
    selectedEntityId && selectedId && selectedEntity?.scripts?.includes(selectedId)

  const handleAttachToEntity = () => {
    if (!selectedId || !selectedEntityId) return
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === selectedEntityId
          ? { ...e, scripts: [...(e.scripts ?? []), selectedId] }
          : e
      ),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderBottom: '1px solid #2f3545' }}>
        <select
          value={selectedId ?? ''}
          onChange={(e) => {
            uiLogger.select('ScriptPanel', 'Select script', { scriptId: e.target.value })
            setSelectedId(e.target.value || null)
          }}
        >
          <option value="">— Select script —</option>
          {scriptIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        {def && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Event
              <select
                value={event}
                onChange={(e) => handleEventChange(e.target.value as ScriptEvent)}
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
                  style={{ width: 64, padding: 4 }}
                />
              </label>
            )}
          </>
        )}
        <button type="button" onClick={handleAdd}>Add</button>
        <button
          type="button"
          onClick={handleAttachToEntity}
          disabled={!selectedId || !selectedEntityId || isAttachedToSelectedEntity}
          title={!selectedEntityId ? 'Select an entity first' : isAttachedToSelectedEntity ? 'Already attached' : 'Attach this script to the selected entity'}
        >
          Attach to entity
        </button>
        <button type="button" onClick={handleRemove} disabled={!selectedId}>Remove</button>
        {selectedId && (
          <button
            type="button"
            onClick={handleApply}
            disabled={!isDirty}
            title="Apply script changes to the world (reloads scene)"
          >
            Apply
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
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
    </div>
  )
}
