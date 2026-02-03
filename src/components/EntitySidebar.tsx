import { useRef, useCallback, useState } from 'react'
import type { Entity, CameraMode } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'
import { SidebarToggleButton } from '@/components/SidebarToggleButton'
import SidebarTabs from './SidebarTabs'
import { sidebarRowStyle, sidebarLabelStyle, fieldLabelStyle } from './sharedStyles'

export interface EntitySidebarProps {
  entities: Entity[]
  selectedEntityId: string | null
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: CameraMode
  onSelectEntity: (id: string) => void
  onAddEntity: (shapeType: AddableShapeType) => void
  onCameraControlChange: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  onCameraTargetChange: (target: string) => void
  onCameraModeChange: (mode: CameraMode) => void
  isOpen: boolean
  onToggle: () => void
}

type LeftTab = 'entities' | 'camera'

export default function EntitySidebar({
  entities,
  selectedEntityId,
  cameraControl,
  cameraTarget,
  cameraMode,
  onSelectEntity,
  onAddEntity,
  onCameraControlChange,
  onCameraTargetChange,
  onCameraModeChange,
  isOpen,
  onToggle,
}: EntitySidebarProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>('camera')
  const addEntitySelectRef = useRef<HTMLSelectElement>(null)

  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      onAddEntity(shapeType)
      if (addEntitySelectRef.current) {
        addEntitySelectRef.current.value = ''
      }
    },
    [onAddEntity]
  )

  return (
    <div style={{ 
      position: 'absolute', 
      left: 0, 
      top: 0, 
      bottom: 0, 
      display: 'flex', 
      height: '100%',
      zIndex: 100,
      pointerEvents: isOpen ? 'auto' : 'none',
    }}>
      <aside
        style={{
          width: isOpen ? 240 : 0,
          borderRight: '1px solid #2f3545',
          overflow: isOpen ? 'auto' : 'hidden',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: 'rgba(27, 31, 42, 0.92)',
          display: 'flex',
          flexDirection: 'column',
          color: '#e6e9f2',
          boxShadow: isOpen ? '2px 0 12px rgba(0,0,0,0.45)' : 'none',
        }}
      >
      {isOpen && (
        <>
          <SidebarTabs
            tabs={['entities', 'camera'] as const}
            activeTab={leftTab}
            onTabChange={(tab) => {
              uiLogger.click('Builder', 'Switch left panel tab', { tab })
              setLeftTab(tab)
            }}
          />
          <div style={{ padding: 10 }}>
            {leftTab === 'entities' && (
              <>
                <label style={fieldLabelStyle}>
                  Add
                  <select
                    ref={addEntitySelectRef}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value as AddableShapeType
                      if (v) handleAddEntity(v)
                    }}
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                    title="Add entity"
                  >
                    <option value="">—</option>
                    <option value="box">Box</option>
                    <option value="sphere">Sphere</option>
                    <option value="cylinder">Cylinder</option>
                    <option value="capsule">Capsule</option>
                    <option value="plane">Plane</option>
                  </select>
                </label>
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0' }}>
                  {entities.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '4px 8px',
                          background: selectedEntityId === e.id ? '#2b3550' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        onClick={() => {
                          uiLogger.click('Builder', 'Select entity', { entityId: e.id, entityName: e.name })
                          onSelectEntity(e.id)
                        }}
                        onMouseEnter={(e) => {
                          if (selectedEntityId !== e.currentTarget.textContent) {
                            e.currentTarget.style.background = '#20263a'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedEntityId !== e.currentTarget.textContent) {
                            e.currentTarget.style.background = 'transparent'
                          }
                        }}
                      >
                        {e.locked && <span style={{ fontSize: 11, opacity: 0.7 }}>🔒</span>}
                        <span>{e.name ?? e.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {leftTab === 'camera' && (
              <>
                <div style={sidebarRowStyle}>
                  <label htmlFor="camera-control" style={sidebarLabelStyle}>
                    Control
                  </label>
                  <select
                    id="camera-control"
                    value={cameraControl}
                    onChange={(e) => {
                      const value = e.target.value as 'free' | 'follow' | 'top' | 'front' | 'right'
                      uiLogger.change('Builder', 'Change camera control', { control: value })
                      onCameraControlChange(value)
                    }}
                    style={{ display: 'block', width: '100%' }}
                  >
                    <option value="free">Free (WASD)</option>
                    <option value="follow">Follow</option>
                    <option value="top">Top</option>
                    <option value="front">Front</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                {cameraControl === 'follow' && (
                  <>
                    <div style={sidebarRowStyle}>
                      <label htmlFor="camera-target" style={sidebarLabelStyle}>
                        Target
                      </label>
                      <select
                        id="camera-target"
                        value={cameraTarget}
                        onChange={(e) => {
                          uiLogger.change('Builder', 'Change camera target', { target: e.target.value })
                          onCameraTargetChange(e.target.value)
                        }}
                        style={{ display: 'block', width: '100%' }}
                      >
                        <option value="">— None —</option>
                        {entities.map((e) => (
                          <option key={e.id} value={e.id}>{e.name ?? e.id}</option>
                        ))}
                      </select>
                    </div>
                    <div style={sidebarRowStyle}>
                      <label htmlFor="camera-mode" style={sidebarLabelStyle}>
                        Mode
                      </label>
                      <select
                        id="camera-mode"
                        value={cameraMode}
                        onChange={(e) => {
                          uiLogger.change('Builder', 'Change camera mode', { mode: e.target.value })
                          onCameraModeChange(e.target.value as CameraMode)
                        }}
                        style={{ display: 'block', width: '100%' }}
                      >
                        <option value="follow">Follow</option>
                        <option value="thirdPerson">Third person</option>
                        <option value="firstPerson">First person</option>
                      </select>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
      </aside>

      {/* Toggle button - always visible */}
      <SidebarToggleButton
        isOpen={isOpen}
        onToggle={onToggle}
        side="left"
        logContext="Toggle left drawer"
      />
    </div>
  )
}
