import * as THREE from 'three'
import type { AvatarFocusSnapshot, CameraConfig, CameraControl, CameraMode } from '@/types/world'
import type { FreeFlyKeys } from '@/types/camera'

export const DEFAULT_FREE_FLY_KEYS: FreeFlyKeys = {
  w: false,
  a: false,
  s: false,
  d: false,
  shift: false,
  alt: false,
  arrowLeft: false,
  arrowRight: false,
  arrowUp: false,
  arrowDown: false,
}

const FREE_FLY_MOVE_SPEED = 8
const FREE_FLY_SPRINT_MULTIPLIER = 2
/** Translation speed multiplier while move keys held; grows without a hard cap (safety clamp only). */
const FREE_FLY_MOVE_BOOST_START = 1
const FREE_FLY_TRANSLATION_BOOST_ACCEL = 2.2
const FREE_FLY_TRANSLATION_BOOST_DECAY = 7
const FREE_FLY_MOVE_BOOST_SAFETY_MAX = 5000
/** Capped look: max yaw/pitch rate (rad/s) when arrow ramp is saturated. */
const FREE_FLY_LOOK_YAW_MAX = 0.48
const FREE_FLY_LOOK_PITCH_MAX = 0.48
/** Arrow ramp 0..1 rise/fall per second (steering only). */
const FREE_FLY_LOOK_RAMP_UP = 1.6
const FREE_FLY_LOOK_RAMP_DOWN = 2.8
/** Exponential smoothing for move velocity (higher = snappier). */
const FREE_FLY_MOVE_SMOOTH = 14
/** Smoothing for yaw/pitch rates toward ramp-limited targets. */
const FREE_FLY_LOOK_SMOOTH = 16
/** `worldUp × forward` nearly zero when looking straight up/down — use projected stable right. */
const FREE_FLY_POLE_EPS_SQ = 1e-6
const VIEW_PRESET_DISTANCE = 15
const ORBIT_SENSITIVITY = 0.003
const ORBIT_DISTANCE_MIN = 1
const ORBIT_DISTANCE_MAX = 150
/** View-ray focus distance when edit-navigation orbit has no entity pivot. */
const EDIT_NAV_FOCUS_FALLBACK_DISTANCE = 12
/** Min polar angle from +Y (rad) to avoid gimbal flip when orbiting in edit mode. */
const EDIT_NAV_POLAR_EPS = 0.08

/** Matches SceneView `PerspectiveCamera(50, …)`; restored when leaving first person. */
export const DEFAULT_PERSPECTIVE_FOV_DEGREES = 50
const FIRST_PERSON_FOV_MIN = 35
const FIRST_PERSON_FOV_MAX = 75
/** Maps wheel/pinch distance delta to FOV change (degrees per unit delta). */
const FIRST_PERSON_FOV_PER_DISTANCE_DELTA = 0.8

const FIRST_PERSON_EYE_HEIGHT = 1.6
/** Pitch above entity forward (local −Z), radians (5°). */
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
  /** When true, `update()` runs free-fly only (Builder edit-navigation mode), ignoring `config.control`. */
  private forceFreeFlyNavigation = false
  /** Per-frame wheel/drag pixels for edit-navigation orbit (not mixed with follow-mode `orbitYaw`/`orbitPitch`). */
  private editNavOrbitPixelDx = 0
  private editNavOrbitPixelDy = 0
  /** Per-frame zoom delta (same units as `setOrbitDistanceDelta` for non–first-person). */
  private editNavZoomDelta = 0
  private readonly editNavPivotScratch = new THREE.Vector3()
  private readonly editNavOffsetScratch = new THREE.Vector3()
  /** When set, edit-navigation orbit/zoom uses this world point instead of camera target / view focus. */
  private readonly editNavSelectionPivot = new THREE.Vector3()
  private editNavUseSelectionPivot = false
  private readonly freeFlyMoveVel = new THREE.Vector3()
  private freeFlyYawRate = 0
  private freeFlyPitchRate = 0
  private readonly freeFlyTargetMove = new THREE.Vector3()
  private readonly freeFlyWorldUp = new THREE.Vector3(0, 1, 0)
  /** Last valid horizontal right for free-fly pitch when `up × forward` is degenerate. */
  private readonly freeFlyStableRight = new THREE.Vector3(1, 0, 0)
  /** World-space angular velocity (rad/s) for free-fly look: up * (-yawRate) + right * (-pitchRate). */
  private readonly freeFlyOmega = new THREE.Vector3()
  /** Tangent increment `omega × forward * dt` before normalizing forward. */
  private readonly freeFlyLookTangent = new THREE.Vector3()
  private readonly freeFlyIntent = new THREE.Vector3()
  /** Unbounded translation boost while move keys held; decays to FREE_FLY_MOVE_BOOST_START when idle. */
  private freeFlyMoveBoost = FREE_FLY_MOVE_BOOST_START
  /** 0..1 ramp for capped arrow look rate. */
  private freeFlyLookRamp = 0

  constructor(options: CameraControllerOptions) {
    this.camera = options.camera
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
    if (prevMode === 'firstPerson' && config.mode !== 'firstPerson') {
      this.camera.fov = DEFAULT_PERSPECTIVE_FOV_DEGREES
      this.camera.updateProjectionMatrix()
    }
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
    if (this.forceFreeFlyNavigation) {
      this.editNavOrbitPixelDx += dx
      this.editNavOrbitPixelDy += dy
      return
    }
    this.orbitYaw -= dx * ORBIT_SENSITIVITY
    this.orbitPitch -= dy * ORBIT_SENSITIVITY
  }

  /** Adjust the orbit distance (zoom). delta > 0 = zoom out, delta < 0 = zoom in. */
  setOrbitDistanceDelta(delta: number): void {
    if (this.config.mode === 'firstPerson') {
      const next = THREE.MathUtils.clamp(
        this.camera.fov + delta * FIRST_PERSON_FOV_PER_DISTANCE_DELTA,
        FIRST_PERSON_FOV_MIN,
        FIRST_PERSON_FOV_MAX,
      )
      this.camera.fov = next
      this.camera.updateProjectionMatrix()
      return
    }
    if (this.forceFreeFlyNavigation) {
      this.editNavZoomDelta += delta
      return
    }
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
    if (keys.alt !== undefined) this.freeFlyKeys.alt = keys.alt
    if (keys.arrowLeft !== undefined) this.freeFlyKeys.arrowLeft = keys.arrowLeft
    if (keys.arrowRight !== undefined) this.freeFlyKeys.arrowRight = keys.arrowRight
    if (keys.arrowUp !== undefined) this.freeFlyKeys.arrowUp = keys.arrowUp
    if (keys.arrowDown !== undefined) this.freeFlyKeys.arrowDown = keys.arrowDown
  }

  /** Reset free-fly dynamics after snapping position/quaternion from outside. */
  resetFreeFlySmoothing(): void {
    this.freeFlyMoveVel.set(0, 0, 0)
    this.freeFlyYawRate = 0
    this.freeFlyPitchRate = 0
    this.freeFlyMoveBoost = FREE_FLY_MOVE_BOOST_START
    this.freeFlyLookRamp = 0
    this.freeFlyStableRight.set(1, 0, 0)
  }

  setForceFreeFlyNavigation(enabled: boolean): void {
    this.forceFreeFlyNavigation = enabled
  }

  /**
   * Builder edit navigation: orbit around the selection centroid (or null to use camera target / focus ahead).
   * Call each frame while edit navigation is active.
   */
  setEditNavigationOrbitPivot(world: { x: number; y: number; z: number } | null): void {
    if (world === null) {
      this.editNavUseSelectionPivot = false
      return
    }
    this.editNavSelectionPivot.set(world.x, world.y, world.z)
    this.editNavUseSelectionPivot = true
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
    this.resetFreeFlySmoothing()
  }

  update(dt: number): void {
    if (this.forceFreeFlyNavigation) {
      this.updateFreeFly(dt)
      this.applyEditNavigationOrbitZoom()
      return
    }
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

    if (this.config.mode === 'firstPerson') {
      this.currentTarget.copy(pos)
    } else {
      this.currentTarget.lerp(pos, this.smooth)
    }
    const height = this.config.height ?? 2

    switch (this.config.mode as CameraMode) {
      case 'firstPerson': {
        this.camera.position.copy(this.currentTarget)
        this.camera.position.y += FIRST_PERSON_EYE_HEIGHT
        const entityQ = this.getEntityQuaternion(targetId) ?? IDENTITY_QUATERNION
        // Vehicle-local yaw (orbitYaw) then pitch (orbitPitch), then entity orientation — same idea as third/follow.
        this.forward.set(0, 0, -1)
        this.forward.applyAxisAngle(this.up, this.orbitYaw)
        this.right.set(1, 0, 0)
        this.forward.applyAxisAngle(this.right, this.orbitPitch)
        this.forward.applyQuaternion(entityQ).normalize()
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
    const { w, a, s, d, shift, alt, arrowLeft, arrowRight, arrowUp, arrowDown } = this.freeFlyKeys

    this.camera.getWorldDirection(this.forward)
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1)
    this.forward.normalize()
    // Horizontal strafe axis: worldUp × forward (Y-up).
    this.right.crossVectors(this.freeFlyWorldUp, this.forward)
    if (this.right.lengthSq() < FREE_FLY_POLE_EPS_SQ) {
      this.right.set(1, 0, 0)
    } else {
      this.right.normalize()
    }

    const moveForwardBack = !alt && (w || s)
    const moveVertical = alt && (w || s)
    const moveStrafe = a || d
    const translationKeysActive = moveForwardBack || moveVertical || moveStrafe

    if (translationKeysActive) {
      this.freeFlyMoveBoost = Math.min(
        FREE_FLY_MOVE_BOOST_SAFETY_MAX,
        this.freeFlyMoveBoost + FREE_FLY_TRANSLATION_BOOST_ACCEL * dt,
      )
    } else {
      this.freeFlyMoveBoost = Math.max(
        FREE_FLY_MOVE_BOOST_START,
        this.freeFlyMoveBoost - FREE_FLY_TRANSLATION_BOOST_DECAY * dt,
      )
    }

    const anyArrow = arrowLeft || arrowRight || arrowUp || arrowDown
    if (anyArrow) {
      this.freeFlyLookRamp = Math.min(1, this.freeFlyLookRamp + FREE_FLY_LOOK_RAMP_UP * dt)
    } else {
      this.freeFlyLookRamp = Math.max(0, this.freeFlyLookRamp - FREE_FLY_LOOK_RAMP_DOWN * dt)
    }

    const speedScalar =
      FREE_FLY_MOVE_SPEED * this.freeFlyMoveBoost * (shift ? FREE_FLY_SPRINT_MULTIPLIER : 1)

    this.freeFlyIntent.set(0, 0, 0)
    if (alt) {
      if (w) this.freeFlyIntent.addScaledVector(this.freeFlyWorldUp, 1)
      if (s) this.freeFlyIntent.addScaledVector(this.freeFlyWorldUp, -1)
    } else {
      if (w) this.freeFlyIntent.addScaledVector(this.forward, 1)
      if (s) this.freeFlyIntent.addScaledVector(this.forward, -1)
    }
    if (a) this.freeFlyIntent.addScaledVector(this.right, 1)
    if (d) this.freeFlyIntent.addScaledVector(this.right, -1)

    if (this.freeFlyIntent.lengthSq() > 1e-12) {
      this.freeFlyIntent.normalize().multiplyScalar(speedScalar)
      this.freeFlyTargetMove.copy(this.freeFlyIntent)
    } else {
      this.freeFlyTargetMove.set(0, 0, 0)
    }

    const moveAlpha = 1 - Math.exp(-FREE_FLY_MOVE_SMOOTH * dt)
    this.freeFlyMoveVel.lerp(this.freeFlyTargetMove, moveAlpha)
    this.camera.position.addScaledVector(this.freeFlyMoveVel, dt)

    const targetYawMax = FREE_FLY_LOOK_YAW_MAX * this.freeFlyLookRamp
    const targetPitchMax = FREE_FLY_LOOK_PITCH_MAX * this.freeFlyLookRamp
    const targetYaw =
      ((arrowRight ? 1 : 0) - (arrowLeft ? 1 : 0)) * targetYawMax
    const targetPitch =
      ((arrowDown ? 1 : 0) - (arrowUp ? 1 : 0)) * targetPitchMax

    const lookAlpha = 1 - Math.exp(-FREE_FLY_LOOK_SMOOTH * dt)
    this.freeFlyYawRate += (targetYaw - this.freeFlyYawRate) * lookAlpha
    this.freeFlyPitchRate += (targetPitch - this.freeFlyPitchRate) * lookAlpha

    if (this.freeFlyYawRate !== 0 || this.freeFlyPitchRate !== 0) {
      this.camera.getWorldDirection(this.forward)
      if (this.forward.lengthSq() < 1e-12) this.forward.set(0, 0, -1)
      this.forward.normalize()

      this.right.crossVectors(this.freeFlyWorldUp, this.forward)
      if (this.right.lengthSq() < FREE_FLY_POLE_EPS_SQ) {
        this.right.copy(this.freeFlyStableRight)
        this.right.addScaledVector(this.forward, -this.forward.dot(this.right))
        if (this.right.lengthSq() < FREE_FLY_POLE_EPS_SQ) {
          this.right.set(1, 0, 0)
          this.right.addScaledVector(this.forward, -this.forward.dot(this.right))
        }
      }
      this.right.normalize()

      this.freeFlyOmega
        .copy(this.freeFlyWorldUp)
        .multiplyScalar(-this.freeFlyYawRate)
        .addScaledVector(this.right, -this.freeFlyPitchRate)
      this.freeFlyLookTangent.crossVectors(this.freeFlyOmega, this.forward).multiplyScalar(dt)
      this.forward.add(this.freeFlyLookTangent)
      if (this.forward.lengthSq() < 1e-18) {
        this.forward.set(0, 0, -1)
      } else {
        this.forward.normalize()
      }

      this.right.crossVectors(this.freeFlyWorldUp, this.forward)
      if (this.right.lengthSq() >= FREE_FLY_POLE_EPS_SQ) {
        this.right.normalize()
        this.freeFlyStableRight.copy(this.right)
      }

      this.currentOffset.copy(this.camera.position).add(this.forward)
      this.camera.lookAt(this.currentOffset)
    }

    this.camera.up.copy(this.freeFlyWorldUp)
  }

  /** Turntable orbit + dolly after free-fly: selection pivot if set, else camera target entity, else focus ahead. */
  private applyEditNavigationOrbitZoom(): void {
    const dx = this.editNavOrbitPixelDx
    const dy = this.editNavOrbitPixelDy
    const zoomDelta = this.editNavZoomDelta
    this.editNavOrbitPixelDx = 0
    this.editNavOrbitPixelDy = 0
    this.editNavZoomDelta = 0

    if (dx === 0 && dy === 0 && zoomDelta === 0) return

    const pivot = this.editNavPivotScratch
    if (this.editNavUseSelectionPivot) {
      pivot.copy(this.editNavSelectionPivot)
    } else {
      const targetId = this.config.target ?? ''
      const entityPivot = targetId ? this.getEntityPosition(targetId) : null
      if (entityPivot) {
        pivot.copy(entityPivot)
      } else {
        this.camera.getWorldDirection(this.forward)
        if (this.forward.lengthSq() < 1e-12) this.forward.set(0, 0, -1)
        this.forward.normalize()
        pivot.copy(this.camera.position).addScaledVector(this.forward, EDIT_NAV_FOCUS_FALLBACK_DISTANCE)
      }
    }

    const offset = this.editNavOffsetScratch
    offset.copy(this.camera.position).sub(pivot)
    let dist = offset.length()
    if (dist < 1e-4) {
      this.camera.getWorldDirection(this.forward)
      if (this.forward.lengthSq() < 1e-12) this.forward.set(0, 0, -1)
      this.forward.normalize()
      offset.copy(this.forward).multiplyScalar(-ORBIT_DISTANCE_MIN)
      dist = ORBIT_DISTANCE_MIN
    }

    if (dx !== 0 || dy !== 0) {
      const yaw = -dx * ORBIT_SENSITIVITY
      offset.applyAxisAngle(this.freeFlyWorldUp, yaw)

      this.right.crossVectors(this.freeFlyWorldUp, offset)
      if (this.right.lengthSq() < FREE_FLY_POLE_EPS_SQ) {
        this.camera.getWorldDirection(this.forward)
        this.right.crossVectors(this.freeFlyWorldUp, this.forward)
        if (this.right.lengthSq() < FREE_FLY_POLE_EPS_SQ) {
          this.right.set(1, 0, 0)
        }
      }
      this.right.normalize()

      const pitch = -dy * ORBIT_SENSITIVITY
      offset.applyAxisAngle(this.right, pitch)

      const r = offset.length()
      if (r > 1e-8) {
        const cosPolar = THREE.MathUtils.clamp(offset.y / r, -1, 1)
        let polar = Math.acos(cosPolar)
        const polarMin = EDIT_NAV_POLAR_EPS
        const polarMax = Math.PI - EDIT_NAV_POLAR_EPS
        if (polar < polarMin || polar > polarMax) {
          polar = THREE.MathUtils.clamp(polar, polarMin, polarMax)
          const horizMag = Math.sin(polar) * r
          const theta = Math.atan2(offset.x, offset.z)
          offset.set(
            horizMag * Math.sin(theta),
            Math.cos(polar) * r,
            horizMag * Math.cos(theta),
          )
        }
      }
    }

    dist = offset.length()
    if (dist < 1e-6) return

    const newDist = THREE.MathUtils.clamp(dist + zoomDelta, ORBIT_DISTANCE_MIN, ORBIT_DISTANCE_MAX)
    offset.normalize().multiplyScalar(newDist)
    this.camera.position.copy(pivot).add(offset)
    this.camera.lookAt(pivot)
    this.camera.up.copy(this.freeFlyWorldUp)
  }

  /** Session snapshot for avatar switching: config + orbit + live FOV. */
  captureAvatarFocusState(): AvatarFocusSnapshot {
    const c = this.config
    return {
      control: (c.control ?? 'free') as CameraControl,
      mode: c.mode,
      target: c.target,
      distance: c.distance,
      height: c.height,
      fov: c.fov,
      orbitYaw: this.orbitYaw,
      orbitPitch: this.orbitPitch,
      orbitDistance: this.orbitDistance,
      effectiveFovDegrees: this.camera.fov,
    }
  }

  /**
   * Restore camera for an avatar from session memory or preferred defaults.
   * Mutates `this.config` (typically the same object as `scene.userData.camera`).
   */
  applyAvatarFocusState(state: AvatarFocusSnapshot): void {
    const prevMode = this.config.mode

    if (prevMode === 'firstPerson' && state.mode !== 'firstPerson') {
      this.camera.fov = DEFAULT_PERSPECTIVE_FOV_DEGREES
      this.camera.updateProjectionMatrix()
    }

    this.config.control = state.control
    this.config.mode = state.mode
    this.config.target = state.target
    this.config.distance = state.distance
    this.config.height = state.height
    if (state.fov !== undefined) this.config.fov = state.fov

    this.orbitYaw = state.orbitYaw
    this.orbitPitch = state.orbitPitch
    this.orbitDistance = state.orbitDistance

    if (state.mode === 'firstPerson') {
      this.camera.fov = state.effectiveFovDegrees
      this.camera.updateProjectionMatrix()
    }

    this.applyPresetIfControl()
  }
}
