import * as THREE from 'three'
import type { CameraController } from '@/camera/cameraController'
import { setTransformerSnackbarFn } from '@/transformers/customCodeTransformer'
import { setVariableOverlayFn } from '@/runtime/variableOverlayBridge'
import { setCoordinateOverlayFn } from '@/runtime/coordinateOverlayBridge'
import type { PrefetchDisposer } from '@/loader/prefetchMaterialTextures'
import type {
  SceneRuntimeHandleBag,
  SceneRuntimeHostCallbacks,
  SceneRuntimeRuntimeDeps,
  SceneRuntimeSessionConfig,
} from './sceneRuntimeSession'

/** Live GPU objects held in session closure after a successful load. */
export interface SceneRuntimeTeardownGpu {
  cam: THREE.PerspectiveCamera | null
  rend: THREE.WebGLRenderer | null
  cameraCtrl: CameraController | null
}

export interface SceneRuntimeTeardownListeners {
  ro: ResizeObserver | null
  removeAvatarKeydown: (() => void) | undefined
}

export interface DisposeSceneRuntimeSessionArgs {
  config: SceneRuntimeSessionConfig
  host: SceneRuntimeHostCallbacks
  handles: SceneRuntimeHandleBag
  deps: SceneRuntimeRuntimeDeps
  scriptSnackbarTimer: { id: number | undefined }
  prefetchDisposer: PrefetchDisposer | null
  gpu: SceneRuntimeTeardownGpu
  listeners: SceneRuntimeTeardownListeners
  /** Set session `cancelled` so in-flight load / rAF bail out. */
  markCancelled: () => void
}

/**
 * Mirrors the SceneView main-effect cleanup block: bridges/HUD first, then
 * null physics ref → stop rAF → registry clear → physics dispose → DOM.
 */
export function disposeSceneRuntimeSession(args: DisposeSceneRuntimeSessionArgs): void {
  const { config, host, handles, deps, gpu, listeners, markCancelled } = args
  const { cam, rend, cameraCtrl } = gpu

  host.setSceneBootstrapPending(false)
  markCancelled()
  args.prefetchDisposer?.cancel()

  setTransformerSnackbarFn(null)
  if (args.scriptSnackbarTimer.id !== undefined) {
    window.clearTimeout(args.scriptSnackbarTimer.id)
    args.scriptSnackbarTimer.id = undefined
  }
  host.setScriptSnackbarMessage(null)
  host.setHudScore(0)
  host.setHudDamage(0)
  handles.lastHudDriveRef.current = null
  host.setHudDrive({ speedMs: 0, wheelAngle: 0 })

  handles.disposePickGizmoRef.current?.()
  handles.disposePickGizmoRef.current = null
  handles.syncGizmoAttachRef.current = null
  handles.gizmoDraggingRef.current = false

  // `useSkyDome` and `useWorldAudio` own their own dispose; they re-run when
  // `scene` flips to null (below) and on hook unmount.

  if (handles.assetResolverRef.current) {
    handles.assetResolverRef.current.dispose()
    handles.assetResolverRef.current = null
  }

  if (cam && cameraCtrl) {
    const camConfig = cameraCtrl.getConfig()
    const saveFreePose =
      handles.editNavigationModeRef.current || (camConfig.control ?? 'free') === 'free'
    if (saveFreePose) {
      handles.savedCameraStateRef.current = {
        position: cam.position.clone(),
        quaternion: cam.quaternion.clone(),
        up: cam.up.clone(),
      }
    }
  }

  // Clear physics ref immediately so any in-flight frame sees null (legacy SceneView order).
  const pw = handles.physicsRef.current
  handles.physicsRef.current = null

  deps.cancelAnimationFrame(handles.frameRef.current)
  listeners.removeAvatarKeydown?.()
  if (listeners.ro) {
    listeners.ro.disconnect()
  }
  const resizeHandler = handles.resizeHandlerRef.current
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    handles.resizeHandlerRef.current = null
  }

  handles.avatarSessionRef.current = null
  handles.cameraCtrlRef.current = null
  handles.scriptRunnerRef.current = null

  handles.registryRef.current?.clear()
  handles.registryRef.current = null
  handles.activeDebugForcesRef.current = []

  if (pw) {
    try {
      pw.dispose()
    } catch (e) {
      console.warn('Error disposing physics world:', e)
    }
  }

  handles.variableOverlayControllerRef.current?.dispose()
  handles.variableOverlayControllerRef.current = null
  handles.coordinateOverlayControllerRef.current?.dispose()
  handles.coordinateOverlayControllerRef.current = null
  const css2d = handles.css2dRendererRef.current
  if (css2d) {
    try {
      if (config.container && css2d.domElement.parentNode === config.container) {
        config.container.removeChild(css2d.domElement)
      }
    } catch (e) {
      console.warn('Error removing CSS2D layer:', e)
    }
    handles.css2dRendererRef.current = null
  }
  setVariableOverlayFn(null)
  setCoordinateOverlayFn(null)

  if (rend) {
    try {
      rend.dispose()
      if (config.container && rend.domElement.parentNode === config.container) {
        config.container.removeChild(rend.domElement)
      }
    } catch (e) {
      console.warn('Error disposing renderer:', e)
    }
  }

  host.setScene(null)
  host.setCamera(null)
  host.setRenderer(null)
}
