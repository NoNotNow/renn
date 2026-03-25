import type { Mesh } from 'three'
import type { Entity, Vec3 } from '@/types/world'
import { DEFAULT_SCALE } from '@/types/world'

/**
 * Bakes mesh scale into primitive shape dimensions and resets entity.scale to [1,1,1].
 * Axis conventions match createColliderDesc in rapierPhysics (height on Y, horizontal radius from max(sx,sz)).
 *
 * Returns null for plane (no dimension fields to bake) or trimesh (use modelScale path).
 */
export function bakeScaleIntoPrimitiveShape(entity: Entity, meshScale: Vec3): Entity | null {
  const shape = entity.shape
  if (!shape) return null

  if (shape.type === 'trimesh' || shape.type === 'plane') return null

  const [sx, sy, sz] = meshScale
  const maxH = Math.max(sx, sz)

  switch (shape.type) {
    case 'box':
      return {
        ...entity,
        scale: DEFAULT_SCALE,
        shape: {
          ...shape,
          width: shape.width * sx,
          height: shape.height * sy,
          depth: shape.depth * sz,
        },
      }
    case 'sphere': {
      const avg = (sx + sy + sz) / 3
      return {
        ...entity,
        scale: DEFAULT_SCALE,
        shape: { ...shape, radius: shape.radius * avg },
      }
    }
    case 'cylinder':
      return {
        ...entity,
        scale: DEFAULT_SCALE,
        shape: {
          ...shape,
          radius: shape.radius * maxH,
          height: shape.height * sy,
        },
      }
    case 'capsule':
      return {
        ...entity,
        scale: DEFAULT_SCALE,
        shape: {
          ...shape,
          radius: shape.radius * maxH,
          height: shape.height * sy,
        },
      }
    case 'cone':
      return {
        ...entity,
        scale: DEFAULT_SCALE,
        shape: {
          ...shape,
          radius: shape.radius * maxH,
          height: shape.height * sy,
        },
      }
    case 'pyramid':
      return {
        ...entity,
        scale: DEFAULT_SCALE,
        shape: {
          ...shape,
          baseSize: shape.baseSize * maxH,
          height: shape.height * sy,
        },
      }
    case 'ring':
      return {
        ...entity,
        scale: DEFAULT_SCALE,
        shape: {
          ...shape,
          innerRadius: shape.innerRadius * maxH,
          outerRadius: shape.outerRadius * maxH,
          height: (shape.height ?? 0.1) * sy,
        },
      }
    default:
      return null
  }
}

/** For trimesh / entity.model wrapper meshes: fold mesh.scale into modelScale; reset entity.scale. */
export function bakeMeshScaleIntoModelScaleEntity(entity: Entity, meshScale: Vec3): Entity {
  const ms = entity.modelScale ?? DEFAULT_SCALE
  return {
    ...entity,
    scale: DEFAULT_SCALE,
    modelScale: [ms[0] * meshScale[0], ms[1] * meshScale[1], ms[2] * meshScale[2]],
  }
}

export function isModelBackedMesh(mesh: Mesh): boolean {
  return mesh.userData.isTrimeshSource === true || mesh.userData.usesModel === true
}
