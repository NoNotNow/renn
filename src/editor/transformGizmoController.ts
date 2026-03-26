import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { findEntityRootForPicking } from '@/utils/entityPicking'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { Entity, Rotation, Shape, Vec3 } from '@/types/world'
import { quaternionToEuler } from '@/utils/rotationUtils'

/** Floor for each scale axis while dragging; matches rapierPhysics tolerances (~1e-4). */
export const GIZMO_MIN_AXIS_SCALE = 1e-4

export const BUILDER_SELECTION_PIVOT_NAME = '__builder_selection_pivot__'

/**
 * World-space centroid of selected entities that are unlocked and have a registry pose.
 * Matches the multi-select gizmo pivot (one entity → its position).
 */
export function averageUnlockedSelectionWorldPosition(
  reg: RenderItemRegistry | null,
  selectedIds: readonly string[],
  getEntity: (id: string) => Entity | undefined,
): Vec3 | null {
  if (!reg || selectedIds.length === 0) return null
  let sx = 0
  let sy = 0
  let sz = 0
  let n = 0
  for (const id of selectedIds) {
    const e = getEntity(id)
    if (!e || e.locked) continue
    const pos = reg.getPosition(id)
    if (!pos) continue
    sx += pos[0]
    sy += pos[1]
    sz += pos[2]
    n += 1
  }
  if (n === 0) return null
  return [sx / n, sy / n, sz / n]
}

export function clampGizmoScaleAxes(x: number, y: number, z: number): Vec3 {
  return [
    Math.max(GIZMO_MIN_AXIS_SCALE, x),
    Math.max(GIZMO_MIN_AXIS_SCALE, y),
    Math.max(GIZMO_MIN_AXIS_SCALE, z),
  ]
}

function logicalRotationFromMeshWorldQuaternion(mesh: THREE.Mesh, worldQuat: THREE.Quaternion): Rotation {
  const baseQ = mesh.userData.visualBaseQuaternion as THREE.Quaternion | undefined
  const q = worldQuat.clone()
  if (baseQ) q.premultiply(baseQ.clone().invert())
  return quaternionToEuler(q)
}

export type BuilderGizmoMode = 'translate' | 'rotate' | 'scale'

export interface BuilderPoseCommit {
  position: Vec3
  rotation: Rotation
  scale: Vec3
  /** Present after scale gizmo bake or when syncing from registry; updates world document shape. */
  shape?: Shape
  modelScale?: Vec3
}

export interface BuilderPoseCommitEntry {
  entityId: string
  pose: BuilderPoseCommit
}

export interface InstallBuilderPickAndGizmoParams {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  getRegistry: () => RenderItemRegistry | null
  getEntity: (id: string) => Entity | undefined
  getSelectedIds: () => string[]
  getGizmoMode: () => BuilderGizmoMode
  onSelectEntity: (id: string | null, options?: { additive?: boolean }) => void
  onPoseCommit: (commits: BuilderPoseCommitEntry[]) => void
  /** Set true while user drags a gizmo handle (for camera orbit gating). */
  setGizmoDragging: (dragging: boolean) => void
}

type MultiDragState = {
  pivotStartWorld: THREE.Matrix4
  meshStartWorld: Map<string, THREE.Matrix4>
  ids: string[]
}

/**
 * Installs TransformControls (translate / rotate / scale) and click-to-select on the canvas.
 * Selection listener is registered after TransformControls.connect() so pointerdown on handles
 * sets dragging before selection runs.
 */
export function installBuilderPickAndGizmo(
  p: InstallBuilderPickAndGizmoParams
): { dispose: () => void; syncAttach: () => void } {
  const controls = new TransformControls(p.camera, p.domElement)
  controls.setMode('translate')
  /** Align gizmo axes with the attached object (single selection only). */
  controls.setSpace('local')

  const helper = controls.getHelper()
  p.scene.add(helper)

  const pivot = new THREE.Group()
  pivot.name = BUILDER_SELECTION_PIVOT_NAME
  p.scene.add(pivot)

  const getEntityMeshes = (): THREE.Object3D[] =>
    p.scene.children.filter((o) => o.userData?.entityId != null)

  const getGizmoTargetIds = (): string[] =>
    p.getSelectedIds().filter((id) => {
      const e = p.getEntity(id)
      return Boolean(e && !e.locked)
    })

  const ndc = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const deltaMat = new THREE.Matrix4()
  const invPivotStart = new THREE.Matrix4()
  const decompPos = new THREE.Vector3()
  const decompQuat = new THREE.Quaternion()
  const decompScale = new THREE.Vector3()

  let multiDragState: MultiDragState | null = null

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
    const mode = p.getGizmoMode()
    if (mode === 'scale') {
      const [sx, sy, sz] = clampGizmoScaleAxes(obj.scale.x, obj.scale.y, obj.scale.z)
      if (sx !== obj.scale.x || sy !== obj.scale.y || sz !== obj.scale.z) {
        obj.scale.set(sx, sy, sz)
      }
      reg.patchScale(id, [sx, sy, sz])
    } else {
      reg.setPosition(id, [obj.position.x, obj.position.y, obj.position.z])
      reg.setRotation(id, item.getRotation())
    }
  }

  const applyMultiTransformToRegistry = (): void => {
    if (!multiDragState) return
    const reg = p.getRegistry()
    if (!reg) return
    pivot.updateMatrixWorld(true)
    const pCurr = pivot.matrixWorld
    invPivotStart.copy(multiDragState.pivotStartWorld).invert()
    deltaMat.copy(pCurr).multiply(invPivotStart)

    for (const id of multiDragState.ids) {
      const m0 = multiDragState.meshStartWorld.get(id)
      if (!m0) continue
      const m1 = new THREE.Matrix4().copy(deltaMat).multiply(m0)
      m1.decompose(decompPos, decompQuat, decompScale)
      const mesh = p.scene.getObjectByName(id)
      if (!(mesh instanceof THREE.Mesh)) continue
      reg.setPosition(id, [decompPos.x, decompPos.y, decompPos.z])
      reg.setRotation(id, logicalRotationFromMeshWorldQuaternion(mesh, decompQuat))
      const [sx, sy, sz] = clampGizmoScaleAxes(decompScale.x, decompScale.y, decompScale.z)
      reg.patchScale(id, [sx, sy, sz])
    }
  }

  const syncAttach = (): void => {
    const targetIds = getGizmoTargetIds()
    if (targetIds.length === 0) {
      controls.detach()
      return
    }

    if (targetIds.length === 1) {
      const id = targetIds[0]!
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
      return
    }

    // Multi: pivot at average position, world-space gizmo
    const reg = p.getRegistry()
    if (!reg) {
      controls.detach()
      return
    }
    const center = averageUnlockedSelectionWorldPosition(reg, targetIds, p.getEntity)
    if (!center) {
      controls.detach()
      return
    }
    pivot.position.set(center[0], center[1], center[2])
    pivot.quaternion.identity()
    pivot.scale.set(1, 1, 1)
    pivot.updateMatrixWorld(true)

    const mode = p.getGizmoMode()
    controls.setMode(mode)
    controls.setSpace('world')
    if (controls.object !== pivot) {
      controls.attach(pivot)
    }
  }

  const onObjectChange = (): void => {
    if (controls.object === pivot) {
      applyMultiTransformToRegistry()
      return
    }
    mirrorAttachedPoseToRegistry()
  }

  const onMouseDown = (): void => {
    p.setGizmoDragging(true)
    if (controls.object === pivot) {
      const reg = p.getRegistry()
      if (!reg) return
      const ids = getGizmoTargetIds()
      pivot.updateMatrixWorld(true)
      const pivotStartWorld = pivot.matrixWorld.clone()
      const meshStartWorld = new Map<string, THREE.Matrix4>()
      for (const id of ids) {
        const mesh = p.scene.getObjectByName(id)
        if (mesh instanceof THREE.Mesh) {
          mesh.updateMatrixWorld(true)
          meshStartWorld.set(id, mesh.matrixWorld.clone())
        }
      }
      multiDragState = { pivotStartWorld, meshStartWorld, ids }
    }
  }

  const onMouseUp = (): void => {
    p.setGizmoDragging(false)
    const reg = p.getRegistry()
    if (!reg) return

    if (controls.object === pivot) {
      const mode = p.getGizmoMode()
      const ids = multiDragState?.ids ?? getGizmoTargetIds()
      const commits: BuilderPoseCommitEntry[] = []
      for (const id of ids) {
        if (mode === 'scale') {
          const baked = reg.applyGizmoScaleBake(id)
          if (!baked) {
            reg.commitScalePhysics(id)
          }
        }
        const item = reg.get(id)
        const pos = reg.getPosition(id)
        const rot = reg.getRotation(id)
        const scale = reg.getScale(id)
        if (pos && rot && scale && item) {
          commits.push({
            entityId: id,
            pose: {
              position: pos,
              rotation: rot,
              scale,
              shape: item.entity.shape,
              modelScale: item.entity.modelScale,
            },
          })
        }
      }
      if (commits.length > 0) {
        p.onPoseCommit(commits)
      }
      multiDragState = null
      return
    }

    const obj = controls.object
    if (!(obj instanceof THREE.Mesh)) return
    const id = obj.name
    if (!id || !reg) return
    const mode = p.getGizmoMode()
    if (mode === 'scale') {
      const baked = reg.applyGizmoScaleBake(id)
      if (!baked) {
        reg.commitScalePhysics(id)
      }
    }
    const item = reg.get(id)
    const pos = reg.getPosition(id)
    const rot = reg.getRotation(id)
    const scale = reg.getScale(id)
    if (pos && rot && scale && item) {
      p.onPoseCommit([
        {
          entityId: id,
          pose: {
            position: pos,
            rotation: rot,
            scale,
            shape: item.entity.shape,
            modelScale: item.entity.modelScale,
          },
        },
      ])
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
    const additive = e.shiftKey || e.metaKey
    p.onSelectEntity(entityRoot.userData.entityId as string, { additive })
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
    p.scene.remove(pivot)
    p.setGizmoDragging(false)
  }

  return { dispose, syncAttach }
}
