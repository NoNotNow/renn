import { useState, useCallback, useRef, useMemo, useEffect, type SetStateAction } from 'react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import { createDefaultEntity, type AddableShapeType } from '@/data/entityDefaults'
import { useProjectContext } from '@/hooks/useProjectContext'
import type { Vec3, Quat } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { updateEntityPosition } from '@/utils/worldUtils'

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
    deleteProject,
    refreshProjects,
    updateWorld,
    updateAssets,
    syncPosesFromScene,
    exportProject,
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
  const [gravityEnabled, setGravityEnabled] = useState(true)
  const [shadowsEnabled, setShadowsEnabled] = useState(true)
  const sceneViewRef = useRef<SceneViewHandle>(null)

  // Drawer states with localStorage persistence
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('leftDrawerOpen')
      return saved ? JSON.parse(saved) : true
    } catch {
      return true
    }
  })
  const [rightDrawerOpen, setRightDrawerOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('rightDrawerOpen')
      return saved ? JSON.parse(saved) : true
    } catch {
      return true
    }
  })

  // Persist drawer states
  useEffect(() => {
    try {
      localStorage.setItem('leftDrawerOpen', JSON.stringify(leftDrawerOpen))
    } catch {
      // Ignore localStorage errors in test environment
    }
  }, [leftDrawerOpen])

  useEffect(() => {
    try {
      localStorage.setItem('rightDrawerOpen', JSON.stringify(rightDrawerOpen))
    } catch {
      // Ignore localStorage errors in test environment
    }
  }, [rightDrawerOpen])

  const sceneWorld = useMemo(
    () => ({
      ...world,
      world: {
        ...world.world,
        camera: {
          ...world.world.camera,
          control: cameraControl,
          target: cameraTarget,
          mode: cameraMode,
        },
      },
    }),
    [world, cameraControl, cameraTarget, cameraMode]
  )

  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      const newEntity = createDefaultEntity(shapeType)
      uiLogger.select('Builder', 'Add entity', { shapeType, entityId: newEntity.id })
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, newEntity],
      }))
      setSelectedEntityId(newEntity.id)
    },
    [updateWorld]
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
      const newEntities = world.entities.filter((e) => e.id !== entityId)
      updateWorld((prev) => ({ ...prev, entities: newEntities }))
      if (selectedEntityId === entityId) setSelectedEntityId(null)
      if (cameraTarget === entityId) {
        setCameraTarget(newEntities[0]?.id ?? '')
      }
    },
    [world.entities, selectedEntityId, cameraTarget, updateWorld, setCameraTarget]
  )

  const handleEntityPositionChange = useCallback(
    (entityId: string, position: Vec3) => {
      updateWorld((prev) => updateEntityPosition(prev, entityId, position))
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

  const getCurrentPose = useCallback(
    (id: string): { position: Vec3; rotation: Quat } => {
      const reg = sceneViewRef.current?.getAllPoses()
      const savedPose = reg?.get(id)
      if (savedPose) return savedPose
      const entity = world.entities.find((e) => e.id === id)
      return {
        position: entity?.position ?? [0, 0, 0],
        rotation: entity?.rotation ?? [0, 0, 0, 1],
      }
    },
    [world.entities]
  )

  const handleEntityPoseChange = useCallback((id: string, pose: { position?: Vec3; rotation?: Quat }) => {
    sceneViewRef.current?.updateEntityPose(id, pose)
  }, [])

  const handleWorldChange = useCallback((newWorld: typeof world) => {
    updateWorld(() => newWorld)
  }, [updateWorld])

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

  const handleSave = useCallback(async () => {
    const allPoses = sceneViewRef.current?.getAllPoses()
    if (allPoses) {
      syncPosesFromScene(allPoses)
    }
    await saveProject()
  }, [syncPosesFromScene, saveProject])

  const handleSaveAs = useCallback(async () => {
    const name = prompt('Project name:', `World ${projects.length + 1}`)
    if (!name) return
    
    const allPoses = sceneViewRef.current?.getAllPoses()
    if (allPoses) {
      syncPosesFromScene(allPoses)
    }
    await saveProjectAs(name)
  }, [syncPosesFromScene, saveProjectAs, projects.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BuilderHeader
        projects={projects}
        currentProject={currentProject}
        gravityEnabled={gravityEnabled}
        shadowsEnabled={shadowsEnabled}
        onNew={handleNew}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExport={exportProject}
        onImport={importProject}
        onOpen={handleOpen}
        onRefresh={refreshProjects}
        onDelete={() => currentProject.id && deleteProject(currentProject.id)}
        onPlay={handlePlay}
        onGravityChange={setGravityEnabled}
        onShadowsChange={setShadowsEnabled}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
      />

      <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}>
        {/* Canvas takes full width */}
        <main style={{ width: '100%', height: '100%' }}>
          <SceneView
            ref={sceneViewRef}
            world={sceneWorld}
            assets={assets}
            version={version}
            runPhysics
            runScripts
            gravityEnabled={gravityEnabled}
            shadowsEnabled={shadowsEnabled}
            selectedEntityId={selectedEntityId}
            onSelectEntity={setSelectedEntityId}
            onEntityPositionChange={handleEntityPositionChange}
          />
        </main>

        {/* Sidebars overlay on top */}
        <EntitySidebar
          entities={world.entities}
          selectedEntityId={selectedEntityId}
          cameraControl={cameraControl}
          cameraTarget={cameraTarget}
          cameraMode={cameraMode}
          onSelectEntity={setSelectedEntityId}
          onAddEntity={handleAddEntity}
          onCameraControlChange={setCameraControl}
          onCameraTargetChange={setCameraTarget}
          onCameraModeChange={setCameraMode}
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
          getCurrentPose={getCurrentPose}
          onEntityPoseChange={handleEntityPoseChange}
          isOpen={rightDrawerOpen}
          onToggle={() => setRightDrawerOpen(!rightDrawerOpen)}
        />
      </div>
    </div>
  )
}
