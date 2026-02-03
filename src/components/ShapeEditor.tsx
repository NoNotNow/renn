import type { Shape } from '@/types/world'
import { getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}
const labelStyle = { fontSize: 12, color: '#c4cbd8' }
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
      <div style={rowStyle}>
        <label htmlFor={`${entityId}-shape`} style={labelStyle}>
          Shape
        </label>
        <select
          id={`${entityId}-shape`}
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
      </div>
      {shape?.type === 'box' && (() => {
        const s = shape
        return (
          <>
            <div style={rowStyle}>
              <label htmlFor={`${entityId}-box-width`} style={labelStyle}>
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
                style={inputStyle}
              />
            </div>
            <div style={rowStyle}>
              <label htmlFor={`${entityId}-box-height`} style={labelStyle}>
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
                style={inputStyle}
              />
            </div>
            <div style={rowStyle}>
              <label htmlFor={`${entityId}-box-depth`} style={labelStyle}>
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
                style={inputStyle}
              />
            </div>
          </>
        )
      })()}
      {shape?.type === 'sphere' && (
        <div style={rowStyle}>
          <label htmlFor={`${entityId}-sphere-radius`} style={labelStyle}>
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
            style={inputStyle}
          />
        </div>
      )}
      {(shape?.type === 'cylinder' || shape?.type === 'capsule') && (() => {
        const s = shape
        const type = s.type
        return (
          <>
            <div style={rowStyle}>
              <label htmlFor={`${entityId}-${type}-radius`} style={labelStyle}>
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
                style={inputStyle}
              />
            </div>
            <div style={rowStyle}>
              <label htmlFor={`${entityId}-${type}-height`} style={labelStyle}>
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
                style={inputStyle}
              />
            </div>
          </>
        )
      })()}
    </>
  )
}
