import * as THREE from 'three'
import type { CameraConfig, CameraControl, CameraMode } from '@/types/world'

export interface FreeFlyKeys {
  w: boolean
  a: boolean
  s: boolean
  d: boolean
  shift: boolean
}

export const DEFAULT_FREE_FLY_KEYS: FreeFlyKeys = {
  w: false,
  a: false,
  s: false,
  d: false,
  shift: false,
}

const MOVE_SPEED = 8
const TURN_SPEED = 2
const TILT_SPEED = 2
const VIEW_PRESET_DISTANCE = 15

export interface CameraControllerOptions {
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  getEntityPosition: (entityId: string) => THREE.Vector3 | null
  getEntityQuaternion?: (entityId: string) => THREE.Quaternion | null
}

export class CameraController {
  private camera: THREE.PerspectiveCamera
  private scene: THREE.Scene
  private getEntityPosition: (entityId: string) => THREE.Vector3 | null
  private getEntityQuaternion: (entityId: string) => THREE.Quaternion | null
  private config: CameraConfig
  private currentTarget = new THREE.Vector3()
  private currentOffset = new THREE.Vector3()
  private smooth = 0.1
  private freeFlyKeys: FreeFlyKeys = { ...DEFAULT_FREE_FLY_KEYS }
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(options: CameraControllerOptions) {
    this.camera = options.camera
    this.scene = options.scene
    this.getEntityPosition = options.getEntityPosition
    this.getEntityQuaternion = options.getEntityQuaternion ?? (() => null)
    const cam = (options.scene.userData.camera as CameraConfig) ?? {
      control: 'free' as CameraControl,
      mode: 'follow',
      target: '',
      distance: 10,
      height: 2,
    }
    this.config = cam
    this.applyPresetIfControl()
  }

  private applyPresetIfControl(): void {
    const c = this.config.control
    if (c === 'top' || c === 'front' || c === 'right') this.setViewPreset(c)
  }

  setConfig(config: CameraConfig): void {
    this.config = config
    this.applyPresetIfControl()
  }

  getConfig(): CameraConfig {
    return this.config
  }

  setFreeFlyInput(keys: Partial<FreeFlyKeys>): void {
    if (keys.w !== undefined) this.freeFlyKeys.w = keys.w
    if (keys.a !== undefined) this.freeFlyKeys.a = keys.a
    if (keys.s !== undefined) this.freeFlyKeys.s = keys.s
    if (keys.d !== undefined) this.freeFlyKeys.d = keys.d
    if (keys.shift !== undefined) this.freeFlyKeys.shift = keys.shift
  }

  setViewPreset(preset: 'top' | 'front' | 'right'): void {
    const origin = new THREE.Vector3(0, 0, 0)
    switch (preset) {
      case 'top':
        this.camera.position.set(0, VIEW_PRESET_DISTANCE, 0)
        this.camera.up.set(0, 0, -1)
        this.camera.lookAt(origin)
        break
      case 'front':
        this.camera.position.set(0, 0, VIEW_PRESET_DISTANCE)
        this.camera.up.set(0, 1, 0)
        this.camera.lookAt(origin)
        break
      case 'right':
        this.camera.position.set(VIEW_PRESET_DISTANCE, 0, 0)
        this.camera.up.set(0, 1, 0)
        this.camera.lookAt(origin)
        break
    }
  }

  update(dt: number): void {
    const control: CameraControl = this.config.control ?? 'free'
    if (control === 'free') {
      this.updateFreeFly(dt)
      return
    }
    if (control === 'top' || control === 'front' || control === 'right') return

    const targetId = this.config.target
    if (!targetId) return

    const pos = this.getEntityPosition(targetId)
    if (!pos) return

    this.currentTarget.lerp(pos, this.smooth)
    const distance = this.config.distance ?? 10
    const height = this.config.height ?? 2

    switch (this.config.mode as CameraMode) {
      case 'firstPerson':
        this.camera.position.copy(this.currentTarget)
        this.camera.position.y += 1.6
        break
      case 'thirdPerson':
      case 'follow': {
        this.currentOffset.set(0, height, distance)
        this.camera.position.copy(this.currentTarget).add(this.currentOffset)
        this.camera.lookAt(this.currentTarget)
        break
      }
      default:
        this.camera.position.copy(this.currentTarget).add(new THREE.Vector3(0, height, distance))
        this.camera.lookAt(this.currentTarget)
    }
  }

  private updateFreeFly(dt: number): void {
    const { w, a, s, d, shift } = this.freeFlyKeys
    this.camera.getWorldDirection(this.forward)
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1)
    this.forward.normalize()
    this.right.crossVectors(this.up, this.forward)
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0)
    this.right.normalize()

    if (shift) {
      // W/S = pitch (tilt), A/D = strafe
      if (w) this.camera.rotateOnWorldAxis(this.right, TILT_SPEED * dt)
      if (s) this.camera.rotateOnWorldAxis(this.right, -TILT_SPEED * dt)
      if (a) this.camera.position.addScaledVector(this.right, MOVE_SPEED * dt)
      if (d) this.camera.position.addScaledVector(this.right, -MOVE_SPEED * dt)
    } else {
      // W/S = forward/back, A/D = yaw (turn)
      if (w) this.camera.position.addScaledVector(this.forward, MOVE_SPEED * dt)
      if (s) this.camera.position.addScaledVector(this.forward, -MOVE_SPEED * dt)
      if (a) this.camera.rotateOnWorldAxis(this.up, TURN_SPEED * dt)
      if (d) this.camera.rotateOnWorldAxis(this.up, -TURN_SPEED * dt)
    }
  }
}
