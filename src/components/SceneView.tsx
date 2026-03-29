import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import type { RennWorld, Vec3, Rotation, CameraConfig, Entity, EditorFreePose } from '@/types/world'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import { DEFAULT_GRAVITY, DEFAULT_ROTATION } from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI, type HudPatch } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { restoreInitialPosesIntoRegistry } from '@/runtime/restoreInitialPoses'
import { runSceneFrame, SCENE_FIXED_DT } from '@/runtime/sceneFrameLoop'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import {
  installBuilderPickAndGizmo,
  type BuilderGizmoMode,
  type BuilderPoseCommitEntry,
} from '@/editor/transformGizmoController'
import { getSceneUserData } from '@/types/sceneUserData'
import { useRawKeyboardInput, useRawWheelInput, getRawInputSnapshot } from '@/input/rawInput'
import { useRawMouseDrag } from '@/input/rawMouseDrag'
import type { TransformerConfig } from '@/types/transformer'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import { computeDirectionalShadowCameraExtent } from '@/utils/shadowBounds'
import { countVisualModelTriangles } from '@/utils/geometryExtractor'
import { findEntityRootForPicking } from '@/utils/entityPicking'
import { ScriptSnackbar } from '@/components/ScriptSnackbar'
import { GameHud } from '@/components/GameHud'
import { WarningSnackbar } from '@/components/WarningSnackbar'

/** Radius inside camera far plane (PerspectiveCamera default far = 1000). */
const SKY_DOME_RADIUS = 500

function disposeSkyDomeMesh(mesh: THREE.Mesh | null): void {
  if (!mesh) return
  mesh.removeFromParent()
  mesh.geometry.dispose()
  const mat = mesh.material
  if (mat instanceof THREE.MeshBasicMaterial) {
    mat.map?.dispose()
    mat.dispose()
  }
}

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
  soundPlaybackCommand?: { action: 'play' | 'stop'; nonce: number } | null
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
}: SceneViewProps, ref: React.Ref<SceneViewHandle>) {
  const sceneKey = useMemo(() => getSceneDependencyKey(world), [world])
  const containerRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<THREE.Scene | null>(null)
  const [camera, setCamera] = useState<THREE.PerspectiveCamera | null>(null)
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null)
  const cameraCtrlRef = useRef<CameraController | null>(null)
  const scriptRunnerRef = useRef<ScriptRunner | null>(null)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const registryRef = useRef<RenderItemRegistry | null>(null)
  const entitiesRef = useRef<LoadedEntity[]>([])
  const assetResolverRef = useRef<DisposableAssetResolver | null>(null)
  const skyDomeRef = useRef<THREE.Mesh | null>(null)
  const worldAudioRef = useRef<HTMLAudioElement | null>(null)
  const worldAudioUrlRef = useRef<string | null>(null)
  const timeRef = useRef(0)
  const frameRef = useRef<number>(0)
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

  const worldRef = useRef(world)
  worldRef.current = world
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
  const editNavigationModeRef = useRef(editNavigationMode)
  editNavigationModeRef.current = editNavigationMode

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
    let scriptSnackbarTimerId: ReturnType<typeof window.setTimeout> | undefined
    let cam: THREE.PerspectiveCamera | null = null
    let rend: THREE.WebGLRenderer | null = null
    let cameraCtrl: CameraController | null = null
    let ro: ResizeObserver | null = null

    setSchemaLoadWarnings([])
    setWorldLoadError(null)
    setHudScore(0)
    setHudDamage(0)

    // Load world asynchronously with assets
    loadWorld(world, _assets).then(({ scene: loadedScene, entities, world: loadedWorld, assetResolver, warnings }) => {
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
        onHudPatch
      )
      const scriptRunner = new ScriptRunner(loadedWorld, gameApi, (id) => {
        const obj = loadedScene.getObjectByName(id)
        return obj instanceof THREE.Mesh ? obj : null
      }, entities)
      scriptRunnerRef.current = scriptRunner
      for (const { entity } of entities) {
        scriptRunner.runOnSpawn(entity.id)
      }

      rend = new THREE.WebGLRenderer({ antialias: true })
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
            const registry = RenderItemRegistry.create(entities, pw, rawInputGetter)
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
        const registry = RenderItemRegistry.create(entities, null, rawInputGetter)
        if (!cancelled && effectIdRef.current === currentEffectId) {
          registryRef.current = registry
          restoreInitialPosesIntoRegistry(registry, initialPosesRef, onPosesRestored)
          installPickGizmoIfBuilder()
          setRegistryEpoch((n) => n + 1)
        }
      }

      // Animation loop (per-frame logic in runtime/sceneFrameLoop.ts)
      const animate = (): void => {
        if (cancelled) return
        frameRef.current = requestAnimationFrame(animate)
        runSceneFrame({
          isCancelled: () => cancelled,
          fixedDt: SCENE_FIXED_DT,
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
        })
      }
      animate()

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
      
      if (skyDomeRef.current) {
        disposeSkyDomeMesh(skyDomeRef.current)
        skyDomeRef.current = null
      }
      if (worldAudioRef.current) {
        worldAudioRef.current.pause()
        worldAudioRef.current.src = ''
        worldAudioRef.current = null
      }
      if (worldAudioUrlRef.current) {
        URL.revokeObjectURL(worldAudioUrlRef.current)
        worldAudioUrlRef.current = null
      }

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
      if (ro) {
        ro.disconnect()
      }
      const resizeHandler = resizeHandlerRef.current
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler)
        resizeHandlerRef.current = null
      }
      
      // Clear refs immediately to prevent any further use
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
  }, [sceneKey, version, runPhysics, runScripts, shadowsEnabled, freeFlyKeysRef, editorFreePoseRef, showGameHud])

  // Update camera config when it changes (without reloading the world)
  useEffect(() => {
    if (!cameraCtrlRef.current || !cameraConfig) return
    cameraCtrlRef.current.setConfig(cameraConfig)
  }, [cameraConfig])

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

  // Sky dome from `world.world.skybox` texture asset id (incremental; no full scene rebuild).
  // Load from `_assets` (not only assetResolverRef) so textures uploaded after the last full load resolve correctly.
  useEffect(() => {
    if (!scene) {
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
      return
    }

    const skyboxId = world.world.skybox?.trim()
    if (!skyboxId) {
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
      return
    }

    const blob = _assets.get(skyboxId)
    if (!blob) {
      console.warn(`[SceneView] Skybox asset id not in project assets map: ${skyboxId}`)
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
      return
    }

    let cancelled = false
    const loader = new THREE.TextureLoader()

    void (async () => {
      const url = URL.createObjectURL(blob)
      let tex: THREE.Texture | null = null
      try {
        tex = await loader.loadAsync(url)
      } catch (e) {
        console.warn(`[SceneView] Failed to load skybox texture ${skyboxId}:`, e)
      } finally {
        URL.revokeObjectURL(url)
      }

      if (cancelled || !scene) {
        tex?.dispose()
        return
      }
      if (!tex) return

      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null

      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping

      const geo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 64, 32)
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = '__renn_sky_dome'
      mesh.frustumCulled = false
      mesh.renderOrder = -1
      scene.add(mesh)
      skyDomeRef.current = mesh
    })()

    return () => {
      cancelled = true
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
    }
  }, [scene, world.world.skybox, _assets])

  useEffect(() => {
    const sound = world.world.sound
    const assetId = sound?.assetId?.trim()
    const blob = assetId ? _assets.get(assetId) : undefined
    const volume = Math.max(0, Math.min(1, sound?.volume ?? 1))
    const loop = sound?.loop ?? true
    const autoplay = sound?.autoplay ?? true

    if (!assetId || !blob) {
      if (worldAudioRef.current) {
        worldAudioRef.current.pause()
        worldAudioRef.current.src = ''
        worldAudioRef.current = null
      }
      if (worldAudioUrlRef.current) {
        URL.revokeObjectURL(worldAudioUrlRef.current)
        worldAudioUrlRef.current = null
      }
      return
    }

    const prev = worldAudioRef.current
    const sameSource = prev?.dataset.assetId === assetId
    if (!sameSource) {
      if (worldAudioRef.current) {
        worldAudioRef.current.pause()
        worldAudioRef.current.src = ''
      }
      if (worldAudioUrlRef.current) {
        URL.revokeObjectURL(worldAudioUrlRef.current)
      }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.dataset.assetId = assetId
      worldAudioRef.current = audio
      worldAudioUrlRef.current = url
    }

    const audio = worldAudioRef.current
    if (!audio) return
    audio.loop = loop
    audio.volume = volume
    if (autoplay) {
      void audio.play().catch(() => {
        // Browsers may block autoplay until user interaction.
      })
    }
  }, [world.world.sound, _assets])

  useEffect(() => {
    if (!soundPlaybackCommand) return
    const audio = worldAudioRef.current
    if (!audio) return
    if (soundPlaybackCommand.action === 'play') {
      void audio.play().catch(() => {
        // If blocked by autoplay policy, user can retry after interaction.
      })
      return
    }
    audio.pause()
  }, [soundPlaybackCommand])

  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {worldLoadError !== null ? (
        <div
          role="alert"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'stretch',
            padding: 20,
            boxSizing: 'border-box',
            background: '#14161c',
            color: '#e6e9f2',
            overflow: 'auto',
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>Failed to load world</h2>
          <pre
            style={{
              margin: '0 0 16px',
              padding: 12,
              background: '#0d0f14',
              border: '1px solid #2f3545',
              borderRadius: 6,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              flex: '0 1 auto',
              maxHeight: '45vh',
              overflow: 'auto',
            }}
          >
            {worldLoadError}
          </pre>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9aa4b2', lineHeight: 1.5 }}>
            If you edited mesh simplification by hand, check that <code style={{ color: '#c4d4e8' }}>maxError</code> is
            at least 0.0001 and <code style={{ color: '#c4d4e8' }}>maxTriangles</code> is at least 500. Current builds
            clamp these on load when possible; fix the JSON or use Undo in the editor if available.
          </p>
          <div>
            <button
              type="button"
              onClick={dismissWorldLoadError}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
                background: '#2a3142',
                border: '1px solid #3d4a62',
                borderRadius: 6,
                color: '#e6e9f2',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {scriptSnackbarMessage !== null ? <ScriptSnackbar message={scriptSnackbarMessage} /> : null}
      {showGameHud ? (
        <GameHud score={hudScore} damage={hudDamage} speedMs={hudDrive.speedMs} wheelAngle={hudDrive.wheelAngle} />
      ) : null}
      <WarningSnackbar messages={schemaLoadWarnings} onDismiss={dismissSchemaLoadWarnings} />
    </div>
  )
}

const SceneView = forwardRef<SceneViewHandle, SceneViewProps>(SceneViewInner)
SceneView.displayName = 'SceneView'
export default SceneView
