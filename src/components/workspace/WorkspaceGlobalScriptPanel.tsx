import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import type { RennWorld, ScriptDef, ScriptEvent } from '@/types/world'
import type { WorkspaceMonacoPayload } from '@/types/workspace'
import { getScriptDef } from '@/scripts/scriptDef'
import { theme } from '@/config/theme'

const SCRIPT_EVENTS: ScriptEvent[] = ['onSpawn', 'onUpdate', 'onCollision', 'onTimer']

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

const compactSelectStyle = {
  padding: '4px 6px',
  borderRadius: 4,
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  fontSize: 12,
}

const intervalInputStyle = {
  width: 64,
  padding: 4,
  borderRadius: 4,
  border: `1px solid ${theme.border.default}`,
  background: theme.bg.panelAlt,
  color: theme.text.primary,
}

const chipBase = {
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
} as const

export interface WorkspaceGlobalScriptPanelProps {
  anchorItemId: string
  globalScripts: Record<string, ScriptDef>
  onGlobalScriptsChange: (next: Record<string, ScriptDef>) => void
  /** World entities for “also used in project” counts when IDs overlap. */
  world: RennWorld
  setMonacoPayload: (payload: WorkspaceMonacoPayload) => void
  monacoSlot: ReactNode
}

export default function WorkspaceGlobalScriptPanel({
  anchorItemId,
  globalScripts,
  onGlobalScriptsChange,
  world,
  setMonacoPayload,
  monacoSlot,
}: WorkspaceGlobalScriptPanelProps) {
  const scriptIds = Object.keys(globalScripts).sort()
  const [selectedId, setSelectedId] = useState(anchorItemId)

  useEffect(() => {
    if (scriptIds.includes(anchorItemId)) setSelectedId(anchorItemId)
    else if (scriptIds.length > 0) setSelectedId(scriptIds[0]!)
    else setSelectedId('')
  }, [anchorItemId, scriptIds.join(',')])

  const def = selectedId ? getScriptDef(globalScripts, selectedId) : null
  const source = def?.source ?? ''
  const event = def?.event ?? 'onUpdate'
  const interval = def?.event === 'onTimer' ? def.interval : 1

  const [draftSource, setDraftSource] = useState(source)
  useLayoutEffect(() => {
    setDraftSource(source)
  }, [selectedId, source])

  const projectOverlapCount =
    selectedId && world.scripts?.[selectedId] != null ?
      world.entities.filter((e) => e.scripts?.includes(selectedId)).length
    : 0

  const handleApply = () => {
    if (!selectedId || !def) return
    const current = getScriptDef(globalScripts, selectedId)
    const nextDef: ScriptDef =
      current?.event === 'onTimer'
        ? { event: 'onTimer', interval: current.interval, source: draftSource }
        : { event: (current?.event ?? 'onUpdate') as 'onSpawn' | 'onUpdate' | 'onCollision', source: draftSource }
    onGlobalScriptsChange({ ...globalScripts, [selectedId]: nextDef })
  }

  const handleEventChange = (newEvent: ScriptEvent) => {
    if (!selectedId) return
    const current = getScriptDef(globalScripts, selectedId)
    const nextDef: ScriptDef =
      newEvent === 'onTimer'
        ? { event: 'onTimer', interval: current?.event === 'onTimer' ? current.interval : 1, source: current?.source ?? '' }
        : { event: newEvent, source: current?.source ?? '' }
    onGlobalScriptsChange({ ...globalScripts, [selectedId]: nextDef })
  }

  const handleIntervalChange = (seconds: number) => {
    if (!selectedId || event !== 'onTimer') return
    const current = getScriptDef(globalScripts, selectedId)
    if (current?.event !== 'onTimer') return
    onGlobalScriptsChange({
      ...globalScripts,
      [selectedId]: { event: 'onTimer', interval: Math.max(0.001, seconds), source: current.source },
    })
  }

  const isDirty = draftSource !== source
  const handleDraftChange = useCallback((text: string) => {
    setDraftSource(text)
  }, [])

  const hasScriptSelection = Boolean(selectedId && globalScripts[selectedId] != null)

  useEffect(() => {
    if (!hasScriptSelection || !def) {
      setMonacoPayload({
        kind: 'placeholder',
        value: '// Global library: add a script under Organize → Global, or select a chip above.\n',
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
      refreshKey: strHash(selectedId),
      scriptEvent: event,
    })
  }, [hasScriptSelection, def, draftSource, handleDraftChange, event, setMonacoPayload, selectedId])

  if (scriptIds.length === 0) {
    return (
      <div style={{ padding: 16, color: theme.text.muted, fontSize: 13 }} data-testid="workspace-global-scripts-empty">
        No scripts in the global library. Add one from Organize → Global (copy from a project, or create in a later
        revision).
      </div>
    )
  }

  return (
    <div
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      data-testid="workspace-global-script-panel"
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
        <div style={{ fontSize: 12, color: theme.text.infoSubtle, lineHeight: 1.45 }}>
          <strong style={{ color: theme.text.primary }}>Global library</strong> (IndexedDB). Copy to the project in Organize
          to attach to entities.
        </div>
        {projectOverlapCount > 0 && (
          <div
            style={{
              fontSize: 12,
              color: theme.text.warning,
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${theme.text.warning}`,
              background: theme.bg.sectionMuted,
            }}
            data-testid="workspace-global-script-project-overlap"
          >
            A project script with ID <strong>{selectedId}</strong> exists in this world and is used by {projectOverlapCount}{' '}
            entity(ies). Global and project definitions are independent until you copy or sync.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.text.muted, marginRight: 4 }}>Global scripts</span>
          {scriptIds.map((id) => {
            const active = id === selectedId
            return (
              <button
                key={id}
                type="button"
                data-testid={`workspace-global-script-chip-${id}`}
                title={id}
                onClick={() => setSelectedId(id)}
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
          })}
        </div>

        {def && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: theme.text.muted }}>
              Event
              <select
                value={event}
                onChange={(e) => handleEventChange(e.target.value as ScriptEvent)}
                style={{ ...compactSelectStyle, marginLeft: 6 }}
                data-testid="workspace-global-script-event"
              >
                {SCRIPT_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </label>
            {event === 'onTimer' && (
              <label style={{ fontSize: 11, color: theme.text.muted }}>
                Interval (s)
                <input
                  type="number"
                  min={0.001}
                  step={0.1}
                  value={interval}
                  onChange={(e) => handleIntervalChange(Number(e.target.value))}
                  style={{ ...intervalInputStyle, marginLeft: 6 }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={handleApply}
              disabled={!isDirty}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${theme.feedback.successBorder}`,
                background: isDirty ? theme.feedback.successBg : theme.bg.surface,
                color: isDirty ? theme.feedback.successText : theme.text.disabled,
                cursor: isDirty ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
              data-testid="workspace-global-script-apply"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 12 }}>{monacoSlot}</div>
    </div>
  )
}
