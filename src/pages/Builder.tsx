import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import SaveDialog from '@/components/SaveDialog'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import { CopyProvider } from '@/contexts/CopyContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cloneEntityFrom, createDefaultEntity, createBulkEntities, type AddableShapeType, type BulkEntityParams } from '@/data/entityDefaults'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { cycleCameraMode, DEFAULT_SCALE, type Vec3, type Rotation, type Entity } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import type { TransformerConfig } from '@/types/transformer'
import type { BuilderGizmoMode, BuilderPoseCommit } from '@/editor/transformGizmoController'

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
  }, [setCameraMode])

  useEffect(() => {
    const isEditableElement = (): boolean => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase()
      if (k !== 'g' && k !== 'r' && k !== 's') return
      if (isEditableElement()) return
      e.preventDefault()
      if (k === 'g') {
        setGizmoMode('translate')
        uiLogger.change('Builder', 'Gizmo mode translate', {})
      } else if (k === 'r') {
        setGizmoMode('rotate')
        uiLogger.change('Builder', 'Gizmo mode rotate', {})
      } else {
        setGizmoMode('scale')
        uiLogger.change('Builder', 'Gizmo mode scale', {})
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      const newEntity = createDefaultEntity(shapeType)
      uiLogger.select('Builder', 'Add entity', { shapeType, entityId: newEntity.id })
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, newEntity],
      }))
      setSelectedEntityId(newEntity.id)
    },
    [updateWorld, captureScenePosesForNextRebuild]
  )

  const handleBulkAddEntities = useCallback(
    (params: BulkEntityParams) => {
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
    [updateWorld, captureScenePosesForNextRebuild]
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
      captureScenePosesForNextRebuild()
      const newEntities = world.entities.filter((e) => e.id !== entityId)
      updateWorld((prev) => ({ ...prev, entities: newEntities }))
      if (selectedEntityId === entityId) setSelectedEntityId(null)
      if (cameraTarget === entityId) {
        setCameraTarget(newEntities[0]?.id ?? '')
      }
    },
    [world.entities, selectedEntityId, cameraTarget, updateWorld, setCameraTarget, captureScenePosesForNextRebuild]
  )

  const handleGizmoModeChange = useCallback((mode: BuilderGizmoMode) => {
    setGizmoMode(mode)
    uiLogger.change('Builder', 'Gizmo mode', { mode })
  }, [])

  const handleEntityPoseCommit = useCallback(
    (entityId: string, pose: BuilderPoseCommit) => {
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
    [updateWorld]
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
    [world.entities, getCurrentPose, updateWorld, captureScenePosesForNextRebuild]
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
    [world, updateWorld, captureScenePosesForNextRebuild]
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

  return (
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
  )
}
