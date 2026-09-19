import type { MutableRefObject, RefObject } from 'react'
import type { RawKeyboardState, RawWheelState } from '@/types/transformer'
import type { FreeFlyKeys } from '@/types/camera'
import type { RawMouseDragState } from '@/input/rawMouseDrag'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import {
  type CameraConfig,
  type EditorFreePose,
  type RennWorld,
  type Rotation,
  type Vec3,
} from '@/types/world'
import { CameraController } from '@/camera/cameraController'
import type { HudPatch } from '@/scripts/gameApi'
import type { ScriptRunner } from '@/scripts/scriptRunner'
import type { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { VariableOverlayController } from '@/runtime/variableOverlayController'
import type { CoordinateOverlayController } from '@/runtime/coordinateOverlayController'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { runSceneRuntimePhysicsAndRegistry } from '@/runtime/sceneRuntimeSessionPhysics'
import {
  installSceneRuntimeAvatarCycleKeydown,
  installSceneRuntimeBuilderPickGizmo,
  installSceneRuntimeResizeHandling,
  scheduleSceneRuntimeFrameLoop,
} from '@/runtime/sceneRuntimeSessionFrame'
import type { ActiveDebugForce } from '@/runtime/debugForces'
import {
  type BuilderGizmoMode,
} from '@/editor/transformGizmoController'
import type { SceneFrameTiming } from '@/runtime/frameTiming'
import {
  collectMaterialMapAssetIds,
  scheduleMaterialTextureDecodePrefetch,
  warmUpRendererTextures,
  type PrefetchDisposer,
} from '@/loader/prefetchMaterialTextures'
import {
  executeSceneRuntimeLoadPath,
  runSceneRuntimeGpuWarmUp,
} from '@/runtime/sceneRuntimeSessionLoad'
import { disposeSceneRuntimeSession } from '@/runtime/sceneRuntimeSessionTeardown'
import type { AvatarSession } from '@/runtime/avatarSession'


/**
 * Serializable inputs that force tearing down and rebuilding the SceneView runtime
 * (mirrors the main scene-setup `useEffect` dependency list in SceneView.tsx).
 *
 * Refs (`freeFlyKeysRef`, `editorFreePoseRef`) are intentionally omitted — they are
 * stable for a SceneView instance and do not participate in the restart key today.
 */
/** Inputs for full runtime restart. World `shadowsEnabled` is excluded — incremental shadow effect in SceneView. */
export interface SceneRuntimeRestartInputs {
  sceneKey: string
  sceneVersion: number
  logarithmicDepthBuffer: boolean | undefined
  videoTextureMaxAnisotropy: number | undefined
  playMode: boolean
}

/** Stable string compared across React effect runs to decide full runtime restart. */
export function buildSceneRuntimeRestartKey(inputs: SceneRuntimeRestartInputs): string {
  return JSON.stringify({
    sceneKey: inputs.sceneKey,
    sceneVersion: inputs.sceneVersion,
    logarithmicDepthBuffer: inputs.logarithmicDepthBuffer ?? null,
    videoTextureMaxAnisotropy: inputs.videoTextureMaxAnisotropy ?? null,
    playMode: inputs.playMode,
  })
}

/** Host-owned React state and bridges the runtime pushes during load / teardown. */
export interface SceneRuntimeHostCallbacks {
  setSceneBootstrapPending: (pending: boolean) => void
  setScene: (scene: THREE.Scene | null) => void
  setCamera: (camera: THREE.PerspectiveCamera | null) => void
  setRenderer: (renderer: THREE.WebGLRenderer | null) => void
  setWorldLoadError: (message: string | null) => void
  setSchemaLoadWarnings: (warnings: string[]) => void
  setRegistryEpoch: (updater: (prev: number) => number) => void
  setScriptSnackbarMessage: (message: string | null) => void
  setHudScore: (score: number) => void
  setHudDamage: (damage: number) => void
  setHudDrive: (drive: { speedMs: number; wheelAngle: number }) => void
  resetHud: () => void
}

/** Ref bag SceneView owns; session mutates during load and teardown. */
export interface SceneRuntimeHandleBag {
  effectIdRef: MutableRefObject<number>
  assetResolverRef: MutableRefObject<DisposableAssetResolver | null>
  entitiesRef: MutableRefObject<LoadedEntity[]>
  registryRef: MutableRefObject<RenderItemRegistry | null>
  cameraCtrlRef: MutableRefObject<CameraController | null>
  avatarSessionRef: MutableRefObject<AvatarSession | null>
  physicsRef: MutableRefObject<PhysicsWorld | null>
  scriptRunnerRef: MutableRefObject<ScriptRunner | null>
  css2dRendererRef: MutableRefObject<CSS2DRenderer | null>
  variableOverlayControllerRef: MutableRefObject<VariableOverlayController | null>
  coordinateOverlayControllerRef: MutableRefObject<CoordinateOverlayController | null>
  frameRef: MutableRefObject<number>
  frameTimingRef: MutableRefObject<SceneFrameTiming | null>
  resizeHandlerRef: MutableRefObject<(() => void) | null>
  savedCameraStateRef: MutableRefObject<{
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    up: THREE.Vector3
  } | null>
  disposePickGizmoRef: MutableRefObject<(() => void) | null>
  syncGizmoAttachRef: MutableRefObject<(() => void) | null>
  gizmoDraggingRef: MutableRefObject<boolean>
  worldRef: MutableRefObject<RennWorld>
  assetsRef: MutableRefObject<Map<string, Blob>>
  playModeRef: MutableRefObject<boolean>
  editNavigationModeRef: MutableRefObject<boolean>
  runPhysicsRef: MutableRefObject<boolean>
  runScriptsRef: MutableRefObject<boolean>
  rawKeyboardRef: RefObject<RawKeyboardState>
  rawWheelRef: RefObject<RawWheelState>
  timeRef: MutableRefObject<number>
  recordFrameStatsOverlayRef: MutableRefObject<boolean>
  activeDebugForcesRef: MutableRefObject<ActiveDebugForce[]>
  freeFlyKeysRef: RefObject<FreeFlyKeys | null>
  rawMouseDragRef: RefObject<RawMouseDragState | null>
  orbitWheelRef: MutableRefObject<{ deltaX: number; deltaY: number; distanceDelta: number }>
  editorFreePoseRef?: MutableRefObject<EditorFreePose | null>
  lastEditorPoseWriteTimeRef: MutableRefObject<number>
  selectedEntityIdsRef: MutableRefObject<string[]>
  gizmoModeRef: MutableRefObject<BuilderGizmoMode>
  onSelectEntityRef: MutableRefObject<SceneViewSelectEntityFn | undefined>
  onEntityPoseCommitRef: MutableRefObject<
    ((commits: import('@/editor/transformGizmoController').BuilderPoseCommitEntry[]) => void) | undefined
  >
  onCurrentAvatarChangeRef: MutableRefObject<((entityId: string | null) => void) | undefined>
  onTexturePaintStrokeEndRef: MutableRefObject<
    ((payload: import('@/editor/transformGizmoController').TexturePaintStrokePayload) => void | Promise<void>) | undefined
  >
  pushUndoBeforePaintStrokeRef: MutableRefObject<(() => void) | undefined>
  textureBrushRgbRef: MutableRefObject<Vec3>
  textureBrushAlphaRef: MutableRefObject<number>
  textureBrushRadiusPxRef: MutableRefObject<number>
  getPaintTargetAssetIdRef: MutableRefObject<((entityId: string) => string | null) | undefined>
  prepareWorldPaintStrokeRef: MutableRefObject<
    ((entityId: string) => Promise<{ mapAssetId: string; blob: Blob } | null>) | undefined
  >
  showGameHudRef: MutableRefObject<boolean>
  hudPatchBridgeRef: MutableRefObject<(patch: HudPatch) => void>
  lastHudDriveRef: MutableRefObject<{ speedMs: number; wheelAngle: number } | null>
  skyDomeRef: MutableRefObject<THREE.Mesh | null>
  coordinateOverlayDisplayVidRef: MutableRefObject<string | null>
}

export type SceneViewSelectEntityFn = (
  entityId: string | null,
  options?: { additive?: boolean; range?: boolean; orderedVisibleEntityIds?: readonly string[] },
) => void



export interface SceneRuntimeSessionConfig {
  world: RennWorld
  restartKey: string
  container: HTMLElement
  host: SceneRuntimeHostCallbacks
  handles: SceneRuntimeHandleBag
  cameraConfig?: CameraConfig
  runPhysics: boolean
  runScripts: boolean
  shadowsEnabled: boolean
  initialPosesRef?: MutableRefObject<
    Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null
  >
  onPosesRestored?: (poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>) => void
}

export interface SceneRuntimeRuntimeDeps {
  loadWorld: typeof loadWorld
  warmUpRendererTextures: typeof warmUpRendererTextures
  scheduleMaterialTextureDecodePrefetch: typeof scheduleMaterialTextureDecodePrefetch
  collectMaterialMapAssetIds: typeof collectMaterialMapAssetIds
  requestAnimationFrame: typeof requestAnimationFrame
  cancelAnimationFrame: typeof cancelAnimationFrame
  importRapierPhysics: () => Promise<typeof import('@/physics/rapierPhysics')>
}

export function createDefaultSceneRuntimeRuntimeDeps(): SceneRuntimeRuntimeDeps {
  return {
    loadWorld,
    warmUpRendererTextures,
    scheduleMaterialTextureDecodePrefetch,
    collectMaterialMapAssetIds,
    // Must not pass bare rAF refs — unbound calls throw "Illegal invocation" in browsers.
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
    importRapierPhysics: () => import('@/physics/rapierPhysics'),
  }
}

/**
 * Long-lived handles shared by the animation loop, imperative SceneView ref API,
 * and incremental effects (gravity, camera config, shadows).
 */
export interface SceneRuntimeSession extends SceneRuntimeHandles {
  /** Idempotent; safe to call after dispose. */
  start(): void
  /** Stops rAF, disposes GPU/physics/registry, clears bridges. */
  dispose(): void
}

export interface SceneRuntimeHandles {
  readonly generation: number
}

export function createSceneRuntimeSession(
  config: SceneRuntimeSessionConfig,
  deps: SceneRuntimeRuntimeDeps = createDefaultSceneRuntimeRuntimeDeps(),
): SceneRuntimeSession {
  const { host, handles } = config
  let disposed = false
  let generation = 0
  let cancelled = false
  const scriptSnackbarTimer = { id: undefined as number | undefined }
  let cam: THREE.PerspectiveCamera | null = null
  let rend: THREE.WebGLRenderer | null = null
  let cameraCtrl: CameraController | null = null
  let ro: ResizeObserver | null = null
  let removeAvatarKeydown: (() => void) | undefined
  let prefetchDisposer: PrefetchDisposer | null = null

  const disposeImpl = (): void => {
    disposeSceneRuntimeSession({
      config,
      host,
      handles,
      deps,
      scriptSnackbarTimer,
      prefetchDisposer,
      gpu: { cam, rend, cameraCtrl },
      listeners: { ro, removeAvatarKeydown },
      markCancelled: () => {
        cancelled = true
      },
    })
    prefetchDisposer = null
    ro = null
    removeAvatarKeydown = undefined
  }

  return {
    get generation() {
      return generation
    },
    start(): void {
      if (disposed) return
      generation += 1
      host.setSceneBootstrapPending(true)

      // Increment effect ID to detect stale async operations
      handles.effectIdRef.current += 1
      const currentEffectId = handles.effectIdRef.current

      // Dispose previous asset resolver if it exists
      if (handles.assetResolverRef.current) {
        handles.assetResolverRef.current.dispose()
        handles.assetResolverRef.current = null
      }

      cancelled = false
      scriptSnackbarTimer.id = undefined
      cam = null
      rend = null
      cameraCtrl = null
      ro = null
      removeAvatarKeydown = undefined
      prefetchDisposer = null

      host.setSchemaLoadWarnings([])
      host.setWorldLoadError(null)
      host.setHudScore(0)
      host.setHudDamage(0)

      // Load world asynchronously with assets (getter keeps blob URLs valid for VideoTextures after load)
      deps.loadWorld(config.world, () => handles.assetsRef.current).then((loadResult) => {
        const loadPath = executeSceneRuntimeLoadPath({
          config,
          host,
          handles,
          cancelled,
          currentEffectId,
          scriptSnackbarTimer,
          loadResult,
        })
        if (!loadPath) return

        cam = loadPath.cam
        rend = loadPath.rend
        cameraCtrl = loadPath.cameraCtrl
        const loadedScene = loadPath.loadedScene
        const loadedWorld = loadPath.loadedWorld
        const entities = loadPath.entities
        const assetResolver = loadPath.assetResolver
        const controlledEntityIdRef = loadPath.controlledEntityIdRef
        const avatarSession = loadPath.avatarSession

        const installPickGizmoIfBuilder = (): void => {
          installSceneRuntimeBuilderPickGizmo({
            isActiveGeneration: () =>
              !cancelled && handles.effectIdRef.current === currentEffectId,
            loadedScene,
            cam,
            rend,
            handles,
          })
        }

        runSceneRuntimePhysicsAndRegistry({
          config,
          host,
          handles,
          deps,
          cancelled,
          currentEffectId,
          loadedWorld,
          entities,
          controlledEntityIdRef,
          installPickGizmoIfBuilder,
        })

        prefetchDisposer = runSceneRuntimeGpuWarmUp({
          config,
          host,
          handles,
          deps,
          rend,
          loadedScene,
          loadedWorld,
          assetResolver,
        })

        scheduleSceneRuntimeFrameLoop({
          isCancelled: () => cancelled,
          handles,
          host,
          requestAnimationFrame: deps.requestAnimationFrame,
          cam,
          rend,
          loadedScene,
        })

        if (avatarSession) {
          removeAvatarKeydown = installSceneRuntimeAvatarCycleKeydown(avatarSession, handles)
        }

        ro = installSceneRuntimeResizeHandling({
          container: config.container,
          handles,
          getCam: () => cam,
          getRend: () => rend,
        })
      }).catch((err) => {
        if (!cancelled) {
          console.error('Failed to load world:', err)
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === 'string'
                ? err
                : 'Unknown error while loading the world.'
          host.setWorldLoadError(msg)
          host.setSceneBootstrapPending(false)
        }
      })
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      disposeImpl()
    },
  }
}

/** Test-only no-op for contract tests; production uses `createSceneRuntimeSession`. */
export function createSceneRuntimeSessionStub(
  config: SceneRuntimeSessionConfig,
): SceneRuntimeSession {
  let disposed = false
  const generation = 0
  return {
    generation,
    start() {
      if (disposed) return
      config.host.setSceneBootstrapPending(true)
      config.host.setSceneBootstrapPending(false)
    },
    dispose() {
      if (disposed) return
      disposed = true
      config.host.setScene(null)
      config.host.setCamera(null)
      config.host.setRenderer(null)
      config.host.resetHud()
    },
  }
}
