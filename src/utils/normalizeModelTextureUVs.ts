import * as THREE from 'three'

const DEGENERATE_SPAN = 1e-5
/** If UVs span more than this (often bad world-space / CAD exports), squash bbox to [0,1]² per axis. */
const EXTREME_UV_SPAN = 64

/**
 * Makes UVs usable for `Texture.repeat` / `Texture.offset` on loaded GLTF scenes.
 *
 * Some assets (e.g. certain Sketchfab-style models) use:
 * - degenerate UVs (single point → repeat has no effect, only offset nudges the sample),
 * - huge translated coordinates (integer-heavy ranges → `repeat` barely changes fractional sampling).
 *
 * Runs after `normalizeSceneToUnitCube` so positions are in mesh-local space [-0.5, 0.5]³ for planar fallback.
 */
export function normalizeModelTextureUVs(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return
    const geom = child.geometry
    const pos = geom.getAttribute('position')
    if (!pos) return

    let uv = geom.getAttribute('uv') as THREE.BufferAttribute | undefined
    const count = pos.count

    if (!uv || uv.itemSize < 2 || uv.count !== count) {
      const arr = new Float32Array(count * 2)
      for (let i = 0; i < count; i++) {
        const x = pos.getX(i)
        const z = pos.getZ(i)
        arr[i * 2] = x + 0.5
        arr[i * 2 + 1] = z + 0.5
      }
      geom.setAttribute('uv', new THREE.BufferAttribute(arr, 2))
      return
    }

    let uMin = Infinity
    let uMax = -Infinity
    let vMin = Infinity
    let vMax = -Infinity
    for (let i = 0; i < count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      uMin = Math.min(uMin, u)
      uMax = Math.max(uMax, u)
      vMin = Math.min(vMin, v)
      vMax = Math.max(vMax, v)
    }
    const spanU = uMax - uMin
    const spanV = vMax - vMin

    if (spanU < DEGENERATE_SPAN || spanV < DEGENERATE_SPAN) {
      for (let i = 0; i < count; i++) {
        const x = pos.getX(i)
        const z = pos.getZ(i)
        uv.setX(i, x + 0.5)
        uv.setY(i, z + 0.5)
      }
      uv.needsUpdate = true
      return
    }

    for (let i = 0; i < count; i++) {
      uv.setX(i, uv.getX(i) - uMin)
      uv.setY(i, uv.getY(i) - vMin)
    }

    const nuMax = uMax - uMin
    const nvMax = vMax - vMin
    if (nuMax > EXTREME_UV_SPAN || nvMax > EXTREME_UV_SPAN) {
      const su = Math.max(nuMax, DEGENERATE_SPAN)
      const sv = Math.max(nvMax, DEGENERATE_SPAN)
      for (let i = 0; i < count; i++) {
        uv.setX(i, uv.getX(i) / su)
        uv.setY(i, uv.getY(i) / sv)
      }
    }

    uv.needsUpdate = true
  })
}
