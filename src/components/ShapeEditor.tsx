import type { Shape } from '@/types/world'
import { getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']

const labelStyle = { display: 'block', marginBottom: 8 }
const inputStyle = { display: 'block', width: '100%' }

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
      <label style={labelStyle}>
        Shape
        <select
          value={effectiveShapeType}
          onChange={(e) => {
            uiLogger.change('PropertyPanel', 'Change shape type', { entityId, oldType: effectiveShapeType, newType: e.target.value })
            setShapeType(e.target.value as AddableShapeType)
          }}
          style={inputStyle}
        >
          <option value="box">Box</option>
          <option value="sphere">Sphere</option>
          <option value="cylinder">Cylinder</option>
          <option value="capsule">Capsule</option>
          <option value="plane">Plane</option>
        </select>
      </label>
      {shape?.type === 'box' && (() => {
        const s = shape
        return (
          <>
            <label style={labelStyle}>
              Width
              <input
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
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Height
              <input
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
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Depth
              <input
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
                style={inputStyle}
              />
            </label>
          </>
        )
      })()}
      {shape?.type === 'sphere' && (
        <label style={labelStyle}>
          Radius
          <input
            type="number"
            min={0.01}
            step={0.1}
            value={shape.radius}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value) || 0.01
              uiLogger.change('PropertyPanel', 'Change sphere radius', { entityId, oldValue: shape.radius, newValue })
              onShapeChange({ type: 'sphere', radius: newValue })
            }}
            style={inputStyle}
          />
        </label>
      )}
      {(shape?.type === 'cylinder' || shape?.type === 'capsule') && (() => {
        const s = shape
        const type = s.type
        return (
          <>
            <label style={labelStyle}>
              Radius
              <input
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
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Height
              <input
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
                style={inputStyle}
              />
            </label>
          </>
        )
      })()}
    </>
  )
}
