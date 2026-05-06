/**
 * Helpers for the "visual base quaternion" pattern: `plane` carries a fixed
 * visual rotation offset (e.g. -PI/2 around X to lie flat) on
 * `mesh.userData.visualBaseQuaternion` so it never leaks into the entity's
 * logical rotation during save / read.
 *
 * Centralised here so registry, RenderItem, gizmo and createPrimitive share one
 * implementation. Re-uses module-level scratch quaternions to avoid per-call
 * allocations on the physics-sync hot path.
 */
import * as THREE from 'three'
import type { Shape } from '@/types/world'

const FLAT_SHAPE_TYPES = new Set<Shape['type']>(['plane'])

const VISUAL_BASE_USERDATA_KEY = 'visualBaseQuaternion'

/** Reusable scratch for `stripVisualBase` (single-threaded JS, no reentrancy). */
const SCRATCH_INVERSE = new THREE.Quaternion()

/** True when shape type uses a baked visual rotation offset (`plane` only). */
export function isFlatShape(type: Shape['type'] | undefined): boolean {
  return type !== undefined && FLAT_SHAPE_TYPES.has(type)
}

/** Fresh visual base quaternion for `plane`, or undefined for other shapes. */
export function createVisualBaseForShape(type: Shape['type'] | undefined): THREE.Quaternion | undefined {
  if (!isFlatShape(type)) return undefined
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
}

/** Typed read of `mesh.userData.visualBaseQuaternion`. */
export function getVisualBase(mesh: THREE.Object3D): THREE.Quaternion | undefined {
  return mesh.userData[VISUAL_BASE_USERDATA_KEY] as THREE.Quaternion | undefined
}

/** Strip the visual base from `worldQuat` to get the logical entity rotation.
 *  Result written into `out` (or a fresh quaternion). `worldQuat` is not mutated. */
export function stripVisualBase(
  worldQuat: THREE.Quaternion,
  mesh: THREE.Object3D,
  out?: THREE.Quaternion,
): THREE.Quaternion {
  const result = out ?? new THREE.Quaternion()
  result.copy(worldQuat)
  const baseQ = getVisualBase(mesh)
  if (baseQ) {
    SCRATCH_INVERSE.copy(baseQ).invert()
    result.premultiply(SCRATCH_INVERSE)
  }
  return result
}

/** Apply the visual base on top of `logicalQuat` in place; returns the same quaternion. */
export function applyVisualBase(logicalQuat: THREE.Quaternion, mesh: THREE.Object3D): THREE.Quaternion {
  const baseQ = getVisualBase(mesh)
  if (baseQ) logicalQuat.premultiply(baseQ)
  return logicalQuat
}

/** Set or clear `mesh.userData.visualBaseQuaternion` based on the shape type. */
export function setVisualBaseFromShape(mesh: THREE.Object3D, type: Shape['type'] | undefined): void {
  mesh.userData[VISUAL_BASE_USERDATA_KEY] = createVisualBaseForShape(type)
}

/** For freshly created meshes: set the base AND pre-multiply the mesh's quaternion. */
export function initVisualBaseFromShape(mesh: THREE.Object3D, type: Shape['type'] | undefined): void {
  const q = createVisualBaseForShape(type)
  if (q) {
    mesh.quaternion.premultiply(q)
    mesh.userData[VISUAL_BASE_USERDATA_KEY] = q
  }
}
