import { useState, useCallback } from 'react'
import type { ProjectMeta } from '@/persistence/types'

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
}

const modalStyle: React.CSSProperties = {
  background: '#1b1f2a',
  padding: '24px',
  borderRadius: '8px',
  minWidth: '400px',
  maxWidth: '600px',
  maxHeight: '80vh',
  overflow: 'auto',
  border: '1px solid #2f3545',
}

const buttonBase: React.CSSProperties = {
  padding: '8px 16px',
  color: '#e6e9f2',
  border: '1px solid #2f3545',
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
    <div style={backdropStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#e6e9f2' }}>
          Save Project
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', color: '#9aa4b2', fontSize: '14px' }}>
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
              background: '#232836',
              border: '1px solid #2f3545',
              borderRadius: '4px',
              color: '#e6e9f2',
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
              background: '#2b3550',
            }}
          >
            Save as new
          </button>
        </div>

        {projects.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '6px', color: '#9aa4b2', fontSize: '14px' }}>
              Or overwrite existing project
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflow: 'auto' }}>
              {projects.map((project) => (
                <div
                  key={project.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: '#232836',
                    border: '1px solid #2f3545',
                    borderRadius: '4px',
                  }}
                >
                  <span style={{ color: '#e6e9f2', fontSize: '14px' }}>{project.name}</span>
                  <button
                    type="button"
                    onClick={() => onOverwrite(project.id)}
                    style={{
                      ...buttonBase,
                      background: '#3d4a5c',
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
            background: '#232836',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
