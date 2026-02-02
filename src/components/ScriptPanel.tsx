import { useState } from 'react'
import Editor from '@monaco-editor/react'
import type { RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

export interface ScriptPanelProps {
  world: RennWorld
  onWorldChange: (world: RennWorld) => void
}

export default function ScriptPanel({ world, onWorldChange }: ScriptPanelProps) {
  const scripts = world.scripts ?? {}
  const [selectedId, setSelectedId] = useState<string | null>(Object.keys(scripts)[0] ?? null)

  const scriptIds = Object.keys(scripts)
  const source = selectedId ? scripts[selectedId] ?? '' : ''

  const handleEditorChange = (value: string | undefined) => {
    if (!selectedId) return
    uiLogger.change('ScriptPanel', 'Edit script content', { scriptId: selectedId, contentLength: value?.length ?? 0 })
    onWorldChange({
      ...world,
      scripts: {
        ...scripts,
        [selectedId]: value ?? '',
      },
    })
  }

  const handleAdd = () => {
    const id = prompt('Script ID:', `script_${Date.now()}`)
    if (!id) return
    uiLogger.click('ScriptPanel', 'Add new script', { scriptId: id })
    onWorldChange({
      ...world,
      scripts: { ...scripts, [id]: '// game.log("hello");' },
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, borderBottom: '1px solid #2f3545' }}>
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
        <button type="button" onClick={handleAdd}>Add</button>
        <button type="button" onClick={handleRemove} disabled={!selectedId}>Remove</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          height="100%"
          language="javascript"
          theme="vs-dark"
          value={source}
          onChange={handleEditorChange}
          options={{ minimap: { enabled: false } }}
        />
      </div>
    </div>
  )
}
