import { useRef, useState, useLayoutEffect, useCallback } from 'react'
import MenuBar from './MenuBar'
import DropdownMenu, { type MenuItemConfig } from './DropdownMenu'
import type { ProjectMeta } from '@/persistence/types'
import type { RennWorld, Vec3 } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import {
  TEXTURE_BRUSH_RADIUS_MAX,
  TEXTURE_BRUSH_RADIUS_MIN,
  TEXTURE_PAINT_RADIUS_PX,
  type BuilderGizmoMode,
} from '@/editor/transformGizmoController'
import { theme } from '@/config/theme'
import { GizmoMoveIcon, GizmoBrushIcon, GizmoRotateIcon, GizmoScaleIcon, GizmoVisualizeIcon } from '@/components/GizmoModeIcons'
import { BrushToolPopover } from '@/components/BrushToolPopover'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { formatMenuShortcut } from '@/utils/menuShortcut'
import { EntityPanelIcons } from './EntityPanelIcons'

export interface BuilderHeaderProps {
  projects: ProjectMeta[]
  onLeftSidebarToggle?: () => void
  currentProject: {
    id: string | null
    name: string
    isDirty: boolean
  }
  onNew: () => void
  onSave: () => void
  onSaveAs: () => void
  onExport: () => void
  onCopyWorld: () => void
  onImport: () => void
  onOpen: (id: string) => void
  onRefresh: () => void
  onReload: () => void
  onDeleteProject: (id: string) => void
  onPlay: () => void
  gizmoMode: BuilderGizmoMode
  onGizmoModeChange: (mode: BuilderGizmoMode) => void
  /** When true, brush tool is inactive (no texture on selection). */
  textureBrushDisabled?: boolean
  /** Shown when `gizmoMode === 'paint'` and brush is enabled. */
  textureBrushColorHex?: string
  onTextureBrushColorHexChange?: (hex: string) => void
  textureBrushRadiusPx?: number
  onTextureBrushRadiusPxChange?: (px: number) => void
  textureBrushAlpha?: number
  onTextureBrushAlphaChange?: (alpha: number) => void
  fileInputRef: React.RefObject<HTMLInputElement>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onResetCamera: () => void
  onApplyDebugForce?: (force: Vec3) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  editNavigationMode?: boolean
  onEditNavigationModeToggle?: () => void
  /** Score/damage HUD overlay on the canvas (same as Play). */
  showGameHud?: boolean
  onGameHudToggle?: () => void
  /** Last-frame ms breakdown overlay (profiling). */
  showFrameStats?: boolean
  onFrameStatsToggle?: () => void
  onOpenPerformanceBooster?: () => void
  onOpenTransformerDocs?: () => void
  /** Single textured entity: open layered texture editor. */
  onOpenTextureStudio?: () => void
  onOpenWorkspace?: () => void
  selectedEntityCount?: number
  onOpenExampleWorld?: (worldJson: RennWorld, name: string) => void
}

export default function BuilderHeader({
  projects,
  onLeftSidebarToggle,
  currentProject,
  onNew,
  onSave,
  onSaveAs,
  onExport,
  onCopyWorld,
  onImport,
  onOpen,
  onRefresh,
  onReload,
  onDeleteProject,
  onPlay,
  gizmoMode,
  onGizmoModeChange,
  textureBrushDisabled = false,
  textureBrushColorHex = '#1f1f24',
  onTextureBrushColorHexChange,
  textureBrushRadiusPx = TEXTURE_PAINT_RADIUS_PX,
  onTextureBrushRadiusPxChange,
  textureBrushAlpha = 1,
  onTextureBrushAlphaChange,
  fileInputRef,
  onFileChange,
  onResetCamera,
  onApplyDebugForce,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  editNavigationMode = false,
  onEditNavigationModeToggle,
  showGameHud = false,
  onGameHudToggle,
  showFrameStats = false,
  onFrameStatsToggle,
  onOpenPerformanceBooster,
  onOpenTransformerDocs,
  onOpenTextureStudio,
  onOpenWorkspace,
  selectedEntityCount: _selectedEntityCount = 0,
  onOpenExampleWorld,
}: BuilderHeaderProps) {
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [brushPopoverOpen, setBrushPopoverOpen] = useState(false)
  const brushToolButtonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (gizmoMode !== 'paint') {
      setBrushPopoverOpen(false)
    }
  }, [gizmoMode])

  const handleBrushToolClick = (): void => {
    if (textureBrushDisabled) return
    if (gizmoMode === 'paint') {
      setBrushPopoverOpen((o) => !o)
      return
    }
    onGizmoModeChange('paint')
    setBrushPopoverOpen(true)
  }

  const recentProjects = projects.slice(0, 5)
  // Example worlds data - folder structure from @folder:exampleWorlds
  // Files are served from public/exampleWorlds, base URL is /renn/
  const exampleWorlds = [
    { name: 'hunt', importPath: '/renn/exampleWorlds/hunt/world.json' },
    { name: 'world1', importPath: '/renn/exampleWorlds/world1/world.json' },
  ]

  const handleOpenExampleWorldClick = useCallback(async (worldName: string, importPath: string) => {
    if (!onOpenExampleWorld) return
    try {
      const response = await fetch(importPath)
      if (!response.ok) {
        console.error('Failed to load example world:', response.status, response.statusText)
        alert('Failed to load example world')
        return
      }
      const worldJson = await response.json()
      onOpenExampleWorld(worldJson, worldName)
      uiLogger.select('BuilderHeader', 'Open example world from menu', { worldName })
    } catch (err) {
      console.error('Failed to load example world:', err)
      alert('Failed to load example world')
    }
  }, [onOpenExampleWorld])

  const exampleWorldsMenuItems: MenuItemConfig[] = exampleWorlds.map((w) => ({
    type: 'item' as const,
    label: w.name,
    onClick: () => void handleOpenExampleWorldClick(w.name, w.importPath),
  }))

  const fileMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'New',
      onClick: onNew,
      shortcut: formatMenuShortcut('Ctrl+N'),
    },
    {
      type: 'submenu',
      label: 'Recent Projects',
      disabled: recentProjects.length === 0,
      items: recentProjects.map((p) => ({
        type: 'item' as const,
        label: p.name,
        onClick: () => onOpen(p.id),
      })),
    },
    {
      type: 'submenu',
      label: 'Example Worlds',
      items: exampleWorldsMenuItems,
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
      shortcut: formatMenuShortcut('Ctrl+S'),
    },
    {
      type: 'item',
      label: 'Save As...',
      onClick: onSaveAs,
      shortcut: formatMenuShortcut('Ctrl+Shift+S'),
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
      label: 'Copy to Clipboard',
      onClick: onCopyWorld,
    },
    {
      type: 'item',
      label: 'Import',
      onClick: onImport,
    },
  ]

  const editMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'Undo',
      onClick: onUndo,
      disabled: !canUndo,
      shortcut: formatMenuShortcut('Ctrl+Z'),
    },
    {
      type: 'item',
      label: 'Redo',
      onClick: onRedo,
      disabled: !canRedo,
      shortcut: formatMenuShortcut('Ctrl+Shift+Z'),
    },
  ]

  const viewMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'Edit-Modus',
      checked: editNavigationMode,
      onClick: onEditNavigationModeToggle,
      disabled: !onEditNavigationModeToggle,
      shortcut: formatMenuShortcut('Ctrl+E'),
    },
    {
      type: 'item',
      label: 'Reset Camera',
      onClick: onResetCamera,
    },
    {
      type: 'item',
      label: 'Game HUD',
      checked: showGameHud,
      onClick: onGameHudToggle,
      disabled: !onGameHudToggle,
    },
    {
      type: 'item',
      label: 'Frame stats',
      checked: showFrameStats,
      onClick: onFrameStatsToggle,
      disabled: !onFrameStatsToggle,
    },
  ]

  const projectMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'Play',
      onClick: onPlay,
      shortcut: formatMenuShortcut('Ctrl+P'),
    },
    {
      type: 'separator',
    },
    {
      type: 'item',
      label: 'Reload',
      onClick: onReload,
    },
    {
      type: 'item',
      label: 'Refresh List',
      onClick: onRefresh,
    },
    {
      type: 'item',
      label: 'Delete Project',
      onClick: () => currentProject.id && onDeleteProject(currentProject.id),
      disabled: !currentProject.id,
    },
  ]

  const toolsMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'Performance booster',
      onClick: onOpenPerformanceBooster,
      disabled: !onOpenPerformanceBooster,
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

  const helpMenuItems: MenuItemConfig[] = [
    {
      type: 'item',
      label: 'Transformer Coding Docs',
      onClick: onOpenTransformerDocs,
      disabled: !onOpenTransformerDocs,
    },
  ]

  return (
    <header
      id="builder-app-header"
      style={{
        background: '#171a22',
        borderBottom: '1px solid #2f3545',
        color: '#e6e9f2',
        position: 'relative',
        zIndex: theme.zIndex.header,
      }}
    >
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
            <DropdownMenu label="Edit" items={editMenuItems} />
            <DropdownMenu label="View" items={viewMenuItems} />
            <DropdownMenu label="Project" items={projectMenuItems} />
            <DropdownMenu label="Tools" items={toolsMenuItems} />
            <DropdownMenu label="Debug" items={debugMenuItems} />
            <DropdownMenu label="Help" items={helpMenuItems} />
          </MenuBar>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <div
            role="group"
            aria-label="Texture brush"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              paddingRight: 10,
              marginRight: 2,
              borderRight: '1px solid #2f3545',
            }}
          >
            <button
              type="button"
              title="Visualize custom transformer variables"
              aria-label="Visualize variables"
              aria-pressed={gizmoMode === 'visualize'}
              onClick={() => onGizmoModeChange('visualize')}
              style={{
                ...entityPanelIconButtonStyle,
                display: 'flex',
                background: gizmoMode === 'visualize' ? '#2a3142' : 'transparent',
                opacity: gizmoMode === 'visualize' ? 1 : 0.85,
              }}
              onMouseEnter={(e) => {
                if (gizmoMode !== 'visualize') e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                if (gizmoMode !== 'visualize') e.currentTarget.style.opacity = '0.85'
              }}
            >
              {GizmoVisualizeIcon}
            </button>
            <button
              ref={brushToolButtonRef}
              type="button"
              title="Paint texture (brush)"
              aria-label="Brush tool"
              aria-expanded={brushPopoverOpen}
              aria-haspopup="dialog"
              aria-controls={brushPopoverOpen ? 'builder-brush-toolbar-panel' : undefined}
              aria-pressed={gizmoMode === 'paint'}
              disabled={textureBrushDisabled}
              onClick={handleBrushToolClick}
              style={{
                ...entityPanelIconButtonStyle,
                display: 'flex',
                background: gizmoMode === 'paint' ? '#2a3142' : 'transparent',
                opacity: textureBrushDisabled ? 0.4 : gizmoMode === 'paint' ? 1 : 0.85,
                cursor: textureBrushDisabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (textureBrushDisabled) return
                if (gizmoMode !== 'paint') e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                if (textureBrushDisabled) return
                if (gizmoMode !== 'paint') e.currentTarget.style.opacity = '0.85'
              }}
            >
              {GizmoBrushIcon}
            </button>
          </div>
          <div
            role="group"
            aria-label="Gizmo mode"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <button
              type="button"
              title="Move (G)"
              aria-label="Move gizmo"
              aria-pressed={gizmoMode === 'translate'}
              onClick={() => onGizmoModeChange('translate')}
              style={{
                ...entityPanelIconButtonStyle,
                display: 'flex',
                background: gizmoMode === 'translate' ? '#2a3142' : 'transparent',
                opacity: gizmoMode === 'translate' ? 1 : 0.85,
              }}
              onMouseEnter={(e) => {
                if (gizmoMode !== 'translate') e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                if (gizmoMode !== 'translate') e.currentTarget.style.opacity = '0.85'
              }}
            >
              {GizmoMoveIcon}
            </button>
            <button
              type="button"
              title="Rotate (R)"
              aria-label="Rotate gizmo"
              aria-pressed={gizmoMode === 'rotate'}
              onClick={() => onGizmoModeChange('rotate')}
              style={{
                ...entityPanelIconButtonStyle,
                display: 'flex',
                background: gizmoMode === 'rotate' ? '#2a3142' : 'transparent',
                opacity: gizmoMode === 'rotate' ? 1 : 0.85,
              }}
              onMouseEnter={(e) => {
                if (gizmoMode !== 'rotate') e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                if (gizmoMode !== 'rotate') e.currentTarget.style.opacity = '0.85'
              }}
            >
              {GizmoRotateIcon}
            </button>
            <button
              type="button"
              title="Scale (S)"
              aria-label="Scale gizmo"
              aria-pressed={gizmoMode === 'scale'}
              onClick={() => onGizmoModeChange('scale')}
              style={{
                ...entityPanelIconButtonStyle,
                display: 'flex',
                background: gizmoMode === 'scale' ? '#2a3142' : 'transparent',
                opacity: gizmoMode === 'scale' ? 1 : 0.85,
              }}
              onMouseEnter={(e) => {
                if (gizmoMode !== 'scale') e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                if (gizmoMode !== 'scale') e.currentTarget.style.opacity = '0.85'
              }}
            >
              {GizmoScaleIcon}
            </button>
          </div>
          {onOpenWorkspace && (
            <div
              role="group"
              aria-label="Workspace"
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 10,
                marginLeft: 2,
                borderLeft: '1px solid #2f3545',
              }}
            >
              <button
                type="button"
                data-testid="header-open-workspace"
                onClick={onOpenWorkspace}
                title="Open behavior workspace (full screen)"
                style={{
                  ...entityPanelIconButtonStyle,
                  display: 'flex',
                  opacity: 0.85,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.85'
                }}
              >
                {EntityPanelIcons.code}
              </button>
            </div>
          )}
        </div>
      </div>

      {brushPopoverOpen && !textureBrushDisabled && onTextureBrushColorHexChange ? (
        <BrushToolPopover
          open
          anchorRef={brushToolButtonRef}
          onClose={() => setBrushPopoverOpen(false)}
          colorHex={textureBrushColorHex}
          onColorHexChange={onTextureBrushColorHexChange}
          brushAlpha={textureBrushAlpha}
          onBrushAlphaChange={onTextureBrushAlphaChange}
          radiusPx={textureBrushRadiusPx}
          onRadiusPxChange={onTextureBrushRadiusPxChange}
          radiusMin={TEXTURE_BRUSH_RADIUS_MIN}
          radiusMax={TEXTURE_BRUSH_RADIUS_MAX}
          onOpenTextureStudio={onOpenTextureStudio}
        />
      ) : null}

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
                  <div
                    key={project.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(project.id)
                        setShowProjectSelector(false)
                      }}
                      style={{
                        flex: 1,
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteProject(project.id)
                      }}
                      title="Delete project"
                      style={{
                        padding: '8px 12px',
                        background: '#3d2a2a',
                        border: '1px solid #4a3535',
                        color: '#e6e9f2',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        fontSize: '16px',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
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
