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

/** Signed bar extent along overlay local Y (screen-up when oriented to camera); same scale as `groupWidth` for full-scale values. */
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

/** Same stacking as `TransformControls` gizmo: draw after scene meshes, not depth-occluded. */
const OVERLAY_RENDER_ORDER = Infinity

function createOverlayMaterial(initial: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    transparent: true,
    ...initial,
  })
}

/** Same CSS strings as labels (`THREE.Color.setStyle`); invalid strings fall back to white (Three warns). */
function setBarMaterialColor(material: THREE.MeshBasicMaterial, cssColor: string): void {
  material.color.setHex(0xffffff)
  const s = String(cssColor).trim()
  if (!s) return
  material.color.setStyle(s)
}

type BarSlot = {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  label: CSS2DObject
  div: HTMLDivElement
}

/**
 * Camera-facing variable bars + CSS2D labels at an entity world position (entity rotation ignored).
 * Local +Y/+X match screen up/right so bars stay vertical on screen when the view tilts.
 * Uses thin boxes instead of GL lines so stroke width is visible and configurable.
 */
export class VariableOverlayController {
  readonly root = new THREE.Group()
  private readonly _camWorldQuat = new THREE.Quaternion()
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
    this.zeroMaterial = createOverlayMaterial({
      color: 0xffffff,
      opacity: 0.65,
    })
    this.zeroMesh = new THREE.Mesh(this.zeroGeom, this.zeroMaterial)
    this.zeroMesh.renderOrder = OVERLAY_RENDER_ORDER
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
      const material = createOverlayMaterial({ opacity: 1 })
      const mesh = new THREE.Mesh(this.barUnitGeom, material)
      mesh.renderOrder = OVERLAY_RENDER_ORDER
      this.root.add(mesh)

      const div = document.createElement('div')
      div.style.fontFamily = 'system-ui, sans-serif'
      div.style.fontSize = '15px'
      div.style.fontWeight = '600'
      div.style.pointerEvents = 'none'
      div.style.textShadow = '0 0 2px #000'
      div.style.writingMode = 'vertical-rl'
      div.style.textOrientation = 'mixed'
      div.style.whiteSpace = 'nowrap'
      const label = new CSS2DObject(div)
      label.center.set(0.5, 1)
      this.root.add(label)

      this.bars.push({ mesh, material, label, div })
    }
  }

  sync(
    _entityId: string | null,
    position: Vec3 | null,
    slots: VariableOverlaySlotPayload[],
    camera?: THREE.Camera | null,
  ): void {
    const show = Boolean(position && slots.length > 0)
    this.root.visible = show
    if (!show || !position) return

    this.root.position.set(position[0], position[1], position[2])
    if (camera) {
      camera.updateMatrixWorld()
      camera.getWorldQuaternion(this._camWorldQuat)
      this.root.quaternion.copy(this._camWorldQuat)
    } else {
      this.root.quaternion.identity()
    }

    const w = this.groupWidth
    const n = slots.length
    const half = w / 2
    const stroke = this.strokeWorld()

    this.zeroMesh.scale.set(2 * half, stroke, stroke)
    this.zeroMesh.position.set(0, 0, 0)

    this.ensureBarCount(n)

    const labelY = -Math.max(0.16, w * 0.11)

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

      setBarMaterialColor(material, slot.color)

      div.textContent = slot.name
      div.style.color = slot.color.trim() || '#ffffff'

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
