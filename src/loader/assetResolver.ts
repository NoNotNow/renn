/**
 * GLTF type for model loading (minimal shape used by loaders).
 */
import * as THREE from 'three'

export interface GLTF {
  scene: THREE.Group
  scenes: THREE.Group[]
  cameras: THREE.Camera[]
  animations: THREE.AnimationClip[]
  asset: {
    generator?: string
    version?: string
    [key: string]: unknown
  }
  parser: unknown
  userData: unknown
}
