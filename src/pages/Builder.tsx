import { useState, useCallback, useRef, useMemo } from 'react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import { createDefaultEntity, type AddableShapeType } from '@/data/entityDefaults'
import { useProjectManagement } from '@/hooks/useProjectManagement'
import type { Vec3, Quat } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { updateEntityPosition } from '@/utils/worldUtils'

export default function Builder() {
  const {
    world,
    assets,
    projects,
    currentProjectId,
    setWorld,
    setAssets,
    loadProjects,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleDelete,
    handleExport,
    handleImport,
    onFileChange,
    handlePlay,
    fileInputRef,
    cameraControl,
    cameraTarget,
    cameraMode,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
  } = useProjectManagement()

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [gravityEnabled, setGravityEnabled] = useState(true)
  const [shadowsEnabled, setShadowsEnabled] = useState(true)
  const sceneViewRef = useRef<SceneViewHandle>(null)

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
      setWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, newEntity],
      }))
      setSelectedEntityId(newEntity.id)
    },
    [setWorld]
  )

  const handleDeleteEntity = useCallback(
    (entityId: string) => {
      const entity = world.entities.find((e) => e.id === entityId)
      uiLogger.delete('Builder', 'Delete entity', { entityId, entityName: entity?.name })
      const newEntities = world.entities.filter((e) => e.id !== entityId)
      setWorld((prev) => ({ ...prev, entities: newEntities }))
      if (selectedEntityId === entityId) setSelectedEntityId(null)
      if (cameraTarget === entityId) {
        setCameraTarget(newEntities[0]?.id ?? '')
      }
    },
    [world.entities, selectedEntityId, cameraTarget, setWorld, setCameraTarget]
  )

  const handleEntityPositionChange = useCallback(
    (entityId: string, position: Vec3) => {
      setWorld((prev) => updateEntityPosition(prev, entityId, position))
    },
    [setWorld]
  )

  const handleReload = useCallback(() => {
    sceneViewRef.current?.reload()
  }, [])

  const handleNewWithReload = useCallback(() => {
    handleNew()
    // Reload after state settles
    setTimeout(() => handleReload(), 0)
  }, [handleNew, handleReload])

  const handleOpenWithReload = useCallback(
    (id: string) => {
      handleOpen(id)
      // Reload after state settles
      setTimeout(() => handleReload(), 0)
    },
    [handleOpen, handleReload]
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

  const handleSaveWithSync = useCallback(async () => {
    const allPoses = sceneViewRef.current?.getAllPoses()
    if (allPoses) {
      // Sync poses back to world before saving
      setWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => {
          const pose = allPoses.get(e.id)
          return pose ? { ...e, position: pose.position, rotation: pose.rotation } : e
        }),
      }))
      // Wait for state to settle, then save
      setTimeout(() => handleSave(), 0)
    } else {
      handleSave()
    }
  }, [handleSave, setWorld])

  const handleSaveAsWithSync = useCallback(async () => {
    const allPoses = sceneViewRef.current?.getAllPoses()
    if (allPoses) {
      // Sync poses back to world before saving
      setWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => {
          const pose = allPoses.get(e.id)
          return pose ? { ...e, position: pose.position, rotation: pose.rotation } : e
        }),
      }))
      // Wait for state to settle, then save
      setTimeout(() => handleSaveAs(), 0)
    } else {
      handleSaveAs()
    }
  }, [handleSaveAs, setWorld])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BuilderHeader
        projects={projects}
        currentProjectId={currentProjectId}
        gravityEnabled={gravityEnabled}
        shadowsEnabled={shadowsEnabled}
        onNew={handleNewWithReload}
        onSave={handleSaveWithSync}
        onSaveAs={handleSaveAsWithSync}
        onExport={handleExport}
        onImport={handleImport}
        onOpen={handleOpenWithReload}
        onRefresh={loadProjects}
        onDelete={handleDelete}
        onPlay={handlePlay}
        onReload={handleReload}
        onGravityChange={setGravityEnabled}
        onShadowsChange={setShadowsEnabled}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
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
        />

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 300 }}>
            <SceneView
              ref={sceneViewRef}
              world={sceneWorld}
              assets={assets}
              runPhysics
              runScripts
              gravityEnabled={gravityEnabled}
              shadowsEnabled={shadowsEnabled}
              selectedEntityId={selectedEntityId}
              onSelectEntity={setSelectedEntityId}
              onEntityPositionChange={handleEntityPositionChange}
            />
          </div>

          <PropertySidebar
            world={world}
            assets={assets}
            selectedEntityId={selectedEntityId}
            onWorldChange={setWorld}
            onAssetsChange={setAssets}
            onDeleteEntity={handleDeleteEntity}
            getCurrentPose={getCurrentPose}
            onEntityPoseChange={handleEntityPoseChange}
          />
        </main>
      </div>
    </div>
  )
}
