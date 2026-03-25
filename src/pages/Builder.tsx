import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import SaveDialog from '@/components/SaveDialog'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider, type EditorUndoApi } from '@/contexts/EditorUndoContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cloneEntityFrom, createDefaultEntity, createBulkEntities, type AddableShapeType, type BulkEntityParams } from '@/data/entityDefaults'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { cycleCameraMode, DEFAULT_SCALE, type Vec3, type Rotation, type Entity } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import type { TransformerConfig } from '@/types/transformer'
import type { BuilderGizmoMode, BuilderPoseCommit } from '@/editor/transformGizmoController'
import { cloneEditorSnapshot, createEditorHistory, type EditorSnapshot } from '@/editor/editorHistory'

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
  } = useProjectContext()

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [gizmoMode, setGizmoMode] = useState<BuilderGizmoMode>('translate')
  const [shadowsEnabled, setShadowsEnabled] = useState(true)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
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
      setSelectedEntityId((sel) =>
        sel && !snap.world.entities.some((e) => e.id === sel) ? null : sel
      )
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
  }, [setCameraMode, handleUndo, handleRedo])

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
      setSelectedEntityId(newEntity.id)
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
        setSelectedEntityId(newEntities[0].id)
      }
    },
    [updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleDeleteEntity = useCallback(
    (entityId: string) => {
      const entity = world.entities.find((e) => e.id === entityId)
      
      // Prevent deletion of locked entities
      if (entity?.locked) {
        alert('Cannot delete a locked entity. Unlock it first.')
        return
      }
      
      uiLogger.delete('Builder', 'Delete entity', { entityId, entityName: entity?.name })
      pushHistory()
      captureScenePosesForNextRebuild()
      const newEntities = world.entities.filter((e) => e.id !== entityId)
      updateWorld((prev) => ({ ...prev, entities: newEntities }))
      if (selectedEntityId === entityId) setSelectedEntityId(null)
      if (cameraTarget === entityId) {
        setCameraTarget(newEntities[0]?.id ?? '')
      }
    },
    [world.entities, selectedEntityId, cameraTarget, updateWorld, setCameraTarget, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleGizmoModeChange = useCallback((mode: BuilderGizmoMode) => {
    setGizmoMode(mode)
    uiLogger.change('Builder', 'Gizmo mode', { mode })
  }, [])

  const handleEntityPoseCommit = useCallback(
    (entityId: string, pose: BuilderPoseCommit) => {
      pushHistory()
      sceneViewRef.current?.updateEntityPose(entityId, {
        position: pose.position,
        rotation: pose.rotation,
        scale: pose.scale,
      })
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) =>
          e.id === entityId
            ? {
                ...e,
                position: pose.position,
                rotation: pose.rotation,
                scale: pose.scale,
                ...(pose.shape !== undefined ? { shape: pose.shape } : {}),
                ...(pose.modelScale !== undefined ? { modelScale: pose.modelScale } : {}),
              }
            : e
        ),
      }))
      uiLogger.change('Builder', 'Gizmo pose commit', { entityId })
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
      setSelectedEntityId(cloned.id)
    },
    [world.entities, getCurrentPose, updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleEntityPoseChange = useCallback(
    (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => {
      sceneViewRef.current?.updateEntityPose(id, pose)
    },
    []
  )

  const handleEntityPhysicsChange = useCallback((id: string, patch: Partial<Entity>) => {
    sceneViewRef.current?.updateEntityPhysics(id, patch)
    updateWorld((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }, [updateWorld])

  const handleEntityMaterialChange = useCallback((id: string, patch: Partial<Entity>) => {
    const updatedEntity = { ...world.entities.find((e) => e.id === id)!, ...patch }
    void sceneViewRef.current?.updateEntityMaterial(id, updatedEntity)
    updateWorld((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }, [world.entities, updateWorld])

  const handleEntityShapeChange = useCallback((id: string, patch: Partial<Entity>) => {
    const updatedEntity = { ...world.entities.find((e) => e.id === id)!, ...patch }
    const applied = sceneViewRef.current?.updateEntityShape(id, updatedEntity) ?? false
    if (applied) {
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }))
    } else {
      // Trimesh or no scene yet — fall back to full rebuild
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }))
    }
  }, [world.entities, updateWorld, captureScenePosesForNextRebuild])

  const handleEntityModelTransformChange = useCallback(
    (id: string, patch: { modelRotation?: [number, number, number]; modelScale?: [number, number, number] }) => {
      sceneViewRef.current?.updateEntityModelTransform(id, patch)
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }))
    },
    [updateWorld]
  )

  const handleRefreshFromPhysics = useCallback(
    (entityId: string) => {
      const pose = getCurrentPose(entityId)
      syncPosesFromScene(new Map([[entityId, pose]]))
    },
    [getCurrentPose, syncPosesFromScene]
  )

  const handleWorldChange = useCallback((newWorld: typeof world) => {
    captureScenePosesForNextRebuild()
    updateWorld(() => newWorld)
  }, [updateWorld, captureScenePosesForNextRebuild])

  const handleEntityTransformersChange = useCallback(
    (entityId: string, transformers: TransformerConfig[]) => {
      pushHistory()
      const nextEntities = world.entities.map((e) =>
        e.id === entityId ? { ...e, transformers } : e
      )
      const nextWorld = { ...world, entities: nextEntities }
      const keyBefore = getSceneDependencyKey(world)
      const keyAfter = getSceneDependencyKey(nextWorld)
      if (keyBefore !== keyAfter) {
        captureScenePosesForNextRebuild()
      }
      updateWorld(() => nextWorld)
      if (keyBefore === keyAfter) {
        sceneViewRef.current?.syncEntityTransformers(entityId, transformers)
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
    uiLogger.click('Builder', 'Reset camera to default position')
  }, [])

  const handleApplyDebugForce = useCallback((force: Vec3) => {
    if (!selectedEntityId) {
      alert('Bitte wähle zuerst ein Entity aus, um eine Force anzuwenden.')
      return
    }
    
    const entity = world.entities.find((e) => e.id === selectedEntityId)
    if (!entity) {
      alert(`Entity "${selectedEntityId}" nicht gefunden.`)
      return
    }
    
    if (entity.bodyType !== 'dynamic') {
      alert(`Entity "${entity.name ?? entity.id}" ist nicht dynamic. Nur dynamic Entities können Forces empfangen.`)
      return
    }
    
    sceneViewRef.current?.applyDebugForce(selectedEntityId, force, 1.0)
    uiLogger.click('Builder', 'Apply debug force', { 
      entityId: selectedEntityId, 
      force,
      duration: 1.0 
    })
  }, [selectedEntityId, world.entities])

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

      <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
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
              selectedEntityId={selectedEntityId}
              onSelectEntity={setSelectedEntityId}
              onEntityPoseCommit={handleEntityPoseCommit}
              gizmoMode={gizmoMode}
              initialPosesRef={initialPosesRef}
              onPosesRestored={syncPosesFromScene}
            />
          </ErrorBoundary>
        </main>

        {/* Sidebars overlay on top */}
        <EntitySidebar
          entities={world.entities}
          selectedEntityId={selectedEntityId}
          cameraControl={cameraControl}
          cameraTarget={cameraTarget}
          cameraMode={cameraMode}
          world={world}
          onSelectEntity={setSelectedEntityId}
          onAddEntity={handleAddEntity}
          onBulkAddEntities={handleBulkAddEntities}
          onCameraControlChange={setCameraControl}
          onCameraTargetChange={setCameraTarget}
          onCameraModeChange={setCameraMode}
          onWorldChange={handleWorldChange}
          isOpen={leftDrawerOpen}
          onToggle={() => setLeftDrawerOpen(!leftDrawerOpen)}
        />

        <PropertySidebar
          world={world}
          assets={assets}
          selectedEntityId={selectedEntityId}
          onWorldChange={handleWorldChange}
          onAssetsChange={handleAssetsChange}
          onDeleteEntity={handleDeleteEntity}
          onCloneEntity={handleCloneEntity}
          getCurrentPose={getCurrentPose}
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
