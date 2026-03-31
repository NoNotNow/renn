import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import PerformanceBoosterDialog from '@/components/PerformanceBoosterDialog'
import SaveDialog from '@/components/SaveDialog'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider, type EditorUndoApi } from '@/contexts/EditorUndoContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cloneEntityFrom, createDefaultEntity, createBulkEntities, type AddableShapeType, type BulkEntityParams } from '@/data/entityDefaults'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { cycleCameraMode, DEFAULT_SCALE, type Vec3, type Rotation, type Entity, type TrimeshSimplificationConfig } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import type { TransformerConfig } from '@/types/transformer'
import type { BuilderGizmoMode, BuilderPoseCommitEntry } from '@/editor/transformGizmoController'
import { cloneEditorSnapshot, createEditorHistory, type EditorSnapshot } from '@/editor/editorHistory'
import { downscaleImageBlob } from '@/utils/textureDownscale'
import { clampTrimeshSimplificationConfig } from '@/scripts/migrateWorld'
import {
  applyMeshSimplificationToEntityInWorld,
  persistSimplifiedMeshAssetFromWorld,
} from '@/utils/bakeSimplifiedModelAsset'

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
    setCameraControl,
    setCameraTarget,
    setCameraMode,
    editorFreePoseRef,
  } = useProjectContext()

  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])

  const handleSelectEntity = useCallback((id: string | null, options?: { additive?: boolean }) => {
    const additive = Boolean(options?.additive)
    setSelectedEntityIds((prev) => {
      if (id === null) return []
      if (!additive) return [id]
      const idx = prev.indexOf(id)
      if (idx >= 0) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
    if (id !== null) {
      uiLogger.click('Builder', 'Select entity', { entityId: id, additive })
    } else {
      uiLogger.click('Builder', 'Clear entity selection', {})
    }
  }, [])
  const [gizmoMode, setGizmoMode] = useState<BuilderGizmoMode>('translate')
  const [shadowsEnabled, setShadowsEnabled] = useState(true)
  const [editNavigationMode, setEditNavigationMode] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [performanceBoosterOpen, setPerformanceBoosterOpen] = useState(false)
  const [perfPickMode, setPerfPickMode] = useState<'mesh' | 'texture' | null>(null)
  const [perfMeshEntityId, setPerfMeshEntityId] = useState<string | null>(null)
  const [perfTextureEntityId, setPerfTextureEntityId] = useState<string | null>(null)
  const [soundPlaybackCommand, setSoundPlaybackCommand] = useState<
    { action: 'play' | 'stop'; nonce: number } | null
  >(null)
  const [livePoses, setLivePoses] = useState<
    Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }> | null
  >(null)
  const sceneViewRef = useRef<SceneViewHandle>(null)
  const initialPosesRef = useRef<Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null>(null)
  const historyRef = useRef(createEditorHistory(EDITOR_HISTORY_MAX_DEPTH))
  const gestureSnapshotRef = useRef<EditorSnapshot | null>(null)
  const worldAssetsRef = useRef({ world, assets })
  worldAssetsRef.current = { world, assets }
  const [historyTick, setHistoryUi] = useState(0)
  const bumpHistoryUi = useCallback(() => setHistoryUi((n) => n + 1), [])

  useEffect(() => {
    historyRef.current.clear()
    bumpHistoryUi()
  }, [documentEpoch, bumpHistoryUi])

  const pushHistory = useCallback(() => {
    const { world: w, assets: a } = worldAssetsRef.current
    historyRef.current.pushBeforeMutation(w, a)
    bumpHistoryUi()
  }, [bumpHistoryUi])

  const applyHistorySnapshot = useCallback(
    (snap: EditorSnapshot) => {
      initialPosesRef.current = null
      applyEditorSnapshot(snap)
      setSelectedEntityIds((ids) => ids.filter((id) => snap.world.entities.some((e) => e.id === id)))
      const nextCameraTarget =
        cameraTarget && snap.world.entities.some((e) => e.id === cameraTarget)
          ? cameraTarget
          : (snap.world.entities[0]?.id ?? '')
      setCameraTarget(nextCameraTarget)
      bumpHistoryUi()
    },
    [applyEditorSnapshot, bumpHistoryUi, cameraTarget, setCameraTarget]
  )

  const handleUndo = useCallback(() => {
    const { world: w, assets: a } = worldAssetsRef.current
    const prev = historyRef.current.undo(w, a)
    if (prev) applyHistorySnapshot(prev)
  }, [applyHistorySnapshot])

  const handleRedo = useCallback(() => {
    const { world: w, assets: a } = worldAssetsRef.current
    const next = historyRef.current.redo(w, a)
    if (next) applyHistorySnapshot(next)
  }, [applyHistorySnapshot])

  const editorUndoApi = useMemo<EditorUndoApi>(
    () => ({
      pushBeforeEdit: () => {
        pushHistory()
      },
      notifyScrubStart: () => {
        const { world: w, assets: a } = worldAssetsRef.current
        gestureSnapshotRef.current = cloneEditorSnapshot(w, a)
      },
      notifyScrubEnd: (hadScrub: boolean) => {
        if (hadScrub && gestureSnapshotRef.current) {
          historyRef.current.commitCoalescedGesture(gestureSnapshotRef.current)
          bumpHistoryUi()
        }
        gestureSnapshotRef.current = null
      },
    }),
    [pushHistory, bumpHistoryUi]
  )

  /** Snapshot live registry poses so the next scene rebuild (entity add/remove/clone, etc.) does not reset physics-driven positions. */
  const captureScenePosesForNextRebuild = useCallback(() => {
    initialPosesRef.current = sceneViewRef.current?.getAllPoses() ?? null
  }, [])

  // Drawer states with localStorage persistence
  const [leftDrawerOpen, setLeftDrawerOpen] = useLocalStorageState('leftDrawerOpen', true)
  const [rightDrawerOpen, setRightDrawerOpen] = useLocalStorageState('rightDrawerOpen', true)
  const [showGameHud, setShowGameHud] = useLocalStorageState('builderShowGameHud', false)

  const sceneCameraConfig = useMemo(
    () => ({
      ...world.world.camera,
      control: cameraControl,
      target: cameraTarget,
      mode: cameraMode,
    }),
    [world.world.camera, cameraControl, cameraTarget, cameraMode]
  )

  useEffect(() => {
    const isEditableElement = (): boolean => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z') {
        if (isEditableElement()) return
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if (mod && e.key === 'y') {
        if (isEditableElement()) return
        e.preventDefault()
        handleRedo()
        return
      }
      if (e.key === 'Escape') {
        if (isEditableElement()) return
        e.preventDefault()
        setSelectedEntityIds([])
        return
      }
      if (mod && !e.shiftKey && e.code === 'KeyE') {
        if (isEditableElement()) return
        e.preventDefault()
        setEditNavigationMode((prev) => {
          const next = !prev
          uiLogger.change('Builder', 'Toggle edit navigation mode', { enabled: next })
          return next
        })
        return
      }
      if (e.code !== 'Digit0' && e.code !== 'Numpad0') return
      if (isEditableElement()) return
      e.preventDefault()
      setCameraMode((prev) => {
        const next = cycleCameraMode(prev)
        uiLogger.change('Builder', 'Change camera mode', { mode: next })
        return next
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setCameraMode, handleUndo, handleRedo, setSelectedEntityIds])

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
      updateWorld((prev) => ({ ...prev, entities: newEntities }))
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

  const handleEntityPoseChange = useCallback(
    (ids: string[], pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityPose(id, pose)
      }
    },
    []
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
    (ids: string[], patch: { modelRotation?: [number, number, number]; modelScale?: [number, number, number] }) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityModelTransform(id, patch)
      }
      const idSet = new Set(ids)
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
      }))
    },
    [updateWorld]
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

  const handleEntityTransformersChange = useCallback(
    (entityIds: string[], transformers: TransformerConfig[]) => {
      pushHistory()
      const idSet = new Set(entityIds)
      const nextEntities = world.entities.map((e) =>
        idSet.has(e.id) ? { ...e, transformers } : e
      )
      const nextWorld = { ...world, entities: nextEntities }
      const keyBefore = getSceneDependencyKey(world)
      const keyAfter = getSceneDependencyKey(nextWorld)
      if (keyBefore !== keyAfter) {
        captureScenePosesForNextRebuild()
      }
      updateWorld(() => nextWorld)
      if (keyBefore === keyAfter) {
        for (const id of entityIds) {
          sceneViewRef.current?.syncEntityTransformers(id, transformers)
        }
      }
    },
    [world, updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleAssetsChange = useCallback((newAssets: typeof assets) => {
    updateAssets(() => newAssets)
  }, [updateAssets])

  // Poll scene poses so the inspector stays in sync with physics/scripts (display only; never calls onWorldChange)
  useEffect(() => {
    const interval = setInterval(() => {
      const poses = sceneViewRef.current?.getAllPoses() ?? null
      if (poses && poses.size > 0) {
        setLivePoses(poses)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [])

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

  void historyTick
  const canUndoHistory = historyRef.current.canUndo()
  const canRedoHistory = historyRef.current.canRedo()

  return (
    <EditorUndoProvider value={editorUndoApi}>
    <CopyProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <BuilderHeader
        projects={projects}
        onLeftSidebarToggle={() => setLeftDrawerOpen((prev) => !prev)}
        currentProject={currentProject}
        gizmoMode={gizmoMode}
        onGizmoModeChange={handleGizmoModeChange}
        shadowsEnabled={shadowsEnabled}
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
        onShadowsChange={setShadowsEnabled}
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
        onOpenPerformanceBooster={() => {
          setPerformanceBoosterOpen(true)
          uiLogger.click('Builder', 'Open Performance booster', {})
        }}
      />

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

      <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
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
              background: '#e11d48',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Canvas takes full width */}
        <main style={{ width: '100%', height: '100%' }}>
          <ErrorBoundary
            fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#171a22', color: '#e6e9f2' }}>
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
              shadowsEnabled={shadowsEnabled}
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
              onCurrentAvatarChange={(id) => {
                if (id) setCameraTarget(id)
              }}
            />
          </ErrorBoundary>
        </main>

        {/* Sidebars overlay on top */}
        <EntitySidebar
          entities={world.entities}
          selectedEntityIds={selectedEntityIds}
          cameraControl={cameraControl}
          cameraTarget={cameraTarget}
          cameraMode={cameraMode}
          world={world}
          onSelectEntity={handleSelectEntity}
          onAddEntity={handleAddEntity}
          onBulkAddEntities={handleBulkAddEntities}
          onCameraControlChange={setCameraControl}
          onCameraTargetChange={setCameraTarget}
          onCameraModeChange={setCameraMode}
          onWorldChange={handleWorldChange}
          onSoundPlaybackCommand={(action) =>
            setSoundPlaybackCommand({ action, nonce: Date.now() + Math.random() })
          }
          isOpen={leftDrawerOpen}
          onToggle={() => setLeftDrawerOpen(!leftDrawerOpen)}
        />

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
          livePoses={livePoses}
          isOpen={rightDrawerOpen}
          onToggle={() => setRightDrawerOpen(!rightDrawerOpen)}
        />
      </div>
    </div>
    </CopyProvider>
    </EditorUndoProvider>
  )
}
