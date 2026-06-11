import * as THREE from 'three'
import type { FogSettings } from '@/types/world'

/** Apply or clear linear distance fog on a Three.js scene. */
export function applySceneFog(scene: THREE.Scene, fog: FogSettings | null): void {
  if (!fog) {
    scene.fog = null
    return
  }
  const [r, g, b] = fog.color ?? [0.4, 0.6, 0.9]
  scene.fog = new THREE.Fog(new THREE.Color(r, g, b), fog.near ?? 10, fog.far ?? 200)
}
