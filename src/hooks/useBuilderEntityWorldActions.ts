import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { SceneViewHandle } from '@/components/SceneView'
import { cloneEntityFrom, createDefaultEntity, createBulkEntities, type AddableShapeType, type BulkEntityParams } from '@/data/entityDefaults'
import { presetTouchesSceneRebuild } from '@/data/modelPresets'
import { applyWorldEdit, type ApplyWorldEditDeps, type ApplyWorldWrite } from '@/editor/applyWorldEdit'
import {
  DEFAULT_POSITION,
  DEFAULT_ROTATION,
  DEFAULT_SCALE,
  type Entity,
  type ModelPreset,
  type RennWorld,
  type Rotation,
  type Vec3,
} from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { pruneGroupMembers } from '@/utils/entityGroups'
import { getEntityApproximateSize } from '@/utils/entityApproximateSize'
import { placeEntitiesInFrontOfCamera } from '@/utils/cameraFrontPlacement'
import { computeMeshWorldMaxExtent } from '@/utils/meshWorldExtent'
import { generateEntityId } from '@/utils/idGenerator'
import {
  commitTransformerConfigsToWorld,
  mapTransformerRegistryIdsToEntity,
  cloneEntityTransformersIntoWorld,
} from '@/utils/commitTransformerConfigsToWorld'
import { resolveMergedTransformerConfigsForEntitySync } from '@/utils/pipeStageResolve'
import { uiLogger } from '@/utils/uiLogger'

export type UseBuilderEntityWorldActionsParams = {
  sceneViewRef: RefObject<SceneViewHandle | null>
  worldEditDeps: ApplyWorldEditDeps
  world: RennWorld
  worldAssetsRef: RefObject<{ world: RennWorld; assets: Map<string, Blob> }>
  selectedEntityIds: string[]
  setSelectedEntityIds: Dispatch<SetStateAction<string[]>>
  setSelectedGroupIds: Dispatch<SetStateAction<string[]>>
  selectionAnchorEntityIdRef: MutableRefObject<string | null>
  updateWorld: (updater: (prev: RennWorld) => RennWorld) => void
  bumpVersion: () => void
  pushHistory: () => void
  syncPosesFromScene: (poses: Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>) => void
}

export function useBuilderEntityWorldActions({
  sceneViewRef,
  worldEditDeps,
  world,
  worldAssetsRef,
  selectedEntityIds,
  setSelectedEntityIds,
  setSelectedGroupIds,
  selectionAnchorEntityIdRef,
  updateWorld,
  bumpVersion,
  pushHistory,
  syncPosesFromScene,
}: UseBuilderEntityWorldActionsParams) {
  const clipboardRef = useRef<{ entities: Entity[] } | null>(null)

  const clipboardShortcutHandlersRef = useRef<{
    onCopy: () => void
    onPaste: () => void
  }>({ onCopy: () => {}, onPaste: () => {} })

  const getCurrentPose = useCallback(
    (id: string): { position: Vec3; rotation: Rotation; scale: Vec3 } => {
      const reg = sceneViewRef.current?.getAllPoses()
      const savedPose = reg?.get(id)
      if (savedPose) return savedPose
      const entity = world.entities.find((e) => e.id === id)
      return {
        position: entity?.position ?? [0, 0, 0],
        rotation: entity?.rotation ?? [0, 0, 0],
        scale: entity?.scale ?? DEFAULT_SCALE,
      }
    },
    [world.entities, sceneViewRef],
  )

  const handleAddEntity = useCallback(
    (type: AddableShapeType) => {
      const cam = sceneViewRef.current?.getCameraPose()
      const entity = createDefaultEntity(type)
      if (cam) {
        const extent = getEntityApproximateSize(entity)
        const positions = placeEntitiesInFrontOfCamera({
          camera: cam,
          entities: [entity],
          extentByEntityId: new Map([[entity.id, extent]]),
        })
        const pos = positions.get(entity.id)
        if (pos) entity.position = pos
      }
      uiLogger.click('Builder', 'Add entity', { type, entityId: entity.id })
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'sync' }, (prevWorld) => ({
        ...prevWorld,
        entities: [...prevWorld.entities, entity],
      }))
      setSelectedEntityIds([entity.id])
    },
    [worldEditDeps, sceneViewRef, setSelectedEntityIds],
  )

  const handleBulkAddEntities = useCallback(
    (params: BulkEntityParams) => {
      const newEntities = createBulkEntities(params)
      uiLogger.click('Builder', 'Bulk add entities', {
        count: newEntities.length,
        shape: params.shape,
      })
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'sync' }, (prevWorld) => ({
        ...prevWorld,
        entities: [...prevWorld.entities, ...newEntities],
      }))
      setSelectedEntityIds(newEntities.map((e) => e.id))
    },
    [worldEditDeps, setSelectedEntityIds],
  )

  const handleDeleteEntities = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      uiLogger.click('Builder', 'Delete entities', { count: ids.length, entityIds: ids })
      const idSet = new Set(ids)
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'sync' }, (prevWorld) => {
        const withPrunedGroups = pruneGroupMembers(prevWorld, idSet)
        return {
          ...withPrunedGroups,
          entities: prevWorld.entities.filter((e) => !idSet.has(e.id)),
        }
      })
      setSelectedEntityIds((prev) => prev.filter((id) => !idSet.has(id)))
      setSelectedGroupIds((prev) => prev.filter((id) => !idSet.has(id)))
    },
    [worldEditDeps, setSelectedEntityIds, setSelectedGroupIds],
  )

  const handleCloneEntity = useCallback(
    (entityId: string) => {
      const prevWorld = worldAssetsRef.current?.world ?? world
      const source = prevWorld.entities.find((e) => e.id === entityId)
      if (!source) return
      const pose = getCurrentPose(entityId)
      const cloned = cloneEntityFrom(source, pose)
      uiLogger.click('Builder', 'Clone entity', { sourceId: entityId, newId: cloned.id })
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'sync' }, (w) => {
        const { world: nextWorldBase, newTransformerIds } = cloneEntityTransformersIntoWorld(w, cloned)
        const entityWithNewIds = {
          ...cloned,
          transformers: newTransformerIds.length > 0 ? newTransformerIds : cloned.transformers,
        }
        return { ...nextWorldBase, entities: [...nextWorldBase.entities, entityWithNewIds] }
      })
      setSelectedEntityIds([cloned.id])
    },
    [getCurrentPose, world, worldEditDeps, worldAssetsRef, setSelectedEntityIds],
  )

  const handleCopyEntities = useCallback(() => {
    if (selectedEntityIds.length === 0) return
    const snapshots: Entity[] = []
    for (const id of selectedEntityIds) {
      const src = world.entities.find((e) => e.id === id)
      if (!src) continue
      const pose = getCurrentPose(id)
      const snap = structuredClone(src) as Entity
      snap.position = [...pose.position] as Vec3
      snap.rotation = [...pose.rotation] as Rotation
      snap.scale = [...pose.scale] as Vec3
      snapshots.push(snap)
    }
    if (snapshots.length === 0) return
    clipboardRef.current = { entities: snapshots }
    uiLogger.click('Builder', 'Copy entities', {
      count: snapshots.length,
      entityIds: snapshots.map((e) => e.id),
    })
  }, [selectedEntityIds, world.entities, getCurrentPose])

  const handlePasteEntities = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip?.entities.length) return
    const cam = sceneViewRef.current?.getCameraPose()
    if (!cam) return

    const extentByEntityId = new Map<string, number>()
    for (const ent of clip.entities) {
      const mesh = sceneViewRef.current?.getMeshForEntity(ent.id)
      if (mesh) {
        extentByEntityId.set(ent.id, computeMeshWorldMaxExtent(mesh, ent))
      } else {
        extentByEntityId.set(ent.id, getEntityApproximateSize(ent))
      }
    }

    const positionByOldId = placeEntitiesInFrontOfCamera({
      camera: cam,
      entities: clip.entities,
      extentByEntityId,
    })

    const newEntities: Entity[] = []
    const newIds: string[] = []
    for (const src of clip.entities) {
      const next = structuredClone(src) as Entity
      next.id = generateEntityId()
      next.locked = false
      const base = (src.name ?? src.id).replace(/\s+copy(\s+\d+)?$/i, '').trim() || src.id
      next.name = `${base} copy`
      const pos = positionByOldId.get(src.id)
      if (pos) next.position = pos
      newEntities.push(next)
      newIds.push(next.id)
    }

    applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'sync' }, (prevWorld) => {
      let nextWorld = prevWorld
      const finalEntities = newEntities.map((cloned) => {
        const { world: w, newTransformerIds } = cloneEntityTransformersIntoWorld(nextWorld, cloned)
        nextWorld = w
        return newTransformerIds.length > 0 ? { ...cloned, transformers: newTransformerIds } : cloned
      })
      return { ...nextWorld, entities: [...nextWorld.entities, ...finalEntities] }
    })
    setSelectedEntityIds(newIds)
    selectionAnchorEntityIdRef.current = newIds[0] ?? null
    uiLogger.click('Builder', 'Paste entities', { count: newEntities.length, entityIds: newIds })
  }, [worldEditDeps, sceneViewRef, setSelectedEntityIds, selectionAnchorEntityIdRef])

  clipboardShortcutHandlersRef.current = {
    onCopy: handleCopyEntities,
    onPaste: handlePasteEntities,
  }

  const handleEntityPoseChange = useCallback(
    (ids: string[], pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityPose(id, pose)
      }
    },
    [sceneViewRef],
  )

  const handleResetPoseToSavedWorld = useCallback(
    (entityIds: string[]) => {
      if (entityIds.length === 0) return
      const unlockedIds = entityIds.filter((id) => {
        const e = world.entities.find((x) => x.id === id)
        return e != null && !e.locked
      })
      if (unlockedIds.length === 0) return
      for (const id of unlockedIds) {
        const e = world.entities.find((x) => x.id === id)!
        sceneViewRef.current?.updateEntityPose(id, {
          position: [...(e.position ?? DEFAULT_POSITION)] as Vec3,
          rotation: [...(e.rotation ?? DEFAULT_ROTATION)] as Rotation,
        })
      }
      uiLogger.click('Builder', 'Reset pose to saved world', { entityIds: unlockedIds })
    },
    [world.entities, sceneViewRef],
  )

  const handleEntityPhysicsChange = useCallback(
    (ids: string[], patch: Partial<Entity>) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityPhysics(id, patch)
      }
      const idSet = new Set(ids)
      applyWorldEdit(worldEditDeps, { undo: 'skip', scene: 'none' }, (prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
      }))
    },
    [worldEditDeps, sceneViewRef],
  )

  const handleEntityMaterialChange = useCallback(
    (ids: string[], patch: Partial<Entity>) => {
      for (const id of ids) {
        const base = world.entities.find((e) => e.id === id)
        if (base) void sceneViewRef.current?.updateEntityMaterial(id, { ...base, ...patch })
      }
      const idSet = new Set(ids)
      applyWorldEdit(worldEditDeps, { undo: 'skip', scene: 'none' }, (prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
      }))
    },
    [world.entities, worldEditDeps, sceneViewRef],
  )

  const handleEntityShapeChange = useCallback(
    (ids: string[], patch: Partial<Entity>) => {
      let needRebuild = false
      for (const id of ids) {
        const updatedEntity = { ...world.entities.find((e) => e.id === id)!, ...patch }
        const applied = sceneViewRef.current?.updateEntityShape(id, updatedEntity) ?? false
        if (!applied) needRebuild = true
      }
      const idSet = new Set(ids)
      if (needRebuild) {
        worldEditDeps.captureScenePosesForNextRebuild()
        bumpVersion()
      }
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
      }))
    },
    [world.entities, updateWorld, worldEditDeps, bumpVersion, sceneViewRef],
  )

  const handleEntityModelTransformChange = useCallback(
    (ids: string[], patch: { modelPosition?: Vec3; modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean }) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityModelTransform(id, patch)
      }
      const idSet = new Set(ids)
      applyWorldEdit(worldEditDeps, { undo: 'skip', scene: 'none' }, (prev) => ({
        ...prev,
        entities: prev.entities.map((e) => {
          if (!idSet.has(e.id)) return e
          const merged = { ...e, ...patch } as Entity
          if (Object.prototype.hasOwnProperty.call(patch, 'doubleSided')) {
            if (patch.doubleSided !== true) delete merged.doubleSided
            else merged.doubleSided = true
          }
          return merged
        }),
      }))
    },
    [worldEditDeps, sceneViewRef],
  )

  const handleAfterModelPresetApply = useCallback(
    async (previews: { id: string; merged: Entity }[], preset: ModelPreset) => {
      if (presetTouchesSceneRebuild(preset)) return
      for (const { id, merged } of previews) {
        const hasMat = Object.prototype.hasOwnProperty.call(preset, 'material')
        const hasDbl = Object.prototype.hasOwnProperty.call(preset, 'doubleSided')
        if (hasMat) {
          await sceneViewRef.current?.updateEntityMaterial(id, merged)
        } else if (hasDbl) {
          sceneViewRef.current?.refreshEntityAppearance(id, merged)
        }
      }
    },
    [sceneViewRef],
  )

  const handleRefreshFromPhysics = useCallback(
    (entityIds: string[]) => {
      const m = new Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>()
      for (const id of entityIds) {
        m.set(id, getCurrentPose(id))
      }
      syncPosesFromScene(m)
    },
    [getCurrentPose, syncPosesFromScene],
  )

  const handleWorldChange = useCallback(
    (newWorld: RennWorld) => {
      applyWorldEdit(worldEditDeps, { undo: 'skip', scene: 'auto' }, () => newWorld)
    },
    [worldEditDeps],
  )

  const applyWorldWrite = useCallback<ApplyWorldWrite>(
    (descriptor, produceNext) => applyWorldEdit(worldEditDeps, descriptor, produceNext),
    [worldEditDeps],
  )

  const syncMergedEntityTransformers = useCallback(
    (entityIds: string[], nextWorld: RennWorld) => {
      sceneViewRef.current?.setWorldPipeRegistry(
        nextWorld.transformers ?? {},
        nextWorld.transformerPipes ?? {},
      )
      for (const id of entityIds) {
        const merged = resolveMergedTransformerConfigsForEntitySync(nextWorld, id)
        sceneViewRef.current?.syncEntityTransformers(id, merged)
      }
    },
    [sceneViewRef],
  )

  const handleEntityTransformersChange = useCallback(
    (
      entityIds: string[],
      transformers: TransformerConfig[],
      orderedRegistryIds?: string[],
      isShared?: boolean,
    ) => {
      pushHistory()
      let nextWorld = world
      for (const id of entityIds) {
        const idsForEntity =
          orderedRegistryIds ?
            isShared || entityIds.length === 1 ?
              orderedRegistryIds
            : mapTransformerRegistryIdsToEntity(orderedRegistryIds, id)
          : undefined
        nextWorld = commitTransformerConfigsToWorld(nextWorld, id, transformers, idsForEntity)
      }
      updateWorld(() => nextWorld)
      syncMergedEntityTransformers(entityIds, nextWorld)
    },
    [world, updateWorld, pushHistory, syncMergedEntityTransformers],
  )

  const handleMergedPipeParamSync = useCallback(
    (nextWorld: RennWorld, entityIds: string[]) => {
      syncMergedEntityTransformers(entityIds, nextWorld)
    },
    [syncMergedEntityTransformers],
  )

  return {
    clipboardShortcutHandlersRef,
    getCurrentPose,
    handleAddEntity,
    handleBulkAddEntities,
    handleDeleteEntities,
    handleCloneEntity,
    handleCopyEntities,
    handlePasteEntities,
    handleEntityPoseChange,
    handleResetPoseToSavedWorld,
    handleEntityPhysicsChange,
    handleEntityMaterialChange,
    handleEntityShapeChange,
    handleEntityModelTransformChange,
    handleAfterModelPresetApply,
    handleRefreshFromPhysics,
    handleWorldChange,
    applyWorldWrite,
    handleEntityTransformersChange,
    handleMergedPipeParamSync,
  }
}
