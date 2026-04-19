import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
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
  resolveSimulationSettings,
  resolvedLogarithmicDepthBuffer,
} from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI, type HudPatch } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { restoreInitialPosesIntoRegistry } from '@/runtime/restoreInitialPoses'
import { runSceneFrame, advanceSemiFixedAccumulator } from '@/runtime/sceneFrameLoop'
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
  installBuilderPickAndGizmo,
  type BuilderGizmoMode,
  type BuilderPoseCommitEntry,
  type TexturePaintStrokePayload,
} from '@/editor/transformGizmoController'
import { getSceneUserData } from '@/types/sceneUserData'
import { useRawKeyboardInput, useRawWheelInput, getRawInputSnapshot } from '@/input/rawInput'
import { useRawMouseDrag } from '@/input/rawMouseDrag'
import type { TransformerConfig } from '@/types/transformer'
import { BUILDER_SCENE_CANVAS_HOST_ATTR } from '@/config/constants'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import { computeDirectionalShadowCameraExtent } from '@/utils/shadowBounds'
import { countVisualModelTriangles } from '@/utils/geometryExtractor'
import { findEntityRootForPicking } from '@/utils/entityPicking'
import { ScriptSnackbar } from '@/components/ScriptSnackbar'
import { GameHud } from '@/components/GameHud'
import { FrameStatsOverlay } from '@/components/FrameStatsOverlay'
import { WarningSnackbar } from '@/components/WarningSnackbar'
import { AvatarSession } from '@/runtime/avatarSession'
export interface SceneViewProps {
  world: RennWorld
  cameraConfig?: CameraConfig
  assets?: Map<string, Blob>
  runPhysics?: boolean
  runScripts?: boolean
  shadowsEnabled?: boolean
  className?: string
  selectedEntityIds?: string[]
  onSelectEntity?: (entityId: string | null, options?: { additive?: boolean }) => void
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
}

export type EntityPhysicsPatch = Partial<Pick<Entity, 'mass' | 'restitution' | 'friction' | 'linearDamping' | 'angularDamping' | 'bodyType'>>

export interface SceneViewHandle {
  setViewPreset: (preset: 'top' | 'front' | 'right') => void
  updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => void
  updateEntityPhysics: (id: string, patch: EntityPhysicsPatch) => void
  /** Hot-swaps geometry and rebuilds collider. Returns false for trimesh (caller must rebuild). */
  updateEntityShape: (id: string, entity: Entity) => boolean
  /** Replaces the mesh material asynchronously (fire-and-forget; texture loading may defer). */
  updateEntityMaterial: (id: string, entity: Entity) => Promise<void>
  /** Applies model rotation/scale to the mesh and rebuilds trimesh collider; avoids full reload. */
  updateEntityModelTransform: (id: string, patch: { modelRotation?: Rotation; modelScale?: Vec3 }) => void
  /** Sync entity.transformers to runtime chain (e.g. enabled flags) without scene reload. */
  syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) => void
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
}

function SceneViewInner({
  world,
  cameraConfig,
  assets: _assets = new Map(),
  runPhysics = true,
  runScripts = true,
  shadowsEnabled = true,
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

  // Active debug forces: { entityId, force, endTime }[]
  const activeDebugForcesRef = useRef<Array<{ entityId: string; force: Vec3; endTime: number }>>([])

  const [playFrameStatsDismissed, setPlayFrameStatsDismissed] = useState(false)
  const prevShowFrameStatsRef = useRef(world.world.showFrameStats === true)

  useEffect(() => {
    const cur = world.world.showFrameStats === true
    if (!prevShowFrameStatsRef.current && cur) {
      setPlayFrameStatsDismissed(false)
    }
    prevShowFrameStatsRef.current = cur
  }, [world.world.showFrameStats])

  const showFrameStatsOverlay =
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

  const worldRef = useRef(world)
  worldRef.current = world
  const assetsRef = useRef(_assets)
  assetsRef.current = _assets
  const [registryEpoch, setRegistryEpoch] = useState(0)
  const [schemaLoadWarnings, setSchemaLoadWarnings] = useState<string[]>([])
  const dismissSchemaLoadWarnings = useCallback(() => setSchemaLoadWarnings([]), [])
  const [worldLoadError, setWorldLoadError] = useState<string | null>(null)
  const dismissWorldLoadError = useCallback(() => setWorldLoadError(null), [])
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
  const showGameHudRef = useRef(showGameHud)
  showGameHudRef.current = showGameHud

  const fullscreen = useSceneFullscreen({
    sceneRootRef,
    fullscreenTargetRef,
    onFullscreenChange,
    externalChromeControl: fullscreenChromeControl,
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

  useEffect(() => {
    registryRef.current?.syncAllShapeWireframeOverlays(world.entities)
  }, [world, registryEpoch])

  const perfPickMode = performancePick?.mode
  const perfPickCb = performancePick?.onEntityPicked

  useEffect(() => {
    if (!perfPickMode || !scene || !camera || !renderer || !perfPickCb) return
    const dom = renderer.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = dom.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
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
  }, [scene, camera, renderer, perfPickMode, perfPickCb])

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
    updateEntityModelTransform: (id: string, patch: { modelRotation?: Rotation; modelScale?: Vec3 }) => {
      registryRef.current?.setModelTransform(id, patch)
    },
    syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) => {
      registryRef.current?.syncEntityTransformers(id, configs)
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
      if (!physicsRef.current) {
        console.warn('[SceneView] Cannot apply debug force: physics world not initialized')
        return
      }
      
      // Check if entity exists and is dynamic
      const body = physicsRef.current.getBody(entityId)
      if (!body || !body.isDynamic()) {
        console.warn(`[SceneView] Cannot apply debug force: entity "${entityId}" is not dynamic`)
        return
      }
      
      const endTime = timeRef.current + duration
      activeDebugForcesRef.current.push({ entityId, force, endTime })
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
  }), [camera, world.world.camera, editorFreePoseRef])

  // Main scene setup effect
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Increment effect ID to detect stale async operations
    effectIdRef.current += 1
    const currentEffectId = effectIdRef.current

    // Dispose previous asset resolver if it exists
    if (assetResolverRef.current) {
      assetResolverRef.current.dispose()
      assetResolverRef.current = null
    }

    let cancelled = false
    let scriptSnackbarTimerId: number | undefined
    let cam: THREE.PerspectiveCamera | null = null
    let rend: THREE.WebGLRenderer | null = null
    let cameraCtrl: CameraController | null = null
    let ro: ResizeObserver | null = null
    let removeAvatarKeydown: (() => void) | undefined

    setSchemaLoadWarnings([])
    setWorldLoadError(null)
    setHudScore(0)
    setHudDamage(0)

    // Load world asynchronously with assets (getter keeps blob URLs valid for VideoTextures after load)
    loadWorld(world, () => assetsRef.current).then(({ scene: loadedScene, entities, world: loadedWorld, assetResolver, warnings }) => {
      // Check if this effect is still active
      if (cancelled || effectIdRef.current !== currentEffectId) {
        // Dispose resolver if effect was cancelled
        if (assetResolver) {
          assetResolver.dispose()
        }
        return
      }

      setWorldLoadError(null)

      if (warnings.length > 0) {
        setSchemaLoadWarnings(warnings)
      }

      entitiesRef.current = entities
      setScene(loadedScene)
      assetResolverRef.current = assetResolver

      // Camera setup
      cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      
      const currentCameraConfig = cameraConfig ?? world.world.camera
      const controlMode = currentCameraConfig?.control ?? 'free'
      const useFreePlacement =
        controlMode === 'free' || editNavigationModeRef.current
      const sessionSaved = savedCameraStateRef.current
      const shouldRestoreSession = Boolean(sessionSaved && useFreePlacement)
      const editorPose = currentCameraConfig?.editorFreePose

      if (shouldRestoreSession && sessionSaved) {
        cam.position.copy(sessionSaved.position)
        cam.quaternion.copy(sessionSaved.quaternion)
        cam.up.copy(sessionSaved.up)
      } else if (useFreePlacement && editorPose) {
        const [px, py, pz] = editorPose.position
        cam.position.set(px, py, pz)
        const [qx, qy, qz, qw] = editorPose.quaternion
        cam.quaternion.set(qx, qy, qz, qw)
        cam.up.set(0, 1, 0)
      } else if (currentCameraConfig?.defaultPosition) {
        const [px, py, pz] = currentCameraConfig.defaultPosition
        cam.position.set(px, py, pz)
        const quat = eulerToQuaternion(currentCameraConfig.defaultRotation ?? DEFAULT_ROTATION)
        cam.quaternion.copy(quat)
        cam.up.set(0, 1, 0)
      } else {
        cam.position.set(0, 5, 10)
        cam.lookAt(0, 0, 0)
      }
      setCamera(cam)

      const getEntityPosition = (entityId: string): THREE.Vector3 | null => {
        const reg = registryRef.current
        if (reg) return reg.getPositionAsVector3(entityId) ?? null
        const obj = loadedScene.getObjectByName(entityId)
        return obj instanceof THREE.Mesh ? obj.position.clone() : null
      }

      const getEntityQuaternion = (entityId: string): THREE.Quaternion | null => {
        const reg = registryRef.current
        if (reg) return reg.getRotationAsQuaternion(entityId) ?? null
        return null
      }

      cameraCtrl = new CameraController({
        camera: cam,
        scene: loadedScene,
        getEntityPosition,
        getEntityQuaternion,
      })
      cameraCtrl.resetFreeFlySmoothing()
      cameraCtrlRef.current = cameraCtrl

      let controlledEntityIdRef: { current: string | null } | undefined
      let avatarSession: AvatarSession | null = null
      if (runScripts && runPhysics) {
        const ref: { current: string | null } = { current: null }
        controlledEntityIdRef = ref
        avatarSession = new AvatarSession({
          entities: loadedWorld.entities,
          worldCamera: (cameraConfig ?? loadedWorld.world.camera) as CameraConfig | undefined,
          getCameraController: () => cameraCtrl,
          controlledEntityIdRef: ref,
          onCurrentAvatarChange: (id) => onCurrentAvatarChangeRef.current?.(id),
        })
        avatarSessionRef.current = avatarSession
      }

      const getPhysicsWorld = () => physicsRef.current
      const getRenderItemRegistry = () => registryRef.current
      const getPositionForGame = (id: string): Vec3 | null =>
        registryRef.current?.getPosition(id) ?? null
      const setPositionForGame = (id: string, x: number, y: number, z: number): void =>
        registryRef.current?.setPosition(id, [x, y, z])
      const getRotationForGame = (id: string): Vec3 | null =>
        registryRef.current?.getRotation(id) ?? null
      const setRotationForGame = (id: string, x: number, y: number, z: number): void =>
        registryRef.current?.setRotation(id, [x, y, z])
      const getUpVectorForGame = (id: string): Vec3 | null =>
        registryRef.current?.getUpVector(id) ?? null
      const getForwardVectorForGame = (id: string): Vec3 | null =>
        registryRef.current?.getForwardVector(id) ?? null
      const onScriptSnackbar = (message: string, durationSeconds: number) => {
        if (scriptSnackbarTimerId !== undefined) {
          window.clearTimeout(scriptSnackbarTimerId)
          scriptSnackbarTimerId = undefined
        }
        setScriptSnackbarMessage(message)
        const ms = durationSeconds * 1000
        scriptSnackbarTimerId = window.setTimeout(() => {
          scriptSnackbarTimerId = undefined
          setScriptSnackbarMessage(null)
        }, ms)
      }
      const onHudPatch = showGameHud
        ? (patch: HudPatch) => {
            if (patch.score !== undefined) setHudScore(patch.score)
            if (patch.damage !== undefined) setHudDamage(patch.damage)
          }
        : undefined
      const gameApi = createGameAPI(
        getPositionForGame,
        setPositionForGame,
        getRotationForGame,
        setRotationForGame,
        getUpVectorForGame,
        getForwardVectorForGame,
        getPhysicsWorld,
        getRenderItemRegistry,
        loadedWorld.entities,
        timeRef,
        onScriptSnackbar,
        onHudPatch,
        avatarSession,
      )
      const scriptRunner = new ScriptRunner(loadedWorld, gameApi, (id) => {
        const obj = loadedScene.getObjectByName(id)
        return obj instanceof THREE.Mesh ? obj : null
      }, entities)
      scriptRunnerRef.current = scriptRunner
      for (const { entity } of entities) {
        scriptRunner.runOnSpawn(entity.id)
      }

      rend = new THREE.WebGLRenderer({
        antialias: true,
        logarithmicDepthBuffer: resolvedLogarithmicDepthBuffer(world.world),
      })
      const w = Math.max(container.clientWidth || 800, 1)
      const h = Math.max(container.clientHeight || 600, 1)
      rend.setSize(w, h)
      rend.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      rend.shadowMap.enabled = shadowsEnabled
      rend.shadowMap.type = THREE.PCFSoftShadowMap
      container.appendChild(rend.domElement)
      setRenderer(rend)

      const sceneUserData = getSceneUserData(loadedScene)
      if (sceneUserData.directionalLight) sceneUserData.directionalLight.castShadow = shadowsEnabled
      cam.aspect = w / h
      cam.updateProjectionMatrix()

      const installPickGizmoIfBuilder = (): void => {
        if (cancelled || effectIdRef.current !== currentEffectId) return
        if (!onSelectEntityRef.current || !onEntityPoseCommitRef.current) return
        if (!cam || !rend) return
        if (!registryRef.current) return
        disposePickGizmoRef.current?.()
        const { dispose, syncAttach } = installBuilderPickAndGizmo({
          scene: loadedScene,
          camera: cam,
          domElement: rend.domElement,
          getRegistry: () => registryRef.current,
          getEntity: (id) => worldRef.current.entities.find((e) => e.id === id),
          getSelectedIds: () => selectedEntityIdsRef.current,
          getGizmoMode: () => gizmoModeRef.current,
          onSelectEntity: (id, opts) => onSelectEntityRef.current?.(id, opts),
          onPoseCommit: (commits) => onEntityPoseCommitRef.current?.(commits),
          setGizmoDragging: (d) => {
            gizmoDraggingRef.current = d
          },
          texturePaint: {
            getAssets: () => assetsRef.current,
            getBrushRgba: () => {
              const c = textureBrushRgbRef.current
              const a = textureBrushAlphaRef.current
              const ac = a < 0 ? 0 : a > 1 ? 1 : a
              return [c[0], c[1], c[2], ac] as const
            },
            getBrushRadiusPx: () => textureBrushRadiusPxRef.current,
            getPaintTargetAssetId: (entityId: string) =>
              getPaintTargetAssetIdRef.current?.(entityId) ?? null,
            prepareWorldPaintStroke: (entityId: string) =>
              prepareWorldPaintStrokeRef.current?.(entityId) ?? Promise.resolve(null),
            pushUndoBeforePaintStroke: () => pushUndoBeforePaintStrokeRef.current?.(),
            onStrokeEnd: (payload) => onTexturePaintStrokeEndRef.current?.(payload),
          },
        })
        disposePickGizmoRef.current = dispose
        syncGizmoAttachRef.current = syncAttach
        syncAttach()
      }

      // Initialize physics
      if (runPhysics) {
        const gravity = loadedWorld.world.gravity ?? DEFAULT_GRAVITY
        import('@/physics/rapierPhysics').then((mod) => {
          mod.createPhysicsWorld(loadedWorld, entities).then((pw) => {
            // Check if this effect is still active
            if (cancelled || effectIdRef.current !== currentEffectId) {
              pw.dispose()
              return
            }
            pw.setGravity(gravity)
            physicsRef.current = pw
            const rawInputGetter = () => getRawInputSnapshot(rawKeyboardRef, rawWheelRef)
            const registry = RenderItemRegistry.create(
              entities,
              pw,
              rawInputGetter,
              controlledEntityIdRef,
            )
            if (!cancelled && effectIdRef.current === currentEffectId) {
              registryRef.current = registry
              restoreInitialPosesIntoRegistry(registry, initialPosesRef, onPosesRestored)
              installPickGizmoIfBuilder()
              setRegistryEpoch((n) => n + 1)
            }
          })
        })
      } else {
        const rawInputGetter = () => getRawInputSnapshot(rawKeyboardRef, rawWheelRef)
        const registry = RenderItemRegistry.create(entities, null, rawInputGetter, controlledEntityIdRef)
        if (!cancelled && effectIdRef.current === currentEffectId) {
          registryRef.current = registry
          restoreInitialPosesIntoRegistry(registry, initialPosesRef, onPosesRestored)
          installPickGizmoIfBuilder()
          setRegistryEpoch((n) => n + 1)
        }
      }

      // Semi-fixed timestep: accumulator in rAF; see `resolveSimulationSettings` / World panel.
      let lastRafTime: number | null = null
      let simAccumulator = 0

      const animate = (rafTime: number): void => {
        if (cancelled) return
        frameRef.current = requestAnimationFrame(animate)

        const sim = resolveSimulationSettings(worldRef.current.world.simulation)
        const { fixedDt, maxStepsPerFrame, timeScale } = sim
        const recordStats = recordFrameStatsOverlayRef.current

        const rawElapsed = lastRafTime == null ? 0 : Math.max(0, (rafTime - lastRafTime) / 1000)
        lastRafTime = rafTime
        const elapsedSec = rawElapsed * timeScale

        const { accumulator: nextAcc, stepsToRun } = advanceSemiFixedAccumulator({
          accumulator: simAccumulator,
          elapsedSec,
          fixedDt,
          maxStepsPerFrame,
        })
        simAccumulator = nextAcc
        const clampedElapsed = Math.min(
          Math.max(0, elapsedSec),
          maxStepsPerFrame * fixedDt,
        )

        const tickStart = recordStats ? performance.now() : 0

        const pushFrame = (opts: {
          fixedDt: number
          skipSimulation: boolean
          variableFrameDt: number
          skipRender: boolean
        }): void => {
          runSceneFrame({
            isCancelled: () => cancelled,
            fixedDt: opts.fixedDt,
            skipSimulation: opts.skipSimulation,
            variableFrameDt: opts.variableFrameDt,
            skipRender: opts.skipRender,
            timeRef,
            rawWheelRef,
            orbitWheelRef,
            editNavigationModeRef,
            cameraCtrlRef,
            physicsRef,
            runPhysics,
            activeDebugForcesRef,
            registryRef,
            rawKeyboardRef,
            worldRef,
            scriptRunnerRef,
            runScripts,
            freeFlyKeysRef,
            rawMouseDragRef,
            gizmoDraggingRef,
            selectedEntityIdsRef,
            editorFreePoseRef,
            cam,
            lastEditorPoseWriteTimeRef,
            showGameHud,
            lastHudDriveRef,
            setHudDrive,
            skyDomeRef,
            rend,
            loadedScene,
            recordFrameTiming: recordStats,
            frameTimingRef,
          })
        }

        if (stepsToRun === 0) {
          pushFrame({
            fixedDt: 0,
            skipSimulation: true,
            variableFrameDt: clampedElapsed,
            skipRender: false,
          })
        } else {
          for (let i = 0; i < stepsToRun; i++) {
            pushFrame({
              fixedDt,
              skipSimulation: false,
              variableFrameDt: 0,
              skipRender: i < stepsToRun - 1,
            })
          }
        }

        if (recordStats) {
          const snap = frameTimingRef.current
          if (snap) {
            snap.frameMs = performance.now() - tickStart
          }
        }
      }
      frameRef.current = requestAnimationFrame(animate)

      if (avatarSession) {
        const onAvatarKeyDown = (e: KeyboardEvent): void => {
          if (!showGameHudRef.current) return
          if (avatarSession!.getRosterEntityIds().length < 2) return
          const t = e.target
          if (t instanceof HTMLElement) {
            const tag = t.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return
          }
          if (e.code === 'Equal' || e.code === 'NumpadAdd') {
            e.preventDefault()
            avatarSession!.cycleAvatar(1)
          } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
            e.preventDefault()
            avatarSession!.cycleAvatar(-1)
          }
        }
        window.addEventListener('keydown', onAvatarKeyDown)
        removeAvatarKeydown = () => window.removeEventListener('keydown', onAvatarKeyDown)
      }

      // Resize handling
      const onResize = (): void => {
        if (!container || !cam || !rend) return
        const w = Math.max(container.clientWidth || 1, 1)
        const h = Math.max(container.clientHeight || 1, 1)
        cam.aspect = w / h
        cam.updateProjectionMatrix()
        rend.setSize(w, h)
      }
      resizeHandlerRef.current = onResize
      window.addEventListener('resize', onResize)
      ro = new ResizeObserver(onResize)
      ro.observe(container)
    }).catch((err) => {
      if (!cancelled) {
        console.error('Failed to load world:', err)
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Unknown error while loading the world.'
        setWorldLoadError(msg)
      }
    })

    return () => {
      // Set cancelled first to stop animation loop
      cancelled = true

      if (scriptSnackbarTimerId !== undefined) {
        window.clearTimeout(scriptSnackbarTimerId)
        scriptSnackbarTimerId = undefined
      }
      setScriptSnackbarMessage(null)
      setHudScore(0)
      setHudDamage(0)
      lastHudDriveRef.current = null
      setHudDrive({ speedMs: 0, wheelAngle: 0 })

      disposePickGizmoRef.current?.()
      disposePickGizmoRef.current = null
      syncGizmoAttachRef.current = null
      gizmoDraggingRef.current = false

      // `useSkyDome` and `useWorldAudio` own their own dispose; they re-run when
      // `scene` flips to null (below) and on hook unmount.

      // Dispose asset resolver
      if (assetResolverRef.current) {
        assetResolverRef.current.dispose()
        assetResolverRef.current = null
      }
      
      // Save camera pose after free-fly or edit-navigation (same-session rebuild / restore).
      if (cam && cameraCtrl) {
        const config = cameraCtrl.getConfig()
        const saveFreePose =
          editNavigationModeRef.current || (config.control ?? 'free') === 'free'
        if (saveFreePose) {
          savedCameraStateRef.current = {
            position: cam.position.clone(),
            quaternion: cam.quaternion.clone(),
            up: cam.up.clone(),
          }
        }
      }
      
      // Clear physics ref IMMEDIATELY to stop animation loop from using it
      const pw = physicsRef.current
      physicsRef.current = null
      
      // Cancel animation frame and remove event listeners
      cancelAnimationFrame(frameRef.current)
      removeAvatarKeydown?.()
      if (ro) {
        ro.disconnect()
      }
      const resizeHandler = resizeHandlerRef.current
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler)
        resizeHandlerRef.current = null
      }
      
      // Clear refs immediately to prevent any further use
      avatarSessionRef.current = null
      cameraCtrlRef.current = null
      scriptRunnerRef.current = null
      
      // Clear registry
      registryRef.current?.clear()
      registryRef.current = null
      
      // Clear debug forces
      activeDebugForcesRef.current = []
      
      // Dispose physics world (after animation loop is stopped)
      if (pw) {
        try {
          pw.dispose()
        } catch (e) {
          console.warn('Error disposing physics world:', e)
        }
      }
      
      // Clean up renderer
      if (rend) {
        try {
          rend.dispose()
          if (container && rend.domElement.parentNode === container) {
            container.removeChild(rend.domElement)
          }
        } catch (e) {
          console.warn('Error disposing renderer:', e)
        }
      }
      
      // Clear state
      setScene(null)
      setCamera(null)
      setRenderer(null)
    }
  }, [
    sceneKey,
    version,
    runPhysics,
    runScripts,
    shadowsEnabled,
    freeFlyKeysRef,
    editorFreePoseRef,
    showGameHud,
    world.world.logarithmicDepthBuffer,
    world.world.videoTextureMaxAnisotropy,
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
    if (session && runScripts && runPhysics && cameraConfig.control === 'follow' && cameraConfig.target) {
      session.setCurrentAvatar(cameraConfig.target)
    }
  }, [cameraConfig, world, runScripts, runPhysics])

  // Update gravity when it changes
  useEffect(() => {
    if (!runPhysics) return
    const pw = physicsRef.current
    if (!pw) return
    const gravity = world.world.gravity ?? DEFAULT_GRAVITY
    pw.setGravity(gravity)
  }, [world.world.gravity, runPhysics])

  // Update shadows when setting changes
  useEffect(() => {
    if (renderer) renderer.shadowMap.enabled = shadowsEnabled
    if (scene) {
      const sceneUserData = getSceneUserData(scene)
      if (sceneUserData.directionalLight) sceneUserData.directionalLight.castShadow = shadowsEnabled
    }
  }, [shadowsEnabled, renderer, scene])

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
        {...{ [BUILDER_SCENE_CANVAS_HOST_ATTR]: true }}
        style={{ width: '100%', height: '100%' }}
      />
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
        />
      ) : null}
    </div>
  )
}

const SceneView = forwardRef<SceneViewHandle, SceneViewProps>(SceneViewInner)
SceneView.displayName = 'SceneView'
export default SceneView
