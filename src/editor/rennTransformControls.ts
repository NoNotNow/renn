import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

const COMBINED_PICK_ORDER = ['translate', 'rotate', 'scale'] as const
type TransformSubMode = (typeof COMBINED_PICK_ORDER)[number]

export type BuilderTransformControlsMode = 'translate' | 'rotate' | 'scale' | 'transform'

/** Visual + picker scale multiplier for translate handles in combined mode. */
export const COMBINED_GIZMO_TRANSLATE_SCALE_BOOST = 1.4

const _raycaster = new THREE.Raycaster()

function boostObjectScales(root: THREE.Object3D, factor: number): void {
  root.traverse((child) => {
    if (child === root) return
    child.scale.multiplyScalar(factor)
  })
}

/** Translate handles render above scale/rotate in combined mode. */
function elevateCombinedTranslateRenderOrder(visual: THREE.Object3D): void {
  visual.traverse((child) => {
    if (child === visual) return
    child.renderOrder = 1
  })
}

function intersectObjectWithRay(
  object: THREE.Object3D,
  raycaster: THREE.Raycaster,
  includeInvisible = false,
): THREE.Intersection | false {
  const allIntersections = raycaster.intersectObject(object, true)
  for (let i = 0; i < allIntersections.length; i++) {
    const hit = allIntersections[i]!
    if (hit.object.visible || includeInvisible) return hit
  }
  return false
}

type TransformControlsGizmoLike = THREE.Object3D & {
  mode: string
  gizmo: Record<TransformSubMode, THREE.Object3D>
  helper: Record<TransformSubMode, THREE.Object3D>
  picker: Record<TransformSubMode, THREE.Object3D>
  updateMatrixWorld: (force?: boolean) => void
}

/** TransformControls with builder-only `transform` combined mode (not in three.js typings). */
type InternalTransformControls = Omit<TransformControls, 'mode' | 'axis' | 'setMode' | 'pointerHover' | 'pointerDown' | 'pointerUp'> & {
  _gizmo: TransformControlsGizmoLike
  mode: string
  axis: string | null
  setMode: (mode: string) => void
  pointerHover: (pointer: unknown) => void
  pointerDown: (pointer: unknown) => void
  pointerUp: (pointer: unknown) => void
}

export function setBuilderTransformMode(
  controls: TransformControls,
  mode: BuilderTransformControlsMode,
): void {
  ;(controls as InternalTransformControls).setMode(mode)
}

/** Restore combined gizmo visuals after a sub-mode drag when builder mode is still `transform`. */
export function restoreCombinedTransformGizmoIfNeeded(
  controls: TransformControls,
  builderMode: string,
): void {
  if (builderMode !== 'transform') return
  const internal = controls as InternalTransformControls
  if (internal.mode === 'transform') {
    internal._gizmo.updateMatrixWorld(true)
    return
  }
  setBuilderTransformMode(controls, 'transform')
  internal._gizmo.updateMatrixWorld(true)
}

/**
 * Builder TransformControls with a combined translate+rotate+scale mode and slightly
 * smaller gizmo size for easier handle picking.
 */
export function createBuilderTransformControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): TransformControls {
  const controls = new TransformControls(camera, domElement) as InternalTransformControls
  controls.setSize(0.85)

  const gizmo = controls._gizmo
  const origGizmoUpdate = gizmo.updateMatrixWorld.bind(gizmo)
  const origPointerHover = controls.pointerHover.bind(controls)
  const origPointerDown = controls.pointerDown.bind(controls)

  let combinedPickMode: TransformSubMode | null = null
  let combinedDragSession = false

  gizmo.updateMatrixWorld = (force?: boolean): void => {
    if (gizmo.mode !== 'transform') {
      origGizmoUpdate(force)
      return
    }

    for (const subMode of COMBINED_PICK_ORDER) {
      gizmo.mode = subMode
      origGizmoUpdate(force)
      gizmo.gizmo[subMode].visible = true
      if (subMode === 'translate') {
        boostObjectScales(gizmo.gizmo.translate, COMBINED_GIZMO_TRANSLATE_SCALE_BOOST)
        boostObjectScales(gizmo.picker.translate, COMBINED_GIZMO_TRANSLATE_SCALE_BOOST)
        elevateCombinedTranslateRenderOrder(gizmo.gizmo.translate)
      }
    }

    gizmo.mode = 'transform'
    gizmo.gizmo.translate.visible = true
    gizmo.gizmo.rotate.visible = true
    gizmo.gizmo.scale.visible = true
    gizmo.helper.translate.visible = false
    gizmo.helper.rotate.visible = false
    gizmo.helper.scale.visible = false
  }

  controls.pointerHover = (pointer: unknown): void => {
    if (controls.mode !== 'transform') {
      combinedPickMode = null
      origPointerHover(pointer)
      return
    }

    if (controls.object === undefined || controls.dragging) return

    combinedPickMode = null
    controls.axis = null

    const p = pointer as THREE.Vector2 | null
    if (p !== null) {
      _raycaster.setFromCamera(p, controls.camera)
      for (const subMode of COMBINED_PICK_ORDER) {
        const intersect = intersectObjectWithRay(gizmo.picker[subMode], _raycaster)
        if (intersect) {
          controls.axis = intersect.object.name
          combinedPickMode = subMode
          return
        }
      }
    }
  }

  controls.pointerDown = (pointer: unknown): void => {
    if (controls.mode === 'transform' && combinedPickMode && controls.axis !== null) {
      combinedDragSession = true
      controls.setMode(combinedPickMode)
    }
    origPointerDown(pointer)
  }

  const restoreCombinedAfterDrag = (): void => {
    if (!combinedDragSession) return
    combinedDragSession = false
    combinedPickMode = null
    controls.setMode('transform')
    gizmo.updateMatrixWorld(true)
  }

  const origPointerUp = controls.pointerUp.bind(controls)
  controls.pointerUp = (pointer: unknown): void => {
    origPointerUp(pointer)
    restoreCombinedAfterDrag()
  }

  return controls as TransformControls
}

/** Active translate / rotate / scale sub-mode while dragging (including combined gizmo). */
export function activeBuilderTransformSubMode(
  builderMode: string,
  controlsMode: string,
): 'translate' | 'rotate' | 'scale' | null {
  if (builderMode === 'translate' || builderMode === 'rotate' || builderMode === 'scale') {
    return builderMode
  }
  if (builderMode === 'transform') {
    if (controlsMode === 'translate' || controlsMode === 'rotate' || controlsMode === 'scale') {
      return controlsMode
    }
  }
  return null
}
