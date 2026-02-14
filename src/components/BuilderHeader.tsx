import { useState } from 'react'
import Switch from './Switch'
import MenuBar from './MenuBar'
import DropdownMenu, { type MenuItemConfig } from './DropdownMenu'
import type { ProjectMeta } from '@/persistence/types'
import type { Vec3 } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

export interface BuilderHeaderProps {
  projects: ProjectMeta[]
  onLeftSidebarToggle?: () => void
  currentProject: {
    id: string | null
    name: string
    isDirty: boolean
  }
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
  onShadowsChange: (enabled: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onResetCamera: () => void
  onApplyDebugForce?: (force: Vec3) => void
}

export default function BuilderHeader({
  projects,
  onLeftSidebarToggle,
  currentProject,
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
  onShadowsChange,
  fileInputRef,
  onFileChange,
  onResetCamera,
  onApplyDebugForce,
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
      onClick: onResetCamera,
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

  const debugMenuItems: MenuItemConfig[] = [
    {
      type: 'submenu',
      label: 'Apply Force',
      disabled: !onApplyDebugForce,
      items: [
        {
          type: 'item',
          label: 'Upward (1s)',
          onClick: () => onApplyDebugForce?.([0, 1000, 0]),
          disabled: !onApplyDebugForce,
        },
        {
          type: 'item',
          label: 'Forward (1s)',
          onClick: () => onApplyDebugForce?.([0, 0, -1000]),
          disabled: !onApplyDebugForce,
        },
        {
          type: 'item',
          label: 'Backward (1s)',
          onClick: () => onApplyDebugForce?.([0, 0, 1000]),
          disabled: !onApplyDebugForce,
        },
        {
          type: 'item',
          label: 'Right (1s)',
          onClick: () => onApplyDebugForce?.([1000, 0, 0]),
          disabled: !onApplyDebugForce,
        },
        {
          type: 'item',
          label: 'Left (1s)',
          onClick: () => onApplyDebugForce?.([-1000, 0, 0]),
          disabled: !onApplyDebugForce,
        },
      ],
    },
  ]

  return (
    <header style={{ background: '#171a22', borderBottom: '1px solid #2f3545', color: '#e6e9f2' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={onLeftSidebarToggle}
            onKeyDown={(e) => e.key === 'Enter' && onLeftSidebarToggle?.()}
            style={{
              padding: '6px 12px',
              fontWeight: 'bold',
              fontSize: '14px',
              color: '#e6e9f2',
              cursor: onLeftSidebarToggle ? 'pointer' : 'default',
            }}
          >
            {currentProject.name}
            {currentProject.isDirty && ' *'}
          </div>
          <MenuBar>
            <DropdownMenu label="File" items={fileMenuItems} />
            <DropdownMenu label="View" items={viewMenuItems} />
            <DropdownMenu label="Project" items={projectMenuItems} />
            <DropdownMenu label="Debug" items={debugMenuItems} />
          </MenuBar>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <Switch
            size="compact"
            checked={shadowsEnabled}
            onChange={(v) => {
              onShadowsChange(v)
              uiLogger.change('Builder', 'Toggle shadows', { enabled: v })
            }}
            label="Shadows"
          />
        </div>
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
              background: '#1b1f2a',
              padding: '24px',
              borderRadius: '8px',
              minWidth: '400px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid #2f3545',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#e6e9f2' }}>Open Project</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {projects.length === 0 ? (
                <p style={{ color: '#9aa4b2', margin: 0 }}>No saved projects</p>
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
                      border: '1px solid #2f3545',
                      background: currentProject.id === project.id ? '#2b3550' : '#1b1f2a',
                      color: '#e6e9f2',
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
                background: '#232836',
                color: '#e6e9f2',
                border: '1px solid #2f3545',
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
