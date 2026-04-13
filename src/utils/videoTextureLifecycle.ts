import * as THREE from 'three'

/** Pause and detach video element before material disposal (avoids stray decode / audio). */
export function disposeVideoAwareMaterial(mat: THREE.Material): void {
  if (mat instanceof THREE.MeshStandardMaterial && mat.map instanceof THREE.VideoTexture) {
    const img = mat.map.image as HTMLVideoElement | undefined
    if (img && typeof img.pause === 'function') {
      img.pause()
      img.removeAttribute('src')
      img.load()
    }
  }
  mat.dispose()
}

export function disposeMaterialOrArray(m: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(m)) {
    for (const x of m) disposeVideoAwareMaterial(x)
  } else {
    disposeVideoAwareMaterial(m)
  }
}
