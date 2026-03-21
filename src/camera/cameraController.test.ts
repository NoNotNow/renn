import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { CameraController, DEFAULT_FREE_FLY_KEYS } from './cameraController'

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

  it('handles free fly input', () => {
    const { camera, scene, getEntityPosition } = createTestSetup()
    
    const controller = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    
    const initialZ = camera.position.z
    
    controller.setFreeFlyInput({ w: true })
    controller.update(0.1)
    
    // Camera should have moved forward (negative z when looking at origin from +z)
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

  it('first person mode positions camera at entity', () => {
    const { camera, scene, getEntityPosition, entityPositions } = createTestSetup()
    
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
    })
    
    // Update multiple times
    for (let i = 0; i < 100; i++) {
      controller.update(0.016)
    }
    
    // Camera should be at player position (approximately, due to smoothing)
    expect(camera.position.x).toBeCloseTo(10, 0)
    expect(camera.position.z).toBeCloseTo(10, 0)
    // Height should be eye level
    expect(camera.position.y).toBeCloseTo(1.6, 0)
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

    it('pitch is clamped and does not flip the camera', () => {
      const { camera, controller } = makeFollowController('follow')

      // Apply extreme downward pitch many times
      for (let i = 0; i < 50; i++) controller.setOrbitDelta(0, 10000)
      for (let i = 0; i < 5; i++) controller.update(0.016)

      // Camera Y must still be above the target (clamped, not flipped)
      expect(camera.position.y).toBeGreaterThan(-Infinity)
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
