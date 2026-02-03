/**
 * Resolves asset ID to URL or Blob for loading textures/models.
 * Implementations: in-memory map (builder), IndexedDB (persistence), or server URLs.
 */
export type AssetResolver = (assetId: string) => Promise<string | Blob | null> | (string | Blob | null)

/**
 * GLTF type for model loading
 */
export interface GLTF {
  scene: THREE.Group
  scenes: THREE.Group[]
  cameras: THREE.Camera[]
  animations: THREE.AnimationClip[]
  asset: {
    generator?: string
    version?: string
    [key: string]: any
  }
  parser: any
  userData: any
}

import * as THREE from 'three'
