import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Vec3 } from '@/types/world'

export interface VariableOverlaySlotPayload {
  index: number
  value: number
  color: string
  name: string
  observedMin: number
  observedMax: number
}

/** Column center X for 1-based column index `col` in `1..n` (spec spacing). */
export function variableOverlayColumnX(col: number, n: number, groupWidth: number): number {
  const half = groupWidth / 2
  return -half + (col / (n + 1)) * groupWidth
}

/** Signed bar extent along Y (world); same scale as `groupWidth` for full-scale values. */
export function variableOverlaySignedBarLength(
  value: number,
  observedMin: number,
  observedMax: number,
  groupWidth: number,
): number {
  const maxAbs = Math.max(Math.abs(observedMin), Math.abs(observedMax))
  const denom = maxAbs > 1e-12 ? maxAbs : 1
  return (value / denom) * groupWidth
}

/** World-space thickness = groupWidth × this factor (mesh bars + zero strip). */
const STROKE_WIDTH_FACTOR = 0.04

type BarSlot = {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  label: CSS2DObject
  div: HTMLDivElement
}

/**
 * World-space variable bars + CSS2D labels at an entity position (no rotation; Y up).
 * Uses thin boxes instead of GL lines so stroke width is visible and configurable.
 */
export class VariableOverlayController {
  readonly root = new THREE.Group()
  private readonly groupWidth: number
  private readonly zeroMesh: THREE.Mesh
  private readonly zeroGeom: THREE.BoxGeometry
  private readonly zeroMaterial: THREE.MeshBasicMaterial
  private readonly barUnitGeom: THREE.BoxGeometry
  private readonly bars: BarSlot[] = []

  constructor(scene: THREE.Scene, groupWidth: number) {
    this.groupWidth = groupWidth
    this.root.name = '__variable_overlay__'

    const stroke = this.strokeWorld()
    this.zeroGeom = new THREE.BoxGeometry(1, 1, 1)
    this.zeroMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
    })
    this.zeroMesh = new THREE.Mesh(this.zeroGeom, this.zeroMaterial)
    this.zeroMesh.scale.set(this.groupWidth, stroke, stroke)
    this.root.add(this.zeroMesh)

    this.barUnitGeom = new THREE.BoxGeometry(1, 1, 1)

    scene.add(this.root)
    this.sync(null, null, [])
  }

  private strokeWorld(): number {
    return Math.max(0.05, this.groupWidth * STROKE_WIDTH_FACTOR)
  }

  private ensureBarCount(need: number): void {
    while (this.bars.length < need) {
      const material = new THREE.MeshBasicMaterial()
      const mesh = new THREE.Mesh(this.barUnitGeom, material)
      this.root.add(mesh)

      const div = document.createElement('div')
      div.style.fontFamily = 'system-ui, sans-serif'
      div.style.fontSize = '11px'
      div.style.fontWeight = '600'
      div.style.pointerEvents = 'none'
      div.style.textShadow = '0 0 2px #000'
      div.style.whiteSpace = 'nowrap'
      const label = new CSS2DObject(div)
      label.center.set(0.5, 1)
      this.root.add(label)

      this.bars.push({ mesh, material, label, div })
    }
  }

  sync(_entityId: string | null, position: Vec3 | null, slots: VariableOverlaySlotPayload[]): void {
    const show = Boolean(position && slots.length > 0)
    this.root.visible = show
    if (!show || !position) return

    this.root.position.set(position[0], position[1], position[2])
    this.root.quaternion.identity()

    const w = this.groupWidth
    const n = slots.length
    const half = w / 2
    const stroke = this.strokeWorld()

    this.zeroMesh.scale.set(2 * half, stroke, stroke)
    this.zeroMesh.position.set(0, 0, 0)

    this.ensureBarCount(n)

    const labelY = -Math.max(0.08, w * 0.06)

    for (let i = 0; i < n; i += 1) {
      const slot = slots[i]!
      const { mesh, material, label, div } = this.bars[i]!

      mesh.visible = true
      label.visible = true

      const col = i + 1
      const x = variableOverlayColumnX(col, n, w)
      const barLen = variableOverlaySignedBarLength(slot.value, slot.observedMin, slot.observedMax, w)

      const h = Math.max(Math.abs(barLen), stroke * 0.35)
      mesh.scale.set(stroke, h, stroke)
      mesh.position.set(x, barLen * 0.5, 0)

      material.color.set(slot.color)
      material.needsUpdate = true

      div.textContent = slot.name
      div.style.color = slot.color

      label.position.set(x, labelY, 0)
    }

    for (let i = n; i < this.bars.length; i += 1) {
      this.bars[i]!.mesh.visible = false
      this.bars[i]!.label.visible = false
    }
  }

  dispose(): void {
    const parent = this.root.parent
    if (parent) parent.remove(this.root)
    this.zeroGeom.dispose()
    this.zeroMaterial.dispose()
    this.barUnitGeom.dispose()
    for (const b of this.bars) {
      b.material.dispose()
    }
    this.bars.length = 0
  }
}
