import * as THREE from 'three'
import type { Entity } from '@/types/world'

const OVERLAY_USER_DATA_KEY = 'isShapeWireframeOverlay' as const

/** Last applied visibility + geometry id for idempotent sync (registry / SceneView). */
const LAST_FLAG_KEY = '_shapeWireframeLastFlag' as const
const LAST_GEOM_UUID_KEY = '_shapeWireframeLastGeomUuid' as const

/** Mesh and entity allow an overlay (primitive + entity.model); ignores the visibility flag. */
export function canAttachShapeWireframeOverlay(mesh: THREE.Mesh, entity: Entity): boolean {
  return (
    mesh.userData.usesModel === true &&
    Boolean(entity.model) &&
    entity.shape?.type !== 'trimesh'
  )
}

export function isShapeWireframeOverlayEligible(mesh: THREE.Mesh, entity: Entity): boolean {
  return canAttachShapeWireframeOverlay(mesh, entity) && entity.showShapeWireframe === true
}

function findOverlayChild(mesh: THREE.Mesh): THREE.LineSegments | null {
  for (let i = 0; i < mesh.children.length; i++) {
    const c = mesh.children[i]
    if (c instanceof THREE.LineSegments && c.userData[OVERLAY_USER_DATA_KEY] === true) {
      return c
    }
  }
  return null
}

function disposeOverlay(lines: THREE.LineSegments): void {
  lines.geometry?.dispose()
  const mat = lines.material
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
  else mat?.dispose()
  lines.removeFromParent()
}

/** Disable picking on the overlay so raycasts hit the entity root / model as before. */
function makeOverlayNonPickable(lines: THREE.LineSegments): void {
  lines.raycast = () => {}
}

/**
 * Syncs the primitive shape edge overlay for model-on-primitive meshes.
 * Removes and disposes any existing overlay when ineligible or disabled.
 */
export function syncShapeWireframeOverlay(mesh: THREE.Mesh, entity: Entity): void {
  const shouldShow =
    canAttachShapeWireframeOverlay(mesh, entity) && entity.showShapeWireframe === true
  const geomUuid = mesh.geometry?.uuid ?? ''

  const lastFlag = mesh.userData[LAST_FLAG_KEY] as boolean | undefined
  const lastGeom = mesh.userData[LAST_GEOM_UUID_KEY] as string | undefined
  if (lastFlag === shouldShow && lastGeom === geomUuid && shouldShow) {
    return
  }

  const existing = findOverlayChild(mesh)
  if (existing) {
    disposeOverlay(existing)
  }

  mesh.userData[LAST_FLAG_KEY] = shouldShow
  mesh.userData[LAST_GEOM_UUID_KEY] = geomUuid

  if (!shouldShow) {
    return
  }

  const edges = new THREE.EdgesGeometry(mesh.geometry)
  const material = new THREE.LineBasicMaterial({
    color: 0x2ee8a8,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const lines = new THREE.LineSegments(edges, material)
  lines.userData[OVERLAY_USER_DATA_KEY] = true
  lines.renderOrder = 1
  makeOverlayNonPickable(lines)
  mesh.add(lines)
}
