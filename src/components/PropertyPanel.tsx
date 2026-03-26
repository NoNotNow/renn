import { useState, useEffect, useMemo } from 'react'
import type { RennWorld, Entity, Vec3, Rotation, Shape } from '@/types/world'
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
import Switch from './Switch'
import {
  fieldLabelStyle,
  sidebarTextInputStyle,
  entityPanelIconButtonStyle,
  removeButtonStyle,
  removeButtonStyleDisabled,
  secondaryButtonStyle,
  secondaryButtonStyleDisabled,
} from './sharedStyles'
import { EntityPanelIcons } from './EntityPanelIcons'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import type { Vec3UndoProps } from './TransformEditor'
import {
  mergeVec3,
  mergeRotation,
  mergeShape,
  mergeMaterial,
  mergeTransformers,
  mergeLocked,
  mergeScale,
  mergeNumber,
  mergeBodyType,
  mergeName,
  allTrimeshOrAllPrimitiveModelLayout,
} from '@/utils/entityInspectorMerge'
import { DEFAULT_POSITION, DEFAULT_ROTATION, DEFAULT_SCALE } from '@/types/world'
import { applyMultiShapeEdit, shapePatchForEntity } from '@/utils/multiSelectShapeChange'

export interface PropertyPanelProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  onDeleteEntities?: (entityIds: string[]) => void
  onCloneEntity?: (entityId: string) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Rotation; scale?: Vec3 }
  onEntityPoseChange?: (ids: string[], pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => void
  onEntityPhysicsChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityShapeChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityMaterialChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityModelTransformChange?: (ids: string[], patch: { modelRotation?: Rotation; modelScale?: Vec3 }) => void
  onEntityTransformersChange?: (entityIds: string[], transformers: TransformerConfig[]) => void
  onRefreshFromPhysics?: (entityIds: string[]) => void
  livePoses?: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null
}

export default function PropertyPanel({
  world,
  assets,
  selectedEntityIds,
  onWorldChange,
  onAssetsChange,
  onDeleteEntities,
  onCloneEntity,
  onEntityPoseChange,
  onEntityPhysicsChange,
  onEntityShapeChange,
  onEntityMaterialChange,
  onEntityModelTransformChange,
  onEntityTransformersChange,
  onRefreshFromPhysics,
  livePoses,
}: PropertyPanelProps) {
  const undo = useEditorUndo()
  const vec3Undo: Vec3UndoProps | undefined =
    undo != null
      ? {
          onScrubStart: () => undo.notifyScrubStart(),
          onScrubEnd: (hadScrub: boolean) => undo.notifyScrubEnd(hadScrub),
          onBeforeCommit: () => undo.pushBeforeEdit(),
        }
      : undefined

  const entities = useMemo(() => {
    const list: Entity[] = []
    for (const id of selectedEntityIds) {
      const e = world.entities.find((x) => x.id === id)
      if (e) list.push(e)
    }
    return list
  }, [selectedEntityIds, world.entities])

  const ids = useMemo(() => entities.map((e) => e.id), [entities])
  const idSet = useMemo(() => new Set(ids), [ids])
  const isMulti = entities.length > 1
  const primaryEntity = entities[0]
  const editorIdPrefix = isMulti ? `multi-${ids.join('-').slice(0, 48)}` : (primaryEntity?.id ?? 'none')

  const [editingName, setEditingName] = useState<string | null>(null)
  useEffect(() => {
    setEditingName(null)
  }, [selectedEntityIds.join('\0')])

  if (entities.length === 0 || !primaryEntity) {
    return (
      <div style={{ padding: 10 }}>
        <p style={{ color: '#9aa4b2' }}>Select an entity</p>
      </div>
    )
  }

  const updateAll = (patch: Partial<Entity>) => {
    onWorldChange({
      ...world,
      entities: world.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
    })
  }

  const anyLocked = entities.some((e) => e.locked)
  const allLocked = entities.every((e) => e.locked)
  const lockMerged = mergeLocked(entities)

  const mergedName = mergeName(entities)
  const displayPosition =
    mergeVec3(entities, (e) => livePoses?.get(e.id)?.position ?? e.position ?? DEFAULT_POSITION) ??
    DEFAULT_POSITION
  const displayRotation =
    mergeRotation(entities, (e) => livePoses?.get(e.id)?.rotation ?? e.rotation ?? DEFAULT_ROTATION) ??
    DEFAULT_ROTATION
  const displayScale =
    mergeScale(entities) ??
    mergeVec3(entities, (e) => livePoses?.get(e.id)?.scale ?? e.scale ?? DEFAULT_SCALE) ??
    DEFAULT_SCALE
  const mergedShape = mergeShape(entities)
  const mergedModelRotation = mergeRotation(entities, (e) => e.modelRotation ?? DEFAULT_ROTATION)
  const mergedModelScale = mergeVec3(entities, (e) => e.modelScale ?? DEFAULT_SCALE)
  const mergedMaterial = mergeMaterial(entities)
  const posMerged = mergeVec3(entities, (e) => livePoses?.get(e.id)?.position ?? e.position ?? DEFAULT_POSITION)
  const rotMerged = mergeRotation(entities, (e) => livePoses?.get(e.id)?.rotation ?? e.rotation ?? DEFAULT_ROTATION)
  const scaleMerged = mergeScale(entities)
  const mergedTransformers = mergeTransformers(entities)
  const mergedBodyType = mergeBodyType(entities)
  const mergedMass = mergeNumber(entities, (e) => e.mass, 1)
  const mergedRestitution = mergeNumber(entities, (e) => e.restitution, 0)
  const mergedFriction = mergeNumber(entities, (e) => e.friction, 0.5)
  const mergedLinearDamping = mergeNumber(entities, (e) => e.linearDamping, 0.3)
  const mergedAngularDamping = mergeNumber(entities, (e) => e.angularDamping, 0.3)

  const shapeLayout = allTrimeshOrAllPrimitiveModelLayout(entities)
  const showShapeMaterialWarning = shapeLayout === 'mixed'
  const shapeTypesDiffer =
    entities.length > 0 &&
    !entities.every((e) => e.shape?.type === entities[0]!.shape?.type)

  const isModelOrTrimeshMerged = (): boolean => {
    if (entities.length === 0) return false
    const f = entities[0]!.shape?.type === 'trimesh' || !!entities[0]!.model
    return entities.every((e) => (e.shape?.type === 'trimesh' || !!e.model) === f)
  }
  const isModelOrTrimesh = isModelOrTrimeshMerged()

  const materialAllNull = entities.every((e) => e.material == null)
  const materialAllSet = entities.every((e) => e.material != null)

  const nameDisplayValue =
    editingName !== null ? editingName : mergedName !== null ? mergedName : ''
  const handleNameFocus = () => setEditingName(mergedName ?? '')
  const handleNameBlur = () => {
    const newName = (editingName ?? mergedName ?? '').trim() || undefined
    if (newName !== (mergedName ?? undefined)) {
      undo?.pushBeforeEdit()
      uiLogger.change('PropertyPanel', 'Change entity name', { entityIds: ids, newName: newName ?? '' })
      updateAll({ name: newName })
    }
    setEditingName(null)
  }

  const handleShapeChange = (shape: Shape) => {
    if (isMulti) {
      const nextEntities = world.entities.map((e) => {
        if (!idSet.has(e.id)) return e
        return { ...e, ...applyMultiShapeEdit(e, shape) }
      })
      onWorldChange({ ...world, entities: nextEntities })
      return
    }
    const e = primaryEntity
    const switchingToTrimesh = shape.type === 'trimesh'
    const switchingFromTrimesh = e.shape?.type === 'trimesh'
    const involvesTrimesh = switchingToTrimesh || switchingFromTrimesh
    const patch = shapePatchForEntity(e, shape)
    if (!involvesTrimesh && onEntityShapeChange) {
      onEntityShapeChange(ids, patch)
    } else {
      updateAll(patch)
    }
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
          {anyLocked && <span style={{ fontSize: 12 }}>🔒</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isMulti
              ? mergedName !== null
                ? `${mergedName} (${entities.length})`
                : `Multiple entities (${entities.length})`
              : (primaryEntity.name ?? primaryEntity.id)}
          </span>
        </h3>
        {(onRefreshFromPhysics || onCloneEntity || onDeleteEntities) && (
          <div
            role="group"
            aria-label="Actions"
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            {onRefreshFromPhysics && (
              <button
                type="button"
                onClick={() => {
                  uiLogger.click('PropertyPanel', 'Refresh from physics', { entityIds: ids })
                  onRefreshFromPhysics(ids)
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
            {onCloneEntity && (
              <button
                type="button"
                onClick={() => {
                  if (isMulti) return
                  uiLogger.click('PropertyPanel', 'Clone entity', { entityId: primaryEntity.id })
                  onCloneEntity(primaryEntity.id)
                }}
                disabled={isMulti}
                title={isMulti ? 'Clone one entity at a time' : 'Clone entity'}
                aria-label="Clone entity"
                style={{
                  ...entityPanelIconButtonStyle,
                  opacity: isMulti ? 0.4 : 0.8,
                  cursor: isMulti ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isMulti) e.currentTarget.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  if (!isMulti) e.currentTarget.style.opacity = '0.8'
                }}
              >
                {EntityPanelIcons.clone}
              </button>
            )}
            {onDeleteEntities && (
              <button
                type="button"
                onClick={() => {
                  if (anyLocked) return
                  uiLogger.delete('PropertyPanel', 'Delete entities', { entityIds: ids })
                  onDeleteEntities(ids)
                }}
                disabled={anyLocked}
                title={anyLocked ? 'Cannot delete locked entities' : isMulti ? 'Delete selected entities' : 'Delete entity'}
                aria-label="Delete entity"
                style={{
                  ...entityPanelIconButtonStyle,
                  ...removeButtonStyle,
                  padding: 0,
                  ...(anyLocked && removeButtonStyleDisabled),
                }}
                onMouseEnter={(e) => {
                  if (!anyLocked) e.currentTarget.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  if (!anyLocked) e.currentTarget.style.opacity = '0.8'
                }}
              >
                {EntityPanelIcons.trash}
              </button>
            )}
          </div>
        )}
      </div>

      <CollapsibleSection
        title="Entity"
        defaultCollapsed={false}
        copyPayload={isMulti ? entities : primaryEntity}
        trailing={
          <button
            type="button"
            onClick={() => {
              undo?.pushBeforeEdit()
              const nextLocked = lockMerged === null ? !allLocked : !lockMerged
              uiLogger.change('PropertyPanel', 'Set lock on entities', { entityIds: ids, locked: nextLocked })
              updateAll({ locked: nextLocked })
            }}
            title={
              lockMerged === null
                ? allLocked
                  ? 'Unlock all'
                  : 'Lock all'
                : lockMerged
                  ? 'Unlock entity'
                  : 'Lock entity'
            }
            aria-label="Toggle lock"
            style={entityPanelIconButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
          >
            {allLocked ? EntityPanelIcons.lock : EntityPanelIcons.unlock}
          </button>
        }
      >
        <label style={fieldLabelStyle}>
          Name
          <input
            type="text"
            value={nameDisplayValue}
            placeholder={isMulti ? '—' : primaryEntity.id}
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
            disabled={anyLocked}
          />
        </label>
        <label style={fieldLabelStyle}>
          ID
          <input
            type="text"
            value={isMulti ? '—' : primaryEntity.id}
            readOnly
            style={sidebarTextInputStyle}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        title="Transform"
        copyPayload={{ position: displayPosition, rotation: displayRotation, scale: displayScale }}
      >
        <TransformEditor
          entityId={editorIdPrefix}
          position={posMerged === null ? null : posMerged}
          rotation={rotMerged === null ? null : rotMerged}
          scale={scaleMerged === null ? null : scaleMerged}
          vec3Undo={vec3Undo}
          onPositionChange={(v) => {
            onEntityPoseChange?.(ids, { position: v })
            updateAll({ position: v })
          }}
          onRotationChange={(q) => {
            onEntityPoseChange?.(ids, { rotation: q })
            updateAll({ rotation: q })
          }}
          onScaleChange={(v) => {
            updateAll({ scale: v })
            onEntityPoseChange?.(ids, { scale: v })
          }}
          disabled={anyLocked}
        />
      </CollapsibleSection>

      {showShapeMaterialWarning ? (
        <p style={{ margin: '4px 0', fontSize: 12, color: '#c9a227' }}>
          Selected entities mix trimesh, models, and primitives. Edit shape or material for a uniform selection.
        </p>
      ) : (
        <>
          <CollapsibleSection title="Shape" copyPayload={mergedShape ?? primaryEntity.shape ?? {}}>
            <ShapeEditor
              entityId={editorIdPrefix}
              shape={mergedShape ?? primaryEntity.shape}
              shapeTypeMixed={shapeTypesDiffer}
              onShapeChange={handleShapeChange}
              disabled={anyLocked}
              assets={assets}
              world={world}
              onAssetsChange={onAssetsChange}
              onWorldChange={onWorldChange}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Physics"
            copyPayload={{
              bodyType: mergedBodyType ?? 'static',
              mass: mergedMass ?? 1,
              restitution: mergedRestitution ?? 0,
              friction: mergedFriction ?? 0.5,
              linearDamping: mergedLinearDamping ?? 0.3,
              angularDamping: mergedAngularDamping ?? 0.3,
            }}
          >
            <PhysicsEditor
              entityId={editorIdPrefix}
              bodyType={mergedBodyType}
              mass={mergedMass}
              restitution={mergedRestitution}
              friction={mergedFriction}
              linearDamping={mergedLinearDamping}
              angularDamping={mergedAngularDamping}
              onBodyTypeChange={(bodyType) =>
                onEntityPhysicsChange ? onEntityPhysicsChange(ids, { bodyType }) : updateAll({ bodyType })
              }
              onMassChange={(mass) =>
                onEntityPhysicsChange ? onEntityPhysicsChange(ids, { mass }) : updateAll({ mass })
              }
              onRestitutionChange={(restitution) =>
                onEntityPhysicsChange ? onEntityPhysicsChange(ids, { restitution }) : updateAll({ restitution })
              }
              onFrictionChange={(friction) =>
                onEntityPhysicsChange ? onEntityPhysicsChange(ids, { friction }) : updateAll({ friction })
              }
              onLinearDampingChange={(linearDamping) =>
                onEntityPhysicsChange ? onEntityPhysicsChange(ids, { linearDamping }) : updateAll({ linearDamping })
              }
              onAngularDampingChange={(angularDamping) =>
                onEntityPhysicsChange ? onEntityPhysicsChange(ids, { angularDamping }) : updateAll({ angularDamping })
              }
              disabled={anyLocked}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Material" copyPayload={mergedMaterial ?? {}}>
            {(() => {
              if (!isModelOrTrimesh) {
                if (mergedMaterial === null) {
                  return (
                    <p style={{ margin: '8px 0', fontSize: 12, color: '#9aa4b2' }}>
                      Material properties differ across selection. Edit one entity or apply a change to set all to the same material.
                    </p>
                  )
                }
                return (
                  <MaterialEditor
                    entityId={editorIdPrefix}
                    material={mergedMaterial}
                    assets={assets}
                    world={world}
                    onMaterialChange={(material) =>
                      onEntityMaterialChange ? onEntityMaterialChange(ids, { material }) : updateAll({ material })
                    }
                    onWorldChange={onWorldChange}
                    onAssetsChange={onAssetsChange}
                    disabled={anyLocked}
                  />
                )
              }
              if (materialAllNull) {
                return (
                  <>
                    <p style={{ margin: '8px 0', fontSize: 12, color: '#9aa4b2' }}>Using colors from 3D file.</p>
                    <button
                      type="button"
                      onClick={() => {
                        uiLogger.change('PropertyPanel', 'Override with material', { entityIds: ids })
                        const defaultMaterial = { color: [0.7, 0.7, 0.7] as [number, number, number] }
                        if (onEntityMaterialChange) {
                          onEntityMaterialChange(ids, { material: defaultMaterial })
                        } else {
                          updateAll({ material: defaultMaterial })
                        }
                      }}
                      disabled={anyLocked}
                      style={{
                        ...secondaryButtonStyle,
                        ...(anyLocked && secondaryButtonStyleDisabled),
                      }}
                    >
                      Override with material
                    </button>
                  </>
                )
              }
              if (materialAllSet && mergedMaterial != null) {
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        uiLogger.change('PropertyPanel', 'Use model colors', { entityIds: ids })
                        if (onEntityMaterialChange) {
                          onEntityMaterialChange(ids, { material: undefined })
                        } else {
                          updateAll({ material: undefined })
                        }
                      }}
                      disabled={anyLocked}
                      style={{
                        fontSize: 12,
                        background: 'none',
                        border: 'none',
                        color: '#7ba3d4',
                        cursor: anyLocked ? 'not-allowed' : 'pointer',
                        padding: '0 0 8px 0',
                        marginBottom: 4,
                      }}
                    >
                      Use model colors
                    </button>
                    <MaterialEditor
                      entityId={editorIdPrefix}
                      material={mergedMaterial}
                      assets={assets}
                      world={world}
                      onMaterialChange={(material) =>
                        onEntityMaterialChange
                          ? onEntityMaterialChange(ids, { material })
                          : updateAll({ material })
                      }
                      onWorldChange={onWorldChange}
                      onAssetsChange={onAssetsChange}
                      disabled={anyLocked}
                    />
                  </>
                )
              }
              return (
                <p style={{ fontSize: 12, color: '#9aa4b2' }}>
                  Material override differs across selection. Set all to file colors or override on each entity type consistently.
                </p>
              )
            })()}
          </CollapsibleSection>

          {entities.every((e) => e.shape?.type !== 'trimesh') && (
            <CollapsibleSection title="3D Model" copyPayload={{ model: primaryEntity.model ?? null }}>
              <ModelEditor
                entityId={editorIdPrefix}
                model={entities.every((e) => e.model === entities[0]!.model) ? primaryEntity.model : undefined}
                modelMixed={!entities.every((e) => e.model === entities[0]!.model)}
                assets={assets}
                world={world}
                onModelChange={(model) =>
                  updateAll(
                    model ? { model } : { model: undefined, showShapeWireframe: undefined },
                  )
                }
                onWorldChange={onWorldChange}
                onAssetsChange={onAssetsChange}
                disabled={anyLocked}
              />
            </CollapsibleSection>
          )}

          {entities.every((e) => e.shape?.type === 'trimesh' || e.model) && (
            <CollapsibleSection
              title="Model-Transform"
              copyPayload={{
                modelRotation: mergedModelRotation ?? DEFAULT_ROTATION,
                modelScale: mergedModelScale ?? DEFAULT_SCALE,
                showShapeWireframe: primaryEntity.showShapeWireframe,
              }}
            >
              {entities.every((e) => e.shape?.type !== 'trimesh' && e.model) ? (
                <div style={{ marginBottom: 10 }}>
                  <Switch
                    checked={entities.every((e) => e.showShapeWireframe === true)}
                    onChange={(checked) => {
                      undo?.pushBeforeEdit()
                      uiLogger.change('PropertyPanel', 'Toggle shape wireframe', { entityIds: ids, value: checked })
                      updateAll(checked ? { showShapeWireframe: true } : { showShapeWireframe: undefined })
                    }}
                    disabled={anyLocked}
                    label="Show shape wireframe"
                  />
                  <div style={{ fontSize: 10, color: '#666', marginTop: 4, paddingLeft: 2 }}>
                    Outlines the physics primitive (not the GLTF mesh)
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Vec3Field
                  label="Model rotation"
                  value={mergedModelRotation}
                  onChange={(r) => {
                    uiLogger.change('PropertyPanel', 'Change model rotation', { entityIds: ids, newValue: r })
                    if (onEntityModelTransformChange) {
                      onEntityModelTransformChange(ids, { modelRotation: r })
                    } else {
                      updateAll({ modelRotation: r })
                    }
                  }}
                  axisLabels={['X', 'Y', 'Z']}
                  idPrefix={`${editorIdPrefix}-model-rotation`}
                  disabled={anyLocked}
                  onScrubStart={vec3Undo?.onScrubStart}
                  onScrubEnd={vec3Undo?.onScrubEnd}
                  onBeforeCommit={vec3Undo?.onBeforeCommit}
                />
                <button
                  type="button"
                  title="Reset model rotation to 0,0,0"
                  aria-label="Reset model rotation to 0,0,0"
                  onClick={() => {
                    vec3Undo?.onBeforeCommit?.()
                    uiLogger.change('PropertyPanel', 'Reset model rotation', { entityIds: ids })
                    if (onEntityModelTransformChange) {
                      onEntityModelTransformChange(ids, { modelRotation: [0, 0, 0] })
                    } else {
                      updateAll({ modelRotation: [0, 0, 0] })
                    }
                  }}
                  disabled={anyLocked}
                  style={{
                    ...entityPanelIconButtonStyle,
                    cursor: anyLocked ? 'not-allowed' : 'pointer',
                    opacity: anyLocked ? 0.5 : 1,
                  }}
                >
                  {EntityPanelIcons.reset}
                </button>
              </div>
              <Vec3Field
                label="Model scale"
                value={mergedModelScale}
                onChange={(v) => {
                  uiLogger.change('PropertyPanel', 'Change model scale', { entityIds: ids, newValue: v })
                  if (onEntityModelTransformChange) {
                    onEntityModelTransformChange(ids, { modelScale: v })
                  } else {
                    updateAll({ modelScale: v })
                  }
                }}
                min={0.01}
                step={0.1}
                sensitivity={0.01}
                idPrefix={`${editorIdPrefix}-model-scale`}
                disabled={anyLocked}
                onScrubStart={vec3Undo?.onScrubStart}
                onScrubEnd={vec3Undo?.onScrubEnd}
                onBeforeCommit={vec3Undo?.onBeforeCommit}
              />
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Transformers" copyPayload={mergedTransformers ?? []}>
            <TransformerEditor
              transformers={mergedTransformers === null ? [] : mergedTransformers}
              transformersMixed={mergedTransformers === null}
              onChange={(transformers) =>
                onEntityTransformersChange
                  ? onEntityTransformersChange(ids, transformers)
                  : updateAll({ transformers })
              }
              disabled={anyLocked}
            />
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
