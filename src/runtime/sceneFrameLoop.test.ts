/**
 * Unit tests for `runSceneFrame` covering the per-frame branches that the
 * accumulator test does not exercise: time advance, wheel orbit gating,
 * debug force lifecycle, distance culling, HUD diff threshold, sky dome
 * follow, editor pose throttling, frame timing recording, and physics-error
 * recovery.
 *
 * Mocks are kept minimal — only the methods actually invoked from the rAF
 * body are stubbed. The integration test
 * `src/test/scenarios/shadow-follow-camera.integration.test.ts` covers the
 * real end-to-end wiring with a loaded world; this file focuses on isolated
 * branch behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  runSceneFrame,
  SCENE_FIXED_DT,
  type SceneFrameLoopInputs,
} from '@/runtime/sceneFrameLoop'
import type { RennWorld, Vec3, EditorFreePose } from '@/types/world'
import type { RawWheelState, RawKeyboardState } from '@/types/transformer'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { ScriptRunner } from '@/scripts/scriptRunner'
import type { CameraController } from '@/camera/cameraController'

function makeWorld(distanceCulling?: false | { maxDistance?: number }): RennWorld {
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      camera: { control: 'free', mode: 'follow', target: '', distance: 10, height: 2 },
      ...(distanceCulling !== undefined ? { distanceCulling: distanceCulling as never } : {}),
    },
    entities: [],
  }
}

function makeWheel(over?: Partial<RawWheelState>): RawWheelState {
  return { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0, ...over }
}

function makeKeyboard(): RawKeyboardState {
  return { w: false, a: false, s: false, d: false, space: false, shift: false }
}

function makeRenderer(): THREE.WebGLRenderer {
  return {
    shadowMap: { enabled: false },
    render: vi.fn(),
    info: { render: { calls: 7, triangles: 1234 }, memory: { geometries: 9 } },
  } as unknown as THREE.WebGLRenderer
}

interface BaseOverrides extends Partial<SceneFrameLoopInputs> {}

function makeBaseInput(over: BaseOverrides = {}): SceneFrameLoopInputs {
  return {
    isCancelled: () => false,
    fixedDt: SCENE_FIXED_DT,
    timeRef: { current: 0 },
    rawWheelRef: { current: makeWheel() },
    orbitWheelRef: { current: { deltaX: 0, deltaY: 0, distanceDelta: 0 } },
    editNavigationModeRef: { current: false },
    cameraCtrlRef: { current: null },
    physicsRef: { current: null },
    runPhysics: false,
    activeDebugForcesRef: { current: [] },
    registryRef: { current: null },
    rawKeyboardRef: { current: makeKeyboard() },
    worldRef: { current: makeWorld(false) },
    scriptRunnerRef: { current: null },
    runScripts: false,
    freeFlyKeysRef: { current: null },
    rawMouseDragRef: { current: null },
    gizmoDraggingRef: { current: false },
    selectedEntityIdsRef: { current: [] },
    editorFreePoseRef: undefined,
    cam: null,
    lastEditorPoseWriteTimeRef: { current: 0 },
    showGameHud: false,
    lastHudDriveRef: { current: null },
    setHudDrive: () => {},
    skyDomeRef: { current: null },
    rend: null,
    loadedScene: null,
    recordFrameTiming: false,
    frameTimingRef: { current: null },
    ...over,
  }
}

describe('runSceneFrame — time advance', () => {
  it('advances timeRef by fixedDt when simAdvance', () => {
    const input = makeBaseInput({ timeRef: { current: 1 } })
    runSceneFrame(input)
    expect(input.timeRef.current).toBeCloseTo(1 + SCENE_FIXED_DT)
  })

  it('does not advance timeRef when skipSimulation is true', () => {
    const input = makeBaseInput({
      timeRef: { current: 1 },
      skipSimulation: true,
      variableFrameDt: 0.1,
    })
    runSceneFrame(input)
    expect(input.timeRef.current).toBe(1)
  })

  it('passes variableFrameDt to camera update when skipSimulation', () => {
    const update = vi.fn()
    const ctrl = {
      getConfig: () => ({ control: 'free', mode: 'follow' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta: () => {},
      setOrbitDistanceDelta: () => {},
      setEditNavigationOrbitPivot: () => {},
      update,
    } as unknown as CameraController
    const input = makeBaseInput({
      cameraCtrlRef: { current: ctrl },
      skipSimulation: true,
      variableFrameDt: 0.0123,
    })
    runSceneFrame(input)
    expect(update).toHaveBeenCalledWith(0.0123)
  })

  it('passes fixedDt to camera update when simAdvance', () => {
    const update = vi.fn()
    const ctrl = {
      getConfig: () => ({ control: 'free', mode: 'follow' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta: () => {},
      setOrbitDistanceDelta: () => {},
      setEditNavigationOrbitPivot: () => {},
      update,
    } as unknown as CameraController
    const input = makeBaseInput({ cameraCtrlRef: { current: ctrl } })
    runSceneFrame(input)
    expect(update).toHaveBeenCalledWith(SCENE_FIXED_DT)
  })

  it('applies render interpolation alpha before camera update', () => {
    const applyInterpolatedVisualPoses = vi.fn()
    const update = vi.fn()
    const ctrl = {
      getConfig: () => ({ control: 'free', mode: 'follow' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta: () => {},
      setOrbitDistanceDelta: () => {},
      setEditNavigationOrbitPivot: () => {},
      update,
    } as unknown as CameraController
    const input = makeBaseInput({
      cameraCtrlRef: { current: ctrl },
      registryRef: {
        current: {
          applyInterpolatedVisualPoses,
        } as unknown as RenderItemRegistry,
      },
      renderInterpolationAlpha: 0.375,
    })
    runSceneFrame(input)
    expect(applyInterpolatedVisualPoses).toHaveBeenCalledWith(0.375)
    expect(update).toHaveBeenCalled()
    expect(applyInterpolatedVisualPoses.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    )
  })

  it('skips applyInterpolatedVisualPoses in edit-navigation mode (stale buffers would fight gizmo)', () => {
    const applyInterpolatedVisualPoses = vi.fn()
    const ctrl = {
      getConfig: () => ({ control: 'free', mode: 'follow' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta: () => {},
      setOrbitDistanceDelta: () => {},
      setEditNavigationOrbitPivot: () => {},
      update: vi.fn(),
    } as unknown as CameraController
    const input = makeBaseInput({
      editNavigationModeRef: { current: true },
      cameraCtrlRef: { current: ctrl },
      registryRef: {
        current: {
          applyInterpolatedVisualPoses,
        } as unknown as RenderItemRegistry,
      },
      renderInterpolationAlpha: 0.5,
    })
    runSceneFrame(input)
    expect(applyInterpolatedVisualPoses).not.toHaveBeenCalled()
  })
})

describe('runSceneFrame — wheel orbit gating', () => {
  it('zeroes orbitWheelRef when neither edit-nav nor follow-control', () => {
    const wheel = makeWheel({ deltaX: 5, deltaY: 6, mouseWheelDelta: 7 })
    const input = makeBaseInput({
      rawWheelRef: { current: wheel },
      orbitWheelRef: { current: { deltaX: 1, deltaY: 1, distanceDelta: 1 } },
    })
    runSceneFrame(input)
    expect(input.orbitWheelRef.current).toEqual({
      deltaX: 0,
      deltaY: 0,
      distanceDelta: 0,
    })
    // Raw wheel left untouched in the gated-out path.
    expect(wheel.deltaX).toBe(5)
    expect(wheel.deltaY).toBe(6)
    expect(wheel.mouseWheelDelta).toBe(7)
  })

  it('consumes raw wheel into orbitWheelRef in edit-navigation mode', () => {
    const wheel = makeWheel({ deltaX: 3, deltaY: 4, pinchDelta: 0.5, mouseWheelDelta: 0.25 })
    const input = makeBaseInput({
      rawWheelRef: { current: wheel },
      editNavigationModeRef: { current: true },
    })
    runSceneFrame(input)
    expect(input.orbitWheelRef.current.deltaX).toBe(3)
    expect(input.orbitWheelRef.current.deltaY).toBe(4)
    expect(input.orbitWheelRef.current.distanceDelta).toBeCloseTo(0.75)
    expect(wheel.deltaX).toBe(0)
    expect(wheel.deltaY).toBe(0)
    expect(wheel.pinchDelta).toBe(0)
    expect(wheel.mouseWheelDelta).toBe(0)
  })

  it('consumes raw wheel when control=follow + mode=follow (and not editNav)', () => {
    const wheel = makeWheel({ deltaX: 2, deltaY: 1, mouseWheelDelta: 0.3 })
    const setOrbitDistanceDelta = vi.fn()
    const ctrl = {
      getConfig: () => ({ control: 'follow', mode: 'follow' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta: () => {},
      setOrbitDistanceDelta,
      setEditNavigationOrbitPivot: () => {},
      update: () => {},
    } as unknown as CameraController
    const input = makeBaseInput({
      rawWheelRef: { current: wheel },
      cameraCtrlRef: { current: ctrl },
    })
    runSceneFrame(input)
    // Raw wheel was consumed (zeroed), orbit deltaX/Y carry the values into camera,
    // and the distance delta is forwarded to the controller (then cleared on the orbit ref).
    expect(wheel.deltaX).toBe(0)
    expect(wheel.mouseWheelDelta).toBe(0)
    expect(input.orbitWheelRef.current.deltaX).toBe(2)
    expect(input.orbitWheelRef.current.deltaY).toBe(1)
    expect(input.orbitWheelRef.current.distanceDelta).toBe(0)
    expect(setOrbitDistanceDelta).toHaveBeenCalledWith(0.3 * 0.75)
  })

  it('passes accumulated orbit delta to camera (with mouse drag added)', () => {
    const setOrbitDelta = vi.fn()
    const setOrbitDistanceDelta = vi.fn()
    const ctrl = {
      getConfig: () => ({ control: 'free', mode: 'follow' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta,
      setOrbitDistanceDelta,
      setEditNavigationOrbitPivot: () => {},
      update: () => {},
    } as unknown as CameraController
    const drag = { deltaX: 10, deltaY: 20, button: 0, active: true }
    const input = makeBaseInput({
      cameraCtrlRef: { current: ctrl },
      editNavigationModeRef: { current: true },
      rawWheelRef: { current: makeWheel({ deltaX: 1, deltaY: 2, mouseWheelDelta: 0.4 }) },
      rawMouseDragRef: { current: drag as never },
    })
    runSceneFrame(input)
    expect(setOrbitDelta).toHaveBeenCalledWith(11, 22)
    expect(setOrbitDistanceDelta).toHaveBeenCalledWith(0.4 * 0.75)
    expect(drag.deltaX).toBe(0)
    expect(drag.deltaY).toBe(0)
  })

  it('ignores mouse drag while gizmoDragging, but still consumes orbit wheel delta', () => {
    const setOrbitDelta = vi.fn()
    const ctrl = {
      getConfig: () => ({ control: 'free', mode: 'follow' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta,
      setOrbitDistanceDelta: () => {},
      setEditNavigationOrbitPivot: () => {},
      update: () => {},
    } as unknown as CameraController
    const drag = { deltaX: 10, deltaY: 20, button: 0, active: true }
    const input = makeBaseInput({
      cameraCtrlRef: { current: ctrl },
      editNavigationModeRef: { current: true },
      rawWheelRef: { current: makeWheel({ deltaX: 1, deltaY: 2 }) },
      rawMouseDragRef: { current: drag as never },
      gizmoDraggingRef: { current: true },
    })
    runSceneFrame(input)
    expect(setOrbitDelta).toHaveBeenCalledWith(1, 2)
    // Drag accumulator still cleared even when ignored.
    expect(drag.deltaX).toBe(0)
    expect(drag.deltaY).toBe(0)
  })
})

describe('runSceneFrame — debug forces', () => {
  it('drops debug forces past their endTime and applies live ones', () => {
    const applyForce = vi.fn()
    const pw = {
      step: () => {},
      applyForce,
      getCollisions: () => [],
    } as unknown as PhysicsWorld
    const dbg = [
      { entityId: 'a', force: [1, 2, 3] as Vec3, endTime: 0.5 }, // expired
      { entityId: 'b', force: [4, 5, 6] as Vec3, endTime: 100 }, // live
    ]
    const input = makeBaseInput({
      timeRef: { current: 1 },
      physicsRef: { current: pw },
      runPhysics: true,
      activeDebugForcesRef: { current: dbg },
      registryRef: { current: null },
    })
    runSceneFrame(input)
    expect(applyForce).toHaveBeenCalledTimes(1)
    expect(applyForce).toHaveBeenCalledWith('b', 4, 5, 6)
    expect(dbg).toHaveLength(1)
    expect(dbg[0]?.entityId).toBe('b')
  })

  it('does not apply debug forces in edit-navigation mode (but still trims expired)', () => {
    const applyForce = vi.fn()
    const pw = {
      step: vi.fn(),
      applyForce,
      getCollisions: () => [],
    } as unknown as PhysicsWorld
    const dbg = [
      { entityId: 'a', force: [1, 2, 3] as Vec3, endTime: 0.5 }, // expired
      { entityId: 'b', force: [4, 5, 6] as Vec3, endTime: 100 }, // live but suppressed
    ]
    const input = makeBaseInput({
      timeRef: { current: 1 },
      physicsRef: { current: pw },
      runPhysics: true,
      activeDebugForcesRef: { current: dbg },
      editNavigationModeRef: { current: true },
    })
    runSceneFrame(input)
    expect(applyForce).not.toHaveBeenCalled()
    expect(dbg).toHaveLength(1)
    expect(dbg[0]?.entityId).toBe('b')
    // Physics step is skipped while in edit-nav (entire transformers/step block gated).
    expect((pw.step as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })
})

describe('runSceneFrame — distance culling', () => {
  it('clears culling when world.distanceCulling === false', () => {
    const apply = vi.fn()
    const clear = vi.fn()
    const reg = {
      get culledSleepingEntityIds() {
        return new Set<string>()
      },
      applyDistanceCulling: apply,
      clearDistanceCulling: clear,
    } as unknown as RenderItemRegistry
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(1, 2, 3)
    const input = makeBaseInput({
      registryRef: { current: reg },
      cam,
      worldRef: { current: makeWorld(false) },
    })
    runSceneFrame(input)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(apply).not.toHaveBeenCalled()
  })

  it('applies culling with merged defaults when world.distanceCulling is omitted', () => {
    const apply = vi.fn()
    const clear = vi.fn()
    const reg = {
      get culledSleepingEntityIds() {
        return new Set<string>()
      },
      applyDistanceCulling: apply,
      clearDistanceCulling: clear,
    } as unknown as RenderItemRegistry
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(10, 20, 30)
    const input = makeBaseInput({
      registryRef: { current: reg },
      cam,
      worldRef: { current: makeWorld() },
    })
    runSceneFrame(input)
    expect(clear).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledTimes(1)
    const [pos, settings] = apply.mock.calls[0]!
    expect(pos).toBe(cam.position)
    expect(settings.maxDistance).toBe(2000)
    expect(settings.minSizeDistanceRatio).toBeCloseTo(0.02)
  })
})

describe('runSceneFrame — sky dome follow', () => {
  it('copies camera position into the sky dome each frame', () => {
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(5, 10, -3)
    const dome = new THREE.Mesh()
    const input = makeBaseInput({
      cam,
      skyDomeRef: { current: dome },
    })
    runSceneFrame(input)
    expect(dome.position.x).toBe(5)
    expect(dome.position.y).toBe(10)
    expect(dome.position.z).toBe(-3)
  })

  it('does nothing when there is no sky dome', () => {
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(5, 10, -3)
    const input = makeBaseInput({ cam, skyDomeRef: { current: null } })
    expect(() => runSceneFrame(input)).not.toThrow()
  })
})

describe('runSceneFrame — HUD diff threshold', () => {
  function hudCtrl(targetId: string): CameraController {
    return {
      getConfig: () => ({ control: 'free', mode: 'follow', target: targetId }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta: () => {},
      setOrbitDistanceDelta: () => {},
      setEditNavigationOrbitPivot: () => {},
      update: () => {},
    } as unknown as CameraController
  }

  function hudPhysics(speedMs: number): PhysicsWorld {
    return {
      step: () => {},
      getCollisions: () => [],
      getLinearVelocityInto: (_id: string, out: Vec3) => {
        out[0] = speedMs
        out[1] = 0
        out[2] = 0
        return true
      },
    } as unknown as PhysicsWorld
  }

  function hudReg(forwardX: number, wheelAngle: number): RenderItemRegistry {
    return {
      get culledSleepingEntityIds() {
        return new Set<string>()
      },
      applyDistanceCulling: () => {},
      clearDistanceCulling: () => {},
      getForwardVectorInto: (_id: string, out: Vec3) => {
        out[0] = forwardX
        out[1] = 0
        out[2] = 0
        return true
      },
      getCar2WheelAngle: () => wheelAngle,
    } as unknown as RenderItemRegistry
  }

  it('emits initial HUD value on the first frame', () => {
    const setHudDrive = vi.fn()
    const input = makeBaseInput({
      showGameHud: true,
      cameraCtrlRef: { current: hudCtrl('car-1') },
      physicsRef: { current: hudPhysics(12) },
      registryRef: { current: hudReg(1, 0.3) },
      lastHudDriveRef: { current: null },
      setHudDrive,
    })
    runSceneFrame(input)
    expect(setHudDrive).toHaveBeenCalledWith({ speedMs: 12, wheelAngle: 0.3 })
    expect(input.lastHudDriveRef.current).toEqual({ speedMs: 12, wheelAngle: 0.3 })
  })

  it('suppresses HUD update when speed and wheel changes are below epsilon', () => {
    const setHudDrive = vi.fn()
    const input = makeBaseInput({
      showGameHud: true,
      cameraCtrlRef: { current: hudCtrl('car-1') },
      physicsRef: { current: hudPhysics(12.01) }, // < 0.05 eps
      registryRef: { current: hudReg(1, 0.3001) }, // < 0.012 eps
      lastHudDriveRef: { current: { speedMs: 12, wheelAngle: 0.3 } },
      setHudDrive,
    })
    runSceneFrame(input)
    expect(setHudDrive).not.toHaveBeenCalled()
  })

  it('emits HUD update when speed change exceeds epsilon', () => {
    const setHudDrive = vi.fn()
    const input = makeBaseInput({
      showGameHud: true,
      cameraCtrlRef: { current: hudCtrl('car-1') },
      physicsRef: { current: hudPhysics(12.5) }, // 0.5 > 0.05 eps
      registryRef: { current: hudReg(1, 0.3) },
      lastHudDriveRef: { current: { speedMs: 12, wheelAngle: 0.3 } },
      setHudDrive,
    })
    runSceneFrame(input)
    expect(setHudDrive).toHaveBeenCalledWith({ speedMs: 12.5, wheelAngle: 0.3 })
  })
})

describe('runSceneFrame — editor pose throttling', () => {
  function navCtrl(): CameraController {
    return {
      getConfig: () => ({ control: 'free', mode: 'follow', target: '' }),
      setForceFreeFlyNavigation: () => {},
      setFreeFlyInput: () => {},
      setOrbitDelta: () => {},
      setOrbitDistanceDelta: () => {},
      setEditNavigationOrbitPivot: () => {},
      update: () => {},
    } as unknown as CameraController
  }

  it('skips writing pose when interval since last write is below 0.35s', () => {
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(1, 2, 3)
    const poseRef: { current: EditorFreePose | null } = { current: null }
    const input = makeBaseInput({
      cam,
      cameraCtrlRef: { current: navCtrl() },
      editorFreePoseRef: poseRef,
      timeRef: { current: 1.0 },
      lastEditorPoseWriteTimeRef: { current: 0.8 }, // delta = 0.2 + dt
    })
    runSceneFrame(input)
    expect(poseRef.current).toBeNull()
  })

  it('writes pose when interval reaches 0.35s', () => {
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(7, 8, 9)
    const poseRef: { current: EditorFreePose | null } = { current: null }
    const input = makeBaseInput({
      cam,
      cameraCtrlRef: { current: navCtrl() },
      editorFreePoseRef: poseRef,
      timeRef: { current: 1.0 },
      lastEditorPoseWriteTimeRef: { current: 0.6 }, // delta = 0.4 + dt > 0.35
    })
    runSceneFrame(input)
    expect(poseRef.current).not.toBeNull()
    expect(poseRef.current!.position).toEqual([7, 8, 9])
    expect(input.lastEditorPoseWriteTimeRef.current).toBeCloseTo(1.0 + SCENE_FIXED_DT)
  })
})

describe('runSceneFrame — frame timing recording', () => {
  it('populates SceneFrameTiming when recordFrameTiming is true (with renderer info)', () => {
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(0, 0, 0)
    const scene = new THREE.Scene()
    const rend = makeRenderer()
    const input = makeBaseInput({
      cam,
      rend,
      loadedScene: scene,
      recordFrameTiming: true,
    })
    runSceneFrame(input)
    const t = input.frameTimingRef.current
    expect(t).not.toBeNull()
    expect(t!.frameMs).toBeGreaterThanOrEqual(0)
    expect(t!.renderCalls).toBe(7)
    expect(t!.renderTriangles).toBe(1234)
    expect(t!.geometries).toBe(9)
  })

  it('records renderMs as 0 when skipRender is true', () => {
    const cam = new THREE.PerspectiveCamera()
    const rend = makeRenderer()
    const input = makeBaseInput({
      cam,
      rend,
      loadedScene: new THREE.Scene(),
      recordFrameTiming: true,
      skipRender: true,
    })
    runSceneFrame(input)
    expect(input.frameTimingRef.current!.renderMs).toBe(0)
    expect(rend.render).not.toHaveBeenCalled()
  })

  it('does not allocate a SceneFrameTiming when recording is disabled', () => {
    const input = makeBaseInput({ frameTimingRef: { current: null } })
    runSceneFrame(input)
    expect(input.frameTimingRef.current).toBeNull()
  })
})

describe('runSceneFrame — physics error recovery', () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errSpy.mockRestore()
  })

  it('catches physics step errors, logs once, and finishes timing without rethrowing', () => {
    const pw = {
      step: () => {
        throw new Error('boom')
      },
      applyForce: () => {},
      getCollisions: () => [],
    } as unknown as PhysicsWorld
    const reg = {
      get culledSleepingEntityIds() {
        return new Set<string>()
      },
      applyDistanceCulling: () => {},
      clearDistanceCulling: () => {},
      executeTransformers: () => {},
      setRawInputGetter: () => {},
      syncFromPhysics: () => {},
    } as unknown as RenderItemRegistry
    const input = makeBaseInput({
      physicsRef: { current: pw },
      runPhysics: true,
      registryRef: { current: reg },
      recordFrameTiming: true,
    })
    expect(() => runSceneFrame(input)).not.toThrow()
    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(errSpy.mock.calls[0]![0]).toBe('Physics step error:')
    // Early-return path still runs `finishTiming` — frameMs populated.
    expect(input.frameTimingRef.current).not.toBeNull()
    expect(input.frameTimingRef.current!.frameMs).toBeGreaterThanOrEqual(0)
  })

  it('suppresses the physics error log when isCancelled (e.g. unmount)', () => {
    const pw = {
      step: () => {
        throw new Error('boom')
      },
      applyForce: () => {},
      getCollisions: () => [],
    } as unknown as PhysicsWorld
    const reg = {
      get culledSleepingEntityIds() {
        return new Set<string>()
      },
      applyDistanceCulling: () => {},
      clearDistanceCulling: () => {},
      executeTransformers: () => {},
      setRawInputGetter: () => {},
      syncFromPhysics: () => {},
    } as unknown as RenderItemRegistry
    let cancelled = false
    const input = makeBaseInput({
      physicsRef: { current: pw },
      runPhysics: true,
      registryRef: { current: reg },
      isCancelled: () => cancelled,
    })
    cancelled = true // simulate cancellation racing with the throw
    runSceneFrame(input)
    expect(errSpy).not.toHaveBeenCalled()
  })
})

describe('runSceneFrame — script collision and update gating', () => {
  it('runs scripts.runOnUpdate but not collisions when there is no physics world', () => {
    const runOnUpdate = vi.fn()
    const runOnCollision = vi.fn()
    const runner = {
      runOnUpdate,
      runOnCollision,
    } as unknown as ScriptRunner
    const input = makeBaseInput({
      scriptRunnerRef: { current: runner },
      runScripts: true,
    })
    runSceneFrame(input)
    expect(runOnCollision).not.toHaveBeenCalled()
    expect(runOnUpdate).toHaveBeenCalledWith(SCENE_FIXED_DT, undefined)
  })

  it('skips runOnUpdate while in edit-navigation mode', () => {
    const runOnUpdate = vi.fn()
    const runner = { runOnUpdate, runOnCollision: () => {} } as unknown as ScriptRunner
    const input = makeBaseInput({
      scriptRunnerRef: { current: runner },
      runScripts: true,
      editNavigationModeRef: { current: true },
    })
    runSceneFrame(input)
    expect(runOnUpdate).not.toHaveBeenCalled()
  })

  it('runs collisions both directions for each pair, with culledSleepingEntityIds passed through', () => {
    const runOnCollision = vi.fn()
    const runner = {
      runOnUpdate: () => {},
      runOnCollision,
    } as unknown as ScriptRunner
    const culled = new Set(['x'])
    const reg = {
      get culledSleepingEntityIds() {
        return culled
      },
      applyDistanceCulling: () => {},
      clearDistanceCulling: () => {},
      executeTransformers: () => {},
      setRawInputGetter: () => {},
      syncFromPhysics: () => {},
    } as unknown as RenderItemRegistry
    const pw = {
      step: () => {},
      applyForce: () => {},
      getCollisions: () => [{ entityIdA: 'a', entityIdB: 'b', impact: 0.42 }],
    } as unknown as PhysicsWorld
    const input = makeBaseInput({
      physicsRef: { current: pw },
      runPhysics: true,
      registryRef: { current: reg },
      scriptRunnerRef: { current: runner },
      runScripts: true,
    })
    runSceneFrame(input)
    expect(runOnCollision).toHaveBeenCalledTimes(2)
    expect(runOnCollision).toHaveBeenNthCalledWith(1, 'a', 'b', 0.42, culled)
    expect(runOnCollision).toHaveBeenNthCalledWith(2, 'b', 'a', 0.42, culled)
  })
})
