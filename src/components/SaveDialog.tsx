import { useState, useCallback } from 'react'
import type { ProjectMeta } from '@/persistence/types'
import Modal from '@/components/Modal'
import { theme } from '@/config/theme'

const buttonBase: React.CSSProperties = {
  padding: '8px 16px',
  color: theme.text.primary,
  border: `1px solid ${theme.border.default}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
}

export interface SaveDialogProps {
  projects: ProjectMeta[]
  defaultName: string
  onSaveNew: (name: string) => void
  onOverwrite: (id: string) => void
  onCancel: () => void
}

export default function SaveDialog({
  projects,
  defaultName,
  onSaveNew,
  onOverwrite,
  onCancel,
}: SaveDialogProps) {
  const [name, setName] = useState(defaultName)

  const handleSaveNew = useCallback(() => {
    const trimmed = name.trim()
    if (trimmed) onSaveNew(trimmed)
  }, [name, onSaveNew])

  return (
    <Modal isOpen onClose={onCancel} title="Save Project" width={600}>
      <div style={{ marginBottom: '16px' }}>
        <label
          style={{ display: 'block', marginBottom: '6px', color: theme.text.muted, fontSize: '14px' }}
        >
          Save as new project
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          style={{
            width: '100%',
            padding: '10px 12px',
            background: theme.bg.input,
            border: `1px solid ${theme.border.default}`,
            borderRadius: '4px',
            color: theme.text.primary,
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveNew()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <button
          type="button"
          onClick={handleSaveNew}
          disabled={!name.trim()}
          style={{
            ...buttonBase,
            marginTop: '8px',
            background: theme.button.primary,
          }}
        >
          Save as new
        </button>
      </div>

      {projects.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '6px', color: theme.text.muted, fontSize: '14px' }}>
            Or overwrite existing project
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {projects.map((project) => (
              <div
                key={project.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: theme.bg.input,
                  border: `1px solid ${theme.border.default}`,
                  borderRadius: '4px',
                }}
              >
                <span style={{ color: theme.text.primary, fontSize: '14px' }}>{project.name}</span>
                <button
                  type="button"
                  onClick={() => onOverwrite(project.id)}
                  style={{
                    ...buttonBase,
                    background: theme.button.muted,
                    padding: '6px 12px',
                  }}
                >
                  Overwrite
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        style={{
          ...buttonBase,
          width: '100%',
          background: theme.bg.input,
        }}
      >
        Cancel
      </button>
    </Modal>
  )
}
