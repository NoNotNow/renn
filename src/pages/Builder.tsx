import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from 'react'
import { loadExampleWorldFromPublicBase } from '@/utils/loadExampleWorldFromPublicBase'
import {
  readExampleWorldUrlParam,
  readExampleWorldUrlState,
  setExampleWorldUrlParam,
  setExampleWorldUrlState,
  type ExampleWorldUrlState,
} from '@/utils/exampleWorldUrlParam'
import { createPortal } from 'react-dom'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import PerformanceBoosterDialog from '@/components/PerformanceBoosterDialog'
import SaveDialog from '@/components/SaveDialog'
import MazeTrainingDialog from '@/components/MazeTrainingDialog'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import Workspace from '@/components/Workspace'
import { LivePosesPoll, type LivePosesMap } from '@/components/LivePosesPoll'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'
import { useEditorHistory } from '@/hooks/useEditorHistory'
import { useTextureMakerSession } from '@/hooks/useTextureMakerSession'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import AvEvolutionPanel from '@/components/AvEvolutionPanel'
import { installAvEvolutionAgentApi } from '@/avEvolution/browser/agentApi'
import { getAvEvolutionStore } from '@/avEvolution/agent/storeRegistry'
import { useProjectContext } from '@/hooks/useProjectContext'
import {
  clearTransformerLiveTraceSnapshot,
  getTransformerLiveTraceSnapshot,
  setTransformerTraceTargetEntityId,
  subscribeTransformerLiveTrace,
} from '@/runtime/transformerTraceBridge'
import {
  incrementTransformerWatchRunId,
  setTransformerWatchEnabled,
} from '@/runtime/transformerWatchBridge'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useBuilderFullscreenChrome } from '@/hooks/useBuilderFullscreenChrome'
import {
  type Vec3,
  type Rotation,
  type TrimeshSimplificationConfig,
} from '@/types/world'
import { useBuilderKeyboardShortcuts } from '@/hooks/useBuilderKeyboardShortcuts'
import { useBuilderPoseSyncSave } from '@/hooks/useBuilderPoseSyncSave'
import { ScriptSnackbar } from '@/components/ScriptSnackbar'
import { SceneFullscreenButton } from '@/components/SceneFullscreenButton'
import { useBuilderExplorerSelection } from '@/hooks/useBuilderExplorerSelection'
import { useBuilderWorkspace } from '@/hooks/useBuilderWorkspace'
import { useBuilderEntityWorldActions } from '@/hooks/useBuilderEntityWorldActions'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { theme } from '@/config/theme'
import {
  DEFAULT_TEXTURE_BRUSH_RGB,
  TEXTURE_BRUSH_RADIUS_MAX,
  TEXTURE_BRUSH_RADIUS_MIN,
  TEXTURE_PAINT_RADIUS_PX,
  type BuilderGizmoMode,
  isBuilderGizmoMode,
  type BuilderPoseCommitEntry,
} from '@/editor/transformGizmoController'
import type { EditorSnapshot } from '@/editor/editorHistory'
import { downscaleImageBlob } from '@/utils/textureDownscale'
import { clampTrimeshSimplificationConfig } from '@/scripts/migrateWorld'
import {
  applyMeshSimplificationToEntityInWorld,
  persistSimplifiedMeshAssetFromWorld,
} from '@/utils/bakeSimplifiedModelAsset'
import { getFullscreenElement, isFullscreenEnabled } from '@/utils/fullscreenApi'
import TextureMaker from '@/components/TextureMaker/TextureMaker'
import TransformerDocs from '@/components/TransformerDocs'
import { applyWorldEdit } from '@/editor/applyWorldEdit'
import { canApplyWorldSnapshotIncrementally } from '@/utils/incrementalSceneSync'
import { useAgentDevProjectBundleBootstrap } from '@/hooks/useAgentDevProjectBundleBootstrap'
import { useGlobalLibraryUpgrade } from '@/hooks/useGlobalLibraryUpgrade'
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock'

const EDITOR_HISTORY_MAX_DEPTH = 80

export default function Builder() {
  // The Builder viewport simulates live, so keep the display awake while it is visible.
  useScreenWakeLock(true)
  const {
    currentProject,
    initialLoadPending,
    world,
    assets,
    projects,
    version,
    newProject,
    loadProject,
    reloadWorld,
    saveProject,
    saveProjectAs,
    saveToProject,
    updateWorld,
    updateAssets,
    applyEditorSnapshot,
    bumpVersion,
    documentEpoch,
    syncPosesFromScene,
    syncPosesToRefOnly,
    handlePlay,
    loadExampleWorld,
    cameraControl,
    cameraTarget,
    cameraMode,
    cameraTargetVerticalAngle,
    fluidOrbitSpeed,
    fluidOrbitDirection,
    fluidOrbitHeight,
    fluidOrbitDistance,
    cameraTargetLag,
    cameraPositionLag,
    setCameraTarget,
    setCameraMode,
    editorFreePoseRef,
    entityWorkHistory,
    recordEntityWorkHistory,
  } = useProjectContext()

  useAgentDevProjectBundleBootstrap({
    enabled: import.meta.env.DEV,
    loadDevWorld: loadExampleWorld,
  })

  // shareable link: ?example=<id>[&entity=<id>][&tool=<gizmo mode>] opens that example world (public/exampleWorlds/<id>/)
  // on start and restores the selected entity and Builder tool (restore + URL sync effects further down)
  const exampleUrlLoadedRef = useRef(false)
  const exampleUrlRestoreRef = useRef<ExampleWorldUrlState | null>(null)
  const [exampleUrlPending, setExampleUrlPending] = useState(
    () => readExampleWorldUrlParam(window.location.search) !== null,
  )
  useEffect(() => {
    if (exampleUrlLoadedRef.current) return
    exampleUrlLoadedRef.current = true
    const state = readExampleWorldUrlState(window.location.search)
    const id = state.example
    if (!id) return
    loadExampleWorldFromPublicBase(import.meta.env.BASE_URL || '/', id)
      .then(({ world, assets }) => {
        exampleUrlRestoreRef.current = state
        loadExampleWorld(world, id, assets)
      })
      .catch((err) => {
        console.error('Failed to load example world from URL:', err)
        setExampleWorldUrlParam(null)
        setExampleUrlPending(false)
      })
  }, [loadExampleWorld])

  const [gizmoMode, setGizmoMode] = useState<BuilderGizmoMode>('translate')
  const [textureBrushRgb, setTextureBrushRgb] = useState<Vec3>(() => [...DEFAULT_TEXTURE_BRUSH_RGB])
  const [textureBrushAlpha, setTextureBrushAlpha] = useState(1)
  const [textureBrushRadiusPx, setTextureBrushRadiusPx] = useState(TEXTURE_PAINT_RADIUS_PX)
  const [editNavigationMode, setEditNavigationMode] = useLocalStorageState('builderEditNavigationMode', false)
  const [gameFrozen, setGameFrozen] = useState(false)
  const [performanceBoosterOpen, setPerformanceBoosterOpen] = useState(false)
  const [mazeTrainingOpen, setMazeTrainingOpen] = useState(false)
  const [avEvolutionOpen, setAvEvolutionOpen] = useState(false)
  useEffect(() => installAvEvolutionAgentApi(getAvEvolutionStore()), [])
  const [transformerDocsOpen, setTransformerDocsOpen] = useState(false)
  const [perfPickMode, setPerfPickMode] = useState<'mesh' | 'texture' | null>(null)
  const [perfMeshEntityId, setPerfMeshEntityId] = useState<string | null>(null)
  const [perfTextureEntityId, setPerfTextureEntityId] = useState<string | null>(null)
  const [soundPlaybackCommand, setSoundPlaybackCommand] = useState<
    { action: 'play' | 'stop'; nonce: number } | null
  >(null)
  const sceneViewRef = useRef<SceneViewHandle>(null)
  const getScenePosesRef = useRef<() => LivePosesMap | null>(() => null)
  getScenePosesRef.current = () => sceneViewRef.current?.getAllPoses() ?? null
  const initialPosesRef = useRef<Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null>(null)
  const prevDocumentEpochRef = useRef(documentEpoch)
  if (prevDocumentEpochRef.current !== documentEpoch) {
    initialPosesRef.current = null
    prevDocumentEpochRef.current = documentEpoch
  }
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

  const syncSceneAfterDocumentChange = useCallback((prevWorld: typeof world, nextWorld: typeof world) => {
    sceneViewRef.current?.syncWorldEntities?.(prevWorld, nextWorld)
  }, [])

  /** Snapshot live registry poses so the next scene rebuild (entity add/remove/clone, etc.) does not reset physics-driven positions. */
  const captureScenePosesForNextRebuild = useCallback(() => {
    initialPosesRef.current = sceneViewRef.current?.getAllPoses() ?? null
  }, [])

  const worldEditDeps = useMemo(
    () => ({
      updateWorld,
      bumpVersion,
      pushBeforeEdit: pushHistory,
      captureScenePosesForNextRebuild,
      syncWorldEntities: syncSceneAfterDocumentChange,
    }),
    [updateWorld, bumpVersion, pushHistory, captureScenePosesForNextRebuild, syncSceneAfterDocumentChange],
  )

  const {
    selectedEntityIds,
    selectedGroupIds,
    setSelectedEntityIds,
    setSelectedGroupIds,
    selectionAnchorEntityIdRef,
    handleSelectEntity,
    handleSelectGroup,
    handleCreateGroupFromSelection,
    handleUngroup,
    handleAddSelectedToGroup,
    handleRemoveSelectedFromGroup,
    handleToggleGroupCollapsed,
    handleRenameGroup,
    clearSelection,
    reconcileAfterSnapshot,
    groupShortcutHandlersRef,
  } = useBuilderExplorerSelection({
    world,
    worldEditDeps,
    recordEntityWorkHistory,
  })

  const {
    clipboardShortcutHandlersRef,
    handleAddEntity,
    handleBulkAddEntities,
    handleDeleteEntities,
    handleCloneEntity,
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
  } = useBuilderEntityWorldActions({
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
  })

  // library fixes reach project copies of global stages / pipes (edited copies are left alone)
  useGlobalLibraryUpgrade({ projectId: currentProject.id, initialLoadPending, world, applyWorldWrite })

  const applyHistorySnapshot = useCallback(
    (snap: EditorSnapshot) => {
      const prev = worldAssetsRef.current
      const needsReload = !canApplyWorldSnapshotIncrementally(prev.world, snap.world)
      if (needsReload) {
        initialPosesRef.current = null
      }
      applyEditorSnapshot(snap, { reloadScene: needsReload })
      if (!needsReload) {
        sceneViewRef.current?.syncWorldEntities?.(prev.world, snap.world)
      }
      reconcileAfterSnapshot(snap.world)
      const nextCameraTarget =
        cameraTarget && snap.world.entities.some((e) => e.id === cameraTarget)
          ? cameraTarget
          : (snap.world.entities[0]?.id ?? '')
      setCameraTarget(nextCameraTarget)
      bumpHistoryUi()
    },
    [applyEditorSnapshot, bumpHistoryUi, cameraTarget, reconcileAfterSnapshot, setCameraTarget],
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

  const {
    builderColumnRef,
    fsSidebarsHitTestRef,
    leftDrawerOpen,
    setLeftDrawerOpen,
    rightDrawerOpen,
    setRightDrawerOpen,
    builderFullscreenActive,
    bumpFsChrome,
    handleSceneFullscreenChange,
    builderChromeIdleHidden,
    fsChromeControlVisible,
    collapseSideDrawers,
  } = useBuilderFullscreenChrome()

  const {
    workspaceOpen,
    workspaceEntry,
    handleOpenWorkspace,
    handleCloseWorkspace,
    handleWorkspaceEntryChange,
    handleSelectEntityFromWorkspace,
    handleOpenWorkspaceAnchored,
  } = useBuilderWorkspace({
    world,
    selectedEntityIds,
    handleSelectEntity,
    collapseSideDrawers,
  })

  const [showGameHud, setShowGameHud] = useLocalStorageState('builderShowGameHud', false)
  const [rightPanelDocked, setRightPanelDocked] = useLocalStorageState('rightSidebarDocked', false)

  const sceneCameraConfig = useMemo(
    () => ({
      ...world.world.camera,
      control: cameraControl,
      target: cameraTarget,
      mode: cameraMode,
      targetVerticalAngle: cameraTargetVerticalAngle,
      fluidOrbitSpeed,
      fluidOrbitDirection,
      fluidOrbitHeight,
      fluidOrbitDistance,
      cameraTargetLag,
      cameraPositionLag,
    }),
    [world.world.camera, cameraControl, cameraTarget, cameraMode, cameraTargetVerticalAngle, fluidOrbitSpeed, fluidOrbitDirection, fluidOrbitHeight, fluidOrbitDistance, cameraTargetLag, cameraPositionLag]
  )

  const fileShortcutHandlersRef = useRef<{
    onSave: () => void
    onSaveAs: () => void
    onNew: () => void
  }>({ onSave: () => {}, onSaveAs: () => {}, onNew: () => {} })

  const {
    showSaveDialog,
    setShowSaveDialog,
    saveSnackbarMessage,
    saveDialogDefaultName,
    handleNew,
    handleOpenExampleWorld,
    handleOpen,
    handleReload,
    handleSave,
    handleSaveAs,
    handleSaveDialogSaveNew,
    handleSaveDialogOverwrite,
  } = useBuilderPoseSyncSave({
    sceneViewRef,
    fileShortcutHandlersRef,
    currentProject,
    projects,
    saveProject,
    saveProjectAs,
    saveToProject,
    syncPosesFromScene,
    syncPosesToRefOnly,
    newProject,
    loadProject,
    reloadWorld,
    loadExampleWorld,
  })

  // Training Mazes dialog → load the exported example world into the builder (no play mode):
  // the world sets world.debugTargetLineEntityId, so the guidance chain overlay renders in builder
  // mode. The dialog stays open; the game HUD is force-enabled so the score watch is visible.
  const handlePlayExampleWorld = useCallback(
    async (worldId: string) => {
      try {
        const { world, assets } = await loadExampleWorldFromPublicBase(import.meta.env.BASE_URL || '/', worldId)
        handleOpenExampleWorld(world, worldId, assets)
        setShowGameHud(true)
        uiLogger.select('Builder', 'Load training maze into builder', { worldName: worldId })
      } catch (err) {
        console.error('Failed to load example world:', err)
        alert('Failed to load example world')
      }
    },
    [handleOpenExampleWorld, setShowGameHud],
  )

  const handleEntityPoseCommit = useCallback(
    (commits: BuilderPoseCommitEntry[]) => {
      if (commits.length === 0) return
      for (const { entityId, pose } of commits) {
        sceneViewRef.current?.updateEntityPose(entityId, {
          position: pose.position,
          rotation: pose.rotation,
          scale: pose.scale,
        })
      }
      const byId = new Map(commits.map((c) => [c.entityId, c.pose] as const))
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'none' }, (prev) => ({
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
    [worldEditDeps]
  )

  const handleGizmoModeChange = useCallback((mode: BuilderGizmoMode) => {
    setGizmoMode(mode)
    uiLogger.click('Builder', 'Change gizmo mode', { mode })
  }, [])

  const handleToggleEditNavigationMode = useCallback(() => {
    setEditNavigationMode((prev) => {
      const next = !prev
      uiLogger.change('Builder', 'Toggle edit navigation mode', { enabled: next })
      return next
    })
  }, [setEditNavigationMode])

  const handleGroupSelectionShortcut = useCallback(
    () => groupShortcutHandlersRef.current.onGroup(),
    [groupShortcutHandlersRef],
  )
  const handleUngroupSelectionShortcut = useCallback(
    () => groupShortcutHandlersRef.current.onUngroup(),
    [groupShortcutHandlersRef],
  )
  const handleCopyShortcut = useCallback(
    () => clipboardShortcutHandlersRef.current.onCopy(),
    [clipboardShortcutHandlersRef],
  )
  const handlePasteShortcut = useCallback(
    () => clipboardShortcutHandlersRef.current.onPaste(),
    [clipboardShortcutHandlersRef],
  )

  useBuilderKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onClearSelection: clearSelection,
    onToggleEditNavigationMode: handleToggleEditNavigationMode,
    onCycleActiveAvatar: useCallback(() => sceneViewRef.current?.cycleActiveAvatar() ?? false, []),
    onChangeCameraMode: setCameraMode,
    onGroupSelection: handleGroupSelectionShortcut,
    onUngroupSelection: handleUngroupSelectionShortcut,
    onCopy: handleCopyShortcut,
    onPaste: handlePasteShortcut,
    onSave: useCallback(() => fileShortcutHandlersRef.current.onSave(), []),
    onSaveAs: useCallback(() => fileShortcutHandlersRef.current.onSaveAs(), []),
    onNew: useCallback(() => fileShortcutHandlersRef.current.onNew(), []),
    onPlay: handlePlay,
    onOpenWorkspace: handleOpenWorkspace,
    isWorkspaceOpen: useCallback(() => workspaceOpen, [workspaceOpen]),
  })

  const handleAssetsChange = useCallback((newAssets: typeof assets) => {
    updateAssets(() => newAssets)
  }, [updateAssets])

  const handleResetCamera = useCallback(() => {
    sceneViewRef.current?.resetCamera()
    applyWorldEdit(worldEditDeps, { undo: 'skip', scene: 'none' }, (prev) => {
      const prevCam = prev.world.camera
      if (!prevCam) return prev
      const { editorFreePose: _removed, ...rest } = prevCam
      return {
        ...prev,
        world: { ...prev.world, camera: rest },
      }
    })
    uiLogger.click('Builder', 'Reset camera to default position')
  }, [worldEditDeps])

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
      bumpVersion()
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
        updateAssets(() => result.assets)
        updateWorld(() => result.world)
      } catch (err) {
        console.error('[PerformanceBooster] Failed to persist simplified mesh', err)
        alert('Failed to bake simplified mesh to assets. Simplification settings remain.')
      }
    },
    [world, assets, updateWorld, updateAssets, captureScenePosesForNextRebuild, bumpVersion, pushHistory]
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
      updateAssets((prev) => {
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

  // example-world link: restore entity / tool from the URL once the world is loaded
  useEffect(() => {
    const restore = exampleUrlRestoreRef.current
    if (!restore || currentProject.id !== null || currentProject.name !== restore.example) return
    exampleUrlRestoreRef.current = null
    if (restore.entity && world.entities.some((e) => e.id === restore.entity)) setSelectedEntityIds([restore.entity])
    if (isBuilderGizmoMode(restore.tool)) setGizmoMode(restore.tool)
    setExampleUrlPending(false)
  }, [currentProject.id, currentProject.name, world, setSelectedEntityIds])

  // example-world link: keep entity / tool in the URL; drop the link when another project is opened
  useEffect(() => {
    if (exampleUrlPending) return
    const example = readExampleWorldUrlParam(window.location.search)
    if (!example) return
    if (currentProject.id !== null || currentProject.name !== example) {
      setExampleWorldUrlParam(null)
      return
    }
    const entity = selectedEntityIds.find((id) => world.entities.some((e) => e.id === id)) ?? null
    setExampleWorldUrlState({ example, entity, tool: gizmoMode })
  }, [exampleUrlPending, currentProject.id, currentProject.name, selectedEntityIds, world, gizmoMode])

  useEffect(() => {
    if (gizmoMode === 'paint' && textureBrushDisabled) {
      setGizmoMode('translate')
    }
  }, [gizmoMode, textureBrushDisabled])

  void historyTick
  void textureMakerHistoryTick
  const canUndoHistory = canUndoTextureMaker || editorCanUndo
  const canRedoHistory = canRedoTextureMaker || editorCanRedo

  const traceActive = selectedEntityIds.length === 1 && workspaceOpen
  const watchActive = selectedEntityIds.length === 1 && workspaceOpen
  useEffect(() => {
    if (traceActive) {
      setTransformerTraceTargetEntityId(selectedEntityIds[0]!)
    } else {
      setTransformerTraceTargetEntityId(null)
      clearTransformerLiveTraceSnapshot()
    }
    return () => {
      setTransformerTraceTargetEntityId(null)
      clearTransformerLiveTraceSnapshot()
    }
  }, [selectedEntityIds, workspaceOpen, traceActive])

  useEffect(() => {
    setTransformerWatchEnabled(watchActive)
    return () => setTransformerWatchEnabled(false)
  }, [watchActive])

  const prevGameFrozenRef = useRef(gameFrozen)
  useEffect(() => {
    const wasFrozen = prevGameFrozenRef.current
    prevGameFrozenRef.current = gameFrozen
    if (wasFrozen && !gameFrozen) {
      incrementTransformerWatchRunId()
    }
  }, [gameFrozen])

  const liveTraceSnapshot = useSyncExternalStore(
    subscribeTransformerLiveTrace,
    getTransformerLiveTraceSnapshot,
    () => null,
  )

  const liveTraceSteps =
    traceActive && liveTraceSnapshot?.entityId === selectedEntityIds[0]
      ? liveTraceSnapshot.steps
      : null

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
        onLeftSidebarToggle={() => setLeftDrawerOpen((prev) => !prev)}
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
        onOpen={handleOpen}
        onReload={handleReload}
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
        onOpenAvEvolution={() => {
          setAvEvolutionOpen(true)
          uiLogger.click('Builder', 'Open AV evolution', {})
        }}
        onOpenTransformerDocs={() => {
          setTransformerDocsOpen(true)
          uiLogger.click('Builder', 'Open Transformer docs', {})
        }}
        onOpenTextureStudio={onOpenTextureStudioFromToolbar}
        onOpenWorkspace={handleOpenWorkspace}
        selectedEntityCount={selectedEntityIds.length}
        onOpenExampleWorld={handleOpenExampleWorld}
        onOpenMazeTraining={() => {
          setMazeTrainingOpen(true)
          uiLogger.click('Builder', 'Open Training Mazes dialog', {})
        }}
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

      {avEvolutionOpen && (
        <AvEvolutionPanel onClose={() => setAvEvolutionOpen(false)} selectedEntityId={selectedEntityIds.length === 1 ? selectedEntityIds[0]! : null} />
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
        entityWorkHistory={entityWorkHistory}
      />

      <TransformerDocs
        isOpen={transformerDocsOpen}
        onClose={() => setTransformerDocsOpen(false)}
      />

      <MazeTrainingDialog
        isOpen={mazeTrainingOpen}
        onClose={() => setMazeTrainingOpen(false)}
        onPlayExampleWorld={handlePlayExampleWorld}
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
          <main style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}>
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
                runPhysics={!gameFrozen}
                runScripts={!gameFrozen}
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
                shouldExitFullscreenOnEscape={useCallback(() => !workspaceOpen, [workspaceOpen])}
              />
            </ErrorBoundary>
            {saveSnackbarMessage !== null ? <ScriptSnackbar message={saveSnackbarMessage} /> : null}
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
              selectedEntityIds={selectedEntityIds}
              selectedGroupIds={selectedGroupIds}
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
                    onOpenWorkspaceAnchored={handleOpenWorkspaceAnchored}
                    onSelectEntity={handleSelectEntity}
                    entityWorkHistory={entityWorkHistory}
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
                    onOpenWorkspaceAnchored={handleOpenWorkspaceAnchored}
                    onSelectEntity={handleSelectEntity}
                    entityWorkHistory={entityWorkHistory}
                  />
              )}
            </LivePosesPoll>
          </div>
        )}
      </div>

      <Workspace
        open={workspaceOpen}
        onClose={handleCloseWorkspace}
        entry={workspaceEntry}
        onEntryChange={handleWorkspaceEntryChange}
        world={world}
        selectedEntityIds={selectedEntityIds}
        onWorldChange={handleWorldChange}
        applyWorldWrite={applyWorldWrite}
        onEntityTransformersChange={handleEntityTransformersChange}
        onMergedPipeParamSync={handleMergedPipeParamSync}
        liveTransformerTraceSteps={liveTraceSteps}
        onSelectEntity={handleSelectEntityFromWorkspace}
        entityWorkHistory={entityWorkHistory}
        gameFrozen={gameFrozen}
        onToggleGameFrozen={() => setGameFrozen((f) => !f)}
        onResetAllEntities={() => {
          for (const e of world.entities) {
            if (!e.locked) {
              sceneViewRef.current?.updateEntityPose(e.id, {
                position: [...(e.position ?? [0, 0, 0])] as Vec3,
                rotation: [...(e.rotation ?? [0, 0, 0])] as Rotation,
              })
            }
          }
        }}
      />
      {workspaceOpen && builderFullscreenActive && isFullscreenEnabled() ?
        createPortal(
          <SceneFullscreenButton
            overlay
            active
            visible
            onToggle={() => {
              sceneViewRef.current?.toggleFullscreen()
              bumpFsChrome()
            }}
          />,
          getFullscreenElement() ?? document.body,
        )
      : null}
    </div>
    </CopyProvider>
    </EditorUndoProvider>
  )
}
