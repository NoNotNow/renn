import Switch from './Switch'
import type { ProjectMeta } from '@/persistence/types'
import { uiLogger } from '@/utils/uiLogger'

export interface BuilderHeaderProps {
  projects: ProjectMeta[]
  currentProject: {
    id: string | null
    name: string
    isDirty: boolean
  }
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
  onGravityChange: (enabled: boolean) => void
  onShadowsChange: (enabled: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export default function BuilderHeader({
  projects,
  currentProject,
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
  onGravityChange,
  onShadowsChange,
  fileInputRef,
  onFileChange,
}: BuilderHeaderProps) {
  return (
    <header style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ccc' }}>
      <strong>
        {currentProject.name}
        {currentProject.isDirty && ' *'}
      </strong>
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
        value={currentProject.id ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v) onOpen(v)
        }}
      >
        <option value="">New Project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button type="button" onClick={onRefresh}>Refresh list</button>
      <button type="button" onClick={onDelete} disabled={!currentProject.id}>Delete</button>
      <button type="button" onClick={onPlay}>Play</button>
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
