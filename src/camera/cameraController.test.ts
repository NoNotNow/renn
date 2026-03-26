import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import {
  CameraController,
  DEFAULT_FREE_FLY_KEYS,
  DEFAULT_PERSPECTIVE_FOV_DEGREES,
} from './cameraController'

function createTestSetup() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(0, 5, 10)
  camera.lookAt(0, 0, 0)
  
  const scene = new THREE.Scene()
  scene.userData.camera = {
    control: 'free',
    mode: 'follow',
    target: 'player',
    distance: 10,
    height: 2,
  }
  
  const entityPositions: Record<string, THREE.Vector3> = {
    player: new THREE.Vector3(0, 0, 0),
  }
  
  const getEntityPosition = vi.fn((id: string) => entityPositions[id] ?? null)
  
  return {
    camera,
    scene,
    getEntityPosition,
    entityPositions,
  }
}

describe('CameraController', () => {
  it('creates a camera controller instance', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    expect(controller).toBeDefined()
  })

  it('gets and sets config', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    const config = controller.getConfig()
    expect(config.control).toBe('free')
    expect(config.target).toBe('player')
    
    controller.setConfig({
      control: 'follow',
      mode: 'thirdPerson',
      target: 'enemy',
      distance: 15,
      height: 3,
    })
    
    const newConfig = controller.getConfig()
    expect(newConfig.control).toBe('follow')
    expect(newConfig.target).toBe('enemy')
  })

  it('sets view preset to top', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    controller.setViewPreset('top')
    
    // Camera should be above looking down
    expect(camera.position.y).toBe(15)
    expect(camera.position.x).toBe(0)
    expect(camera.position.z).toBe(0)
  })

  it('sets view preset to front', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    controller.setViewPreset('front')
    
    // Camera should be in front looking at origin
    expect(camera.position.z).toBe(15)
    expect(camera.position.x).toBe(0)
    expect(camera.position.y).toBe(3)
  })

  it('sets view preset to right', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    controller.setViewPreset('right')
    
    // Camera should be on right side looking at origin
    expect(camera.position.x).toBe(15)
    expect(camera.position.y).toBe(3)
    expect(camera.position.z).toBe(0)
  })

  it('handles free fly input (W forward, smoothed)', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    const initialZ = camera.position.z
    
    controller.setFreeFlyInput({ w: true })
    for (let i = 0; i < 30; i++) controller.update(1 / 60)
    
    // Camera should have moved forward (negative z when looking at origin from +z)
    expect(camera.position.z).not.toBe(initialZ)
  })

  it('strafes with D along horizontal right', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    const controller = new CameraController({ camera, scene, getEntityPosition })
    const startX = camera.position.x
    controller.setFreeFlyInput({ d: true })
    for (let i = 0; i < 45; i++) controller.update(1 / 60)
    expect(Math.abs(camera.position.x - startX)).toBeGreaterThan(0.05)
  })

  it('yaws view with arrow keys (quaternion changes)', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    const controller = new CameraController({ camera, scene, getEntityPosition })
    const q0 = camera.quaternion.clone()
    controller.setFreeFlyInput({ arrowRight: true })
    for (let i = 0; i < 40; i++) controller.update(1 / 60)
    expect(camera.quaternion.angleTo(q0)).toBeGreaterThan(0.02)
  })

  it('free fly stays finite near vertical view (pole robustness)', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(0, 10, 0)
    camera.lookAt(0.01, 11, 0)
    const scene = new THREE.Scene()
    scene.userData.camera = {
      control: 'free',
      mode: 'follow',
      target: 'player',
      distance: 10,
      height: 2,
    }
    const getEntityPosition = vi.fn(() => new THREE.Vector3(0, 0, 0))
    const controller = new CameraController({ camera, scene, getEntityPosition })
    controller.setFreeFlyInput({ arrowRight: true, arrowUp: true, arrowDown: true })
    for (let i = 0; i < 120; i++) controller.update(1 / 60)
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    expect(Number.isFinite(dir.x)).toBe(true)
    expect(Number.isFinite(dir.y)).toBe(true)
    expect(Number.isFinite(dir.z)).toBe(true)
    expect(dir.length()).toBeGreaterThan(0.99)
    expect(dir.length()).toBeLessThan(1.01)
    expect(Number.isFinite(camera.position.x)).toBe(true)
    expect(camera.quaternion.length()).toBeGreaterThan(0.99)
  })

  /** Orbit-style pitch clamp was ±0.44π; sin that magnitude — free-fly must exceed this to prove no vertical stop. */
  const LEGACY_ORBIT_ELEV_ABS_SIN_CAP = Math.sin(Math.PI * 0.44)

  describe('free-fly look (tangent ω×forward integration)', () => {
    function freeFlyScene() {
      const scene = new THREE.Scene()
      scene.userData.camera = {
        control: 'free',
        mode: 'follow',
        target: 'player',
        distance: 10,
        height: 2,
      }
      const getEntityPosition = vi.fn(() => new THREE.Vector3(0, 0, 0))
      return { scene, getEntityPosition }
    }

    it('reaches |forward.y| beyond legacy orbit pitch cap (full vertical)', () => {
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      camera.position.set(0, 5, 0)
      camera.lookAt(10, 5, 0)
      const { scene, getEntityPosition } = freeFlyScene()
      const controller = new CameraController({ camera, scene, getEntityPosition })
      const dir = new THREE.Vector3()

      const run = (keys: { arrowUp?: boolean; arrowDown?: boolean }) => {
        controller.setFreeFlyInput(keys)
        for (let i = 0; i < 900; i++) controller.update(1 / 60)
        camera.getWorldDirection(dir)
        return dir.y
      }

      const yUp = run({ arrowUp: true })
      const cam2 = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      cam2.position.set(0, 5, 0)
      cam2.lookAt(10, 5, 0)
      const ctrl2 = new CameraController({ camera: cam2, scene, getEntityPosition })
      ctrl2.setFreeFlyInput({ arrowDown: true })
      for (let i = 0; i < 900; i++) ctrl2.update(1 / 60)
      cam2.getWorldDirection(dir)
      const yDown = dir.y

      const maxAbs = Math.max(Math.abs(yUp), Math.abs(yDown))
      expect(maxAbs).toBeGreaterThan(LEGACY_ORBIT_ELEV_ABS_SIN_CAP + 0.008)
    })

    it('keeps world forward unit length over long mixed arrow input', () => {
      const { camera, scene, getEntityPosition } = createTestSetup()
      const controller = new CameraController({ camera, scene, getEntityPosition })
      controller.setFreeFlyInput({
        arrowLeft: true,
        arrowDown: true,
      })
      const dir = new THREE.Vector3()
      for (let i = 0; i < 800; i++) {
        controller.update(1 / 60)
        camera.getWorldDirection(dir)
        expect(dir.length()).toBeGreaterThan(0.999)
        expect(dir.length()).toBeLessThan(1.001)
        expect(Number.isFinite(dir.x)).toBe(true)
      }
    })

    it('arrow up vs arrow down produce opposite vertical tilt from the same start', () => {
      const dir = new THREE.Vector3()
      const run = (arrowUp: boolean, arrowDown: boolean) => {
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
        camera.position.set(0, 5, 10)
        camera.lookAt(0, 0, 0)
        const scene = new THREE.Scene()
        scene.userData.camera = {
          control: 'free',
          mode: 'follow',
          target: 'player',
          distance: 10,
          height: 2,
        }
        const getEntityPosition = vi.fn(() => new THREE.Vector3(0, 0, 0))
        const controller = new CameraController({ camera, scene, getEntityPosition })
        camera.getWorldDirection(dir)
        const yStart = dir.y
        controller.setFreeFlyInput({ arrowUp, arrowDown })
        for (let i = 0; i < 360; i++) controller.update(1 / 60)
        camera.getWorldDirection(dir)
        return dir.y - yStart
      }

      const deltaUp = run(true, false)
      const deltaDown = run(false, true)
      expect(deltaUp * deltaDown).toBeLessThan(0)
      expect(Math.abs(deltaUp)).toBeGreaterThan(0.04)
      expect(Math.abs(deltaDown)).toBeGreaterThan(0.04)
    })

    it('does not touch orientation when look rates are zero (no arrows)', () => {
      const { camera, scene, getEntityPosition } = createTestSetup()
      const controller = new CameraController({ camera, scene, getEntityPosition })
      const q0 = camera.quaternion.clone()
      const dir0 = new THREE.Vector3()
      camera.getWorldDirection(dir0)
      for (let i = 0; i < 120; i++) controller.update(1 / 60)
      expect(camera.quaternion.angleTo(q0)).toBeLessThan(1e-6)
      const dir1 = new THREE.Vector3()
      camera.getWorldDirection(dir1)
      expect(dir0.distanceTo(dir1)).toBeLessThan(1e-5)
    })
  })

  it('Shift increases move speed vs no Shift', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    const start = new THREE.Vector3(0, 5, 10)
    const ctrlA = new CameraController({ camera, scene, getEntityPosition })
    ctrlA.setFreeFlyInput({ w: true })
    for (let i = 0; i < 60; i++) ctrlA.update(1 / 60)
    const distA = camera.position.distanceTo(start)

    const camB = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camB.position.copy(start)
    camB.lookAt(0, 0, 0)
    const sceneB = new THREE.Scene()
    sceneB.userData.camera = { control: 'free', mode: 'follow', target: 'player', distance: 10, height: 2 }
    const ctrlB = new CameraController({
      camera: camB,
      scene: sceneB,
      getEntityPosition,
    })
    ctrlB.setFreeFlyInput({ w: true, shift: true })
    for (let i = 0; i < 60; i++) ctrlB.update(1 / 60)
    const distB = camB.position.distanceTo(start)
    expect(distB).toBeGreaterThan(distA * 1.2)
  })

  it('Alt + W moves along world up (Y increases)', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    const controller = new CameraController({ camera, scene, getEntityPosition })
    const y0 = camera.position.y
    controller.setFreeFlyInput({ w: true, alt: true })
    for (let i = 0; i < 40; i++) controller.update(1 / 60)
    expect(camera.position.y).toBeGreaterThan(y0)
  })

  it('translation accelerates while W is held (boost grows)', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    const shortCtrl = new CameraController({ camera, scene, getEntityPosition })
    shortCtrl.setFreeFlyInput({ w: true })
    for (let i = 0; i < 15; i++) shortCtrl.update(1 / 60)
    const distShort = camera.position.distanceTo(new THREE.Vector3(0, 5, 10))

    const cam2 = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    cam2.position.set(0, 5, 10)
    cam2.lookAt(0, 0, 0)
    const scene2 = new THREE.Scene()
    scene2.userData.camera = { control: 'free', mode: 'follow', target: 'player', distance: 10, height: 2 }
    const longCtrl = new CameraController({ camera: cam2, scene: scene2, getEntityPosition })
    longCtrl.setFreeFlyInput({ w: true })
    for (let i = 0; i < 120; i++) longCtrl.update(1 / 60)
    const distLong = cam2.position.distanceTo(new THREE.Vector3(0, 5, 10))
    expect(distLong).toBeGreaterThan(distShort * 2)
  })

  it('force free fly runs while control is follow', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()

    scene.userData.camera = {
      control: 'follow',
      mode: 'follow',
      target: 'player',
      distance: 10,
      height: 2,
    }

    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })

    const initialZ = camera.position.z
    controller.setForceFreeFlyNavigation(true)
    controller.setFreeFlyInput({ w: true })
    controller.update(0.1)

    expect(camera.position.z).not.toBe(initialZ)
  })

  it('follows target entity in follow mode', () => {
    const { camera, scene, getEntityPosition, entityPositions } = createTestSetup()
    
    scene.userData.camera = {
      control: 'follow',
      mode: 'follow',
      target: 'player',
      distance: 10,
      height: 2,
    }
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    // Move player
    entityPositions.player.set(5, 0, 5)
    
    // Update multiple times for smoothing
    for (let i = 0; i < 100; i++) {
      controller.update(0.016)
    }
    
    // Camera should be behind and above the player
    expect(camera.position.x).toBeGreaterThan(0)
    expect(camera.position.y).toBeGreaterThan(0)
  })

  it('first person mode positions camera at entity and looks along pitched forward', () => {
    const { camera, scene, getEntityPosition, entityPositions } = createTestSetup()

    const identityQ = new THREE.Quaternion()
    const getEntityQuaternion = vi.fn((_id: string) => identityQ)

    scene.userData.camera = {
      control: 'follow',
      mode: 'firstPerson',
      target: 'player',
      distance: 10,
      height: 2,
    }

    entityPositions.player.set(10, 0, 10)

    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
      getEntityQuaternion,
    })

    controller.update(0.016)

    expect(camera.position.x).toBeCloseTo(10, 0)
    expect(camera.position.z).toBeCloseTo(10, 0)
    expect(camera.position.y).toBeCloseTo(1.6, 0)

    const expected = new THREE.Vector3(0, 0, -1)
    const right = new THREE.Vector3(1, 0, 0)
    expected.applyAxisAngle(right, THREE.MathUtils.degToRad(5)).normalize()

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    expect(dir.x).toBeCloseTo(expected.x, 5)
    expect(dir.y).toBeCloseTo(expected.y, 5)
    expect(dir.z).toBeCloseTo(expected.z, 5)
  })

  it('first person look direction follows entity yaw (not world −Z)', () => {
    const { camera, scene, getEntityPosition, entityPositions } = createTestSetup()

    const yaw90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    const getEntityQuaternion = vi.fn((_id: string) => yaw90)

    scene.userData.camera = {
      control: 'follow',
      mode: 'firstPerson',
      target: 'player',
      distance: 10,
      height: 2,
    }

    entityPositions.player.set(0, 0, 0)

    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
      getEntityQuaternion,
    })

    controller.update(0.016)

    const expected = new THREE.Vector3(0, 0, -1).applyQuaternion(yaw90).normalize()
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yaw90).normalize()
    expected.applyAxisAngle(right, THREE.MathUtils.degToRad(5)).normalize()

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    expect(dir.dot(expected)).toBeGreaterThan(0.999)
    expect(Math.abs(dir.x)).toBeGreaterThan(0.5)
  })

  it('first person copies target position in one frame (no position lerp)', () => {
    const { camera, scene, getEntityPosition, entityPositions } = createTestSetup()

    const identityQ = new THREE.Quaternion()
    const getEntityQuaternion = vi.fn((_id: string) => identityQ)

    scene.userData.camera = {
      control: 'follow',
      mode: 'firstPerson',
      target: 'player',
      distance: 10,
      height: 2,
    }

    entityPositions.player.set(42, 0, -17)

    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
      getEntityQuaternion,
    })

    controller.update(0.016)

    expect(camera.position.x).toBeCloseTo(42, 5)
    expect(camera.position.z).toBeCloseTo(-17, 5)
    expect(camera.position.y).toBeCloseTo(1.6, 5)
  })

  it('rotates camera offset with target quaternion in follow mode', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()

    scene.userData.camera = {
      control: 'follow',
      mode: 'follow',
      target: 'player',
      distance: 10,
      height: 0,
    }

    // 90-degree yaw around Y axis: target is now facing +X
    const yaw90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    const getEntityQuaternion = vi.fn((_id: string) => yaw90)

    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
      getEntityQuaternion,
    })

    // Run until smoothing converges
    for (let i = 0; i < 200; i++) {
      controller.update(0.016)
    }

    // Unrotated offset (0, 0, 20) rotated 90-deg around Y becomes (20, 0, 0).
    // The car now faces -X, so the camera at +X is correctly behind it.
    expect(camera.position.x).toBeGreaterThan(5)
    expect(Math.abs(camera.position.z)).toBeLessThan(5)
  })

  it('rotates camera offset with target quaternion in thirdPerson mode', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()

    scene.userData.camera = {
      control: 'follow',
      mode: 'thirdPerson',
      target: 'player',
      distance: 10,
      height: 0,
    }

    // 90-degree yaw: car faces -X, camera should land at +X (behind the car)
    const yaw90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    const getEntityQuaternion = vi.fn((_id: string) => yaw90)

    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
      getEntityQuaternion,
    })

    for (let i = 0; i < 200; i++) {
      controller.update(0.016)
    }

    expect(camera.position.x).toBeGreaterThan(5)
    expect(Math.abs(camera.position.z)).toBeLessThan(5)
  })

  it('keeps camera offset in world space in tracking mode (no target rotation)', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()

    scene.userData.camera = {
      control: 'follow',
      mode: 'tracking',
      target: 'player',
      distance: 10,
      height: 0,
    }

    // 90-degree yaw: target faces +X, but tracking ignores rotation
    const yaw90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    const getEntityQuaternion = vi.fn((_id: string) => yaw90)

    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
      getEntityQuaternion,
    })

    for (let i = 0; i < 200; i++) {
      controller.update(0.016)
    }

    // Target at (0, 0, 0); offset is world-space (0, 0, 60), so camera at (0, 0, 60) — not rotated to +X
    expect(camera.position.z).toBeGreaterThan(50)
    expect(Math.abs(camera.position.x)).toBeLessThan(5)
  })

  it('returns null for missing entity', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    scene.userData.camera = {
      control: 'follow',
      mode: 'follow',
      target: 'nonexistent',
      distance: 10,
      height: 2,
    }
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    const initialPos = camera.position.clone()
    controller.update(0.016)
    
    // Camera should not move if target not found
    expect(camera.position.equals(initialPos)).toBe(true)
  })

  it('applies view preset on construction when control is preset', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    scene.userData.camera = {
      control: 'top',
      mode: 'follow',
      target: 'player',
    }
    
    new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    // Camera should be at top position
    expect(camera.position.y).toBe(15)
  })

  describe('orbit (setOrbitDelta)', () => {
    function makeFollowController(mode: 'follow' | 'thirdPerson' | 'tracking' = 'follow') {
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      camera.position.set(0, 5, 10)
      camera.lookAt(0, 0, 0)

      const scene = new THREE.Scene()
      scene.userData.camera = {
        control: 'follow',
        mode,
        target: 'player',
        distance: 10,
        height: 0,
      }

      const entityPositions: Record<string, THREE.Vector3> = {
        player: new THREE.Vector3(0, 0, 0),
      }

      const controller = new CameraController({
        camera,
        scene,
        getEntityPosition: (id) => entityPositions[id] ?? null,
      })

      // Converge smoothing
      for (let i = 0; i < 200; i++) controller.update(0.016)

      return { camera, controller }
    }

    it('yaw right shifts camera to the left side of the target', () => {
      const { camera, controller } = makeFollowController('follow')
      const basePosX = camera.position.x

      // Positive dx → orbitYaw decreases → camera swings to -X side
      controller.setOrbitDelta(200, 0)
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(camera.position.x).toBeLessThan(basePosX)
    })

    it('yaw left shifts camera to the right side of the target', () => {
      const { camera, controller } = makeFollowController('follow')
      const basePosX = camera.position.x

      controller.setOrbitDelta(-200, 0)
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(camera.position.x).toBeGreaterThan(basePosX)
    })

    it('pitch up raises the camera above the target', () => {
      const { camera, controller } = makeFollowController('follow')
      const basePosY = camera.position.y

      // Negative dy → orbitPitch increases → camera moves higher
      controller.setOrbitDelta(0, -200)
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(camera.position.y).toBeGreaterThan(basePosY)
    })

    it('extreme orbit pitch deltas stay numerically finite', () => {
      const { camera, controller } = makeFollowController('follow')

      for (let i = 0; i < 50; i++) controller.setOrbitDelta(0, 10000)
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(Number.isFinite(camera.position.x)).toBe(true)
      expect(Number.isFinite(camera.position.y)).toBe(true)
      expect(Number.isFinite(camera.position.z)).toBe(true)
    })

    it('orbit resets when switching control mode', () => {
      const { camera, controller } = makeFollowController('follow')

      controller.setOrbitDelta(500, 0)
      for (let i = 0; i < 5; i++) controller.update(0.016)
      const orbitedX = camera.position.x

      // Switch to 'free' and back to 'follow' – orbit resets
      controller.setConfig({ control: 'free', mode: 'follow', target: 'player', distance: 10, height: 0 })
      controller.setConfig({ control: 'follow', mode: 'follow', target: 'player', distance: 10, height: 0 })
      for (let i = 0; i < 200; i++) controller.update(0.016)

      // After reset the camera should be back near Z axis (x close to 0)
      expect(Math.abs(camera.position.x)).toBeLessThan(Math.abs(orbitedX))
    })

    it('works in thirdPerson mode', () => {
      const { camera, controller } = makeFollowController('thirdPerson')
      const basePosX = camera.position.x

      controller.setOrbitDelta(200, 0)
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(camera.position.x).toBeLessThan(basePosX)
    })

    it('works in tracking mode (world-space orbit, same yaw as follow)', () => {
      const { camera, controller } = makeFollowController('tracking')
      const basePosX = camera.position.x

      controller.setOrbitDelta(200, 0)
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(camera.position.x).toBeLessThan(basePosX)
    })

    it('setOrbitDistanceDelta zooms in (smaller distance = camera closer)', () => {
      const { camera, controller } = makeFollowController('follow')
      for (let i = 0; i < 200; i++) controller.update(0.016)
      const baseZ = camera.position.z

      controller.setOrbitDistanceDelta(-5) // zoom in
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(Math.abs(camera.position.z)).toBeLessThan(Math.abs(baseZ))
    })

    it('setOrbitDistanceDelta zooms out', () => {
      const { camera, controller } = makeFollowController('follow')
      for (let i = 0; i < 200; i++) controller.update(0.016)
      const baseZ = camera.position.z

      controller.setOrbitDistanceDelta(5) // zoom out
      for (let i = 0; i < 5; i++) controller.update(0.016)

      expect(Math.abs(camera.position.z)).toBeGreaterThan(Math.abs(baseZ))
    })

    it('orbitDistance is clamped at min', () => {
      const { controller } = makeFollowController('follow')
      controller.setOrbitDistanceDelta(-10000)
      // Should not throw, distance should stay >= 1
      expect(() => controller.update(0.016)).not.toThrow()
    })

    it('orbitDistance is clamped at max', () => {
      const { controller } = makeFollowController('follow')
      controller.setOrbitDistanceDelta(10000)
      expect(() => controller.update(0.016)).not.toThrow()
    })

    function makeFirstPersonController() {
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      camera.position.set(0, 5, 10)
      camera.lookAt(0, 0, 0)

      const scene = new THREE.Scene()
      scene.userData.camera = {
        control: 'follow',
        mode: 'firstPerson',
        target: 'player',
        distance: 10,
        height: 2,
      }

      const entityPositions: Record<string, THREE.Vector3> = {
        player: new THREE.Vector3(0, 0, 0),
      }

      const identityQ = new THREE.Quaternion()
      const getEntityQuaternion = vi.fn((_id: string) => identityQ)

      const controller = new CameraController({
        camera,
        scene,
        getEntityPosition: (id) => entityPositions[id] ?? null,
        getEntityQuaternion,
      })

      controller.update(0.016)
      return { camera, controller }
    }

    it('setOrbitDelta yaw changes first-person look direction', () => {
      const { camera, controller } = makeFirstPersonController()
      const before = new THREE.Vector3()
      camera.getWorldDirection(before)

      controller.setOrbitDelta(400, 0)
      controller.update(0.016)

      const after = new THREE.Vector3()
      camera.getWorldDirection(after)
      expect(after.dot(before)).toBeLessThan(0.999)
    })

    it('setOrbitDistanceDelta adjusts FOV in first person', () => {
      const { camera, controller } = makeFirstPersonController()
      expect(camera.fov).toBe(DEFAULT_PERSPECTIVE_FOV_DEGREES)

      controller.setOrbitDistanceDelta(-5)
      expect(camera.fov).toBeLessThan(DEFAULT_PERSPECTIVE_FOV_DEGREES)

      controller.setOrbitDistanceDelta(10000)
      expect(camera.fov).toBe(75)

      controller.setOrbitDistanceDelta(-10000)
      expect(camera.fov).toBe(35)
    })

    it('leaving first person restores default FOV', () => {
      const { camera, controller } = makeFirstPersonController()
      controller.setOrbitDistanceDelta(-20)
      expect(camera.fov).not.toBe(DEFAULT_PERSPECTIVE_FOV_DEGREES)

      controller.setConfig({
        control: 'follow',
        mode: 'thirdPerson',
        target: 'player',
        distance: 10,
        height: 0,
      })

      expect(camera.fov).toBe(DEFAULT_PERSPECTIVE_FOV_DEGREES)
    })
  })
})

describe('DEFAULT_FREE_FLY_KEYS', () => {
  it('has all keys set to false by default', () => {
    expect(DEFAULT_FREE_FLY_KEYS.w).toBe(false)
    expect(DEFAULT_FREE_FLY_KEYS.a).toBe(false)
    expect(DEFAULT_FREE_FLY_KEYS.s).toBe(false)
    expect(DEFAULT_FREE_FLY_KEYS.d).toBe(false)
    expect(DEFAULT_FREE_FLY_KEYS.shift).toBe(false)
  })
})
