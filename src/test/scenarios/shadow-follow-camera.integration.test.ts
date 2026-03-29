/**
 * Integration: directional shadow ortho volume follows the viewer, not a fixed world point.
 *
 * Regression: `DirectionalLight.target` stayed at the origin while the orthographic shadow
 * frustum is centered on the target, so shadows only appeared in a region around world center.
 * `runSceneView` calls `syncDirectionalLightShadowFocusToCamera` each frame before render.
 */

import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import { createDefaultEntity } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'
import { getSceneUserData } from '@/types/sceneUserData'
import {
  syncDirectionalLightShadowFocusToCamera,
  DIRECTIONAL_LIGHT_OFFSET_DISTANCE,
} from '@/utils/shadowBounds'
import { runSceneFrame, SCENE_FIXED_DT } from '@/runtime/sceneFrameLoop'
import type { SceneFrameLoopInputs } from '@/runtime/sceneFrameLoop'

function minimalWorld(overrides?: Partial<RennWorld['world']>): RennWorld {
  const plane = createDefaultEntity('plane')
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      camera: { control: 'free', mode: 'follow', target: '', distance: 10, height: 2 },
      ...overrides,
    },
    entities: [plane],
  }
}

describe('shadow follow camera (integration)', () => {
  it('after load, light target is origin; sync moves target to camera and preserves parallel offset', async () => {
    const world = minimalWorld()
    const { scene } = await loadWorld(world)
    const dirLight = getSceneUserData(scene).directionalLight!
    expect(dirLight.target.position.x).toBe(0)
    expect(dirLight.target.position.y).toBe(0)
    expect(dirLight.target.position.z).toBe(0)

    const cam = new THREE.PerspectiveCamera()
    cam.position.set(250, 12, -180)

    syncDirectionalLightShadowFocusToCamera(scene, cam)

    expect(dirLight.target.position.x).toBeCloseTo(250)
    expect(dirLight.target.position.y).toBeCloseTo(12)
    expect(dirLight.target.position.z).toBeCloseTo(-180)

    const [dx, dy, dz] = [1, 2, 1]
    expect(dirLight.position.x).toBeCloseTo(250 + dx * DIRECTIONAL_LIGHT_OFFSET_DISTANCE)
    expect(dirLight.position.y).toBeCloseTo(12 + dy * DIRECTIONAL_LIGHT_OFFSET_DISTANCE)
    expect(dirLight.position.z).toBeCloseTo(-180 + dz * DIRECTIONAL_LIGHT_OFFSET_DISTANCE)
  })

  it('uses world.directionalLight.direction for the sun offset after sync', async () => {
    const world = minimalWorld({
      directionalLight: { direction: [0, 1, 0], color: [1, 1, 1], intensity: 1 },
    })
    const { scene } = await loadWorld(world)
    const dirLight = getSceneUserData(scene).directionalLight!
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(100, 5, -40)

    syncDirectionalLightShadowFocusToCamera(scene, cam)

    expect(dirLight.target.position.x).toBeCloseTo(100)
    expect(dirLight.target.position.y).toBeCloseTo(5)
    expect(dirLight.target.position.z).toBeCloseTo(-40)
    expect(dirLight.position.x).toBeCloseTo(100)
    expect(dirLight.position.y).toBeCloseTo(5 + DIRECTIONAL_LIGHT_OFFSET_DISTANCE)
    expect(dirLight.position.z).toBeCloseTo(-40)
  })

  it('runSceneFrame syncs shadow focus before render (camera far from origin)', async () => {
    const world = minimalWorld()
    const { scene } = await loadWorld(world)
    const dirLight = getSceneUserData(scene).directionalLight!
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(-420, 30, 310)

    const rend = {
      shadowMap: { enabled: true },
      render: vi.fn(),
    } as unknown as InstanceType<typeof THREE.WebGLRenderer>

    const input: SceneFrameLoopInputs = {
      isCancelled: () => false,
      fixedDt: SCENE_FIXED_DT,
      timeRef: { current: 0 },
      rawWheelRef: { current: null },
      orbitWheelRef: { current: { deltaX: 0, deltaY: 0, distanceDelta: 0 } },
      editNavigationModeRef: { current: false },
      cameraCtrlRef: { current: null },
      physicsRef: { current: null },
      runPhysics: false,
      activeDebugForcesRef: { current: [] },
      registryRef: { current: null },
      rawKeyboardRef: { current: null },
      worldRef: { current: world },
      scriptRunnerRef: { current: null },
      runScripts: false,
      freeFlyKeysRef: { current: null },
      rawMouseDragRef: { current: null },
      gizmoDraggingRef: { current: false },
      selectedEntityIdsRef: { current: [] },
      editorFreePoseRef: undefined,
      cam,
      lastEditorPoseWriteTimeRef: { current: 0 },
      showGameHud: false,
      lastHudDriveRef: { current: null },
      setHudDrive: () => {},
      skyDomeRef: { current: null },
      rend,
      loadedScene: scene,
    }

    runSceneFrame(input)

    expect(rend.render).toHaveBeenCalledWith(scene, cam)
    expect(dirLight.target.position.x).toBeCloseTo(-420)
    expect(dirLight.target.position.y).toBeCloseTo(30)
    expect(dirLight.target.position.z).toBeCloseTo(310)
  })
})
