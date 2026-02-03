import type { RennWorld, Entity, Vec3, Quat } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import TransformEditor from './TransformEditor'
import ShapeEditor from './ShapeEditor'
import PhysicsEditor from './PhysicsEditor'
import MaterialEditor from './MaterialEditor'
import ModelEditor from './ModelEditor'
import { sectionStyle, sectionTitleStyle, fieldLabelStyle } from './sharedStyles'

export interface PropertyPanelProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  onDeleteEntity?: (entityId: string) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Quat }
  onEntityPoseChange?: (id: string, pose: { position?: Vec3; rotation?: Quat }) => void
}

export default function PropertyPanel({
  world,
  assets,
  selectedEntityId,
  onWorldChange,
  onAssetsChange,
  onDeleteEntity,
  getCurrentPose,
  onEntityPoseChange,
}: PropertyPanelProps) {
  const inputStyle = {
    display: 'block',
    width: '100%',
    padding: '6px 8px',
    borderRadius: 6,
  }

  const entity = selectedEntityId
    ? world.entities.find((e) => e.id === selectedEntityId)
    : null

  if (!entity) {
    return (
      <div style={{ padding: 10 }}>
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
  const isLocked = entity.locked ?? false

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        {isLocked && <span style={{ fontSize: 12 }}>🔒</span>}
        {entity.name ?? entity.id}
      </h3>
      <div style={sectionStyle}>
        <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Entity</span>
          <button
            type="button"
            onClick={() => {
              uiLogger.change('PropertyPanel', 'Toggle entity lock', { entityId: entity.id, locked: !isLocked })
              updateEntity({ locked: !isLocked })
            }}
            title={isLocked ? 'Unlock entity' : 'Lock entity'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              fontSize: 14,
              lineHeight: 1,
              opacity: 0.8,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
          >
            {isLocked ? '🔒' : '🔓'}
          </button>
        </div>
        <label style={fieldLabelStyle}>
          Name
          <input
            type="text"
            value={entity.name ?? ''}
            placeholder={entity.id}
            onChange={(e) => {
              uiLogger.change('PropertyPanel', 'Change entity name', { entityId: entity.id, oldName: entity.name, newName: e.target.value })
              updateEntity({ name: e.target.value || undefined })
            }}
            style={inputStyle}
            disabled={isLocked}
          />
        </label>
        <label style={fieldLabelStyle}>
          ID
          <input
            type="text"
            value={entity.id}
            readOnly
            style={inputStyle}
          />
        </label>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Shape</div>
        <ShapeEditor
          entityId={entity.id}
          shape={entity.shape}
          onShapeChange={(shape) => {
            // When switching to trimesh, clear entity.model since trimesh uses shape.model
            if (shape.type === 'trimesh' && entity.model) {
              uiLogger.change('PropertyPanel', 'Clear entity model when switching to trimesh', { 
                entityId: entity.id, 
                clearedModel: entity.model 
              })
              updateEntity({ shape, model: undefined })
            } else {
              updateEntity({ shape })
            }
          }}
          disabled={isLocked}
          assets={assets}
          world={world}
          onAssetsChange={onAssetsChange}
          onWorldChange={onWorldChange}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Transform</div>
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
          disabled={isLocked}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Physics</div>
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
          disabled={isLocked}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Material</div>
        <MaterialEditor
          entityId={entity.id}
          material={entity.material}
          assets={assets}
          world={world}
          onMaterialChange={(material) => updateEntity({ material })}
          onWorldChange={onWorldChange}
          onAssetsChange={onAssetsChange}
          disabled={isLocked}
        />
      </div>

      {entity.shape?.type !== 'trimesh' && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>3D Model</div>
          <ModelEditor
            entityId={entity.id}
            model={entity.model}
            assets={assets}
            world={world}
            onModelChange={(model) => updateEntity({ model })}
            onWorldChange={onWorldChange}
            onAssetsChange={onAssetsChange}
            disabled={isLocked}
          />
        </div>
      )}

      {onDeleteEntity && (
        <button
          type="button"
          onClick={() => {
            uiLogger.delete('PropertyPanel', 'Delete entity button clicked', { entityId: entity.id, entityName: entity.name })
            onDeleteEntity(entity.id)
          }}
          disabled={isLocked}
          style={{
            padding: '8px 12px',
            background: isLocked ? '#2a2a2a' : '#3a1b1b',
            border: isLocked ? '1px solid #3a3a3a' : '1px solid #6b2a2a',
            color: isLocked ? '#666' : '#f4d6d6',
            borderRadius: 6,
            cursor: isLocked ? 'not-allowed' : 'pointer',
            alignSelf: 'stretch',
          }}
        >
          Delete entity
        </button>
      )}
    </div>
  )
}
