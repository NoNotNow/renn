import type { RennWorld, Entity, Vec3, Quat } from '@/types/world'

export interface PropertyPanelProps {
  world: RennWorld
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
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

export default function PropertyPanel({ world, selectedEntityId, onWorldChange }: PropertyPanelProps) {
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

  return (
    <div style={{ padding: 8 }}>
      <h3 style={{ margin: '0 0 8px' }}>{entity.name ?? entity.id}</h3>
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
        Position (x, y, z)
        <input
          type="text"
          value={vec3ToString(position)}
          onChange={(e) => {
            const v = parseVec3(e.target.value)
            if (v) updateEntity({ position: v })
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
            if (q) updateEntity({ rotation: q })
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
            if (v) updateEntity({ scale: v })
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Body type
        <select
          value={entity.bodyType ?? 'static'}
          onChange={(e) => updateEntity({ bodyType: e.target.value as Entity['bodyType'] })}
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
              onChange={(e) => updateEntity({ mass: parseFloat(e.target.value) || 0 })}
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
              onChange={(e) => updateEntity({ restitution: parseFloat(e.target.value) || 0 })}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
        </>
      )}
    </div>
  )
}
