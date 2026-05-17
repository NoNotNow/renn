import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import PerformanceBoosterDialog from '@/components/PerformanceBoosterDialog'
import SaveDialog from '@/components/SaveDialog'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import { LivePosesPoll, type LivePosesMap } from '@/components/LivePosesPoll'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'
import { useEditorHistory } from '@/hooks/useEditorHistory'
import { useTextureMakerSession } from '@/hooks/useTextureMakerSession'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cloneEntityFrom, createDefaultEntity, createBulkEntities, type AddableShapeType, type BulkEntityParams } from '@/data/entityDefaults'
import { presetTouchesSceneRebuild } from '@/data/modelPresets'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useBuilderFullscreenChrome } from '@/hooks/useBuilderFullscreenChrome'
import {
  DEFAULT_POSITION,
  DEFAULT_ROTATION,
  DEFAULT_SCALE,
  type Vec3,
  type Rotation,
  type Entity,
  type ModelPreset,
  type TrimeshSimplificationConfig,
} from '@/types/world'
import { useBuilderKeyboardShortcuts } from '@/hooks/useBuilderKeyboardShortcuts'
import {
  addToGroup,
  createGroupFromSelection,
  dissolveGroup,
  expandGroupSelection,
  findGroupContaining,
  getGroups,
  pruneGroupMembers,
  removeFromGroup,
  renameGroup,
  setGroupCollapsed,
} from '@/utils/entityGroups'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { theme } from '@/config/theme'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import type { TransformerConfig } from '@/types/transformer'
import {
  DEFAULT_TEXTURE_BRUSH_RGB,
  TEXTURE_BRUSH_RADIUS_MAX,
  TEXTURE_BRUSH_RADIUS_MIN,
  TEXTURE_PAINT_RADIUS_PX,
  type BuilderGizmoMode,
  type BuilderPoseCommitEntry,
} from '@/editor/transformGizmoController'
import type { EditorSnapshot } from '@/editor/editorHistory'
import { downscaleImageBlob } from '@/utils/textureDownscale'
import { clampTrimeshSimplificationConfig } from '@/scripts/migrateWorld'
import {
  applyMeshSimplificationToEntityInWorld,
  persistSimplifiedMeshAssetFromWorld,
} from '@/utils/bakeSimplifiedModelAsset'
import { generateEntityId } from '@/utils/idGenerator'
import TextureMaker from '@/components/TextureMaker/TextureMaker'
import TransformerDocs from '@/components/TransformerDocs'
import { getEntityApproximateSize } from '@/utils/entityApproximateSize'
import { computeMeshWorldMaxExtent } from '@/utils/meshWorldExtent'
import { placeEntitiesInFrontOfCamera } from '@/utils/cameraFrontPlacement'
import { commitTransformerConfigsToWorld } from '@/utils/commitTransformerConfigsToWorld'

const EDITOR_HISTORY_MAX_DEPTH = 80

export default function Builder() {
  const {
    currentProject,
    world,
    assets,
    projects,
    version,
    newProject,
    loadProject,
    saveProject,
    saveProjectAs,
    saveToProject,
    deleteProject,
    refreshProjects,
    updateWorld,
    updateAssets,
    applyEditorSnapshot,
    documentEpoch,
    syncPosesFromScene,
    syncPosesToRefOnly,
    exportProject,
    copyWorldToClipboard,
    importProject,
    onFileChange,
    handlePlay,
    fileInputRef,
    cameraControl,
    cameraTarget,
    cameraMode,
    cameraTargetVerticalAngle,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
    setCameraTargetVerticalAngle,
    editorFreePoseRef,
  } = useProjectContext()

  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  /** Anchor for Shift-range selection in the entity explorer (Explorer-style lists). */
  const selectionAnchorEntityIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (selectedEntityIds.length === 0) {
      selectionAnchorEntityIdRef.current = null
    } else if (selectedEntityIds.length === 1) {
      selectionAnchorEntityIdRef.current = selectedEntityIds[0]!
    }
  }, [selectedEntityIds])

  const handleSelectEntity = useCallback(
    (
      id: string | null,
      options?: { additive?: boolean; range?: boolean; orderedVisibleEntityIds?: readonly string[] },
    ) => {
      const additive = Boolean(options?.additive)
      const range = Boolean(options?.range)
      const order = options?.orderedVisibleEntityIds

      if (id === null) {
        selectionAnchorEntityIdRef.current = null
        setSelectedGroupIds([])
        setSelectedEntityIds([])
        uiLogger.click('Builder', 'Clear entity selection', {})
        return
      }

      if (range && order && order.length > 0) {
        setSelectedGroupIds([])
        setSelectedEntityIds((prev) => {
          const anchorId = selectionAnchorEntityIdRef.current ?? prev[0] ?? id
          let ai = order.indexOf(anchorId)
          const bi = order.indexOf(id)
          if (bi < 0) return [id]
          if (ai < 0) ai = bi
          const lo = Math.min(ai, bi)
          const hi = Math.max(ai, bi)
          return order.slice(lo, hi + 1) as string[]
        })
        uiLogger.click('Builder', 'Select entity', { entityId: id, range: true })
        return
      }

      if (!additive) {
        selectionAnchorEntityIdRef.current = id
        setSelectedGroupIds([])
        setSelectedEntityIds([id])
        uiLogger.click('Builder', 'Select entity', { entityId: id, additive: false })
        return
      }

      setSelectedEntityIds((prev) => {
        const idx = prev.indexOf(id)
        if (idx >= 0) return prev.filter((x) => x !== id)
        return [...prev, id]
      })
      uiLogger.click('Builder', 'Select entity', { entityId: id, additive: true })
    },
    [],
  )
  const [gizmoMode, setGizmoMode] = useState<BuilderGizmoMode>('translate')
  const [textureBrushRgb, setTextureBrushRgb] = useState<Vec3>(() => [...DEFAULT_TEXTURE_BRUSH_RGB])
  const [textureBrushAlpha, setTextureBrushAlpha] = useState(1)
  const [textureBrushRadiusPx, setTextureBrushRadiusPx] = useState(TEXTURE_PAINT_RADIUS_PX)
  const [editNavigationMode, setEditNavigationMode] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [performanceBoosterOpen, setPerformanceBoosterOpen] = useState(false)
  const [transformerDocsOpen, setTransformerDocsOpen] = useState(false)
  const [perfPickMode, setPerfPickMode] = useState<'mesh' | 'texture' | null>(null)
  const [perfMeshEntityId, setPerfMeshEntityId] = useState<string | null>(null)
  const [perfTextureEntityId, setPerfTextureEntityId] = useState<string | null>(null)
  const [soundPlaybackCommand, setSoundPlaybackCommand] = useState<
    { action: 'play' | 'stop'; nonce: number } | null
  >(null)
  const sceneViewRef = useRef<SceneViewHandle>(null)
  /** In-memory entity clipboard (Cmd/Ctrl+C); paste with Cmd/Ctrl+V in front of camera. */
  const clipboardRef = useRef<{ entities: Entity[] } | null>(null)
  const getScenePosesRef = useRef<() => LivePosesMap | null>(() => null)
  getScenePosesRef.current = () => sceneViewRef.current?.getAllPoses() ?? null
  const initialPosesRef = useRef<Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null>(null)
  const worldAssetsRef = useRef({ world, assets })
  worldAssetsRef.current = { world, assets }
  const {
    pushBeforeMutation: pushHistory,
    tryUndo: tryEditorUndo,
    tryRedo: tryEditorRedo,
    clear: clearEditorHistory,
    bumpUi: bumpHistoryUi,
    editorUndoApi,
    tick: historyTick,
    canUndo: editorCanUndo,
    canRedo: editorCanRedo,
  } = useEditorHistory({ worldAssetsRef, maxDepth: EDITOR_HISTORY_MAX_DEPTH })
  useEffect(() => {
    clearEditorHistory()
    bumpHistoryUi()
  }, [documentEpoch, clearEditorHistory, bumpHistoryUi])

  const applyHistorySnapshot = useCallback(
    (snap: EditorSnapshot) => {
      initialPosesRef.current = null
      applyEditorSnapshot(snap)
      setSelectedEntityIds((ids) => ids.filter((id) => snap.world.entities.some((e) => e.id === id)))
      setSelectedGroupIds((gids) => gids.filter((gid) => (snap.world.groups ?? []).some((g) => g.id === gid)))
      const nextCameraTarget =
        cameraTarget && snap.world.entities.some((e) => e.id === cameraTarget)
          ? cameraTarget
          : (snap.world.entities[0]?.id ?? '')
      setCameraTarget(nextCameraTarget)
      bumpHistoryUi()
    },
    [applyEditorSnapshot, bumpHistoryUi, cameraTarget, setCameraTarget]
  )

  const {
    textureMakerEntityId,
    textureMakerLayerId,
    textureMakerDraftDoc,
    textureMakerDraftAssets,
    textureMakerRevertReady,
    compositePreviewUrl,
    textureMakerDoc,
    textureMakerHistoryTick,
    canUndoTextureMaker,
    canRedoTextureMaker,
    textureBrushDisabled,
    activateTextureStudioForEntity,
    getPaintTargetAssetId,
    prepareWorldPaintStroke,
    handleClose: handleTextureMakerClose,
    handleUndo,
    handleRedo,
    handleTexturePaintStrokeEnd,
    handleTextureMakerSelectLayer,
    handleTextureMakerPatchLayer,
    handleTextureMakerResizeDocument,
    handleTextureMakerReorderLayer,
    handleTextureMakerRemoveLayer,
    handleTextureMakerAddEmptyLayer,
    handleTextureMakerImportLayer,
    handleTextureMakerRevertToOriginal,
    handleTextureMakerApply,
    handleTextureMakerMergeDown,
    handleTextureMakerStudioPaintStrokeEnd,
    pushTextureMakerBeforeEdit,
  } = useTextureMakerSession({
    world,
    assets,
    worldAssetsRef,
    sceneViewRef,
    selectedEntityIds,
    documentEpoch,
    pushHistory,
    tryEditorUndo,
    tryEditorRedo,
    applyHistorySnapshot,
    updateWorld,
    updateAssets,
    maxDepth: EDITOR_HISTORY_MAX_DEPTH,
  })

  /** Snapshot live registry poses so the next scene rebuild (entity add/remove/clone, etc.) does not reset physics-driven positions. */
  const captureScenePosesForNextRebuild = useCallback(() => {
    initialPosesRef.current = sceneViewRef.current?.getAllPoses() ?? null
  }, [])

  const {
    builderColumnRef,
    fsSidebarsHitTestRef,
    leftDrawerOpen,
    setLeftDrawerOpen,
    rightDrawerOpen,
    setRightDrawerOpen,
    bumpFsChrome,
    handleSceneFullscreenChange,
    builderChromeIdleHidden,
    fsChromeControlVisible,
    collapseSideDrawers,
  } = useBuilderFullscreenChrome()
  const [showGameHud, setShowGameHud] = useLocalStorageState('builderShowGameHud', false)
  const [rightPanelDocked, setRightPanelDocked] = useLocalStorageState('rightSidebarDocked', false)

  const sceneCameraConfig = useMemo(
    () => ({
      ...world.world.camera,
      control: cameraControl,
      target: cameraTarget,
      mode: cameraMode,
      targetVerticalAngle: cameraTargetVerticalAngle,
    }),
    [world.world.camera, cameraControl, cameraTarget, cameraMode, cameraTargetVerticalAngle]
  )

  // Forwarding refs so group shortcuts can fire handlers that are declared later in this file.
  const groupShortcutHandlersRef = useRef<{
    onGroup: () => void
    onUngroup: () => void
  }>({ onGroup: () => {}, onUngroup: () => {} })

  const clipboardShortcutHandlersRef = useRef<{
    onCopy: () => void
    onPaste: () => void
  }>({ onCopy: () => {}, onPaste: () => {} })

  const fileShortcutHandlersRef = useRef<{
    onSave: () => void
    onSaveAs: () => void
    onNew: () => void
  }>({ onSave: () => {}, onSaveAs: () => {}, onNew: () => {} })

  useBuilderKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onClearSelection: useCallback(() => {
      selectionAnchorEntityIdRef.current = null
      setSelectedEntityIds([])
      setSelectedGroupIds([])
    }, []),
    onToggleEditNavigationMode: useCallback(() => {
      setEditNavigationMode((prev) => {
        const next = !prev
        uiLogger.change('Builder', 'Toggle edit navigation mode', { enabled: next })
        return next
      })
    }, []),
    onCycleActiveAvatar: useCallback(() => sceneViewRef.current?.cycleActiveAvatar() ?? false, []),
    onChangeCameraMode: setCameraMode,
    onGroupSelection: useCallback(() => groupShortcutHandlersRef.current.onGroup(), []),
    onUngroupSelection: useCallback(() => groupShortcutHandlersRef.current.onUngroup(), []),
    onCopy: useCallback(() => clipboardShortcutHandlersRef.current.onCopy(), []),
    onPaste: useCallback(() => clipboardShortcutHandlersRef.current.onPaste(), []),
    onSave: useCallback(() => fileShortcutHandlersRef.current.onSave(), []),
    onSaveAs: useCallback(() => fileShortcutHandlersRef.current.onSaveAs(), []),
    onNew: useCallback(() => fileShortcutHandlersRef.current.onNew(), []),
    onPlay: handlePlay,
  })

  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      pushHistory()
      const newEntity = createDefaultEntity(shapeType)
      uiLogger.select('Builder', 'Add entity', { shapeType, entityId: newEntity.id })
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, newEntity],
      }))
      setSelectedEntityIds([newEntity.id])
    },
    [updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleBulkAddEntities = useCallback(
    (params: BulkEntityParams) => {
      pushHistory()
      const newEntities = createBulkEntities(params)
      uiLogger.select('Builder', 'Bulk add entities', { 
        count: params.count, 
        shape: params.shape,
        bodyType: params.bodyType,
      })
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, ...newEntities],
      }))
      // Select the first created entity
      if (newEntities.length > 0) {
        setSelectedEntityIds([newEntities[0]!.id])
      }
    },
    [updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleDeleteEntities = useCallback(
    (entityIds: string[]) => {
      if (entityIds.length === 0) return
      const idSet = new Set(entityIds)
      const locked = entityIds.filter((id) => world.entities.find((e) => e.id === id)?.locked)
      if (locked.length > 0) {
        alert('Cannot delete: one or more selected entities are locked. Unlock them first.')
        return
      }
      pushHistory()
      captureScenePosesForNextRebuild()
      const newEntities = world.entities.filter((e) => !idSet.has(e.id))
      updateWorld((prev) => {
        const nextWorld = { ...prev, entities: newEntities }
        return pruneGroupMembers(nextWorld, idSet)
      })
      setSelectedEntityIds((sel) => sel.filter((id) => !idSet.has(id)))
      if (cameraTarget && idSet.has(cameraTarget)) {
        setCameraTarget(newEntities[0]?.id ?? '')
      }
      uiLogger.delete('Builder', 'Delete entities', { entityIds, count: entityIds.length })
    },
    [world.entities, cameraTarget, updateWorld, setCameraTarget, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleGizmoModeChange = useCallback((mode: BuilderGizmoMode) => {
    setGizmoMode(mode)
    uiLogger.change('Builder', 'Gizmo mode', { mode })
  }, [])

  const handleEntityPoseCommit = useCallback(
    (commits: BuilderPoseCommitEntry[]) => {
      if (commits.length === 0) return
      pushHistory()
      for (const { entityId, pose } of commits) {
        sceneViewRef.current?.updateEntityPose(entityId, {
          position: pose.position,
          rotation: pose.rotation,
          scale: pose.scale,
        })
      }
      const byId = new Map(commits.map((c) => [c.entityId, c.pose] as const))
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => {
          const pose = byId.get(e.id)
          if (!pose) return e
          return {
            ...e,
            position: pose.position,
            rotation: pose.rotation,
            scale: pose.scale,
            ...(pose.shape !== undefined ? { shape: pose.shape } : {}),
            ...(pose.modelScale !== undefined ? { modelScale: pose.modelScale } : {}),
          }
        }),
      }))
      uiLogger.change('Builder', 'Gizmo pose commit', { count: commits.length, entityIds: commits.map((c) => c.entityId) })
    },
    [updateWorld, pushHistory]
  )

  const handleNew = useCallback(() => {
    if (currentProject.isDirty && !confirm('Discard unsaved changes?')) return
    newProject()
  }, [currentProject.isDirty, newProject])

  const handleOpen = useCallback(
    (id: string) => {
      if (currentProject.isDirty && !confirm('Discard unsaved changes?')) return
      loadProject(id)
    },
    [currentProject.isDirty, loadProject]
  )

  const handleReload = useCallback(() => {
    if (!currentProject.id) return
    if (currentProject.isDirty && !confirm('Discard unsaved changes and reload from storage?')) return
    loadProject(currentProject.id)
  }, [currentProject.id, currentProject.isDirty, loadProject])

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
    [world.entities]
  )

  const handleCloneEntity = useCallback(
    (entityId: string) => {
      pushHistory()
      const source = world.entities.find((e) => e.id === entityId)
      if (!source) return
      const pose = getCurrentPose(entityId)
      const cloned = cloneEntityFrom(source, pose)
      uiLogger.click('Builder', 'Clone entity', { sourceId: entityId, newId: cloned.id })
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, cloned],
      }))
      setSelectedEntityIds([cloned.id])
    },
    [world.entities, getCurrentPose, updateWorld, captureScenePosesForNextRebuild, pushHistory]
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

    pushHistory()
    captureScenePosesForNextRebuild()

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

    updateWorld((prev) => ({
      ...prev,
      entities: [...prev.entities, ...newEntities],
    }))
    setSelectedEntityIds(newIds)
    selectionAnchorEntityIdRef.current = newIds[0] ?? null
    uiLogger.click('Builder', 'Paste entities', { count: newEntities.length, entityIds: newIds })
  }, [captureScenePosesForNextRebuild, pushHistory, updateWorld])

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
    []
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
    [world.entities],
  )

  const handleEntityPhysicsChange = useCallback((ids: string[], patch: Partial<Entity>) => {
    for (const id of ids) {
      sceneViewRef.current?.updateEntityPhysics(id, patch)
    }
    const idSet = new Set(ids)
    updateWorld((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
    }))
  }, [updateWorld])

  const handleEntityMaterialChange = useCallback((ids: string[], patch: Partial<Entity>) => {
    for (const id of ids) {
      const base = world.entities.find((e) => e.id === id)
      if (base) void sceneViewRef.current?.updateEntityMaterial(id, { ...base, ...patch })
    }
    const idSet = new Set(ids)
    updateWorld((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
    }))
  }, [world.entities, updateWorld])

  const handleEntityShapeChange = useCallback(
    (ids: string[], patch: Partial<Entity>) => {
      let needRebuild = false
      for (const id of ids) {
        const updatedEntity = { ...world.entities.find((e) => e.id === id)!, ...patch }
        const applied = sceneViewRef.current?.updateEntityShape(id, updatedEntity) ?? false
        if (!applied) needRebuild = true
      }
      const idSet = new Set(ids)
      if (needRebuild) captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
      }))
    },
    [world.entities, updateWorld, captureScenePosesForNextRebuild]
  )

  const handleEntityModelTransformChange = useCallback(
    (ids: string[], patch: { modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean }) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityModelTransform(id, patch)
      }
      const idSet = new Set(ids)
      updateWorld((prev) => ({
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
    [updateWorld]
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
    []
  )

  const handleRefreshFromPhysics = useCallback(
    (entityIds: string[]) => {
      const m = new Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>()
      for (const id of entityIds) {
        m.set(id, getCurrentPose(id))
      }
      syncPosesFromScene(m)
    },
    [getCurrentPose, syncPosesFromScene]
  )

  const handleWorldChange = useCallback((newWorld: typeof world) => {
    captureScenePosesForNextRebuild()
    updateWorld(() => newWorld)
  }, [updateWorld, captureScenePosesForNextRebuild])

  // ----- Explorer groups (Phase A: organizational only; no scene rebuild) -----

  const handleSelectGroup = useCallback(
    (groupId: string, options?: { additive?: boolean }) => {
      const additive = Boolean(options?.additive)
      const expanded = expandGroupSelection(world, [groupId])
      uiLogger.click('Builder', 'Select group', { groupId, entityCount: expanded.length, additive })
      if (additive) {
        setSelectedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]))
        setSelectedEntityIds((prev) => {
          const set = new Set(prev)
          for (const id of expanded) set.add(id)
          return Array.from(set)
        })
      } else {
        selectionAnchorEntityIdRef.current = expanded[0] ?? null
        setSelectedGroupIds([groupId])
        setSelectedEntityIds(expanded)
      }
    },
    [world],
  )

  const handleCreateGroupFromSelection = useCallback(() => {
    const ids = [...selectedEntityIds, ...selectedGroupIds]
    if (ids.length < 2) return
    pushHistory()
    let createdGroupId: string | null = null
    updateWorld((prev) => {
      const { world: nextWorld, group } = createGroupFromSelection(prev, ids)
      if (!group) return prev
      createdGroupId = group.id
      return nextWorld
    })
    if (createdGroupId) {
      uiLogger.click('Builder', 'Create group', { groupId: createdGroupId, members: ids })
      setSelectedGroupIds([createdGroupId])
    }
  }, [selectedEntityIds, selectedGroupIds, updateWorld, pushHistory])

  const handleUngroup = useCallback(
    (groupId: string) => {
      pushHistory()
      updateWorld((prev) => dissolveGroup(prev, groupId))
      setSelectedGroupIds((prev) => prev.filter((id) => id !== groupId))
      uiLogger.click('Builder', 'Ungroup', { groupId })
    },
    [updateWorld, pushHistory],
  )

  const handleAddSelectedToGroup = useCallback(
    (groupId: string) => {
      if (selectedEntityIds.length === 0) return
      pushHistory()
      updateWorld((prev) => addToGroup(prev, groupId, selectedEntityIds))
      uiLogger.click('Builder', 'Add to group', { groupId, entityIds: selectedEntityIds })
    },
    [selectedEntityIds, updateWorld, pushHistory],
  )

  const handleRemoveSelectedFromGroup = useCallback(() => {
    if (selectedEntityIds.length === 0) return
    pushHistory()
    updateWorld((prev) => {
      let nextWorld = prev
      for (const groupId of getGroups(prev).map((g) => g.id)) {
        const inThisGroup = selectedEntityIds.filter((eid) => {
          const parent = findGroupContaining(nextWorld, eid)
          return parent?.id === groupId
        })
        if (inThisGroup.length > 0) {
          nextWorld = removeFromGroup(nextWorld, groupId, inThisGroup)
        }
      }
      return nextWorld
    })
    uiLogger.click('Builder', 'Remove from group', { entityIds: selectedEntityIds })
  }, [selectedEntityIds, updateWorld, pushHistory])

  const handleToggleGroupCollapsed = useCallback(
    (groupId: string, collapsed: boolean) => {
      updateWorld((prev) => setGroupCollapsed(prev, groupId, collapsed))
    },
    [updateWorld],
  )

  const handleRenameGroup = useCallback(
    (groupId: string, name: string) => {
      pushHistory()
      updateWorld((prev) => renameGroup(prev, groupId, name))
      uiLogger.change('Builder', 'Rename group', { groupId, name })
    },
    [updateWorld, pushHistory],
  )

  // Cmd/Ctrl+G and Cmd/Ctrl+Shift+G: group / ungroup. Cmd+Shift+G ungroups when a single
  // group is selected; Cmd+G groups the current selection if it has at least 2 members.
  groupShortcutHandlersRef.current = {
    onGroup: handleCreateGroupFromSelection,
    onUngroup: () => {
      if (selectedEntityIds.length === 0 && selectedGroupIds.length === 1) {
        handleUngroup(selectedGroupIds[0]!)
      }
    },
  }

  const handleEntityTransformersChange = useCallback(
    (entityIds: string[], transformers: TransformerConfig[]) => {
      pushHistory()
      /** Must write configs into `world.transformers` + `entity.transformers` ID arrays (Phase 7 registry); never embed configs on entities. */
      let nextWorld = world
      for (const id of entityIds) {
        nextWorld = commitTransformerConfigsToWorld(nextWorld, id, transformers)
      }
      updateWorld(() => nextWorld)
      for (const id of entityIds) {
        sceneViewRef.current?.syncEntityTransformers(id, transformers)
      }
    },
    [world, updateWorld, pushHistory]
  )

  const handleAssetsChange = useCallback((newAssets: typeof assets) => {
    updateAssets(() => newAssets)
  }, [updateAssets])

  // Warn before leaving if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (currentProject.isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [currentProject.isDirty])

  const syncPosesThen = useCallback(
    async (fn: () => Promise<void>) => {
      const allPoses = sceneViewRef.current?.getAllPoses()
      if (allPoses) {
        syncPosesToRefOnly(allPoses)
        await fn()
        syncPosesFromScene(allPoses)
      } else {
        await fn()
      }
    },
    [syncPosesFromScene, syncPosesToRefOnly]
  )

  const handleSave = useCallback(async () => {
    if (!currentProject.id) {
      setShowSaveDialog(true)
      return
    }
    await syncPosesThen(saveProject)
  }, [currentProject.id, syncPosesThen, saveProject])

  const handleSaveAs = useCallback(() => {
    setShowSaveDialog(true)
  }, [])

  useEffect(() => {
    fileShortcutHandlersRef.current.onSave = handleSave
    fileShortcutHandlersRef.current.onSaveAs = handleSaveAs
    fileShortcutHandlersRef.current.onNew = handleNew
  }, [handleSave, handleSaveAs, handleNew])

  const handleSaveDialogSaveNew = useCallback(
    async (name: string) => {
      await syncPosesThen(() => saveProjectAs(name))
      setShowSaveDialog(false)
    },
    [syncPosesThen, saveProjectAs]
  )

  const handleSaveDialogOverwrite = useCallback(
    async (id: string) => {
      await syncPosesThen(() => saveToProject(id))
      setShowSaveDialog(false)
    },
    [syncPosesThen, saveToProject]
  )

  const saveDialogDefaultName =
    currentProject.name !== 'Untitled' ? currentProject.name : `World ${projects.length + 1}`

  const handleResetCamera = useCallback(() => {
    sceneViewRef.current?.resetCamera()
    updateWorld((prev) => {
      const prevCam = prev.world.camera
      if (!prevCam) return prev
      const { editorFreePose: _removed, ...rest } = prevCam
      return {
        ...prev,
        world: { ...prev.world, camera: rest },
      }
    })
    uiLogger.click('Builder', 'Reset camera to default position')
  }, [updateWorld])

  const handleApplyDebugForce = useCallback(
    (force: Vec3) => {
      if (selectedEntityIds.length === 0) {
        alert('Bitte wähle zuerst ein oder mehrere Entities aus, um eine Force anzuwenden.')
        return
      }
      const nonDynamic: string[] = []
      for (const id of selectedEntityIds) {
        const entity = world.entities.find((e) => e.id === id)
        if (!entity) continue
        if (entity.bodyType !== 'dynamic') {
          nonDynamic.push(entity.name ?? id)
          continue
        }
        sceneViewRef.current?.applyDebugForce(id, force, 1.0)
      }
      if (nonDynamic.length > 0 && nonDynamic.length === selectedEntityIds.length) {
        alert(`Kein dynamic Entity in der Auswahl. Nicht-dynamic: ${nonDynamic.join(', ')}`)
        return
      }
      if (nonDynamic.length > 0) {
        alert(`Force auf dynamic Entities angewendet. Übersprungen (nicht dynamic): ${nonDynamic.join(', ')}`)
      }
      uiLogger.click('Builder', 'Apply debug force', {
        entityIds: selectedEntityIds,
        force,
        duration: 1.0,
      })
    },
    [selectedEntityIds, world.entities]
  )

  const handleApplyMeshSimplification = useCallback(
    async (entityId: string, config: TrimeshSimplificationConfig) => {
      const safe = clampTrimeshSimplificationConfig({ ...config, enabled: true })
      pushHistory()
      captureScenePosesForNextRebuild()
      const nextWorld = applyMeshSimplificationToEntityInWorld(world, entityId, safe)
      updateWorld(() => nextWorld)
      try {
        const result = await persistSimplifiedMeshAssetFromWorld(nextWorld, assets, entityId)
        if (!result.ok) {
          if (result.reason === 'bake-unchanged') {
            console.warn(
              '[PerformanceBooster] Bake produced unchanged geometry; simplification config kept on entity'
            )
          }
          return
        }
        await updateAssets(() => result.assets)
        updateWorld(() => result.world)
      } catch (err) {
        console.error('[PerformanceBooster] Failed to persist simplified mesh', err)
        alert('Failed to bake simplified mesh to assets. Simplification settings remain.')
      }
    },
    [world, assets, updateWorld, updateAssets, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleApplyTextureDownscale = useCallback(
    async (entityId: string, maxEdgePx: number) => {
      const entity = world.entities.find((e) => e.id === entityId)
      const mapId = entity?.material?.map
      if (!mapId) throw new Error('No texture on entity')
      const blob = assets.get(mapId)
      if (!blob) throw new Error('Texture asset missing')
      const newBlob = await downscaleImageBlob(blob, maxEdgePx)
      pushHistory()
      await updateAssets((prev) => {
        const next = new Map(prev)
        next.set(mapId, newBlob)
        return next
      })
    },
    [world.entities, assets, updateAssets, pushHistory]
  )

  const handleTextureBrushRadiusPxChange = useCallback((px: number) => {
    const n = Math.round(px)
    if (!Number.isFinite(n)) return
    setTextureBrushRadiusPx(Math.min(TEXTURE_BRUSH_RADIUS_MAX, Math.max(TEXTURE_BRUSH_RADIUS_MIN, n)))
  }, [])

  const handleTextureBrushAlphaChange = useCallback((a: number) => {
    if (!Number.isFinite(a)) return
    setTextureBrushAlpha(Math.min(1, Math.max(0, a)))
  }, [])

  useEffect(() => {
    if (gizmoMode === 'paint' && textureBrushDisabled) {
      setGizmoMode('translate')
    }
  }, [gizmoMode, textureBrushDisabled])

  void historyTick
  void textureMakerHistoryTick
  const canUndoHistory = canUndoTextureMaker || editorCanUndo
  const canRedoHistory = canRedoTextureMaker || editorCanRedo

  const onOpenTextureStudioFromToolbar =
    selectedEntityIds.length === 1
      ? () => {
          const id = selectedEntityIds[0]!
          void activateTextureStudioForEntity(id)
        }
      : undefined

  return (
    <EditorUndoProvider value={editorUndoApi}>
    <CopyProvider>
      <div ref={builderColumnRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: builderChromeIdleHidden ? 'none' : undefined }}>
        <BuilderHeader
        projects={projects}
        onLeftSidebarToggle={() => setLeftDrawerOpen((prev) => !prev)}
        currentProject={currentProject}
        gizmoMode={gizmoMode}
        onGizmoModeChange={handleGizmoModeChange}
        textureBrushDisabled={textureBrushDisabled}
        textureBrushColorHex={colorToHex(textureBrushRgb)}
        onTextureBrushColorHexChange={(hex) => setTextureBrushRgb(hexToColor(hex))}
        textureBrushAlpha={textureBrushAlpha}
        onTextureBrushAlphaChange={handleTextureBrushAlphaChange}
        textureBrushRadiusPx={textureBrushRadiusPx}
        onTextureBrushRadiusPxChange={handleTextureBrushRadiusPxChange}
        onNew={handleNew}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExport={exportProject}
        onCopyWorld={copyWorldToClipboard}
        onImport={importProject}
        onOpen={handleOpen}
        onRefresh={refreshProjects}
        onReload={handleReload}
        onDeleteProject={deleteProject}
        onPlay={handlePlay}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        onResetCamera={handleResetCamera}
        onApplyDebugForce={handleApplyDebugForce}
        canUndo={canUndoHistory}
        canRedo={canRedoHistory}
        onUndo={handleUndo}
        onRedo={handleRedo}
        editNavigationMode={editNavigationMode}
        onEditNavigationModeToggle={() => {
          setEditNavigationMode((prev) => {
            const next = !prev
            uiLogger.click('Builder', 'Toggle edit navigation mode (menu)', { enabled: next })
            return next
          })
        }}
        showGameHud={showGameHud}
        onGameHudToggle={() => {
          setShowGameHud((prev) => {
            const next = !prev
            uiLogger.click('Builder', 'Toggle game HUD (menu)', { enabled: next })
            return next
          })
        }}
        showFrameStats={world.world.showFrameStats === true}
        onFrameStatsToggle={() => {
          const next = world.world.showFrameStats !== true
          uiLogger.click('Builder', 'Toggle frame stats (menu)', { enabled: next })
          handleWorldChange({
            ...world,
            world: { ...world.world, showFrameStats: next },
          })
        }}
        onOpenPerformanceBooster={() => {
          setPerformanceBoosterOpen(true)
          uiLogger.click('Builder', 'Open Performance booster', {})
        }}
        onOpenTransformerDocs={() => {
          setTransformerDocsOpen(true)
          uiLogger.click('Builder', 'Open Transformer docs', {})
        }}
        onOpenTextureStudio={onOpenTextureStudioFromToolbar}
      />
        </div>

      {showSaveDialog && (
        <SaveDialog
          projects={projects}
          defaultName={saveDialogDefaultName}
          onSaveNew={handleSaveDialogSaveNew}
          onOverwrite={handleSaveDialogOverwrite}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}

      <PerformanceBoosterDialog
        isOpen={performanceBoosterOpen}
        onClose={() => {
          setPerformanceBoosterOpen(false)
          setPerfPickMode(null)
          setPerfMeshEntityId(null)
          setPerfTextureEntityId(null)
        }}
        world={world}
        assets={assets}
        sceneViewRef={sceneViewRef}
        sceneVersion={version}
        meshTargetEntityId={perfMeshEntityId}
        textureTargetEntityId={perfTextureEntityId}
        onMeshTargetSelected={setPerfMeshEntityId}
        onTextureTargetSelected={setPerfTextureEntityId}
        onRequestPickMesh={() => setPerfPickMode('mesh')}
        onRequestPickTexture={() => setPerfPickMode('texture')}
        onApplyMesh={handleApplyMeshSimplification}
        onApplyTexture={handleApplyTextureDownscale}
      />

      <TransformerDocs
        isOpen={transformerDocsOpen}
        onClose={() => setTransformerDocsOpen(false)}
      />

      <div
        ref={fsSidebarsHitTestRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {editNavigationMode && (
            <div
              role="status"
              aria-label="Edit-Modus aktiv"
              title="Edit-Modus: Navigation"
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 200,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: theme.status.editMode,
                boxShadow: '0 0 0 2px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
              }}
            />
          )}
          <main style={{ flex: 1, minHeight: 0, width: '100%' }}>
            <ErrorBoundary
              fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: theme.bg.errorFallback, color: theme.text.primary }}>
                  <div style={{ textAlign: 'center' }}>
                    <h2>Scene Error</h2>
                    <p>The 3D scene encountered an error. Try reloading the project.</p>
                  </div>
                </div>
              }
            >
              <SceneView
                ref={sceneViewRef}
                world={world}
                cameraConfig={sceneCameraConfig}
                assets={assets}
                version={version}
                runPhysics
                runScripts
                selectedEntityIds={selectedEntityIds}
                onSelectEntity={handleSelectEntity}
                onEntityPoseCommit={handleEntityPoseCommit}
                gizmoMode={gizmoMode}
                initialPosesRef={initialPosesRef}
                onPosesRestored={syncPosesFromScene}
                editNavigationMode={editNavigationMode}
                editorFreePoseRef={editorFreePoseRef}
                soundPlaybackCommand={soundPlaybackCommand}
                performancePick={
                  perfPickMode
                    ? {
                        mode: perfPickMode,
                        onEntityPicked: (id: string) => {
                          if (perfPickMode === 'mesh') setPerfMeshEntityId(id)
                          if (perfPickMode === 'texture') setPerfTextureEntityId(id)
                          setPerfPickMode(null)
                        },
                      }
                    : null
                }
                showGameHud={showGameHud}
                onFrameStatsClose={() => {
                  uiLogger.click('Builder', 'Close frame stats overlay', {})
                  handleWorldChange({
                    ...world,
                    world: { ...world.world, showFrameStats: false },
                  })
                }}
                onCurrentAvatarChange={(id) => {
                  if (id) setCameraTarget(id)
                }}
                onTexturePaintStrokeEnd={handleTexturePaintStrokeEnd}
                pushUndoBeforePaintStroke={() => editorUndoApi.pushBeforeEdit()}
                textureBrushRgb={textureBrushRgb}
                textureBrushAlpha={textureBrushAlpha}
                textureBrushRadiusPx={textureBrushRadiusPx}
                getPaintTargetAssetId={getPaintTargetAssetId}
                prepareWorldPaintStroke={prepareWorldPaintStroke}
                onFullscreenChange={handleSceneFullscreenChange}
                fullscreenTargetRef={builderColumnRef}
                fullscreenChromeControl={{ visible: fsChromeControlVisible, bumpActivity: bumpFsChrome }}
              />
            </ErrorBoundary>
          </main>

          {/* Left overlay + floating right panel (pointer-events: none wrapper; drawers use auto). */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 100,
              pointerEvents: 'none',
              display: builderChromeIdleHidden ? 'none' : undefined,
            }}
          >
            <EntitySidebar
              entities={world.entities}
              selectedEntityIds={selectedEntityIds}
              selectedGroupIds={selectedGroupIds}
              cameraControl={cameraControl}
              cameraTarget={cameraTarget}
              cameraMode={cameraMode}
              cameraTargetVerticalAngle={cameraTargetVerticalAngle}
              world={world}
              onSelectEntity={handleSelectEntity}
              onSelectGroup={handleSelectGroup}
              onCreateGroupFromSelection={handleCreateGroupFromSelection}
              onUngroup={handleUngroup}
              onAddSelectedToGroup={handleAddSelectedToGroup}
              onRemoveSelectedFromGroup={handleRemoveSelectedFromGroup}
              onToggleGroupCollapsed={handleToggleGroupCollapsed}
              onRenameGroup={handleRenameGroup}
              onAddEntity={handleAddEntity}
              onBulkAddEntities={handleBulkAddEntities}
              onCameraControlChange={setCameraControl}
              onCameraTargetChange={setCameraTarget}
              onCameraModeChange={setCameraMode}
              onCameraTargetVerticalAngleChange={setCameraTargetVerticalAngle}
              onWorldChange={handleWorldChange}
              onSoundPlaybackCommand={(action) =>
                setSoundPlaybackCommand({ action, nonce: Date.now() + Math.random() })
              }
              getAvatarFocusSnapshot={() => sceneViewRef.current?.getAvatarFocusSnapshot() ?? null}
              isOpen={leftDrawerOpen}
              onToggle={() => setLeftDrawerOpen(!leftDrawerOpen)}
            />

            {!rightPanelDocked && (
              <LivePosesPoll getPosesRef={getScenePosesRef} intervalMs={100}>
                {(livePoses) => (
                  <PropertySidebar
                    world={world}
                    assets={assets}
                    selectedEntityIds={selectedEntityIds}
                    onWorldChange={handleWorldChange}
                    onAssetsChange={handleAssetsChange}
                    onDeleteEntities={handleDeleteEntities}
                    onCloneEntity={handleCloneEntity}
                    onEntityPoseChange={handleEntityPoseChange}
                    onEntityPhysicsChange={handleEntityPhysicsChange}
                    onEntityMaterialChange={handleEntityMaterialChange}
                    onEntityShapeChange={handleEntityShapeChange}
                    onEntityModelTransformChange={handleEntityModelTransformChange}
                    onEntityTransformersChange={handleEntityTransformersChange}
                    onRefreshFromPhysics={handleRefreshFromPhysics}
                    onResetPoseToSavedWorld={handleResetPoseToSavedWorld}
                    livePoses={livePoses}
                    isOpen={rightDrawerOpen}
                    onToggle={() => setRightDrawerOpen(!rightDrawerOpen)}
                    dockLayout={false}
                    onDockLayoutChange={setRightPanelDocked}
                    onOpenTextureStudio={activateTextureStudioForEntity}
                    onAfterModelPresetApply={handleAfterModelPresetApply}
                    onTransformerCodePopoutOpen={collapseSideDrawers}
                    onSelectEntity={handleSelectEntity}
                  />
                )}
              </LivePosesPoll>
            )}
          </div>

          {textureMakerEntityId && textureMakerDoc ? (
            <TextureMaker
              entityId={textureMakerEntityId}
              doc={textureMakerDraftDoc ?? textureMakerDoc}
              compositePreviewUrl={compositePreviewUrl}
              selectedLayerId={textureMakerLayerId}
              onClose={handleTextureMakerClose}
              revertToOriginalAvailable={textureMakerRevertReady}
              onRevertToOriginal={handleTextureMakerRevertToOriginal}
              onApplyTextureMaker={() => void handleTextureMakerApply()}
              onSelectLayer={handleTextureMakerSelectLayer}
              onPatchLayer={handleTextureMakerPatchLayer}
              onReorderLayer={handleTextureMakerReorderLayer}
              onRemoveLayer={handleTextureMakerRemoveLayer}
              onAddEmptyLayer={handleTextureMakerAddEmptyLayer}
              onImportLayer={handleTextureMakerImportLayer}
              onMergeDown={handleTextureMakerMergeDown}
              onResizeDocument={handleTextureMakerResizeDocument}
              textureBrushRgb={textureBrushRgb}
              textureBrushAlpha={textureBrushAlpha}
              textureBrushRadiusPx={textureBrushRadiusPx}
              onTextureBrushColorHexChange={(hex) => setTextureBrushRgb(hexToColor(hex))}
              onTextureBrushAlphaChange={setTextureBrushAlpha}
              onTextureBrushRadiusPxChange={setTextureBrushRadiusPx}
              studioAssets={textureMakerDraftAssets ?? assets}
              pushUndoBeforePaintStroke={pushTextureMakerBeforeEdit}
              onStudioPaintStrokeEnd={handleTextureMakerStudioPaintStrokeEnd}
            />
          ) : null}
        </div>

        {rightPanelDocked && (
          <div
            style={{
              flexShrink: 0,
              height: '100%',
              minHeight: 0,
              zIndex: 100,
              display: builderChromeIdleHidden ? 'none' : undefined,
            }}
          >
            <LivePosesPoll getPosesRef={getScenePosesRef} intervalMs={100}>
              {(livePoses) => (
                <PropertySidebar
                  world={world}
                  assets={assets}
                  selectedEntityIds={selectedEntityIds}
                  onWorldChange={handleWorldChange}
                  onAssetsChange={handleAssetsChange}
                  onDeleteEntities={handleDeleteEntities}
                  onCloneEntity={handleCloneEntity}
                  onEntityPoseChange={handleEntityPoseChange}
                  onEntityPhysicsChange={handleEntityPhysicsChange}
                  onEntityMaterialChange={handleEntityMaterialChange}
                  onEntityShapeChange={handleEntityShapeChange}
                  onEntityModelTransformChange={handleEntityModelTransformChange}
                  onEntityTransformersChange={handleEntityTransformersChange}
                  onRefreshFromPhysics={handleRefreshFromPhysics}
                  onResetPoseToSavedWorld={handleResetPoseToSavedWorld}
                  livePoses={livePoses}
                  isOpen={rightDrawerOpen}
                  onToggle={() => setRightDrawerOpen(!rightDrawerOpen)}
                  dockLayout
                  onDockLayoutChange={setRightPanelDocked}
                  onOpenTextureStudio={activateTextureStudioForEntity}
                  onAfterModelPresetApply={handleAfterModelPresetApply}
                  onTransformerCodePopoutOpen={collapseSideDrawers}
                  onSelectEntity={handleSelectEntity}
                />
              )}
            </LivePosesPoll>
          </div>
        )}
      </div>
    </div>
    </CopyProvider>
    </EditorUndoProvider>
  )
}
