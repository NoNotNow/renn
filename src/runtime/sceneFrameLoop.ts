/**
 * Single-frame work for SceneView: physics, transformers, scripts, camera, HUD, render.
 * Keeps the hot path in one module for easier testing and LLM edits.
 */

import type * as THREE from 'three'
import type { RefObject, MutableRefObject } from 'react'
import type { RennWorld, Vec3, EditorFreePose } from '@/types/world'
import type { RawInput, RawKeyboardState, RawWheelState } from '@/types/transformer'
import type { FreeFlyKeys } from '@/types/camera'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { ScriptRunner } from '@/scripts/scriptRunner'
import type { CameraController } from '@/camera/cameraController'
import { getRawInputSnapshot } from '@/input/rawInput'
import type { RawMouseDragState } from '@/input/rawMouseDrag'
import { averageUnlockedSelectionWorldPosition } from '@/editor/transformGizmoController'
import { getForwardSpeed } from '@/utils/vec3'

export const SCENE_FIXED_DT = 1 / 60

export interface SceneFrameLoopInputs {
  isCancelled: () => boolean
  fixedDt: number
  timeRef: MutableRefObject<number>
  rawWheelRef: RefObject<RawWheelState>
  orbitWheelRef: MutableRefObject<{ deltaX: number; deltaY: number; distanceDelta: number }>
  editNavigationModeRef: MutableRefObject<boolean>
  cameraCtrlRef: MutableRefObject<CameraController | null>
  physicsRef: MutableRefObject<PhysicsWorld | null>
  runPhysics: boolean
  activeDebugForcesRef: MutableRefObject<Array<{ entityId: string; force: Vec3; endTime: number }>>
  registryRef: MutableRefObject<RenderItemRegistry | null>
  rawKeyboardRef: RefObject<RawKeyboardState>
  worldRef: MutableRefObject<RennWorld>
  scriptRunnerRef: MutableRefObject<ScriptRunner | null>
  runScripts: boolean
  freeFlyKeysRef: RefObject<FreeFlyKeys | null>
  rawMouseDragRef: RefObject<RawMouseDragState | null>
  gizmoDraggingRef: MutableRefObject<boolean>
  selectedEntityIdsRef: MutableRefObject<string[]>
  editorFreePoseRef: MutableRefObject<EditorFreePose | null> | undefined
  cam: THREE.PerspectiveCamera | null
  lastEditorPoseWriteTimeRef: MutableRefObject<number>
  showGameHud: boolean
  lastHudDriveRef: MutableRefObject<{ speedMs: number; wheelAngle: number } | null>
  setHudDrive: (v: { speedMs: number; wheelAngle: number }) => void
  skyDomeRef: MutableRefObject<THREE.Mesh | null>
  rend: THREE.WebGLRenderer | null
  loadedScene: THREE.Scene | null
}

/**
 * Runs one simulation/render frame (called from requestAnimationFrame).
 */
export function runSceneFrame(input: SceneFrameLoopInputs): void {
  const {
    isCancelled,
    fixedDt: dt,
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
  } = input

  timeRef.current += dt

  const orbitCtrl = cameraCtrlRef.current
  const orbitCfg = orbitCtrl?.getConfig()
  const orbitFollowModes =
    orbitCfg?.mode === 'follow' ||
    orbitCfg?.mode === 'thirdPerson' ||
    orbitCfg?.mode === 'tracking' ||
    orbitCfg?.mode === 'firstPerson'
  const editNav = editNavigationModeRef.current
  const followCameraWheelOrbit = !editNav && orbitCfg?.control === 'follow' && orbitFollowModes
  const consumeWheelForCameraOrbit = followCameraWheelOrbit || editNav
  if (rawWheelRef.current && consumeWheelForCameraOrbit) {
    const rw = rawWheelRef.current
    orbitWheelRef.current.deltaX = rw.deltaX
    orbitWheelRef.current.deltaY = rw.deltaY
    orbitWheelRef.current.distanceDelta = (rw.pinchDelta ?? 0) + (rw.mouseWheelDelta ?? 0)
    rw.deltaX = 0
    rw.deltaY = 0
    rw.pinchDelta = 0
    rw.mouseWheelDelta = 0
  } else {
    orbitWheelRef.current.deltaX = 0
    orbitWheelRef.current.deltaY = 0
    orbitWheelRef.current.distanceDelta = 0
  }

  const pw = physicsRef.current
  if (pw && runPhysics && !isCancelled()) {
    try {
      const currentTime = timeRef.current
      activeDebugForcesRef.current = activeDebugForcesRef.current.filter((debugForce) => {
        if (currentTime >= debugForce.endTime) {
          return false
        }
        if (!editNav) {
          pw.applyForce(debugForce.entityId, debugForce.force[0], debugForce.force[1], debugForce.force[2])
        }
        return true
      })

      if (!editNav) {
        if (registryRef.current) {
          const rawInput: RawInput = getRawInputSnapshot(rawKeyboardRef, rawWheelRef)
          registryRef.current.setRawInputGetter(() => rawInput)
          const wind = worldRef.current.world.wind
          registryRef.current.executeTransformers(dt, wind)
        }

        pw.step(dt)
        registryRef.current?.syncFromPhysics()

        if (scriptRunnerRef.current && runScripts) {
          const collisions = pw.getCollisions()
          for (const { entityIdA, entityIdB, impact } of collisions) {
            scriptRunnerRef.current.runOnCollision(entityIdA, entityIdB, impact)
            scriptRunnerRef.current.runOnCollision(entityIdB, entityIdA, impact)
          }
        }
      }
    } catch (e) {
      if (!isCancelled()) {
        console.error('Physics step error:', e)
      }
      return
    }
  }

  if (scriptRunnerRef.current && runScripts && !editNavigationModeRef.current) {
    scriptRunnerRef.current.runOnUpdate(dt)
  }

  const ctrl = cameraCtrlRef.current
  if (ctrl) {
    ctrl.setForceFreeFlyNavigation(editNavigationModeRef.current)
    const useFreeFlyKeys =
      (ctrl.getConfig().control ?? 'free') === 'free' || editNavigationModeRef.current
    if (useFreeFlyKeys && freeFlyKeysRef.current) {
      ctrl.setFreeFlyInput(freeFlyKeysRef.current)
    }
    const drag = rawMouseDragRef.current
    const orbitWheel = orbitWheelRef.current
    const gizmoDrag = gizmoDraggingRef.current
    const orbitDx = (gizmoDrag ? 0 : (drag?.deltaX ?? 0)) + orbitWheel.deltaX
    const orbitDy = (gizmoDrag ? 0 : (drag?.deltaY ?? 0)) + orbitWheel.deltaY
    if (orbitDx !== 0 || orbitDy !== 0) {
      ctrl.setOrbitDelta(orbitDx, orbitDy)
    }
    if (drag) {
      drag.deltaX = 0
      drag.deltaY = 0
    }
    if (orbitWheel.distanceDelta !== 0) {
      ctrl.setOrbitDistanceDelta(orbitWheel.distanceDelta * 0.75)
      orbitWheel.distanceDelta = 0
    }
    if (editNavigationModeRef.current) {
      const selPivot = averageUnlockedSelectionWorldPosition(
        registryRef.current,
        selectedEntityIdsRef.current,
        (id) => worldRef.current.entities.find((e) => e.id === id),
      )
      ctrl.setEditNavigationOrbitPivot(
        selPivot ? { x: selPivot[0], y: selPivot[1], z: selPivot[2] } : null,
      )
    } else {
      ctrl.setEditNavigationOrbitPivot(null)
    }
    ctrl.update(dt)

    const poseSink = editorFreePoseRef
    if (poseSink && cam && !isCancelled()) {
      const cfg = ctrl.getConfig()
      const navigating = (cfg.control ?? 'free') === 'free' || editNavigationModeRef.current
      if (navigating) {
        const t = timeRef.current
        if (t - lastEditorPoseWriteTimeRef.current >= 0.35) {
          lastEditorPoseWriteTimeRef.current = t
          poseSink.current = {
            position: [cam.position.x, cam.position.y, cam.position.z],
            quaternion: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w],
          }
        }
      }
    }
  }

  if (showGameHud) {
    const camCtrl = cameraCtrlRef.current
    const targetId = (camCtrl?.getConfig().target ?? '').trim()
    let speedMs = 0
    let wheelAngle = 0
    const pwLoop = physicsRef.current
    const reg = registryRef.current
    if (targetId && pwLoop && reg) {
      const vel = pwLoop.getLinearVelocity(targetId)
      const forward = reg.getForwardVector(targetId)
      if (vel && forward) {
        speedMs = getForwardSpeed(vel, forward)
      }
      wheelAngle = reg.getCar2WheelAngle(targetId) ?? 0
    }
    const last = lastHudDriveRef.current
    const epsS = 0.05
    const epsW = 0.012
    if (
      last === null ||
      Math.abs(last.speedMs - speedMs) > epsS ||
      Math.abs(last.wheelAngle - wheelAngle) > epsW
    ) {
      lastHudDriveRef.current = { speedMs, wheelAngle }
      setHudDrive({ speedMs, wheelAngle })
    }
  }

  const dome = skyDomeRef.current
  if (dome && cam && !isCancelled()) {
    dome.position.copy(cam.position)
  }

  if (rend && loadedScene && cam && !isCancelled()) {
    rend.render(loadedScene, cam)
  }
}
