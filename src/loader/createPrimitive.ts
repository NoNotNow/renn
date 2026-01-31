import * as THREE from 'three'
import type { Shape, Vec3, Quat, MaterialRef } from '@/types/world'

function colorFromRef(material: MaterialRef | undefined): THREE.Color {
  if (material?.color && Array.isArray(material.color)) {
    const [r, g, b] = material.color
    return new THREE.Color(r, g, b)
  }
  return new THREE.Color(0.7, 0.7, 0.7)
}

function materialFromRef(material: MaterialRef | undefined): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colorFromRef(material),
    roughness: material?.roughness ?? 0.5,
    metalness: material?.metalness ?? 0,
  })
}

function applyTransform(
  mesh: THREE.Mesh,
  position: Vec3,
  rotation: Quat,
  scale: Vec3
): void {
  mesh.position.set(position[0], position[1], position[2])
  mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3])
  mesh.scale.set(scale[0], scale[1], scale[2])
}

/**
 * Creates a Three.js mesh for the given shape and material.
 * Does not set position/rotation/scale; caller applies those.
 */
export function createPrimitiveMesh(
  shape: Shape,
  materialRef: MaterialRef | undefined
): THREE.Mesh {
  const mat = materialFromRef(materialRef)
  let geometry: THREE.BufferGeometry

  switch (shape.type) {
    case 'box':
      geometry = new THREE.BoxGeometry(shape.width, shape.height, shape.depth)
      break
    case 'sphere':
      geometry = new THREE.SphereGeometry(shape.radius, 32, 32)
      break
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 32)
      break
    case 'capsule':
      geometry = new THREE.CapsuleGeometry(shape.radius, Math.max(0, shape.height - 2 * shape.radius), 8, 16)
      break
    case 'plane': {
      const size = 100
      geometry = new THREE.PlaneGeometry(size * 2, size * 2)
      break
    }
    case 'trimesh':
      geometry = new THREE.BoxGeometry(1, 1, 1)
      break
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1)
  }

  return new THREE.Mesh(geometry, mat)
}

/**
 * Builds a mesh for an entity: primitive from shape (or placeholder for trimesh/model).
 * Applies position, rotation, scale from entity.
 */
export function buildEntityMesh(
  shape: Shape | undefined,
  materialRef: MaterialRef | undefined,
  position: Vec3,
  rotation: Quat,
  scale: Vec3
): THREE.Mesh {
  const s = shape ?? { type: 'box' as const, width: 1, height: 1, depth: 1 }
  const mesh = createPrimitiveMesh(s, materialRef)
  applyTransform(mesh, position, rotation, scale)
  if (s.type === 'plane') {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    mesh.quaternion.premultiply(q)
  }
  return mesh
}
