import { useState, useEffect, useMemo } from 'react'
import type { RennWorld, Entity, Vec3, Rotation, Shape } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { uiLogger } from '@/utils/uiLogger'
import TransformEditor from './TransformEditor'
import ShapeEditor from './ShapeEditor'
import PhysicsEditor from './PhysicsEditor'
import ModelEditor from './ModelEditor'
import CollapsibleSection from './CollapsibleSection'
import { fieldLabelStyle, sidebarTextInputStyle, entityPanelIconButtonStyle } from './sharedStyles'
import { EntityPanelIcons } from './EntityPanelIcons'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { theme } from '@/config/theme'
import type { Vec3UndoProps } from './TransformEditor'
import {
  mergeVec3,
  mergeRotation,
  mergeShape,
  mergeMaterial,
  mergeLocked,
  mergeScale,
  mergeNumber,
  mergeBodyType,
  mergeName,
  mergeAvatar,
  allTrimeshOrAllPrimitiveModelLayout,
} from '@/utils/entityInspectorMerge'
import { DEFAULT_POSITION, DEFAULT_ROTATION, DEFAULT_SCALE } from '@/types/world'
import { applyMultiShapeEdit, shapePatchForEntity } from '@/utils/multiSelectShapeChange'
import {
  getMixedDimensionFieldSpecs,
  patchEntityWithMixedDimension,
  type MixedDimensionKind,
} from '@/utils/mixedShapeDimensions'
import PropertyPanelHeader from './propertyPanel/PropertyPanelHeader'
import MaterialSection from './propertyPanel/MaterialSection'
import ModelTransformSection from './propertyPanel/ModelTransformSection'
import AvatarSection from './propertyPanel/AvatarSection'

export interface PropertyPanelProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  onDeleteEntities?: (entityIds: string[]) => void
  onCloneEntity?: (entityId: string) => void
  onEntityPoseChange?: (ids: string[], pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => void
  onEntityPhysicsChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityShapeChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityMaterialChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityModelTransformChange?: (ids: string[], patch: { modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean }) => void
  onEntityTransformersChange?: (entityIds: string[], transformers: TransformerConfig[]) => void
  onRefreshFromPhysics?: (entityIds: string[]) => void
  livePoses?: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null
  onOpenTextureStudio?: (entityId: string) => void | Promise<void>
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
  onRefreshFromPhysics,
  livePoses,
  onOpenTextureStudio,
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

  const mixedDimensionFields = useMemo(() => {
    if (entities.length < 2) return undefined
    if (entities.every((e) => e.shape?.type === entities[0]!.shape?.type)) return undefined
    const specs = getMixedDimensionFieldSpecs(entities)
    return specs.length > 0 ? specs : undefined
  }, [entities])

  if (entities.length === 0 || !primaryEntity) {
    return (
      <div style={{ padding: 10 }}>
        <p style={{ color: theme.text.muted }}>Select an entity</p>
      </div>
    )
  }

  const updateAll = (patch: Partial<Entity>) => {
    const applyMerge = (e: Entity): Entity => {
      const merged = { ...e, ...patch } as Entity
      if (Object.prototype.hasOwnProperty.call(patch, 'doubleSided')) {
        if (patch.doubleSided === true) merged.doubleSided = true
        else delete merged.doubleSided
      }
      return merged
    }
    onWorldChange({
      ...world,
      entities: world.entities.map((e) => (idSet.has(e.id) ? applyMerge(e) : e)),
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
  const mergedAvatar = mergeAvatar(entities)
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

  const handleMixedDimensionChange = (kind: MixedDimensionKind, value: number) => {
    uiLogger.change('PropertyPanel', 'Mixed shape dimension', { entityIds: ids, kind, value })
    const nextEntities = world.entities.map((e) => {
      if (!idSet.has(e.id)) return e
      return patchEntityWithMixedDimension(e, kind, value)
    })
    onWorldChange({ ...world, entities: nextEntities })
  }

  const isModelOrTrimeshMerged = (): boolean => {
    if (entities.length === 0) return false
    const f = entities[0]!.shape?.type === 'trimesh' || !!entities[0]!.model
    return entities.every((e) => (e.shape?.type === 'trimesh' || !!e.model) === f)
  }
  const isModelOrTrimesh = isModelOrTrimeshMerged()

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
      <PropertyPanelHeader
        entities={entities}
        ids={ids}
        primaryEntity={primaryEntity}
        isMulti={isMulti}
        anyLocked={anyLocked}
        mergedName={mergedName}
        onRefreshFromPhysics={onRefreshFromPhysics}
        onCloneEntity={onCloneEntity}
        onDeleteEntities={onDeleteEntities}
      />

      <CollapsibleSection
        title="Entity"
        titleTooltip="Human-readable name, stable id, and lock. Locked entities cannot be deleted and skip property edits."
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
        <label
          style={{ ...fieldLabelStyle, cursor: 'help' }}
          title="Shown in the entity list; does not change the internal id."
        >
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
        <label
          style={{ ...fieldLabelStyle, cursor: 'help' }}
          title="Stable identifier referenced by scripts and links; read-only."
        >
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
        titleTooltip="World-space pose: position, Euler rotation (radians, XYZ order), and per-axis scale."
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
        <p style={{ margin: '4px 0', fontSize: 12, color: theme.text.warning }}>
          Selected entities mix trimesh, models, and primitives. Edit shape or material for a uniform selection.
        </p>
      ) : (
        <>
          <CollapsibleSection
            title="Shape"
            titleTooltip="Collider primitive or trimesh from a model; dimensions and simplification live here."
            copyPayload={mergedShape ?? primaryEntity.shape ?? {}}
          >
            <ShapeEditor
              entityId={editorIdPrefix}
              shape={mergedShape ?? primaryEntity.shape}
              shapeTypeMixed={shapeTypesDiffer}
              onShapeChange={handleShapeChange}
              mixedDimensionFields={mixedDimensionFields}
              onMixedDimensionChange={isMulti && shapeTypesDiffer ? handleMixedDimensionChange : undefined}
              disabled={anyLocked}
              assets={assets}
              world={world}
              onAssetsChange={onAssetsChange}
              onWorldChange={onWorldChange}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Physics"
            titleTooltip="Rapier rigid body: static / dynamic / kinematic, mass, damping, bounce, and friction."
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

          <CollapsibleSection
            title="Material"
            titleTooltip="PBR surface: base color, optional texture map with UV tweaks, opacity, roughness, and metalness."
            copyPayload={mergedMaterial ?? {}}
          >
            <MaterialSection
              entities={entities}
              ids={ids}
              primaryEntity={primaryEntity}
              isMulti={isMulti}
              isModelOrTrimesh={isModelOrTrimesh}
              mergedMaterial={mergedMaterial}
              editorIdPrefix={editorIdPrefix}
              assets={assets}
              world={world}
              anyLocked={anyLocked}
              onWorldChange={onWorldChange}
              onAssetsChange={onAssetsChange}
              onEntityMaterialChange={onEntityMaterialChange}
              updateAll={updateAll}
              onOpenTextureStudio={onOpenTextureStudio}
            />
          </CollapsibleSection>

          {entities.every((e) => e.shape?.type !== 'trimesh') && (
            <CollapsibleSection
              title="3D Model"
              titleTooltip="Optional GLB visual layered on primitive shapes (ignored when the shape itself is trimesh)."
              copyPayload={{ model: primaryEntity.model ?? null }}
            >
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
              titleTooltip="Extra rotation/scale applied to the visual model mesh (and optional physics wireframe preview)."
              copyPayload={{
                modelRotation: mergedModelRotation ?? DEFAULT_ROTATION,
                modelScale: mergedModelScale ?? DEFAULT_SCALE,
                showShapeWireframe: primaryEntity.showShapeWireframe,
                doubleSided: primaryEntity.doubleSided,
              }}
            >
              <ModelTransformSection
                entities={entities}
                ids={ids}
                editorIdPrefix={editorIdPrefix}
                mergedModelRotation={mergedModelRotation}
                mergedModelScale={mergedModelScale}
                anyLocked={anyLocked}
                vec3Undo={vec3Undo}
                onUndoBeforeEdit={undo ? () => undo.pushBeforeEdit() : undefined}
                onEntityModelTransformChange={onEntityModelTransformChange}
                updateAll={updateAll}
              />
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Avatar (play)"
            titleTooltip="When enabled, this entity is driven as the player in play mode (camera and input routing)."
            copyPayload={mergedAvatar ?? {}}
          >
            <AvatarSection
              ids={ids}
              primaryEntity={primaryEntity}
              isMulti={isMulti}
              mergedAvatar={mergedAvatar}
              anyLocked={anyLocked}
              world={world}
              onUndoBeforeEdit={undo ? () => undo.pushBeforeEdit() : undefined}
              updateAll={updateAll}
            />
          </CollapsibleSection>

        </>
      )}
    </div>
  )
}
