import { useRef, useCallback } from 'react'
import type { Entity, CameraMode } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'

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
}

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
}: EntitySidebarProps) {
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
    <aside style={{ width: 240, borderRight: '1px solid #ccc', padding: 8, overflow: 'auto' }}>
      <h3 style={{ margin: '0 0 8px' }}>Entities</h3>
      <select
        ref={addEntitySelectRef}
        value=""
        onChange={(e) => {
          const v = e.target.value as AddableShapeType
          if (v) handleAddEntity(v)
        }}
        style={{ display: 'block', width: '100%', marginBottom: 8 }}
        title="Add entity"
      >
        <option value="">Add entity...</option>
        <option value="box">Add box</option>
        <option value="sphere">Add sphere</option>
        <option value="cylinder">Add cylinder</option>
        <option value="capsule">Add capsule</option>
        <option value="plane">Add plane</option>
      </select>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {entities.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '4px 8px',
                background: selectedEntityId === e.id ? '#e0e0ff' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => {
                uiLogger.click('Builder', 'Select entity', { entityId: e.id, entityName: e.name })
                onSelectEntity(e.id)
              }}
            >
              {e.name ?? e.id}
            </button>
          </li>
        ))}
      </ul>
      <h3 style={{ margin: '16px 0 8px' }}>Camera</h3>
      <label>
        Control
        <select
          value={cameraControl}
          onChange={(e) => {
            const value = e.target.value as 'free' | 'follow' | 'top' | 'front' | 'right'
            uiLogger.change('Builder', 'Change camera control', { control: value })
            onCameraControlChange(value)
          }}
        >
          <option value="free">Free (WASD)</option>
          <option value="follow">Follow</option>
          <option value="top">Top</option>
          <option value="front">Front</option>
          <option value="right">Right</option>
        </select>
      </label>
      {cameraControl === 'follow' && (
        <>
          <label>
            Target
            <select
              value={cameraTarget}
              onChange={(e) => {
                uiLogger.change('Builder', 'Change camera target', { target: e.target.value })
                onCameraTargetChange(e.target.value)
              }}
            >
              <option value="">— None —</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name ?? e.id}</option>
              ))}
            </select>
          </label>
          <label>
            Mode
            <select
              value={cameraMode}
              onChange={(e) => {
                uiLogger.change('Builder', 'Change camera mode', { mode: e.target.value })
                onCameraModeChange(e.target.value as CameraMode)
              }}
            >
              <option value="follow">Follow</option>
              <option value="thirdPerson">Third person</option>
              <option value="firstPerson">First person</option>
            </select>
          </label>
        </>
      )}
    </aside>
  )
}
