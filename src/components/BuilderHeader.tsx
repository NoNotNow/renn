import { useState } from 'react'
import Switch from './Switch'
import MenuBar from './MenuBar'
import DropdownMenu, { type MenuItemConfig } from './DropdownMenu'
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
  const [showProjectSelector, setShowProjectSelector] = useState(false)

  const fileMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'New',
      onClick: onNew,
      shortcut: 'Ctrl+N',
    },
    {
      type: 'item',
      label: 'Open...',
      onClick: () => setShowProjectSelector(true),
    },
    {
      type: 'separator',
    },
    {
      type: 'item',
      label: 'Save',
      onClick: onSave,
      shortcut: 'Ctrl+S',
    },
    {
      type: 'item',
      label: 'Save As...',
      onClick: onSaveAs,
      shortcut: 'Ctrl+Shift+S',
    },
    {
      type: 'separator',
    },
    {
      type: 'item',
      label: 'Export',
      onClick: onExport,
    },
    {
      type: 'item',
      label: 'Import',
      onClick: onImport,
    },
  ]

  const viewMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'Reset Camera',
      onClick: () => {
        // TODO: Implement camera reset
        console.log('Reset camera')
      },
    },
  ]

  const projectMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'Play',
      onClick: onPlay,
      shortcut: 'Ctrl+P',
    },
    {
      type: 'separator',
    },
    {
      type: 'item',
      label: 'Refresh List',
      onClick: onRefresh,
    },
    {
      type: 'item',
      label: 'Delete Project',
      onClick: onDelete,
      disabled: !currentProject.id,
    },
  ]

  return (
    <header>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ padding: '6px 12px', fontWeight: 'bold', fontSize: '14px' }}>
          {currentProject.name}
          {currentProject.isDirty && ' *'}
        </div>
        <MenuBar>
          <DropdownMenu label="File" items={fileMenuItems} />
          <DropdownMenu label="View" items={viewMenuItems} />
          <DropdownMenu label="Project" items={projectMenuItems} />
        </MenuBar>
      </div>

      {/* Toolbar row with toggles */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 12px',
          background: '#fafafa',
          borderBottom: '1px solid #d0d0d0',
        }}
      >
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

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {/* Project selector modal */}
      {showProjectSelector && (
        <div
          style={{
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
          }}
          onClick={() => setShowProjectSelector(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '24px',
              borderRadius: '8px',
              minWidth: '400px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Open Project</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {projects.length === 0 ? (
                <p style={{ color: '#666', margin: 0 }}>No saved projects</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      onOpen(project.id)
                      setShowProjectSelector(false)
                    }}
                    style={{
                      padding: '12px',
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      background: currentProject.id === project.id ? '#e8f4fd' : 'white',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      fontSize: '14px',
                    }}
                  >
                    {project.name}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowProjectSelector(false)}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                width: '100%',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
