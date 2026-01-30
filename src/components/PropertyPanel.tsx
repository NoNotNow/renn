import type { RennWorld, Entity, Vec3, Quat, Shape, Color } from '@/types/world'
import { getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'

export interface PropertyPanelProps {
  world: RennWorld
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
  onDeleteEntity?: (entityId: string) => void
}

function vec3ToString(v: Vec3): string {
  return `${v[0]}, ${v[1]}, ${v[2]}`
}

function quatToString(q: Quat): string {
  return `${q[0]}, ${q[1]}, ${q[2]}, ${q[3]}`
}

function parseVec3(s: string): Vec3 | null {
  const parts = s.split(',').map((x) => parseFloat(x.trim()))
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return [parts[0], parts[1], parts[2]]
}

function parseQuat(s: string): Quat | null {
  const parts = s.split(',').map((x) => parseFloat(x.trim()))
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  return [parts[0], parts[1], parts[2], parts[3]]
}

function colorToString(c: Color): string {
  return `${c[0]}, ${c[1]}, ${c[2]}`
}

function parseColor(s: string): Color | null {
  const parts = s.split(',').map((x) => parseFloat(x.trim()))
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return [parts[0], parts[1], parts[2]]
}

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']

export default function PropertyPanel({ world, selectedEntityId, onWorldChange, onDeleteEntity }: PropertyPanelProps) {
  const entity = selectedEntityId
    ? world.entities.find((e) => e.id === selectedEntityId)
    : null

  if (!entity) {
    return (
      <div style={{ padding: 8 }}>
        <p style={{ color: '#666' }}>Select an entity</p>
      </div>
    )
  }

  const updateEntity = (patch: Partial<Entity>) => {
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        e.id === entity.id ? { ...e, ...patch } : e
      ),
    })
  }

  const position = entity.position ?? [0, 0, 0]
  const rotation = entity.rotation ?? [0, 0, 0, 1]
  const scale = entity.scale ?? [1, 1, 1]

  const shapeType = (entity.shape?.type ?? 'box') as AddableShapeType
  const effectiveShapeType = ADDABLE_SHAPE_TYPES.includes(shapeType) ? shapeType : 'box'
  const color = entity.material?.color ?? [0.7, 0.7, 0.7]
  const colorStr = colorToString(color)

  const updateShape = (shape: Shape) => updateEntity({ shape })
  const setShapeType = (newType: AddableShapeType) => {
    updateEntity({ shape: getDefaultShapeForType(newType) })
  }

  return (
    <div style={{ padding: 8 }}>
      <h3 style={{ margin: '0 0 8px' }}>{entity.name ?? entity.id}</h3>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Name
        <input
          type="text"
          value={entity.name ?? ''}
          placeholder={entity.id}
          onChange={(e) => {
            uiLogger.change('PropertyPanel', 'Change entity name', { entityId: entity.id, oldName: entity.name, newName: e.target.value })
            updateEntity({ name: e.target.value || undefined })
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        ID
        <input
          type="text"
          value={entity.id}
          readOnly
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Shape
        <select
          value={effectiveShapeType}
          onChange={(e) => {
            uiLogger.change('PropertyPanel', 'Change shape type', { entityId: entity.id, oldType: effectiveShapeType, newType: e.target.value })
            setShapeType(e.target.value as AddableShapeType)
          }}
          style={{ display: 'block', width: '100%' }}
        >
          <option value="box">Box</option>
          <option value="sphere">Sphere</option>
          <option value="cylinder">Cylinder</option>
          <option value="capsule">Capsule</option>
          <option value="plane">Plane</option>
        </select>
      </label>
      {entity.shape?.type === 'box' && (() => {
        const s = entity.shape
        return (
          <>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Width
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={s.width}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', 'Change box width', { entityId: entity.id, oldValue: s.width, newValue })
                  updateShape({
                    type: 'box',
                    width: newValue,
                    height: s.height,
                    depth: s.depth,
                  })
                }}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Height
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={s.height}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', 'Change box height', { entityId: entity.id, oldValue: s.height, newValue })
                  updateShape({
                    type: 'box',
                    width: s.width,
                    height: newValue,
                    depth: s.depth,
                  })
                }}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Depth
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={s.depth}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', 'Change box depth', { entityId: entity.id, oldValue: s.depth, newValue })
                  updateShape({
                    type: 'box',
                    width: s.width,
                    height: s.height,
                    depth: newValue,
                  })
                }}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
          </>
        )
      })()}
      {entity.shape?.type === 'sphere' && (
        <label style={{ display: 'block', marginBottom: 8 }}>
          Radius
          <input
            type="number"
            min={0.01}
            step={0.1}
            value={entity.shape.radius}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value) || 0.01
              uiLogger.change('PropertyPanel', 'Change sphere radius', { entityId: entity.id, oldValue: entity.shape?.type === 'sphere' ? entity.shape.radius : undefined, newValue })
              updateShape({ type: 'sphere', radius: newValue })
            }}
            style={{ display: 'block', width: '100%' }}
          />
        </label>
      )}
      {(entity.shape?.type === 'cylinder' || entity.shape?.type === 'capsule') && (() => {
        const s = entity.shape
        const type = s.type
        return (
          <>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Radius
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={s.radius}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', `Change ${type} radius`, { entityId: entity.id, oldValue: s.radius, newValue })
                  updateShape({
                    type,
                    radius: newValue,
                    height: s.height,
                  })
                }}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Height
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={s.height}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.01
                  uiLogger.change('PropertyPanel', `Change ${type} height`, { entityId: entity.id, oldValue: s.height, newValue })
                  updateShape({
                    type,
                    radius: s.radius,
                    height: newValue,
                  })
                }}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
          </>
        )
      })()}
      <label style={{ display: 'block', marginBottom: 8 }}>
        Position (x, y, z)
        <input
          type="text"
          value={vec3ToString(position)}
          onChange={(e) => {
            const v = parseVec3(e.target.value)
            if (v) {
              uiLogger.change('PropertyPanel', 'Change position', { entityId: entity.id, oldValue: position, newValue: v })
              updateEntity({ position: v })
            }
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Rotation (quat x, y, z, w)
        <input
          type="text"
          value={quatToString(rotation)}
          onChange={(e) => {
            const q = parseQuat(e.target.value)
            if (q) {
              uiLogger.change('PropertyPanel', 'Change rotation', { entityId: entity.id, oldValue: rotation, newValue: q })
              updateEntity({ rotation: q })
            }
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Scale (x, y, z)
        <input
          type="text"
          value={vec3ToString(scale)}
          onChange={(e) => {
            const v = parseVec3(e.target.value)
            if (v) {
              uiLogger.change('PropertyPanel', 'Change scale', { entityId: entity.id, oldValue: scale, newValue: v })
              updateEntity({ scale: v })
            }
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Body type
        <select
          value={entity.bodyType ?? 'static'}
          onChange={(e) => {
            uiLogger.change('PropertyPanel', 'Change body type', { entityId: entity.id, oldValue: entity.bodyType, newValue: e.target.value })
            updateEntity({ bodyType: e.target.value as Entity['bodyType'] })
          }}
          style={{ display: 'block', width: '100%' }}
        >
          <option value="static">Static</option>
          <option value="dynamic">Dynamic</option>
          <option value="kinematic">Kinematic</option>
        </select>
      </label>
      {entity.bodyType === 'dynamic' && (
        <>
          <label style={{ display: 'block', marginBottom: 8 }}>
            Mass
            <input
              type="number"
              min={0}
              step={0.1}
              value={entity.mass ?? 1}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                uiLogger.change('PropertyPanel', 'Change mass', { entityId: entity.id, oldValue: entity.mass, newValue })
                updateEntity({ mass: newValue })
              }}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            Restitution
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={entity.restitution ?? 0}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                uiLogger.change('PropertyPanel', 'Change restitution', { entityId: entity.id, oldValue: entity.restitution, newValue })
                updateEntity({ restitution: newValue })
              }}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
        </>
      )}
      <label style={{ display: 'block', marginBottom: 8 }}>
        Friction
        <input
          type="number"
          min={0}
          step={0.1}
          value={entity.friction ?? 0.5}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) || 0
            uiLogger.change('PropertyPanel', 'Change friction', { entityId: entity.id, oldValue: entity.friction, newValue })
            updateEntity({ friction: newValue })
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <h4 style={{ margin: '12px 0 8px' }}>Material</h4>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Color (r, g, b 0–1)
        <input
          type="text"
          value={colorStr}
          onChange={(e) => {
            const c = parseColor(e.target.value)
            if (c) {
              uiLogger.change('PropertyPanel', 'Change color', { entityId: entity.id, oldValue: color, newValue: c })
              updateEntity({ material: { ...entity.material, color: c } })
            }
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Roughness
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={entity.material?.roughness ?? 0.5}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) ?? 0.5
            uiLogger.change('PropertyPanel', 'Change roughness', { entityId: entity.id, oldValue: entity.material?.roughness, newValue })
            updateEntity({
              material: { ...entity.material, roughness: newValue },
            })
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Metalness
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={entity.material?.metalness ?? 0}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) ?? 0
            uiLogger.change('PropertyPanel', 'Change metalness', { entityId: entity.id, oldValue: entity.material?.metalness, newValue })
            updateEntity({
              material: { ...entity.material, metalness: newValue },
            })
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      {onDeleteEntity && (
        <button
          type="button"
          onClick={() => {
            uiLogger.delete('PropertyPanel', 'Delete entity button clicked', { entityId: entity.id, entityName: entity.name })
            onDeleteEntity(entity.id)
          }}
          style={{
            marginTop: 16,
            padding: '8px 12px',
            background: '#fcc',
            border: '1px solid #c99',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Delete entity
        </button>
      )}
    </div>
  )
}
