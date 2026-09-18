import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { Entity, Shape, TrimeshSimplificationConfig } from '@/types/world'
import {
  extractMeshGeometry,
  getGeometryInfo,
  withTrimeshSceneDetachedFromEntityWrapper,
} from '@/utils/geometryExtractor'
import { simplifyGeometry, shouldSimplifyGeometry } from '@/utils/meshSimplifier'
import { transformTrimeshVertices } from '@/utils/trimeshTransform'

/** Compute the volume of a collider shape so density = mass / volume. */
export function computeColliderVolume(
  shape: Shape | undefined,
  scale?: [number, number, number],
): number {
  const [sx, sy, sz] = scale ?? [1, 1, 1]
  if (!shape) return 1 * sx * sy * sz // default unit box

  switch (shape.type) {
    case 'box':
      return shape.width * sx * shape.height * sy * shape.depth * sz
    case 'sphere': {
      const avgS = (sx + sy + sz) / 3
      const r = shape.radius * avgS
      return (4 / 3) * Math.PI * r * r * r
    }
    case 'cylinder': {
      const r = shape.radius * Math.max(sx, sz)
      const h = shape.height * sy
      return Math.PI * r * r * h
    }
    case 'capsule': {
      const r = shape.radius * Math.max(sx, sz)
      const h = Math.max(0, shape.height - 2 * shape.radius) * sy
      return Math.PI * r * r * h + (4 / 3) * Math.PI * r * r * r
    }
    case 'cone': {
      const r = shape.radius * Math.max(sx, sz)
      const h = shape.height * sy
      return (1 / 3) * Math.PI * r * r * h
    }
    case 'pyramid': {
      const b = shape.baseSize * Math.max(sx, sz)
      const h = shape.height * sy
      return (1 / 3) * b * b * h
    }
    case 'plane':
      return 0 // HalfSpace is infinite; static ground has no density/mass
    default:
      return 0 // trimesh and unknown shapes; mass is set via setMass when volume is 0
  }
}

export function createColliderDesc(
  shape: Shape | undefined,
  entity: Entity,
  mesh?: THREE.Mesh,
): RAPIER.ColliderDesc | null {
  if (!shape) {
    // Default to a unit box
    return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
  }

  const scale = entity.scale ?? [1, 1, 1]

  switch (shape.type) {
    case 'box':
      return RAPIER.ColliderDesc.cuboid(
        (shape.width / 2) * scale[0],
        (shape.height / 2) * scale[1],
        (shape.depth / 2) * scale[2],
      )

    case 'sphere': {
      // Use average scale for sphere
      const avgScale = (scale[0] + scale[1] + scale[2]) / 3
      return RAPIER.ColliderDesc.ball(shape.radius * avgScale)
    }

    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder(
        (shape.height / 2) * scale[1],
        shape.radius * Math.max(scale[0], scale[2]),
      )

    case 'capsule': {
      const halfHeight = Math.max(1e-4, (shape.height / 2 - shape.radius) * scale[1])
      return RAPIER.ColliderDesc.capsule(halfHeight, shape.radius * Math.max(scale[0], scale[2]))
    }

    case 'cone':
      return RAPIER.ColliderDesc.cone(
        (shape.height / 2) * scale[1],
        shape.radius * Math.max(scale[0], scale[2]),
      )

    case 'pyramid': {
      // Square-base pyramid: convex hull of 5 points so collision matches visual (ConeGeometry with 4 segments).
      // Cone would use a circular base that circumscribes the square, making collision larger than the mesh.
      const halfH = shape.height / 2
      const r = shape.baseSize / Math.SQRT2 // half-diagonal of base square (= radius of cone with 4 segments)
      const [sx, sy, sz] = scale
      const points = new Float32Array(5 * 3)
      // Apex (index 0)
      points[0] = 0
      points[1] = halfH * sy
      points[2] = 0
      // Base corners (same layout as Three.js ConeGeometry with 4 radial segments)
      points[3] = r * sx
      points[4] = -halfH * sy
      points[5] = 0
      points[6] = 0
      points[7] = -halfH * sy
      points[8] = r * sz
      points[9] = -r * sx
      points[10] = -halfH * sy
      points[11] = 0
      points[12] = 0
      points[13] = -halfH * sy
      points[14] = -r * sz
      const hull = RAPIER.ColliderDesc.convexHull(points)
      if (hull) return hull
      // Fallback if convex hull fails (e.g. degenerate points)
      return RAPIER.ColliderDesc.cone(halfH * sy, r * Math.max(sx, sz))
    }

    case 'plane': {
      // Infinite half-space so items never fall through away from center.
      // Outward normal: up (0, 1, 0) so solid is below the plane at body position.
      const planeShape = shape as { type: 'plane'; normal?: [number, number, number] }
      const [nx = 0, ny = 1, nz = 0] = planeShape.normal ?? [0, 1, 0]
      const len = Math.hypot(nx, ny, nz) || 1
      const normal = { x: nx / len, y: ny / len, z: nz / len }
      const halfSpace = new RAPIER.HalfSpace(normal)
      return new RAPIER.ColliderDesc(halfSpace)
    }

    case 'trimesh': {
      // Check if we have a mesh with trimesh metadata
      if (mesh && mesh.userData.isTrimeshSource) {
        try {
          // Extract geometry from the trimesh scene (stored in userData).
          // Use world transforms so internal GLTF hierarchy (e.g. -90° X on an intermediate node)
          // matches rendering. Detach from the entity wrapper so entity rotation/position are not
          // baked in (Rapier applies those on the body). Model rotation/scale from the inspector
          // are already on `modelScene` via applyModelTransform before this runs.
          const sourceScene = mesh.userData.trimeshScene || mesh
          let extractedGeometry = withTrimeshSceneDetachedFromEntityWrapper(sourceScene, () =>
            extractMeshGeometry(sourceScene, true),
          )

          if (extractedGeometry && extractedGeometry.vertices.length > 0 && extractedGeometry.indices.length > 0) {
            const transformedVertices = transformTrimeshVertices(
              extractedGeometry.vertices,
              [0, 0, 0],
              [1, 1, 1],
              scale,
            )
            extractedGeometry = { vertices: transformedVertices, indices: extractedGeometry.indices }

            const originalInfo = getGeometryInfo(extractedGeometry)

            // Check if simplification is needed
            const trimeshShape = shape as {
              type: 'trimesh'
              model: string
              simplification?: TrimeshSimplificationConfig
            }
            const preSimplified = mesh.userData.trimeshGeometriesSimplified === true
            if (
              !preSimplified &&
              shouldSimplifyGeometry(originalInfo.triangleCount, trimeshShape.simplification)
            ) {
              if (import.meta.env.DEV) {
                console.log(`[PhysicsWorld] Simplifying trimesh: ${originalInfo.triangleCount} triangles`)
              }

              try {
                const simplificationResult = simplifyGeometry(extractedGeometry, trimeshShape.simplification!)

                // Check if simplification actually worked
                if (simplificationResult.reductionPercentage > 0) {
                  extractedGeometry = {
                    vertices: simplificationResult.vertices,
                    indices: simplificationResult.indices,
                  }

                  if (import.meta.env.DEV) {
                    console.log(
                      `[PhysicsWorld] Simplified: ${simplificationResult.originalTriangleCount} → ` +
                        `${simplificationResult.simplifiedTriangleCount} triangles ` +
                        `(${simplificationResult.reductionPercentage.toFixed(1)}% reduction)`,
                    )
                  }
                } else {
                  console.warn(
                    `[PhysicsWorld] Simplification failed or target already met (${simplificationResult.originalTriangleCount} triangles). ` +
                      `Using original geometry. Try adjusting maxTriangles threshold.`,
                  )
                }
              } catch (error) {
                console.error('[PhysicsWorld] Simplification error, using original geometry:', error)
              }
            }

            const finalInfo = getGeometryInfo(extractedGeometry)
            if (import.meta.env.DEV) {
              console.log(
                `[PhysicsWorld] Creating trimesh collider: ${finalInfo.vertexCount} vertices, ${finalInfo.triangleCount} triangles`,
              )
            }

            // Warn about large meshes
            if (finalInfo.triangleCount > 10000) {
              console.warn(
                `[PhysicsWorld] Large trimesh (${finalInfo.triangleCount} triangles) may impact performance. Consider enabling simplification.`,
              )
            }

            return RAPIER.ColliderDesc.trimesh(extractedGeometry.vertices, extractedGeometry.indices)
          } else {
            console.warn('[PhysicsWorld] Failed to extract geometry from trimesh (empty or null), using box fallback')
          }
        } catch (error) {
          console.error('[PhysicsWorld] Error creating trimesh collider:', error)
        }
      }

      // Fallback to box if extraction fails or no mesh provided
      console.warn('[PhysicsWorld] Trimesh collider could not be created, using box fallback')
      return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    }

    default:
      return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
  }
}
