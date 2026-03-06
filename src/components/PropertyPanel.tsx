import { useState, useEffect } from 'react'
import type { RennWorld, Entity, Vec3, Rotation } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import TransformEditor from './TransformEditor'
import ShapeEditor from './ShapeEditor'
import PhysicsEditor from './PhysicsEditor'
import MaterialEditor from './MaterialEditor'
import ModelEditor from './ModelEditor'
import TransformerEditor from './TransformerEditor'
import CollapsibleSection from './CollapsibleSection'
import { fieldLabelStyle, sidebarTextInputStyle, iconButtonStyle, removeButtonStyle, removeButtonStyleDisabled } from './sharedStyles'

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 14, height: 14, flexShrink: 0 }}
    >
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

export interface PropertyPanelProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  onDeleteEntity?: (entityId: string) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Rotation }
  onEntityPoseChange?: (id: string, pose: { position?: Vec3; rotation?: Rotation }) => void
  onEntityPhysicsChange?: (id: string, patch: Partial<Entity>) => void
  onEntityShapeChange?: (id: string, patch: Partial<Entity>) => void
  onEntityMaterialChange?: (id: string, patch: Partial<Entity>) => void
  onRefreshFromPhysics?: (entityId: string) => void
  livePoses?: Map<string, { position: Vec3; rotation: Rotation }> | null
}

export default function PropertyPanel({
  world,
  assets,
  selectedEntityId,
  onWorldChange,
  onAssetsChange,
  onDeleteEntity,
  onEntityPoseChange,
  onEntityPhysicsChange,
  onEntityShapeChange,
  onEntityMaterialChange,
  onRefreshFromPhysics,
  livePoses,
}: PropertyPanelProps) {
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

  const livePose = livePoses?.get(entity.id)
  const displayPosition = livePose?.position ?? entity.position ?? [0, 0, 0]
  const displayRotation = livePose?.rotation ?? entity.rotation ?? [0, 0, 0]
  const scale = entity.scale ?? [1, 1, 1]
  const isLocked = entity.locked ?? false

  const [editingName, setEditingName] = useState<string | null>(null)
  useEffect(() => {
    setEditingName(null)
  }, [entity.id])

  const nameDisplayValue = editingName !== null ? editingName : (entity.name ?? '')
  const handleNameFocus = () => setEditingName(entity.name ?? '')
  const handleNameBlur = () => {
    const newName = (editingName ?? entity.name ?? '').trim() || undefined
    if (newName !== (entity.name ?? undefined)) {
      uiLogger.change('PropertyPanel', 'Change entity name', { entityId: entity.id, oldName: entity.name, newName: newName ?? '' })
      updateEntity({ name: newName })
    }
    setEditingName(null)
  }

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          margin: '0 0 2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minWidth: 0,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {isLocked && <span style={{ fontSize: 12 }}>🔒</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entity.name ?? entity.id}
          </span>
        </h3>
        {onRefreshFromPhysics && (
          <button
            type="button"
            onClick={() => {
              uiLogger.click('PropertyPanel', 'Refresh from physics', { entityId: entity.id })
              onRefreshFromPhysics(entity.id)
            }}
            title="Refresh position and rotation from physics"
            style={{ ...iconButtonStyle, flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
          >
            <RefreshIcon />
          </button>
        )}
      </div>

      <CollapsibleSection
        title="Entity"
        defaultCollapsed={false}
        trailing={
          <button
            type="button"
            onClick={() => {
              uiLogger.change('PropertyPanel', 'Toggle entity lock', { entityId: entity.id, locked: !isLocked })
              updateEntity({ locked: !isLocked })
            }}
            title={isLocked ? 'Unlock entity' : 'Lock entity'}
            style={{ ...iconButtonStyle, fontSize: 14 }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
          >
            {isLocked ? '🔒' : '🔓'}
          </button>
        }
      >
        <label style={fieldLabelStyle}>
          Name
          <input
            type="text"
            value={nameDisplayValue}
            placeholder={entity.id}
            onChange={(e) => {
              if (editingName !== null) {
                setEditingName(e.target.value)
              }
            }}
            onFocus={handleNameFocus}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Return') {
                e.currentTarget.blur()
              }
            }}
            style={sidebarTextInputStyle}
            disabled={isLocked}
          />
        </label>
        <label style={fieldLabelStyle}>
          ID
          <input
            type="text"
            value={entity.id}
            readOnly
            style={sidebarTextInputStyle}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection title="Transform">
        <TransformEditor
          entityId={entity.id}
          position={displayPosition}
          rotation={displayRotation}
          scale={scale}
          onPositionChange={(v) => {
            if (onEntityPoseChange) {
              onEntityPoseChange(entity.id, { position: v })
            } else {
              updateEntity({ position: v })
            }
          }}
          onRotationChange={(q) => {
            if (onEntityPoseChange) onEntityPoseChange(entity.id, { rotation: q })
            updateEntity({ rotation: q })
          }}
          onScaleChange={(v) => updateEntity({ scale: v })}
          disabled={isLocked}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Shape">
        <ShapeEditor
          entityId={entity.id}
          shape={entity.shape}
          onShapeChange={(shape) => {
            // Switching to trimesh must also clear entity.model (trimesh uses shape.model)
            const switchingToTrimesh = shape.type === 'trimesh'
            const switchingFromTrimesh = entity.shape?.type === 'trimesh'
            const involvesTrimesh = switchingToTrimesh || switchingFromTrimesh
            if (switchingToTrimesh && entity.model) {
              uiLogger.change('PropertyPanel', 'Clear entity model when switching to trimesh', { 
                entityId: entity.id, 
                clearedModel: entity.model 
              })
            }
            const patch: Partial<Entity> = switchingToTrimesh && entity.model
              ? { shape, model: undefined }
              : { shape }
            if (!involvesTrimesh && onEntityShapeChange) {
              onEntityShapeChange(entity.id, patch)
            } else {
              updateEntity(patch)
            }
          }}
          disabled={isLocked}
          assets={assets}
          world={world}
          onAssetsChange={onAssetsChange}
          onWorldChange={onWorldChange}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Physics">
        <PhysicsEditor
          entityId={entity.id}
          bodyType={entity.bodyType}
          mass={entity.mass ?? 1}
          restitution={entity.restitution ?? 0}
          friction={entity.friction ?? 0.5}
          linearDamping={entity.linearDamping ?? 0.3}
          angularDamping={entity.angularDamping ?? 0.3}
          onBodyTypeChange={(bodyType) => onEntityPhysicsChange ? onEntityPhysicsChange(entity.id, { bodyType }) : updateEntity({ bodyType })}
          onMassChange={(mass) => onEntityPhysicsChange ? onEntityPhysicsChange(entity.id, { mass }) : updateEntity({ mass })}
          onRestitutionChange={(restitution) => onEntityPhysicsChange ? onEntityPhysicsChange(entity.id, { restitution }) : updateEntity({ restitution })}
          onFrictionChange={(friction) => onEntityPhysicsChange ? onEntityPhysicsChange(entity.id, { friction }) : updateEntity({ friction })}
          onLinearDampingChange={(linearDamping) => onEntityPhysicsChange ? onEntityPhysicsChange(entity.id, { linearDamping }) : updateEntity({ linearDamping })}
          onAngularDampingChange={(angularDamping) => onEntityPhysicsChange ? onEntityPhysicsChange(entity.id, { angularDamping }) : updateEntity({ angularDamping })}
          disabled={isLocked}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Material">
        <MaterialEditor
          entityId={entity.id}
          material={entity.material}
          assets={assets}
          world={world}
          onMaterialChange={(material) =>
            onEntityMaterialChange
              ? onEntityMaterialChange(entity.id, { material })
              : updateEntity({ material })
          }
          onWorldChange={onWorldChange}
          onAssetsChange={onAssetsChange}
          disabled={isLocked}
        />
      </CollapsibleSection>

      {entity.shape?.type !== 'trimesh' && (
        <CollapsibleSection title="3D Model">
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
        </CollapsibleSection>
      )}

      {entity.transformers && entity.transformers.length > 0 && (
        <CollapsibleSection title="Transformers">
          <TransformerEditor
            transformers={entity.transformers}
            onChange={(transformers) => updateEntity({ transformers })}
            disabled={isLocked}
          />
        </CollapsibleSection>
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
            ...removeButtonStyle,
            ...(isLocked && removeButtonStyleDisabled),
            padding: '8px 12px',
            alignSelf: 'stretch',
          }}
        >
          Delete entity
        </button>
      )}
    </div>
  )
}
