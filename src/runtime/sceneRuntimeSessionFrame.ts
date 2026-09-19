import * as THREE from 'three'
import { resolveSimulationSettings } from '@/types/world'
import {
  runSceneFrame,
  advanceSemiFixedAccumulator,
  planSemiFixedPushFrames,
} from '@/runtime/sceneFrameLoop'
import {
  installBuilderPickAndGizmo,
} from '@/editor/transformGizmoController'
import { isKeyboardEventInEditableContext } from '@/input/rawInput'
import {
  setVariableOverlayDisplayEntityId,
  getVariableOverlaySlots,
} from '@/runtime/variableOverlayBridge'
import {
  setCoordinateOverlayDisplayEntityId,
  clearCoordinateEntries,
  getCoordinateOverlayEntries,
} from '@/runtime/coordinateOverlayBridge'
import type { AvatarSession } from '@/runtime/avatarSession'
import type {
  SceneRuntimeHandleBag,
  SceneRuntimeHostCallbacks,
  SceneRuntimeRuntimeDeps,
} from './sceneRuntimeSession'

export interface SceneRuntimeBuilderPickGizmoContext {
  isActiveGeneration: () => boolean
  loadedScene: THREE.Scene
  cam: THREE.PerspectiveCamera | null
  rend: THREE.WebGLRenderer | null
  handles: SceneRuntimeHandleBag
}

/** Builder pick/gizmo install after registry attach (mirrors pre-extract inline closure). */
export function installSceneRuntimeBuilderPickGizmo(ctx: SceneRuntimeBuilderPickGizmoContext): void {
  const { handles, loadedScene, cam, rend } = ctx
  if (!ctx.isActiveGeneration()) return
  if (handles.playModeRef.current) return
  if (!handles.onSelectEntityRef.current || !handles.onEntityPoseCommitRef.current) return
  if (!cam || !rend) return
  if (!handles.registryRef.current) return
  handles.disposePickGizmoRef.current?.()
  const { dispose, syncAttach } = installBuilderPickAndGizmo({
    scene: loadedScene,
    camera: cam,
    domElement: rend.domElement,
    getRegistry: () => handles.registryRef.current,
    getEntity: (id) => handles.worldRef.current.entities.find((e) => e.id === id),
    getSelectedIds: () => handles.selectedEntityIdsRef.current,
    getGizmoMode: () => handles.gizmoModeRef.current,
    onSelectEntity: (id, opts) => handles.onSelectEntityRef.current?.(id, opts),
    onPoseCommit: (commits) => handles.onEntityPoseCommitRef.current?.(commits),
    setGizmoDragging: (d) => {
      handles.gizmoDraggingRef.current = d
    },
    texturePaint: {
      getAssets: () => handles.assetsRef.current,
      getBrushRgba: () => {
        const c = handles.textureBrushRgbRef.current
        const a = handles.textureBrushAlphaRef.current
        const ac = a < 0 ? 0 : a > 1 ? 1 : a
        return [c[0], c[1], c[2], ac] as const
      },
      getBrushRadiusPx: () => handles.textureBrushRadiusPxRef.current,
      getPaintTargetAssetId: (entityId: string) =>
        handles.getPaintTargetAssetIdRef.current?.(entityId) ?? null,
      prepareWorldPaintStroke: (entityId: string) =>
        handles.prepareWorldPaintStrokeRef.current?.(entityId) ?? Promise.resolve(null),
      pushUndoBeforePaintStroke: () => handles.pushUndoBeforePaintStrokeRef.current?.(),
      onStrokeEnd: (payload) => handles.onTexturePaintStrokeEndRef.current?.(payload),
    },
  })
  handles.disposePickGizmoRef.current = dispose
  handles.syncGizmoAttachRef.current = syncAttach
  syncAttach()
}

export interface SceneRuntimeFrameLoopContext {
  isCancelled: () => boolean
  handles: SceneRuntimeHandleBag
  host: SceneRuntimeHostCallbacks
  requestAnimationFrame: SceneRuntimeRuntimeDeps['requestAnimationFrame']
  cam: THREE.PerspectiveCamera | null
  rend: THREE.WebGLRenderer | null
  loadedScene: THREE.Scene
}

/** Schedules the semi-fixed rAF loop (orchestration only; `runSceneFrame` unchanged). */
export function scheduleSceneRuntimeFrameLoop(ctx: SceneRuntimeFrameLoopContext): void {
  const { handles, host, loadedScene } = ctx
  let lastRafTime: number | null = null
  let simAccumulator = 0

  const animate = (rafTime: number): void => {
    if (ctx.isCancelled()) return
    handles.frameRef.current = ctx.requestAnimationFrame(animate)

    const sim = resolveSimulationSettings(handles.worldRef.current.world.simulation)
    const { fixedDt, maxStepsPerFrame, timeScale } = sim
    const recordStats = handles.recordFrameStatsOverlayRef.current

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
    const clampedElapsed = Math.min(Math.max(0, elapsedSec), maxStepsPerFrame * fixedDt)

    const tickStart = recordStats ? performance.now() : 0

    const pushFrame = (opts: {
      fixedDt: number
      skipSimulation: boolean
      variableFrameDt: number
      skipRender: boolean
      renderInterpolationAlpha: number
    }): void => {
      runSceneFrame({
        isCancelled: ctx.isCancelled,
        fixedDt: opts.fixedDt,
        skipSimulation: opts.skipSimulation,
        variableFrameDt: opts.variableFrameDt,
        skipRender: opts.skipRender,
        renderInterpolationAlpha: opts.renderInterpolationAlpha,
        timeRef: handles.timeRef,
        rawWheelRef: handles.rawWheelRef,
        orbitWheelRef: handles.orbitWheelRef,
        editNavigationModeRef: handles.editNavigationModeRef,
        cameraCtrlRef: handles.cameraCtrlRef,
        physicsRef: handles.physicsRef,
        runPhysics: handles.runPhysicsRef.current,
        activeDebugForcesRef: handles.activeDebugForcesRef,
        registryRef: handles.registryRef,
        rawKeyboardRef: handles.rawKeyboardRef,
        worldRef: handles.worldRef,
        scriptRunnerRef: handles.scriptRunnerRef,
        runScripts: handles.runScriptsRef.current,
        freeFlyKeysRef: handles.freeFlyKeysRef,
        rawMouseDragRef: handles.rawMouseDragRef,
        gizmoDraggingRef: handles.gizmoDraggingRef,
        selectedEntityIdsRef: handles.selectedEntityIdsRef,
        editorFreePoseRef: handles.editorFreePoseRef,
        cam: ctx.cam,
        lastEditorPoseWriteTimeRef: handles.lastEditorPoseWriteTimeRef,
        showGameHud: handles.showGameHudRef.current,
        lastHudDriveRef: handles.lastHudDriveRef,
        setHudDrive: host.setHudDrive,
        skyDomeRef: handles.skyDomeRef,
        rend: ctx.rend,
        loadedScene,
        recordFrameTiming: recordStats,
        frameTimingRef: handles.frameTimingRef,
        onFrameStart: () => {
          const mode = handles.gizmoModeRef.current
          const ids = handles.selectedEntityIdsRef.current
          const vid = mode === 'visualize' && ids.length === 1 ? ids[0]! : null
          setVariableOverlayDisplayEntityId(vid)
          setCoordinateOverlayDisplayEntityId(vid)
          if (vid !== handles.coordinateOverlayDisplayVidRef.current) {
            clearCoordinateEntries()
            handles.coordinateOverlayDisplayVidRef.current = vid
          }
        },
        beforeWebGlRender: () => {
          const overlay = handles.variableOverlayControllerRef.current
          const coordOverlay = handles.coordinateOverlayControllerRef.current
          const mode = handles.gizmoModeRef.current
          const ids = handles.selectedEntityIdsRef.current
          if (!overlay || mode !== 'visualize' || ids.length !== 1) {
            overlay?.sync(null, null, [])
            coordOverlay?.sync([])
            return
          }
          const id = ids[0]!
          const pos = handles.registryRef.current?.getPosition(id)
          if (!pos) {
            overlay.sync(null, null, [])
            coordOverlay?.sync([])
            return
          }
          overlay.sync(id, pos, getVariableOverlaySlots(), ctx.cam)
          coordOverlay?.sync(getCoordinateOverlayEntries())
        },
        css2dRenderer: handles.css2dRendererRef.current,
      })
    }

    for (const plan of planSemiFixedPushFrames({
      stepsToRun,
      fixedDt,
      simAccumulator,
      clampedElapsed,
    })) {
      pushFrame(plan)
    }

    if (recordStats) {
      const snap = handles.frameTimingRef.current
      if (snap) {
        snap.frameMs = performance.now() - tickStart
      }
    }
  }

  handles.frameRef.current = ctx.requestAnimationFrame(animate)
}

export interface SceneRuntimeResizeContext {
  container: HTMLElement
  handles: SceneRuntimeHandleBag
  getCam: () => THREE.PerspectiveCamera | null
  getRend: () => THREE.WebGLRenderer | null
}

/** Window resize listener + ResizeObserver; stores handler on `resizeHandlerRef`. */
export function installSceneRuntimeResizeHandling(ctx: SceneRuntimeResizeContext): ResizeObserver {
  const onResize = (): void => {
    const cam = ctx.getCam()
    const rend = ctx.getRend()
    if (!ctx.container || !cam || !rend) return
    const w = Math.max(ctx.container.clientWidth || 1, 1)
    const h = Math.max(ctx.container.clientHeight || 1, 1)
    cam.aspect = w / h
    cam.updateProjectionMatrix()
    rend.setSize(w, h)
    ctx.handles.css2dRendererRef.current?.setSize(w, h)
  }
  ctx.handles.resizeHandlerRef.current = onResize
  window.addEventListener('resize', onResize)
  const ro = new ResizeObserver(onResize)
  ro.observe(ctx.container)
  return ro
}

/** +/- keys cycle play avatar when HUD visible and roster has 2+ members. */
export function installSceneRuntimeAvatarCycleKeydown(
  avatarSession: AvatarSession,
  handles: SceneRuntimeHandleBag,
): () => void {
  const onAvatarKeyDown = (e: KeyboardEvent): void => {
    if (!handles.showGameHudRef.current) return
    if (avatarSession.getRosterEntityIds().length < 2) return
    if (isKeyboardEventInEditableContext(e)) return
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault()
      avatarSession.cycleAvatar(1)
    } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault()
      avatarSession.cycleAvatar(-1)
    }
  }
  window.addEventListener('keydown', onAvatarKeyDown)
  return () => window.removeEventListener('keydown', onAvatarKeyDown)
}
