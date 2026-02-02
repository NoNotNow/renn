import Switch from './Switch'
import type { ProjectMeta } from '@/persistence/types'
import { uiLogger } from '@/utils/uiLogger'

export interface BuilderHeaderProps {
  projects: ProjectMeta[]
  currentProjectId: string | null
  gravityEnabled: boolean
  shadowsEnabled: boolean
  onNew: () => void
  onSave: () => void
  onSaveAs: () => void
  onExport: () => void
  onImport: () => void
  onOpen: (id: string) => void
  onRefresh: () => void
  onDelete: () => void
  onPlay: () => void
  onReload: () => void
  onGravityChange: (enabled: boolean) => void
  onShadowsChange: (enabled: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export default function BuilderHeader({
  projects,
  currentProjectId,
  gravityEnabled,
  shadowsEnabled,
  onNew,
  onSave,
  onSaveAs,
  onExport,
  onImport,
  onOpen,
  onRefresh,
  onDelete,
  onPlay,
  onReload,
  onGravityChange,
  onShadowsChange,
  fileInputRef,
  onFileChange,
}: BuilderHeaderProps) {
  return (
    <header style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ccc' }}>
      <strong>Renn Builder</strong>
      <button type="button" onClick={onNew}>New</button>
      <button type="button" onClick={onSave}>Save</button>
      <button type="button" onClick={onSaveAs}>Save as</button>
      <button type="button" onClick={onExport}>Download</button>
      <button type="button" onClick={onImport}>Upload</button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <select
        value={currentProjectId ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v) onOpen(v)
        }}
      >
        <option value="">— No project —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button type="button" onClick={onRefresh}>Refresh list</button>
      <button type="button" onClick={onDelete} disabled={!currentProjectId}>Delete</button>
      <button type="button" onClick={onPlay}>Play</button>
      <button
        type="button"
        onClick={() => {
          onReload()
          uiLogger.click('Builder', 'Reload scene from JSON')
        }}
        title="Reset scene to saved JSON state (discards runtime changes)"
      >
        Reload
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
        <Switch
          checked={gravityEnabled}
          onChange={(v) => {
            onGravityChange(v)
            uiLogger.change('Builder', 'Toggle gravity', { enabled: v })
          }}
          label="Gravity"
        />
        <Switch
          checked={shadowsEnabled}
          onChange={(v) => {
            onShadowsChange(v)
            uiLogger.change('Builder', 'Toggle shadows', { enabled: v })
          }}
          label="Shadows"
        />
      </div>
    </header>
  )
}
