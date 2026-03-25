import { useState, useCallback } from 'react'
import type { RennWorld, ScriptDef } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import Modal from './Modal'
import { useEditorUndo } from '@/contexts/EditorUndoContext'

function getDef(scripts: Record<string, ScriptDef>, id: string): ScriptDef | null {
  const raw = scripts[id]
  if (raw == null) return null
  if (typeof raw === 'string') return { event: 'onUpdate', source: raw }
  return raw
}

function getEventLabel(def: ScriptDef | null): string {
  if (!def) return '?'
  return def.event === 'onTimer' ? `onTimer (${def.interval}s)` : def.event
}

export interface ScriptDialogProps {
  isOpen: boolean
  onClose: () => void
  world: RennWorld
  selectedEntityId: string | null
  entityScriptIds: string[]
  onChange: (entityScriptIds: string[]) => void
  onWorldChange?: (world: RennWorld) => void
}

export default function ScriptDialog({
  isOpen,
  onClose,
  world,
  selectedEntityId,
  entityScriptIds,
  onChange,
  onWorldChange,
}: ScriptDialogProps) {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)

  const scripts = world.scripts ?? {}
  const allScriptIds = Object.keys(scripts)
  const filteredScriptIds = allScriptIds.filter((id) =>
    id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const entityName =
    (selectedEntityId && world.entities.find((e) => e.id === selectedEntityId)?.name) ?? selectedEntityId ?? 'Entity'

  const handleAttach = useCallback(() => {
    if (!selectedScriptId || entityScriptIds.includes(selectedScriptId)) return
    uiLogger.click('ScriptDialog', 'Attach script to entity', { scriptId: selectedScriptId, entityId: selectedEntityId })
    pushUndo()
    onChange([...entityScriptIds, selectedScriptId])
  }, [selectedScriptId, entityScriptIds, selectedEntityId, onChange, pushUndo])

  const handleDetach = useCallback(
    (scriptId: string) => {
      uiLogger.click('ScriptDialog', 'Detach script from entity', { scriptId, entityId: selectedEntityId })
      pushUndo()
      onChange(entityScriptIds.filter((id) => id !== scriptId))
    },
    [entityScriptIds, selectedEntityId, onChange, pushUndo]
  )

  const handleCreateNew = useCallback(() => {
    const id = prompt('Script ID:', `script_${Date.now()}`)
    if (!id) return
    if (scripts[id]) {
      alert('A script with this ID already exists.')
      return
    }
    uiLogger.click('ScriptDialog', 'Create new script', { scriptId: id })
    pushUndo()
    const nextScripts = { ...scripts, [id]: { event: 'onUpdate' as const, source: '// ctx.log(ctx.entity.id);' } }
    if (onWorldChange) {
      onWorldChange({ ...world, scripts: nextScripts })
    }
    onChange([...entityScriptIds, id])
    setSelectedScriptId(id)
  }, [scripts, world, entityScriptIds, onChange, onWorldChange, pushUndo])

  const handleRename = useCallback(() => {
    if (!selectedScriptId || !onWorldChange) return
    const def = getDef(scripts, selectedScriptId)
    if (!def) return
    const newIdRaw = prompt('New script ID:', selectedScriptId)
    if (newIdRaw == null) return
    const newId = newIdRaw.trim()
    if (!newId || newId === selectedScriptId) return
    if (scripts[newId]) {
      alert('A script with this ID already exists.')
      return
    }
    uiLogger.click('ScriptDialog', 'Rename script', { oldId: selectedScriptId, newId })
    pushUndo()
    const { [selectedScriptId]: _removed, ...rest } = scripts
    const nextScripts = { ...rest, [newId]: def }
    const nextEntities = world.entities.map((e) => ({
      ...e,
      scripts: e.scripts?.map((sid) => (sid === selectedScriptId ? newId : sid)) ?? [],
    }))
    onWorldChange({ ...world, scripts: nextScripts, entities: nextEntities })
    setSelectedScriptId(newId)
  }, [selectedScriptId, scripts, world, onWorldChange, pushUndo])

  const isAttached = selectedScriptId && entityScriptIds.includes(selectedScriptId)
  const canRename = selectedScriptId && onWorldChange

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Scripts for ${entityName}`} width={700} height={500}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Left: All scripts */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#e6e9f2' }}>
              All scripts ({filteredScriptIds.length})
            </h3>
            <input
              type="text"
              placeholder="Search scripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                background: '#1a1a1a',
                border: '1px solid #2f3545',
                color: '#e6e9f2',
                fontSize: 14,
                marginBottom: 8,
              }}
            />
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {filteredScriptIds.length === 0 ? (
                <div style={{ color: '#9aa4b2', fontSize: 14 }}>
                  {searchQuery ? 'No scripts match your search' : 'No scripts in world'}
                </div>
              ) : (
                filteredScriptIds.map((id) => {
                  const def = getDef(scripts, id)
                  const attached = entityScriptIds.includes(id)
                  const selected = selectedScriptId === id
                  return (
                    <div
                      key={id}
                      onClick={() => setSelectedScriptId(id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: selected ? '2px solid #4a9eff' : '1px solid #2f3545',
                        background: selected ? '#1e2a3a' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 500, color: '#e6e9f2' }}>{id}</span>
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa4b2' }}>
                          {getEventLabel(def)}
                        </span>
                      </div>
                      {attached && (
                        <span style={{ fontSize: 11, color: '#6a9e6a' }}>Attached</span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleCreateNew}
                style={{
                  padding: '8px 12px',
                  background: '#2d4a2d',
                  border: '1px solid #4a6a4a',
                  color: '#a4d4a4',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Create new script
              </button>
              <button
                type="button"
                onClick={handleRename}
                disabled={!canRename}
                title={canRename ? 'Rename selected script' : 'Select a script to rename'}
                style={{
                  padding: '8px 12px',
                  background: canRename ? '#2a3a4a' : '#2a2a2a',
                  border: canRename ? '1px solid #3f4f5f' : '1px solid #2f3545',
                  color: canRename ? '#e6e9f2' : '#666',
                  borderRadius: 6,
                  cursor: canRename ? 'pointer' : 'not-allowed',
                  fontSize: 12,
                }}
              >
                Rename
              </button>
            </div>
          </div>

          {/* Right: Attached to this entity */}
          <div
            style={{
              width: 220,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderLeft: '1px solid #2f3545',
              paddingLeft: 16,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e6e9f2' }}>
              Attached to this entity ({entityScriptIds.length})
            </h3>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entityScriptIds.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9aa4b2' }}>No scripts attached</div>
              ) : (
                entityScriptIds.map((id) => {
                  const def = getDef(scripts, id)
                  return (
                    <div
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: '#1a1a1a',
                        border: '1px solid #2f3545',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#e6e9f2', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {id}
                        </div>
                        <div style={{ fontSize: 11, color: '#9aa4b2' }}>{getEventLabel(def)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDetach(id)}
                        title="Detach from entity"
                        style={{
                          padding: '4px 8px',
                          background: 'transparent',
                          border: '1px solid #2f3545',
                          color: '#9aa4b2',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        Detach
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            <button
              type="button"
              onClick={handleAttach}
              disabled={!selectedScriptId || isAttached}
              title={isAttached ? 'Already attached' : 'Attach selected script to entity'}
              style={{
                padding: '8px 12px',
                background: selectedScriptId && !isAttached ? '#2d4a2d' : '#2a2a2a',
                border: selectedScriptId && !isAttached ? '1px solid #4a6a4a' : '1px solid #2f3545',
                color: selectedScriptId && !isAttached ? '#a4d4a4' : '#666',
                borderRadius: 6,
                cursor: selectedScriptId && !isAttached ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              Attach selected
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: 16,
            borderTop: '1px solid #2f3545',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#2d4a2d',
              border: '1px solid #4a6a4a',
              color: '#a4d4a4',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
