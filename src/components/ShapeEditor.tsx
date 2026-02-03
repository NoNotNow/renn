import type { Shape } from '@/types/world'
import { getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'
import { sidebarRowStyle, sidebarLabelStyle, sidebarInputStyle } from './sharedStyles'

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']

export interface ShapeEditorProps {
  entityId: string
  shape: Shape | undefined
  onShapeChange: (shape: Shape) => void
}

export default function ShapeEditor({
  entityId,
  shape,
  onShapeChange,
}: ShapeEditorProps) {
  const shapeType = (shape?.type ?? 'box') as AddableShapeType
  const effectiveShapeType = ADDABLE_SHAPE_TYPES.includes(shapeType) ? shapeType : 'box'

  const setShapeType = (newType: AddableShapeType) => {
    onShapeChange(getDefaultShapeForType(newType))
  }

  return (
    <>
      <div style={sidebarRowStyle}>
        <label htmlFor={`${entityId}-shape`} style={sidebarLabelStyle}>
          Shape
        </label>
        <select
          id={`${entityId}-shape`}
          value={effectiveShapeType}
          onChange={(e) => {
            uiLogger.change('PropertyPanel', 'Change shape type', { entityId, oldType: effectiveShapeType, newType: e.target.value })
            setShapeType(e.target.value as AddableShapeType)
          }}
          style={sidebarInputStyle}
        >
          <option value="box">Box</option>
          <option value="sphere">Sphere</option>
          <option value="cylinder">Cylinder</option>
          <option value="capsule">Capsule</option>
          <option value="plane">Plane</option>
        </select>
      </div>
      {shape?.type === 'box' && (() => {
        const s = shape
        return (
          <>
            <div style={sidebarRowStyle}>
              <label htmlFor={`${entityId}-box-width`} style={sidebarLabelStyle}>
                Width
              </label>
              <input
                id={`${entityId}-box-width`}
                type="number"
                min={0.01}
                step={0.1}
                value={s.width}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', 'Change box width', { entityId, oldValue: s.width, newValue })
                  onShapeChange({
                    type: 'box',
                    width: newValue,
                    height: s.height,
                    depth: s.depth,
                  })
                }}
                style={sidebarInputStyle}
              />
            </div>
            <div style={sidebarRowStyle}>
              <label htmlFor={`${entityId}-box-height`} style={sidebarLabelStyle}>
                Height
              </label>
              <input
                id={`${entityId}-box-height`}
                type="number"
                min={0.01}
                step={0.1}
                value={s.height}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', 'Change box height', { entityId, oldValue: s.height, newValue })
                  onShapeChange({
                    type: 'box',
                    width: s.width,
                    height: newValue,
                    depth: s.depth,
                  })
                }}
                style={sidebarInputStyle}
              />
            </div>
            <div style={sidebarRowStyle}>
              <label htmlFor={`${entityId}-box-depth`} style={sidebarLabelStyle}>
                Depth
              </label>
              <input
                id={`${entityId}-box-depth`}
                type="number"
                min={0.01}
                step={0.1}
                value={s.depth}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', 'Change box depth', { entityId, oldValue: s.depth, newValue })
                  onShapeChange({
                    type: 'box',
                    width: s.width,
                    height: s.height,
                    depth: newValue,
                  })
                }}
                style={sidebarInputStyle}
              />
            </div>
          </>
        )
      })()}
      {shape?.type === 'sphere' && (
        <div style={sidebarRowStyle}>
          <label htmlFor={`${entityId}-sphere-radius`} style={sidebarLabelStyle}>
            Radius
          </label>
          <input
            id={`${entityId}-sphere-radius`}
            type="number"
            min={0.01}
            step={0.1}
            value={shape.radius}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value) || 0.01
              uiLogger.change('PropertyPanel', 'Change sphere radius', { entityId, oldValue: shape.radius, newValue })
              onShapeChange({ type: 'sphere', radius: newValue })
            }}
            style={sidebarInputStyle}
          />
        </div>
      )}
      {(shape?.type === 'cylinder' || shape?.type === 'capsule') && (() => {
        const s = shape
        const type = s.type
        return (
          <>
            <div style={sidebarRowStyle}>
              <label htmlFor={`${entityId}-${type}-radius`} style={sidebarLabelStyle}>
                Radius
              </label>
              <input
                id={`${entityId}-${type}-radius`}
                type="number"
                min={0.01}
                step={0.1}
                value={s.radius}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', `Change ${type} radius`, { entityId, oldValue: s.radius, newValue })
                  onShapeChange({
                    type,
                    radius: newValue,
                    height: s.height,
                  })
                }}
                style={sidebarInputStyle}
              />
            </div>
            <div style={sidebarRowStyle}>
              <label htmlFor={`${entityId}-${type}-height`} style={sidebarLabelStyle}>
                Height
              </label>
              <input
                id={`${entityId}-${type}-height`}
                type="number"
                min={0.01}
                step={0.1}
                value={s.height}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', `Change ${type} height`, { entityId, oldValue: s.height, newValue })
                  onShapeChange({
                    type,
                    radius: s.radius,
                    height: newValue,
                  })
                }}
                style={sidebarInputStyle}
              />
            </div>
          </>
        )
      })()}
    </>
  )
}
