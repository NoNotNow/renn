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
