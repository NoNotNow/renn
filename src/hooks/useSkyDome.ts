import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** Radius inside camera far plane (PerspectiveCamera default far = 1000). */
export const SKY_DOME_RADIUS = 500

export function disposeSkyDomeMesh(mesh: THREE.Mesh | null): void {
  if (!mesh) return
  mesh.removeFromParent()
  mesh.geometry.dispose()
  const mat = mesh.material
  if (mat instanceof THREE.MeshBasicMaterial) {
    mat.map?.dispose()
    mat.dispose()
  }
}

export interface UseSkyDomeArgs {
  scene: THREE.Scene | null
  skyboxAssetId: string | undefined
  assets: Map<string, Blob>
}

/**
 * Loads (and disposes) a skybox sphere mesh into the given `scene` whenever
 * `skyboxAssetId` or the underlying blob changes. The returned ref points at
 * the live mesh (or `null`) and is intended for per-frame consumers (e.g. the
 * scene frame loop, which copies the camera position into it).
 */
export function useSkyDome({ scene, skyboxAssetId, assets }: UseSkyDomeArgs): {
  skyDomeRef: React.MutableRefObject<THREE.Mesh | null>
} {
  const skyDomeRef = useRef<THREE.Mesh | null>(null)

  useEffect(() => {
    if (!scene) {
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
      return
    }

    const id = skyboxAssetId?.trim()
    if (!id) {
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
      return
    }

    const blob = assets.get(id)
    if (!blob) {
      console.warn(`[useSkyDome] Skybox asset id not in project assets map: ${id}`)
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
      return
    }

    let cancelled = false
    const loader = new THREE.TextureLoader()

    void (async () => {
      const url = URL.createObjectURL(blob)
      let tex: THREE.Texture | null = null
      try {
        tex = await loader.loadAsync(url)
      } catch (e) {
        console.warn(`[useSkyDome] Failed to load skybox texture ${id}:`, e)
      } finally {
        URL.revokeObjectURL(url)
      }

      if (cancelled || !scene) {
        tex?.dispose()
        return
      }
      if (!tex) return

      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null

      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping

      const geo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 64, 32)
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = '__renn_sky_dome'
      mesh.frustumCulled = false
      mesh.renderOrder = -1
      scene.add(mesh)
      skyDomeRef.current = mesh
    })()

    return () => {
      cancelled = true
      disposeSkyDomeMesh(skyDomeRef.current)
      skyDomeRef.current = null
    }
  }, [scene, skyboxAssetId, assets])

  return { skyDomeRef }
}
