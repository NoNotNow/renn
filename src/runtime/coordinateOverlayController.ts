import * as THREE from 'three'
import type { CoordinateOverlayEntry } from './coordinateOverlayBridge'

/** World-space radius of the cylinder drawn from entity to target coordinate. */
const LINE_RADIUS = 0.035

/** Same stacking as TransformControls: draw after scene meshes, not depth-occluded. */
const OVERLAY_RENDER_ORDER = Infinity

function createLineMaterial(cssColor: string): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    transparent: true,
    opacity: 0.85,
  })
  mat.color.setStyle(cssColor)
  return mat
}

type LineSlot = {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
}

/**
 * Renders world-space lines (thin cylinders) for each line
 * published via `api.visualizeLine()`.
 * Cylinder geometry is 1 unit tall along local Y; `sync` repositions/rotates each
 * mesh so it spans from `entry.from` to `entry.to` in world space.
 */
export class CoordinateOverlayController {
  private readonly scene: THREE.Scene
  private readonly _unitGeom: THREE.CylinderGeometry
  private readonly _slots: LineSlot[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
    // 1-unit-tall, thin cylinder; scaled per-line in sync()
    this._unitGeom = new THREE.CylinderGeometry(LINE_RADIUS, LINE_RADIUS, 1, 8, 1)
  }

  private ensureSlotCount(need: number): void {
    while (this._slots.length < need) {
      const material = createLineMaterial('#ffffff')
      const mesh = new THREE.Mesh(this._unitGeom, material)
      mesh.renderOrder = OVERLAY_RENDER_ORDER
      this.scene.add(mesh)
      this._slots.push({ mesh, material })
    }
  }

  sync(entries: CoordinateOverlayEntry[]): void {
    const n = entries.length
    this.ensureSlotCount(n)

    for (let i = 0; i < n; i += 1) {
      const slot = this._slots[i]!
      const entry = entries[i]!

      const from = new THREE.Vector3(entry.from[0], entry.from[1], entry.from[2])
      const to = new THREE.Vector3(entry.to[0], entry.to[1], entry.to[2])

      const dir = new THREE.Vector3().subVectors(to, from)
      const length = dir.length()

      if (length < 1e-6) {
        slot.mesh.visible = false
        continue
      }

      slot.mesh.visible = true
      slot.material.color.setStyle(entry.color)

      // Position at midpoint, scale Y to line length, orient along direction
      slot.mesh.position.copy(from).addScaledVector(dir, 0.5)
      slot.mesh.scale.set(1, length, 1)
      slot.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize(),
      )
    }

    for (let i = n; i < this._slots.length; i += 1) {
      this._slots[i]!.mesh.visible = false
    }
  }

  dispose(): void {
    for (const slot of this._slots) {
      this.scene.remove(slot.mesh)
      slot.material.dispose()
    }
    this._slots.length = 0
    this._unitGeom.dispose()
  }
}
