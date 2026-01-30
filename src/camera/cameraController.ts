import * as THREE from 'three'
import type { CameraConfig, CameraMode } from '@/types/world'

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

  constructor(options: CameraControllerOptions) {
    this.camera = options.camera
    this.scene = options.scene
    this.getEntityPosition = options.getEntityPosition
    this.getEntityQuaternion = options.getEntityQuaternion ?? (() => null)
    const cam = (options.scene.userData.camera as CameraConfig) ?? {
      mode: 'follow',
      target: '',
      distance: 10,
      height: 2,
    }
    this.config = cam
  }

  setConfig(config: CameraConfig): void {
    this.config = config
  }

  getConfig(): CameraConfig {
    return this.config
  }

  update(_dt: number): void {
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
        // Rotation driven by pointer elsewhere
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
}
