import type { Entity, Vec3 } from '@/types/world'

/** Default margin beyond tight frustum fit so pasted objects are comfortably visible. */
export const CAMERA_FRONT_PLACEMENT_MARGIN = 1.4

/** Minimum distance from camera to group center (world units). */
export const CAMERA_FRONT_MIN_DISTANCE = 1.5

export interface CameraFrontPose {
  position: Vec3
  forward: Vec3
  fovRadians: number
  aspect: number
}

function vec3LenSq(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(vec3LenSq(v))
  if (len < 1e-12) return [0, 0, -1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/**
 * World-space centroid of positions (empty input returns origin).
 */
export function computeGroupCenter(positions: Vec3[]): Vec3 {
  if (positions.length === 0) return [0, 0, 0]
  let sx = 0
  let sy = 0
  let sz = 0
  for (const p of positions) {
    sx += p[0]
    sy += p[1]
    sz += p[2]
  }
  const n = positions.length
  return [sx / n, sy / n, sz / n]
}

export interface ComputeFrontDistanceOptions {
  margin?: number
  minDistance?: number
}

/**
 * Distance from camera along view forward so that a sphere of diameter `maxExtent`
 * (radius = maxExtent/2) fits inside the vertical perspective frustum slice, using
 * the smaller of vertical and horizontal half-angles, then scaled by `margin`.
 */
export function computeFrontDistance(
  maxExtent: number,
  fovRadians: number,
  aspect: number,
  opts?: ComputeFrontDistanceOptions,
): number {
  const margin = opts?.margin ?? CAMERA_FRONT_PLACEMENT_MARGIN
  const minDistance = opts?.minDistance ?? CAMERA_FRONT_MIN_DISTANCE
  const radius = Math.max(0, maxExtent) * 0.5
  const vHalf = fovRadians * 0.5
  const tanV = Math.tan(vHalf)
  const hHalf = Math.atan(tanV * Math.max(aspect, 1e-6))
  const effective = Math.min(vHalf, hHalf)
  const sinE = Math.sin(Math.max(effective, 1e-4))
  const fit = radius > 0 ? (radius / sinE) * margin : minDistance
  return Math.max(minDistance, fit)
}

export interface PlaceEntitiesInFrontOfCameraInput {
  camera: CameraFrontPose
  /** Entities with current world `position` (e.g. live pose). */
  entities: Entity[]
  /** Max world-space extent (largest AABB edge) per entity id — from mesh bounds or approximate. */
  extentByEntityId: Map<string, number>
}

/**
 * New world positions for each entity: group centroid moves to a point in front of the camera
 * at a distance derived from frustum fit for the enclosing sphere of the selection.
 */
export function placeEntitiesInFrontOfCamera(input: PlaceEntitiesInFrontOfCameraInput): Map<string, Vec3> {
  const { camera, entities, extentByEntityId } = input
  const out = new Map<string, Vec3>()
  if (entities.length === 0) return out

  const positions: Vec3[] = entities.map((e) => e.position ?? [0, 0, 0])
  const center = computeGroupCenter(positions)

  let enclosingRadius = 0
  for (const ent of entities) {
    const pos: Vec3 = ent.position ?? [0, 0, 0]
    const ext = extentByEntityId.get(ent.id) ?? 1
    const r = ext * 0.5
    const d = Math.sqrt(vec3LenSq(vec3Sub(pos, center))) + r
    if (d > enclosingRadius) enclosingRadius = d
  }

  const diameter = 2 * enclosingRadius
  const dist = computeFrontDistance(diameter, camera.fovRadians, camera.aspect)
  const fwd = vec3Normalize(camera.forward)
  const anchor = vec3Add(camera.position, vec3Scale(fwd, dist))

  for (const ent of entities) {
    const entPos: Vec3 = ent.position ?? [0, 0, 0]
    const delta = vec3Sub(entPos, center)
    out.set(ent.id, vec3Add(anchor, delta))
  }
  return out
}
