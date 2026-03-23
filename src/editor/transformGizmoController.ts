import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { findEntityRootForPicking } from '@/utils/entityPicking'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { Entity, Rotation, Vec3 } from '@/types/world'

export type BuilderGizmoMode = 'translate' | 'rotate'

export interface InstallBuilderPickAndGizmoParams {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  getRegistry: () => RenderItemRegistry | null
  getEntity: (id: string) => Entity | undefined
  getSelectedId: () => string | null
  getGizmoMode: () => BuilderGizmoMode
  onSelectEntity: (id: string | null) => void
  onPoseCommit: (entityId: string, pose: { position: Vec3; rotation: Rotation }) => void
  /** Set true while user drags a gizmo handle (for camera orbit gating). */
  setGizmoDragging: (dragging: boolean) => void
}

/**
 * Installs TransformControls (translate/rotate only) and click-to-select on the canvas.
 * Selection listener is registered after TransformControls.connect() so pointerdown on handles
 * sets dragging before selection runs.
 */
export function installBuilderPickAndGizmo(
  p: InstallBuilderPickAndGizmoParams
): { dispose: () => void; syncAttach: () => void } {
  const controls = new TransformControls(p.camera, p.domElement)
  controls.setMode('translate')
  /** Align gizmo axes with the attached object (not world X/Y/Z). */
  controls.setSpace('local')

  const helper = controls.getHelper()
  p.scene.add(helper)

  const getEntityMeshes = (): THREE.Object3D[] =>
    p.scene.children.filter((o) => o.userData?.entityId != null)

  const ndc = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()

  const setNdcFromEvent = (e: PointerEvent): void => {
    const rect = p.domElement.getBoundingClientRect()
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  const mirrorAttachedPoseToRegistry = (): void => {
    const obj = controls.object
    if (!(obj instanceof THREE.Mesh)) return
    const id = obj.name
    const reg = p.getRegistry()
    if (!id || !reg) return
    const item = reg.get(id)
    if (!item) return
    reg.setPosition(id, [obj.position.x, obj.position.y, obj.position.z])
    reg.setRotation(id, item.getRotation())
  }

  const syncAttach = (): void => {
    const id = p.getSelectedId()
    const entity = id ? p.getEntity(id) : undefined
    const locked = entity?.locked === true
    if (!id || locked) {
      controls.detach()
      return
    }
    const obj = p.scene.getObjectByName(id)
    if (obj instanceof THREE.Mesh) {
      const mode = p.getGizmoMode()
      controls.setMode(mode)
      controls.setSpace('local')
      if (controls.object !== obj) {
        controls.attach(obj)
      }
    } else {
      controls.detach()
    }
  }

  const onObjectChange = (): void => {
    mirrorAttachedPoseToRegistry()
  }

  const onMouseDown = (): void => {
    p.setGizmoDragging(true)
  }

  const onMouseUp = (): void => {
    p.setGizmoDragging(false)
    const obj = controls.object
    if (!(obj instanceof THREE.Mesh)) return
    const id = obj.name
    const reg = p.getRegistry()
    if (!id || !reg) return
    const pos = reg.getPosition(id)
    const rot = reg.getRotation(id)
    if (pos && rot) {
      p.onPoseCommit(id, { position: pos, rotation: rot })
    }
  }

  controls.addEventListener('objectChange', onObjectChange)
  controls.addEventListener('mouseDown', onMouseDown)
  controls.addEventListener('mouseUp', onMouseUp)

  controls.connect()

  const onSelectPointerDown = (e: PointerEvent): void => {
    if (e.button === 1) return
    if (controls.dragging) return

    setNdcFromEvent(e)
    p.scene.updateMatrixWorld(true)
    raycaster.setFromCamera(ndc, p.camera)
    const hits = raycaster.intersectObjects(getEntityMeshes(), true)
    const hit = hits[0]
    const entityRoot = hit?.object ? findEntityRootForPicking(hit.object) : null
    if (!entityRoot) {
      p.onSelectEntity(null)
      return
    }
    p.onSelectEntity(entityRoot.userData.entityId as string)
  }

  p.domElement.addEventListener('pointerdown', onSelectPointerDown)

  syncAttach()

  const dispose = (): void => {
    p.domElement.removeEventListener('pointerdown', onSelectPointerDown)
    controls.removeEventListener('objectChange', onObjectChange)
    controls.removeEventListener('mouseDown', onMouseDown)
    controls.removeEventListener('mouseUp', onMouseUp)
    controls.dispose()
    p.scene.remove(helper)
    p.setGizmoDragging(false)
  }

  return { dispose, syncAttach }
}
