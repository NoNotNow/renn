import * as THREE from 'three'
import type { CameraConfig, CameraControl, CameraMode } from '@/types/world'
import type { FreeFlyKeys } from '@/types/camera'

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
const ORBIT_SENSITIVITY = 0.003
const ORBIT_PITCH_MIN = -Math.PI * 0.44
const ORBIT_PITCH_MAX = Math.PI * 0.44
const ORBIT_DISTANCE_MIN = 1
const ORBIT_DISTANCE_MAX = 150

const FIRST_PERSON_EYE_HEIGHT = 1.6
/** Pitch above entity forward (local −Z), radians (20°). */
const FIRST_PERSON_PITCH_UP_RAD = THREE.MathUtils.degToRad(5)

const IDENTITY_QUATERNION = new THREE.Quaternion()

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
  private orbitYaw = 0
  private orbitPitch = 0
  private orbitDistance = 10

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
    this.orbitDistance = cam.distance ?? 10
    this.applyPresetIfControl()
  }

  private applyPresetIfControl(): void {
    const c = this.config.control
    if (c === 'top' || c === 'front' || c === 'right') this.setViewPreset(c)
  }

  setConfig(config: CameraConfig): void {
    const prevControl = this.config.control
    const prevMode = this.config.mode
    this.config = config
    if (config.control !== prevControl) {
      this.orbitYaw = 0
      this.orbitPitch = 0
      this.orbitDistance = config.distance ?? 10
    }
    if (config.mode === 'firstPerson' && prevMode !== 'firstPerson') {
      this.orbitYaw = 0
      this.orbitPitch = 0
      this.orbitDistance = config.distance ?? 10
    }
    this.applyPresetIfControl()
  }

  /**
   * Accumulate mouse drag deltas (pixels) into orbit yaw/pitch angles.
   * Call each frame with the delta since last frame; pass 0,0 when no drag.
   */
  setOrbitDelta(dx: number, dy: number): void {
    this.orbitYaw -= dx * ORBIT_SENSITIVITY
    this.orbitPitch -= dy * ORBIT_SENSITIVITY
    this.orbitPitch = Math.max(ORBIT_PITCH_MIN, Math.min(ORBIT_PITCH_MAX, this.orbitPitch))
  }

  /** Adjust the orbit distance (zoom). delta > 0 = zoom out, delta < 0 = zoom in. */
  setOrbitDistanceDelta(delta: number): void {
    this.orbitDistance = Math.max(
      ORBIT_DISTANCE_MIN,
      Math.min(ORBIT_DISTANCE_MAX, this.orbitDistance + delta),
    )
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
        this.camera.position.set(0, 3, VIEW_PRESET_DISTANCE)
        this.camera.up.set(0, 1, 0)
        this.camera.lookAt(origin)
        break
      case 'right':
        this.camera.position.set(VIEW_PRESET_DISTANCE, 3, 0)
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
    const height = this.config.height ?? 2

    switch (this.config.mode as CameraMode) {
      case 'firstPerson': {
        this.camera.position.copy(this.currentTarget)
        this.camera.position.y += FIRST_PERSON_EYE_HEIGHT
        const entityQ = this.getEntityQuaternion(targetId) ?? IDENTITY_QUATERNION
        this.forward.set(0, 0, -1).applyQuaternion(entityQ).normalize()
        this.right.set(1, 0, 0).applyQuaternion(entityQ).normalize()
        this.forward.applyAxisAngle(this.right, FIRST_PERSON_PITCH_UP_RAD).normalize()
        this.camera.up.set(0, 1, 0)
        this.currentOffset.copy(this.camera.position).add(this.forward)
        this.camera.lookAt(this.currentOffset)
        break
      }
      case 'follow': {
        const followQ = this.getEntityQuaternion(targetId)
        this.currentOffset.copy(this.sphericalOffset(this.orbitDistance * 2, height))
        if (followQ) this.currentOffset.applyQuaternion(followQ)
        this.camera.position.copy(this.currentTarget).add(this.currentOffset)
        this.camera.lookAt(this.currentTarget)
        break
      }
      case 'thirdPerson': {
        const thirdPersonQ = this.getEntityQuaternion(targetId)
        this.currentOffset.copy(this.sphericalOffset(this.orbitDistance, height))
        if (thirdPersonQ) this.currentOffset.applyQuaternion(thirdPersonQ)
        this.camera.position.copy(this.currentTarget).add(this.currentOffset)
        this.camera.lookAt(this.currentTarget)
        break
      }
      case 'tracking': {
        this.currentOffset.copy(this.sphericalOffset(this.orbitDistance * 2 * 3, height))
        this.camera.position.copy(this.currentTarget).add(this.currentOffset)
        this.camera.lookAt(this.currentTarget)
        break
      }
      default:
        this.camera.position.copy(this.currentTarget).add(new THREE.Vector3(0, height, this.orbitDistance))
        this.camera.lookAt(this.currentTarget)
    }
  }

  /**
   * Compute a camera offset vector in local space from spherical orbit angles.
   * The base direction is "behind and above" (positive Z = back, positive Y = up).
   * orbitYaw rotates horizontally, orbitPitch tilts vertically.
   */
  private sphericalOffset(radius: number, height: number): THREE.Vector3 {
    const totalRadius = Math.sqrt(radius * radius + height * height)
    const basePitch = Math.atan2(height, radius)
    const pitch = basePitch + this.orbitPitch
    const yaw = this.orbitYaw
    const x = totalRadius * Math.sin(yaw) * Math.cos(pitch)
    const y = totalRadius * Math.sin(pitch)
    const z = totalRadius * Math.cos(yaw) * Math.cos(pitch)
    return new THREE.Vector3(x, y, z)
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
