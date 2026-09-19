import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { buildLoadedEntity } from '@/loader/loadWorld'
import type {
  RennWorld,
  Vec3,
  Rotation,
  CameraConfig,
  Entity,
  EditorFreePose,
  AvatarFocusSnapshot,
} from '@/types/world'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import {
  DEFAULT_GRAVITY,
  DEFAULT_ROTATION,
  resolveFogSettings,
  resolvedPixelRatio,
  resolvedShadowsEnabled,
} from '@/types/world'
import { applySceneFog } from '@/utils/sceneFog'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import type { HudPatch } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { tryEnqueueDebugForce, type ActiveDebugForce } from '@/runtime/debugForces'
import { setNdcFromPointerEvent } from '@/utils/pointerNdc'
import {
  perspectiveCameraToSceneCameraPose,
  type SceneCameraPose,
} from '@/utils/sceneCameraPose'
import type { SceneFrameTiming } from '@/runtime/frameTiming'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useSkyDome } from '@/hooks/useSkyDome'
import { useWorldAudio, type SoundPlaybackCommand } from '@/hooks/useWorldAudio'
import { useSceneFullscreen } from '@/hooks/useSceneFullscreen'
import { SceneFullscreenButton } from '@/components/SceneFullscreenButton'
import { WorldLoadErrorOverlay } from '@/components/WorldLoadErrorOverlay'
import {
  DEFAULT_TEXTURE_BRUSH_RGB,
  TEXTURE_PAINT_RADIUS_PX,
  type BuilderGizmoMode,
  type BuilderPoseCommitEntry,
  type TexturePaintStrokePayload,
} from '@/editor/transformGizmoController'
import { getSceneUserData } from '@/types/sceneUserData'
import {
  useRawKeyboardInput,
  useRawWheelInput,
  isKeyboardEventInEditableContext,
} from '@/input/rawInput'
import { useRawMouseDrag } from '@/input/rawMouseDrag'
import type { TransformerConfig, TransformerDef, TransformerPipe } from '@/types/transformer'
import {
  BUILDER_SCENE_CANVAS_HOST_ATTR,
  SUPPRESS_ESCAPE_SCENE_FOCUS_ATTR,
} from '@/config/constants'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import { diffEntityWorld, worldPipeRegistryChanged } from '@/utils/incrementalSceneSync'
import { syncEntityDocumentToScene } from '@/utils/syncEntityDocumentToScene'
import { computeDirectionalShadowCameraExtent } from '@/utils/shadowBounds'
import { countVisualModelTriangles } from '@/utils/geometryExtractor'
import { findEntityRootForPicking } from '@/utils/entityPicking'
import { ScriptSnackbar } from '@/components/ScriptSnackbar'
import { setVariableOverlayFn } from '@/runtime/variableOverlayBridge'
import { VariableOverlayController } from '@/runtime/variableOverlayController'
import { setCoordinateOverlayFn } from '@/runtime/coordinateOverlayBridge'
import { CoordinateOverlayController } from '@/runtime/coordinateOverlayController'
import { GameHud } from '@/components/GameHud'
import { FrameStatsOverlay } from '@/components/FrameStatsOverlay'
import { WarningSnackbar } from '@/components/WarningSnackbar'
import IndeterminateLoadingBar from '@/components/IndeterminateLoadingBar'
import { AvatarSession } from '@/runtime/avatarSession'
import {
  buildSceneRuntimeRestartKey,
  createDefaultSceneRuntimeRuntimeDeps,
  createSceneRuntimeSession,
  type SceneRuntimeHandleBag,
  type SceneRuntimeHostCallbacks,
} from '@/runtime/sceneRuntimeSession'
export interface SceneViewProps {
  world: RennWorld
  cameraConfig?: CameraConfig
  assets?: Map<string, Blob>
  runPhysics?: boolean
  runScripts?: boolean
  className?: string
  selectedEntityIds?: string[]
  onSelectEntity?: (
    entityId: string | null,
    options?: { additive?: boolean; range?: boolean; orderedVisibleEntityIds?: readonly string[] },
  ) => void
  /** Builder: called after a gizmo drag ends with the committed poses (one or many). */
  onEntityPoseCommit?: (commits: BuilderPoseCommitEntry[]) => void
  gizmoMode?: BuilderGizmoMode
  version?: number
  /** Ref set by parent before world update; applied to registry after reload and then cleared. */
  initialPosesRef?: React.MutableRefObject<
    Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null
  >
  /** Called after initial poses are applied so parent can sync world state. */
  onPosesRestored?: (poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>) => void
  /**
   * Builder: WASD free-fly, no transformer run, physics step paused, scripts paused.
   * Does not change persisted world or camera config.
   */
  editNavigationMode?: boolean
  /** Builder: session ref for last free-fly pose; merged on save via ProjectContext.getWorldToSave. */
  editorFreePoseRef?: React.MutableRefObject<EditorFreePose | null>
  /** Optional command from editor UI to manually control world background sound. */
  soundPlaybackCommand?: SoundPlaybackCommand | null
  /**
   * Builder: when `mode` is set, the next click on the canvas picks an entity (raycast)
   * and calls `onEntityPicked` (Performance booster).
   */
  performancePick?: {
    mode: 'mesh' | 'texture' | null
    onEntityPicked: (entityId: string) => void
  } | null
  /** When true, show score/damage HUD; scripts update via `ctx.setScore` / `ctx.setDamage`. */
  showGameHud?: boolean
  /**
   * Builder: persist `showFrameStats: false` when the user closes the overlay.
   * Omit on Play so close only hides for the session (world is not mutated).
   */
  onFrameStatsClose?: () => void
  /** Optional: e.g. Builder `setCameraTarget` when the play avatar changes (+/− or script). */
  onCurrentAvatarChange?: (entityId: string | null) => void
  /** Builder: persist painted texture after pointer-up (single-entity brush stroke). */
  onTexturePaintStrokeEnd?: (payload: TexturePaintStrokePayload) => void | Promise<void>
  /** Builder: snapshot before a brush stroke (undo). */
  pushUndoBeforePaintStroke?: () => void
  /** Builder: brush stroke RGB (0–1). */
  textureBrushRgb?: Vec3
  /** Builder: brush stroke alpha (0–1). */
  textureBrushAlpha?: number
  /** Builder: brush radius in texture pixels (clamped 1–800 in gizmo controller). */
  textureBrushRadiusPx?: number
  /** Builder: paint this asset (e.g. active compositor layer) instead of `entity.material.map`. */
  getPaintTargetAssetId?: (entityId: string) => string | null
  /** Builder: create a default composite texture when the first 3D brush stroke has no map yet. */
  prepareWorldPaintStroke?: (entityId: string) => Promise<{ mapAssetId: string; blob: Blob } | null>
  /** Called when this scene root enters or exits native fullscreen (e.g. Builder restores side drawers). */
  onFullscreenChange?: (active: boolean) => void
  /**
   * When set (e.g. Builder), `requestFullscreen` targets this node instead of the SceneView wrapper.
   * Must be stable for the lifetime of the SceneView instance.
   */
  fullscreenTargetRef?: React.RefObject<HTMLElement | null>
  /**
   * When set, pointer-reveal for the fullscreen button is driven by the parent (e.g. document-wide
   * listeners). SceneView does not attach pointer handlers on the scene root for chrome visibility.
   */
  fullscreenChromeControl?: { visible: boolean; bumpActivity: () => void }
  /**
   * When this returns false, plain Escape does not exit fullscreen (e.g. Workspace is open).
   */
  shouldExitFullscreenOnEscape?: () => boolean
  /**
   * Play route: disable picking/gizmo, shape wireframe overlays, variable/coordinate overlays,
   * and frame-stats HUD regardless of world flags.
   */
  playMode?: boolean
}

export type EntityPhysicsPatch = Partial<Pick<Entity, 'mass' | 'restitution' | 'friction' | 'linearDamping' | 'angularDamping' | 'bodyType'>>

export type { SceneCameraPose } from '@/utils/sceneCameraPose'

export interface SceneViewHandle {
  setViewPreset: (preset: 'top' | 'front' | 'right') => void
  updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => void
  updateEntityPhysics: (id: string, patch: EntityPhysicsPatch) => void
  /** Hot-swaps geometry and rebuilds collider. Returns false for trimesh (caller must rebuild). */
  updateEntityShape: (id: string, entity: Entity) => boolean
  /** Replaces the mesh material asynchronously (fire-and-forget; texture loading may defer). */
  updateEntityMaterial: (id: string, entity: Entity) => Promise<void>
  /** Applies model position/rotation/scale / double-sided GLTF shading; rebuilds trimesh collider only when position, rotation or scale change. */
  updateEntityModelTransform: (
    id: string,
    patch: { modelPosition?: Vec3; modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean }
  ) => void
  /** Sync world entity snapshot to registry and GLTF sides only (no texture load). */
  refreshEntityAppearance: (id: string, entity: Entity) => void
  /** Sync entity.transformers to runtime chain (e.g. enabled flags) without scene reload. */
  syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) => void
  /** Update world transformer + pipe registries used for merged runtime param resolution. */
  setWorldPipeRegistry: (
    transformers: Record<string, TransformerDef>,
    transformerPipes: Record<string, TransformerPipe>,
  ) => void
  getAllPoses: () => Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }> | null
  resetCamera: () => void
  applyDebugForce: (entityId: string, force: Vec3, duration: number) => void
  /** Builder: root entity mesh (for trimesh, includes wrapper with `userData.trimeshScene`). */
  getMeshForEntity: (entityId: string) => THREE.Mesh | null
  getEntityTriangleCount: (entityId: string) => number | null
  /** Live follow/orbit camera state for persisting avatar defaults (Builder). */
  getAvatarFocusSnapshot: () => AvatarFocusSnapshot | null
  /** Advance active play avatar when roster has 2+ members (Builder Digit1 / Numpad1). */
  cycleActiveAvatar: () => boolean
  /** Builder: world-space camera position, forward, vertical FOV (rad), aspect — null if camera not ready. */
  getCameraPose: () => SceneCameraPose | null
  /** Incrementally sync scene/registry/physics after document edits (add/remove/update entities). */
  syncWorldEntities: (prev: RennWorld, next: RennWorld) => Promise<void>
  /** Toggle native fullscreen for this scene host (Builder column or scene root). */
  toggleFullscreen: () => void
}

function SceneViewInner({
  world,
  cameraConfig,
  assets: _assets = new Map(),
  runPhysics = true,
  runScripts = true,
  className = '',
  selectedEntityIds = [],
  onSelectEntity,
  onEntityPoseCommit,
  gizmoMode = 'translate',
  version = 0,
  initialPosesRef,
  onPosesRestored,
  editNavigationMode = false,
  editorFreePoseRef,
  soundPlaybackCommand = null,
  performancePick = null,
  showGameHud = false,
  onFrameStatsClose,
  onCurrentAvatarChange,
  onTexturePaintStrokeEnd,
  pushUndoBeforePaintStroke,
  textureBrushRgb = DEFAULT_TEXTURE_BRUSH_RGB,
  textureBrushAlpha = 1,
  textureBrushRadiusPx = TEXTURE_PAINT_RADIUS_PX,
  getPaintTargetAssetId,
  prepareWorldPaintStroke,
  onFullscreenChange,
  fullscreenTargetRef,
  fullscreenChromeControl,
  shouldExitFullscreenOnEscape,
  playMode = false,
}: SceneViewProps, ref: React.Ref<SceneViewHandle>) {
  const sceneKey = useMemo(() => getSceneDependencyKey(world), [world])
  const sceneRootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<THREE.Scene | null>(null)
  const [camera, setCamera] = useState<THREE.PerspectiveCamera | null>(null)
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null)
  const cameraCtrlRef = useRef<CameraController | null>(null)
  const avatarSessionRef = useRef<AvatarSession | null>(null)
  const scriptRunnerRef = useRef<ScriptRunner | null>(null)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const registryRef = useRef<RenderItemRegistry | null>(null)
  const entitiesRef = useRef<LoadedEntity[]>([])
  const assetResolverRef = useRef<DisposableAssetResolver | null>(null)
  const timeRef = useRef(0)
  const frameRef = useRef<number>(0)
  const frameTimingRef = useRef<SceneFrameTiming | null>(null)
  const effectIdRef = useRef(0)
  const savedCameraStateRef = useRef<{
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    up: THREE.Vector3
  } | null>(null)
  const resizeHandlerRef = useRef<(() => void) | null>(null)

  const freeFlyKeysRef = useKeyboardInput()
  const rawKeyboardRef = useRawKeyboardInput()
  const rawWheelRef = useRawWheelInput(containerRef)
  const rawMouseDragRef = useRawMouseDrag(containerRef)
  const orbitWheelRef = useRef({ deltaX: 0, deltaY: 0, distanceDelta: 0 })
  const lastEditorPoseWriteTimeRef = useRef(0)

  const activeDebugForcesRef = useRef<ActiveDebugForce[]>([])

  const [playFrameStatsDismissed, setPlayFrameStatsDismissed] = useState(false)
  const shadowsEnabled = resolvedShadowsEnabled(world.world)
  const prevShowFrameStatsRef = useRef(world.world.showFrameStats === true)

  useEffect(() => {
    const cur = world.world.showFrameStats === true
    if (!prevShowFrameStatsRef.current && cur) {
      setPlayFrameStatsDismissed(false)
    }
    prevShowFrameStatsRef.current = cur
  }, [world.world.showFrameStats])

  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (!isKeyboardEventInEditableContext(e)) return
      const path = typeof e.composedPath === 'function' ? e.composedPath() : []
      for (const n of path) {
        if (n instanceof Element && n.hasAttribute(SUPPRESS_ESCAPE_SCENE_FOCUS_ATTR)) return
      }
      const host = containerRef.current
      if (!host) return
      const ae = document.activeElement
      if (ae instanceof HTMLElement) ae.blur()
      host.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => window.removeEventListener('keydown', onKeyDownCapture, true)
  }, [])

  const showFrameStatsOverlay =
    !playMode &&
    world.world.showFrameStats === true &&
    (onFrameStatsClose !== undefined ? true : !playFrameStatsDismissed)

  const handleFrameStatsClose = useCallback(() => {
    if (onFrameStatsClose) {
      onFrameStatsClose()
    } else {
      setPlayFrameStatsDismissed(true)
    }
  }, [onFrameStatsClose])

  const recordFrameStatsOverlayRef = useRef(false)
  recordFrameStatsOverlayRef.current = showFrameStatsOverlay

  const playModeRef = useRef(playMode)
  playModeRef.current = playMode

  const worldRef = useRef(world)
  worldRef.current = world
  const assetsRef = useRef(_assets)
  assetsRef.current = _assets
  const [registryEpoch, setRegistryEpoch] = useState(0)
  const [schemaLoadWarnings, setSchemaLoadWarnings] = useState<string[]>([])
  const dismissSchemaLoadWarnings = useCallback(() => setSchemaLoadWarnings([]), [])
  const [worldLoadError, setWorldLoadError] = useState<string | null>(null)
  const dismissWorldLoadError = useCallback(() => setWorldLoadError(null), [])
  /** Covers async loadWorld + sync GPU texture warm-up until the first animation frame is scheduled. */
  const [sceneBootstrapPending, setSceneBootstrapPending] = useState(true)
  const [scriptSnackbarMessage, setScriptSnackbarMessage] = useState<string | null>(null)
  const [hudScore, setHudScore] = useState(0)
  const [hudDamage, setHudDamage] = useState(0)
  const [hudDrive, setHudDrive] = useState({ speedMs: 0, wheelAngle: 0 })
  const lastHudDriveRef = useRef<{ speedMs: number; wheelAngle: number } | null>(null)
  const gizmoDraggingRef = useRef(false)
  const disposePickGizmoRef = useRef<(() => void) | null>(null)
  const syncGizmoAttachRef = useRef<(() => void) | null>(null)
  const selectedEntityIdsRef = useRef<string[]>([])
  const gizmoModeRef = useRef<BuilderGizmoMode>('translate')
  const onSelectEntityRef = useRef(onSelectEntity)
  const onEntityPoseCommitRef = useRef(onEntityPoseCommit)
  const onCurrentAvatarChangeRef = useRef(onCurrentAvatarChange)
  const onTexturePaintStrokeEndRef = useRef(onTexturePaintStrokeEnd)
  onTexturePaintStrokeEndRef.current = onTexturePaintStrokeEnd
  const pushUndoBeforePaintStrokeRef = useRef(pushUndoBeforePaintStroke)
  pushUndoBeforePaintStrokeRef.current = pushUndoBeforePaintStroke
  const textureBrushRgbRef = useRef<Vec3>(textureBrushRgb)
  textureBrushRgbRef.current = textureBrushRgb
  const textureBrushAlphaRef = useRef(textureBrushAlpha)
  textureBrushAlphaRef.current = textureBrushAlpha
  const textureBrushRadiusPxRef = useRef(textureBrushRadiusPx)
  textureBrushRadiusPxRef.current = textureBrushRadiusPx
  const getPaintTargetAssetIdRef = useRef(getPaintTargetAssetId)
  getPaintTargetAssetIdRef.current = getPaintTargetAssetId
  const prepareWorldPaintStrokeRef = useRef(prepareWorldPaintStroke)
  prepareWorldPaintStrokeRef.current = prepareWorldPaintStroke
  const editNavigationModeRef = useRef(editNavigationMode)
  editNavigationModeRef.current = editNavigationMode
  const runPhysicsRef = useRef(runPhysics)
  runPhysicsRef.current = runPhysics
  const runScriptsRef = useRef(runScripts)
  runScriptsRef.current = runScripts
  const showGameHudRef = useRef(showGameHud)
  showGameHudRef.current = showGameHud
  /** Stable bridge into latest HUD setters — avoids scene reload when toggling HUD visibility. */
  const hudPatchBridgeRef = useRef<(patch: HudPatch) => void>(() => {})
  hudPatchBridgeRef.current = (patch: HudPatch) => {
    if (patch.score !== undefined) setHudScore(patch.score)
    if (patch.damage !== undefined) setHudDamage(patch.damage)
  }
  const css2dRendererRef = useRef<CSS2DRenderer | null>(null)
  const variableOverlayControllerRef = useRef<VariableOverlayController | null>(null)
  const coordinateOverlayControllerRef = useRef<CoordinateOverlayController | null>(null)
  /** Last visualize-mode display entity id; used to clear coordinate lines on selection change only. */
  const coordinateOverlayDisplayVidRef = useRef<string | null>(null)

  const fullscreen = useSceneFullscreen({
    sceneRootRef,
    fullscreenTargetRef,
    onFullscreenChange,
    externalChromeControl: fullscreenChromeControl,
    shouldExitFullscreenOnEscape,
  })

  const { skyDomeRef } = useSkyDome({
    scene,
    skyboxAssetId: world.world.skybox,
    assets: _assets,
  })

  useWorldAudio({
    sound: world.world.sound,
    assets: _assets,
    playbackCommand: soundPlaybackCommand,
  })

  useEffect(() => {
    onCurrentAvatarChangeRef.current = onCurrentAvatarChange
  }, [onCurrentAvatarChange])

  selectedEntityIdsRef.current = selectedEntityIds
  gizmoModeRef.current = gizmoMode
  onSelectEntityRef.current = onSelectEntity
  onEntityPoseCommitRef.current = onEntityPoseCommit

  const selectionSyncKey = selectedEntityIds.join('\0')

  useEffect(() => {
    syncGizmoAttachRef.current?.()
  }, [selectionSyncKey, gizmoMode, sceneKey, registryEpoch])

  // Re-wire after full scene reload: main effect cleanup calls `setVariableOverlayFn(null)` when
  // `sceneKey` / `version` change (e.g. adding a transformer). Without re-running, Visualize would
  // stay active in the UI but the bridge would stay disconnected until gizmo mode toggled.
  useEffect(() => {
    if (playMode || gizmoMode !== 'visualize') {
      setVariableOverlayFn(null)
      return
    }
    setVariableOverlayFn(() => {})
    return () => {
      setVariableOverlayFn(null)
    }
  }, [playMode, gizmoMode, sceneKey, version])

  useEffect(() => {
    if (playMode || gizmoMode !== 'visualize') {
      setCoordinateOverlayFn(null)
      return
    }
    setCoordinateOverlayFn(() => {})
    return () => {
      setCoordinateOverlayFn(null)
    }
  }, [playMode, gizmoMode, sceneKey, version])

  useEffect(() => {
    const entities =
      playMode ? world.entities.map((e) => ({ ...e, showShapeWireframe: undefined })) : world.entities
    registryRef.current?.syncAllShapeWireframeOverlays(entities)
  }, [world, registryEpoch, playMode])

  const perfPickMode = performancePick?.mode
  const perfPickCb = performancePick?.onEntityPicked

  useEffect(() => {
    if (playMode || !perfPickMode || !scene || !camera || !renderer || !perfPickCb) return
    const dom = renderer.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setNdcFromPointerEvent(ndc, e, dom)
      raycaster.setFromCamera(ndc, camera)
      const roots = scene.children.filter((o) => o.userData?.entityId != null)
      const hits = raycaster.intersectObjects(roots, true)
      if (hits.length === 0) return
      const root = findEntityRootForPicking(hits[0]!.object)
      const id = root?.userData?.entityId
      if (typeof id === 'string') perfPickCb(id)
    }
    dom.addEventListener('pointerdown', onDown, { capture: true })
    return () => dom.removeEventListener('pointerdown', onDown, { capture: true })
  }, [playMode, scene, camera, renderer, perfPickMode, perfPickCb])

  const syncWorldEntities = useCallback(async (prev: RennWorld, next: RennWorld) => {
    const sceneObj = scene
    const registry = registryRef.current
    if (!sceneObj || !registry) return

    if (worldPipeRegistryChanged(prev, next)) {
      registry.setWorldPipeRegistry(next.transformers ?? {}, next.transformerPipes ?? {})
    }

    const { removedIds, added, updated } = diffEntityWorld(prev, next)

    for (const id of removedIds) {
      registry.removeEntity(id, sceneObj)
      scriptRunnerRef.current?.removeEntity(id)
      entitiesRef.current = entitiesRef.current.filter((entry) => entry.entity.id !== id)
    }

    for (const entity of added) {
      const loaded = await buildLoadedEntity(entity, assetResolverRef.current)
      sceneObj.add(loaded.mesh)
      registry.addLoadedEntity(entity, loaded.mesh, next.scripts)
      scriptRunnerRef.current?.addEntity(entity, next)
      scriptRunnerRef.current?.runOnSpawn(entity.id)
      entitiesRef.current.push(loaded)
    }

    const entitySceneOps = {
      updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => {
        if (pose.position) registry.setPosition(id, pose.position)
        if (pose.rotation) registry.setRotation(id, pose.rotation)
        if (pose.scale) registry.setScale(id, pose.scale)
      },
      updateEntityPhysics: (id: string, patch: EntityPhysicsPatch) => registry.updatePhysics(id, patch),
      updateEntityShape: (id: string, ent: Entity) => registry.updateShape(id, ent),
      updateEntityMaterial: async (id: string, ent: Entity) => {
        await registry.updateMaterial(id, ent, assetResolverRef.current ?? undefined)
      },
      updateEntityModelTransform: (
        id: string,
        patch: { modelPosition?: Vec3; modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean },
      ) => registry.setModelTransform(id, patch),
      refreshEntityAppearance: (id: string, ent: Entity) => registry.patchEntityAppearance(id, ent),
      syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) =>
        registry.syncEntityTransformers(id, configs),
    }

    for (const { prev: prevEntity, next: nextEntity } of updated) {
      syncEntityDocumentToScene(entitySceneOps, next, prevEntity, nextEntity)
      const idx = entitiesRef.current.findIndex((e) => e.entity.id === nextEntity.id)
      if (idx >= 0) {
        entitiesRef.current[idx] = { entity: nextEntity, mesh: entitiesRef.current[idx]!.mesh }
      }
    }

    avatarSessionRef.current?.syncWorld(next)
    registry.syncAllShapeWireframeOverlays(next.entities)
    setRegistryEpoch((n) => n + 1)
  }, [scene])

  const syncWorldEntitiesRef = useRef(syncWorldEntities)
  syncWorldEntitiesRef.current = syncWorldEntities

  useImperativeHandle(ref, () => ({
    setViewPreset: (preset: 'top' | 'front' | 'right') => {
      cameraCtrlRef.current?.setViewPreset(preset)
    },
    updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => {
      if (pose.position) registryRef.current?.setPosition(id, pose.position)
      if (pose.rotation) registryRef.current?.setRotation(id, pose.rotation)
      if (pose.scale) registryRef.current?.setScale(id, pose.scale)
    },
    updateEntityPhysics: (id: string, patch: EntityPhysicsPatch) => {
      registryRef.current?.updatePhysics(id, patch)
    },
    updateEntityShape: (id: string, entity: Entity) => {
      return registryRef.current?.updateShape(id, entity) ?? false
    },
    updateEntityMaterial: async (id: string, entity: Entity) => {
      await registryRef.current?.updateMaterial(id, entity, assetResolverRef.current ?? undefined)
    },
    updateEntityModelTransform: (
      id: string,
      patch: { modelPosition?: Vec3; modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean }
    ) => {
      registryRef.current?.setModelTransform(id, patch)
    },
    refreshEntityAppearance: (id: string, entity: Entity) => {
      registryRef.current?.patchEntityAppearance(id, entity)
    },
    syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) => {
      registryRef.current?.syncEntityTransformers(id, configs)
    },
    setWorldPipeRegistry: (transformers, transformerPipes) => {
      registryRef.current?.setWorldPipeRegistry(transformers, transformerPipes)
    },
    getAllPoses: () => registryRef.current?.getAllPoses() ?? null,
    resetCamera: () => {
      if (!camera) return
      
      // Clear saved camera state so it doesn't restore old position
      savedCameraStateRef.current = null
      if (editorFreePoseRef) editorFreePoseRef.current = null
      
      // Get default position and rotation from world config
      const camCfg = world.world.camera
      const defaultPos = camCfg?.defaultPosition ?? [0, 5, 10]
      const defaultRot = camCfg?.defaultRotation ?? DEFAULT_ROTATION
      
      // Reset camera position and rotation
      camera.position.set(defaultPos[0], defaultPos[1], defaultPos[2])
      const quat = eulerToQuaternion(defaultRot)
      camera.quaternion.copy(quat)
      camera.up.set(0, 1, 0)
      cameraCtrlRef.current?.resetFreeFlySmoothing()
    },
    applyDebugForce: (entityId: string, force: Vec3, duration: number) => {
      tryEnqueueDebugForce({
        physics: physicsRef.current,
        queue: activeDebugForcesRef.current,
        entityId,
        force,
        endTime: timeRef.current + duration,
      })
    },
    getMeshForEntity: (entityId: string) => registryRef.current?.get(entityId)?.mesh ?? null,
    getEntityTriangleCount: (entityId: string) => {
      const m = registryRef.current?.get(entityId)?.mesh
      if (!m) return null
      return countVisualModelTriangles(m)
    },
    getAvatarFocusSnapshot: () => cameraCtrlRef.current?.captureAvatarFocusState() ?? null,
    cycleActiveAvatar: () => {
      const session = avatarSessionRef.current
      if (!session || session.getRosterEntityIds().length < 2) return false
      session.cycleAvatar(1)
      return true
    },
    getCameraPose: (): SceneCameraPose | null => {
      const cam = camera
      if (!cam) return null
      return perspectiveCameraToSceneCameraPose(cam)
    },
    syncWorldEntities: (prev, next) => syncWorldEntitiesRef.current(prev, next),
    toggleFullscreen: () => fullscreen.toggle(),
  }), [camera, world.world.camera, editorFreePoseRef, fullscreen.toggle])

  const sceneRuntimeRestartKey = useMemo(
    () =>
      buildSceneRuntimeRestartKey({
        sceneKey,
        sceneVersion: version,
        shadowsEnabled,
        logarithmicDepthBuffer: world.world.logarithmicDepthBuffer,
        worldShadowsEnabled: world.world.shadowsEnabled,
        videoTextureMaxAnisotropy: world.world.videoTextureMaxAnisotropy,
        playMode,
      }),
    [
      sceneKey,
      version,
      shadowsEnabled,
      world.world.logarithmicDepthBuffer,
      world.world.shadowsEnabled,
      world.world.videoTextureMaxAnisotropy,
      playMode,
    ],
  )

  const sceneRuntimeHandles = useMemo(
    (): SceneRuntimeHandleBag => ({
      effectIdRef,
      assetResolverRef,
      entitiesRef,
      registryRef,
      cameraCtrlRef,
      avatarSessionRef,
      physicsRef,
      scriptRunnerRef,
      css2dRendererRef,
      variableOverlayControllerRef,
      coordinateOverlayControllerRef,
      frameRef,
      frameTimingRef,
      resizeHandlerRef,
      savedCameraStateRef,
      disposePickGizmoRef,
      syncGizmoAttachRef,
      gizmoDraggingRef,
      worldRef,
      assetsRef,
      playModeRef,
      editNavigationModeRef,
      runPhysicsRef,
      runScriptsRef,
      rawKeyboardRef,
      rawWheelRef,
      timeRef,
      recordFrameStatsOverlayRef,
      activeDebugForcesRef,
      freeFlyKeysRef,
      rawMouseDragRef,
      orbitWheelRef,
      editorFreePoseRef,
      lastEditorPoseWriteTimeRef,
      selectedEntityIdsRef,
      gizmoModeRef,
      onSelectEntityRef,
      onEntityPoseCommitRef,
      onCurrentAvatarChangeRef,
      onTexturePaintStrokeEndRef,
      pushUndoBeforePaintStrokeRef,
      textureBrushRgbRef,
      textureBrushAlphaRef,
      textureBrushRadiusPxRef,
      getPaintTargetAssetIdRef,
      prepareWorldPaintStrokeRef,
      showGameHudRef,
      hudPatchBridgeRef,
      lastHudDriveRef,
      skyDomeRef,
      coordinateOverlayDisplayVidRef,
    }),
    [editorFreePoseRef, freeFlyKeysRef],
  )

  const sceneRuntimeDeps = useMemo(() => createDefaultSceneRuntimeRuntimeDeps(), [])

  const sceneRuntimeHost = useMemo((): SceneRuntimeHostCallbacks => {
    const resetHud = (): void => {
      setHudScore(0)
      setHudDamage(0)
      lastHudDriveRef.current = null
      setHudDrive({ speedMs: 0, wheelAngle: 0 })
    }
    return {
      setSceneBootstrapPending,
      setScene,
      setCamera,
      setRenderer,
      setWorldLoadError,
      setSchemaLoadWarnings,
      setRegistryEpoch,
      setScriptSnackbarMessage,
      setHudScore,
      setHudDamage,
      setHudDrive,
      resetHud,
    }
  }, [])

  // Main scene setup effect
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const session = createSceneRuntimeSession(
      {
        world,
        restartKey: sceneRuntimeRestartKey,
        container,
        handles: sceneRuntimeHandles,
        host: sceneRuntimeHost,
        cameraConfig,
        runPhysics,
        runScripts,
        shadowsEnabled,
        initialPosesRef,
        onPosesRestored,
      },
      sceneRuntimeDeps,
    )
    session.start()
    return () => session.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart key mirrors legacy effect deps; world/cameraConfig read from closure like before
  }, [
    sceneKey,
    version,
    shadowsEnabled,
    freeFlyKeysRef,
    editorFreePoseRef,
    world.world.logarithmicDepthBuffer,
    world.world.shadowsEnabled,
    world.world.videoTextureMaxAnisotropy,
    playMode,
  ])


  // Update camera config when it changes (without reloading the world).
  // After setConfig, sync AvatarSession with `world` and re-apply follow focus so each avatar’s
  // persisted preferred (orbit angle, mode, control, distance) is not shared across targets.
  useEffect(() => {
    if (!cameraCtrlRef.current || !cameraConfig) return
    const ctrl = cameraCtrlRef.current
    const session = avatarSessionRef.current
    if (session) {
      session.syncWorld(world)
    }
    ctrl.setConfig(cameraConfig)
    if (session && runScriptsRef.current && runPhysicsRef.current && cameraConfig.control === 'follow' && cameraConfig.target) {
      session.setCurrentAvatar(cameraConfig.target)
    }
  }, [cameraConfig, world])

  // Update gravity when it changes
  useEffect(() => {
    if (!runPhysicsRef.current) return
    const pw = physicsRef.current
    if (!pw) return
    const gravity = world.world.gravity ?? DEFAULT_GRAVITY
    pw.setGravity(gravity)
  }, [world.world.gravity])

  // Update shadows when setting changes
  useEffect(() => {
    if (renderer) renderer.shadowMap.enabled = shadowsEnabled
    if (scene) {
      const sceneUserData = getSceneUserData(scene)
      if (sceneUserData.directionalLight) sceneUserData.directionalLight.castShadow = shadowsEnabled
    }
  }, [shadowsEnabled, renderer, scene])

  // Update pixel ratio when quality setting changes (no full reload needed)
  useEffect(() => {
    if (renderer) renderer.setPixelRatio(resolvedPixelRatio(world.world))
  }, [world.world.renderPixelRatio, renderer])

  // Update the directional shadow camera orthographic bounds when planes change.
  // Note: plane `scale`/`position` updates in the Builder do not trigger a full scene rebuild.
  useEffect(() => {
    if (!scene) return
    const sceneUserData = getSceneUserData(scene)
    const dirLight = sceneUserData.directionalLight
    if (!dirLight) return

    const extent = computeDirectionalShadowCameraExtent(world.entities)
    const shadowCam = dirLight.shadow.camera
    shadowCam.left = -extent
    shadowCam.right = extent
    shadowCam.top = extent
    shadowCam.bottom = -extent
    shadowCam.updateProjectionMatrix()
  }, [scene, world.entities])

  // Update sky color when it changes (without full reload)
  useEffect(() => {
    if (!scene) return
    const skyColor = world.world.skyColor
    if (skyColor) {
      const [r, g, b] = skyColor
      scene.background = new THREE.Color(r, g, b)
    }
  }, [world.world.skyColor, scene])

  // Update fog when it changes (without full reload)
  useEffect(() => {
    if (!scene) return
    applySceneFog(scene, resolveFogSettings(world.world.fog, world.world.skyColor))
  }, [world.world.fog, world.world.skyColor, scene])

  const allowInternalFsChromePointer = fullscreen.supported && !fullscreen.useExternalChrome
  return (
    <div
      ref={sceneRootRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
      onPointerMove={allowInternalFsChromePointer ? fullscreen.bumpChrome : undefined}
      onPointerDown={allowInternalFsChromePointer ? fullscreen.bumpChrome : undefined}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        {...{ [BUILDER_SCENE_CANVAS_HOST_ATTR]: true }}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          outline: 'none',
          overscrollBehavior: 'none',
          touchAction: 'none',
        }}
      />
      {sceneBootstrapPending ? (
        <div
          data-testid="scene-bootstrap-loading"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            background: '#171a22',
            color: '#e6e9f2',
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>Loading scene…</p>
          <IndeterminateLoadingBar />
        </div>
      ) : null}
      {worldLoadError !== null ? (
        <WorldLoadErrorOverlay message={worldLoadError} onDismiss={dismissWorldLoadError} />
      ) : null}
      {scriptSnackbarMessage !== null ? <ScriptSnackbar message={scriptSnackbarMessage} /> : null}
      {showGameHud ? (
        <GameHud score={hudScore} damage={hudDamage} speedMs={hudDrive.speedMs} wheelAngle={hudDrive.wheelAngle} />
      ) : null}
      {showFrameStatsOverlay ? (
        <FrameStatsOverlay frameTimingRef={frameTimingRef} onClose={handleFrameStatsClose} />
      ) : null}
      <WarningSnackbar messages={schemaLoadWarnings} onDismiss={dismissSchemaLoadWarnings} />
      {fullscreen.supported ? (
        <SceneFullscreenButton
          active={fullscreen.active}
          visible={fullscreen.chromeVisible}
          onToggle={fullscreen.toggle}
          onReturnFocusToScene={() => {
            containerRef.current?.focus({ preventScroll: true })
          }}
        />
      ) : null}
    </div>
  )
}

const SceneView = forwardRef<SceneViewHandle, SceneViewProps>(SceneViewInner)
SceneView.displayName = 'SceneView'
export default SceneView
