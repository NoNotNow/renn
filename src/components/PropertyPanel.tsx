import type { RennWorld, Entity, Vec3, Quat } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import TransformEditor from './TransformEditor'
import ShapeEditor from './ShapeEditor'
import PhysicsEditor from './PhysicsEditor'
import MaterialEditor from './MaterialEditor'

export interface PropertyPanelProps {
  world: RennWorld
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
  onDeleteEntity?: (entityId: string) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Quat }
  onEntityPoseChange?: (id: string, pose: { position?: Vec3; rotation?: Quat }) => void
}

export default function PropertyPanel({
  world,
  selectedEntityId,
  onWorldChange,
  onDeleteEntity,
  getCurrentPose,
  onEntityPoseChange,
}: PropertyPanelProps) {
  const entity = selectedEntityId
    ? world.entities.find((e) => e.id === selectedEntityId)
    : null

  if (!entity) {
    return (
      <div style={{ padding: 8 }}>
        <p style={{ color: '#9aa4b2' }}>Select an entity</p>
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

      <ShapeEditor
        entityId={entity.id}
        shape={entity.shape}
        onShapeChange={(shape) => updateEntity({ shape })}
      />

      <TransformEditor
        entityId={entity.id}
        position={position}
        rotation={rotation}
        scale={scale}
        onPositionChange={(v) => {
          if (onEntityPoseChange) {
            onEntityPoseChange(entity.id, { position: v })
          } else {
            updateEntity({ position: v })
          }
        }}
        onRotationChange={(q) => {
          if (onEntityPoseChange) {
            onEntityPoseChange(entity.id, { rotation: q })
          } else {
            updateEntity({ rotation: q })
          }
        }}
        onScaleChange={(v) => updateEntity({ scale: v })}
        getCurrentPose={getCurrentPose}
      />

      <PhysicsEditor
        entityId={entity.id}
        bodyType={entity.bodyType}
        mass={entity.mass ?? 1}
        restitution={entity.restitution ?? 0}
        friction={entity.friction ?? 0.5}
        onBodyTypeChange={(bodyType) => updateEntity({ bodyType })}
        onMassChange={(mass) => updateEntity({ mass })}
        onRestitutionChange={(restitution) => updateEntity({ restitution })}
        onFrictionChange={(friction) => updateEntity({ friction })}
      />

      <MaterialEditor
        entityId={entity.id}
        material={entity.material}
        onMaterialChange={(material) => updateEntity({ material })}
      />

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
            background: '#3a1b1b',
            border: '1px solid #6b2a2a',
            color: '#f4d6d6',
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
