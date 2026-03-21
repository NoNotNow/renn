import { useState, useEffect } from 'react'
import type { RennWorld, Entity, Vec3, Rotation } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { uiLogger } from '@/utils/uiLogger'
import TransformEditor from './TransformEditor'
import Vec3Field from './Vec3Field'
import ShapeEditor from './ShapeEditor'
import PhysicsEditor from './PhysicsEditor'
import MaterialEditor from './MaterialEditor'
import ModelEditor from './ModelEditor'
import TransformerEditor from './TransformerEditor'
import CollapsibleSection from './CollapsibleSection'
import { fieldLabelStyle, sidebarTextInputStyle, iconButtonStyle, entityPanelIconButtonStyle, removeButtonStyle, removeButtonStyleDisabled, secondaryButtonStyle, secondaryButtonStyleDisabled } from './sharedStyles'
import { EntityPanelIcons } from './EntityPanelIcons'

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
  onEntityModelTransformChange?: (id: string, patch: { modelRotation?: Rotation; modelScale?: Vec3 }) => void
  onEntityTransformersChange?: (entityId: string, transformers: TransformerConfig[]) => void
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
  onEntityModelTransformChange,
  onEntityTransformersChange,
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
  const modelRotation = entity.modelRotation ?? [0, 0, 0]
  const modelScale = entity.modelScale ?? [1, 1, 1]
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
            aria-label="Refresh position and rotation from physics"
            style={entityPanelIconButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
          >
            {EntityPanelIcons.refresh}
          </button>
        )}
      </div>

      <CollapsibleSection
        title="Entity"
        defaultCollapsed={false}
        copyPayload={entity}
        trailing={
          <button
            type="button"
            onClick={() => {
              uiLogger.change('PropertyPanel', 'Toggle entity lock', { entityId: entity.id, locked: !isLocked })
              updateEntity({ locked: !isLocked })
            }}
            title={isLocked ? 'Unlock entity' : 'Lock entity'}
            aria-label={isLocked ? 'Unlock entity' : 'Lock entity'}
            style={entityPanelIconButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
          >
            {isLocked ? EntityPanelIcons.lock : EntityPanelIcons.unlock}
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

      <CollapsibleSection
        title="Transform"
        copyPayload={{ position: displayPosition, rotation: displayRotation, scale }}
      >
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

      <CollapsibleSection title="Shape" copyPayload={entity.shape ?? {}}>
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

      <CollapsibleSection
        title="Physics"
        copyPayload={{
          bodyType: entity.bodyType,
          mass: entity.mass ?? 1,
          restitution: entity.restitution ?? 0,
          friction: entity.friction ?? 0.5,
          linearDamping: entity.linearDamping ?? 0.3,
          angularDamping: entity.angularDamping ?? 0.3,
        }}
      >
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

      <CollapsibleSection title="Material" copyPayload={entity.material ?? {}}>
        {(() => {
          const isModelOrTrimesh = entity.shape?.type === 'trimesh' || !!entity.model
          if (isModelOrTrimesh) {
            if (entity.material == null) {
              return (
                <>
                  <p style={{ margin: '8px 0', fontSize: 12, color: '#9aa4b2' }}>
                    Using colors from 3D file.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      uiLogger.change('PropertyPanel', 'Override with material', { entityId: entity.id })
                      const defaultMaterial = { color: [0.7, 0.7, 0.7] as [number, number, number] }
                      if (onEntityMaterialChange) {
                        onEntityMaterialChange(entity.id, { material: defaultMaterial })
                      } else {
                        updateEntity({ material: defaultMaterial })
                      }
                    }}
                    disabled={isLocked}
                    style={{
                      ...secondaryButtonStyle,
                      ...(isLocked && secondaryButtonStyleDisabled),
                    }}
                  >
                    Override with material
                  </button>
                </>
              )
            }
            return (
              <>
                <button
                  type="button"
                  onClick={() => {
                    uiLogger.change('PropertyPanel', 'Use model colors', { entityId: entity.id })
                    if (onEntityMaterialChange) {
                      onEntityMaterialChange(entity.id, { material: undefined })
                    } else {
                      updateEntity({ material: undefined })
                    }
                  }}
                  disabled={isLocked}
                  style={{
                    fontSize: 12,
                    background: 'none',
                    border: 'none',
                    color: '#7ba3d4',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    padding: '0 0 8px 0',
                    marginBottom: 4,
                  }}
                >
                  Use model colors
                </button>
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
              </>
            )
          }
          return (
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
          )
        })()}
      </CollapsibleSection>

      {entity.shape?.type !== 'trimesh' && (
        <CollapsibleSection title="3D Model" copyPayload={entity.model ?? {}}>
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

      {(entity.shape?.type === 'trimesh' || entity.model) && (
        <CollapsibleSection
          title="Model-Transform"
          copyPayload={{ modelRotation, modelScale }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Vec3Field
              label="Model rotation"
              value={modelRotation}
              onChange={(r) => {
                uiLogger.change('PropertyPanel', 'Change model rotation', { entityId: entity.id, oldValue: modelRotation, newValue: r })
                if (onEntityModelTransformChange) {
                  onEntityModelTransformChange(entity.id, { modelRotation: r })
                } else {
                  updateEntity({ modelRotation: r })
                }
              }}
              axisLabels={['X', 'Y', 'Z']}
              idPrefix={`${entity.id}-model-rotation`}
              disabled={isLocked}
            />
            <button
              type="button"
              title="Reset model rotation to 0,0,0"
              aria-label="Reset model rotation to 0,0,0"
              onClick={() => {
                uiLogger.change('PropertyPanel', 'Reset model rotation', { entityId: entity.id })
                if (onEntityModelTransformChange) {
                  onEntityModelTransformChange(entity.id, { modelRotation: [0, 0, 0] })
                } else {
                  updateEntity({ modelRotation: [0, 0, 0] })
                }
              }}
              disabled={isLocked}
              style={{
                ...entityPanelIconButtonStyle,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              {EntityPanelIcons.reset}
            </button>
          </div>
          <Vec3Field
            label="Model scale"
            value={modelScale}
            onChange={(v) => {
              uiLogger.change('PropertyPanel', 'Change model scale', { entityId: entity.id, oldValue: modelScale, newValue: v })
              if (onEntityModelTransformChange) {
                onEntityModelTransformChange(entity.id, { modelScale: v })
              } else {
                updateEntity({ modelScale: v })
              }
            }}
            min={0.01}
            step={0.1}
            sensitivity={0.01}
            idPrefix={`${entity.id}-model-scale`}
            disabled={isLocked}
          />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Transformers" copyPayload={entity.transformers ?? []}>
        <TransformerEditor
          transformers={entity.transformers ?? []}
          onChange={(transformers) =>
            onEntityTransformersChange
              ? onEntityTransformersChange(entity.id, transformers)
              : updateEntity({ transformers })
          }
          disabled={isLocked}
        />
      </CollapsibleSection>

      {onDeleteEntity && (
        <button
          type="button"
          onClick={() => {
            uiLogger.delete('PropertyPanel', 'Delete entity button clicked', { entityId: entity.id, entityName: entity.name })
            onDeleteEntity(entity.id)
          }}
          disabled={isLocked}
          title="Delete entity"
          aria-label="Delete entity"
          style={{
            ...removeButtonStyle,
            ...(isLocked && removeButtonStyleDisabled),
            ...entityPanelIconButtonStyle,
            alignSelf: 'stretch',
            minHeight: 36,
          }}
        >
          {EntityPanelIcons.trash}
        </button>
      )}
    </div>
  )
}
