/**
 * Integration: physics trimesh vertices (body space, entity scale applied) must match Three.js
 * world-space extraction for the same model root — including internal GLTF hierarchy (many
 * exports use an intermediate node with e.g. -90° X between root and mesh).
 *
 * Uses `public/world/assets/elefant(1).glb` when present; loads with a standalone ArrayBuffer
 * (Node `Buffer.buffer` can point into a larger slab and break GLTFLoader).
 *
 * Metrics: per-vertex max abs diff (identity case) and symmetric chamfer max / bbox diagonal
 * (relative) for rotated + scaled models with optional meshoptimizer simplification.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { applyTrimeshVisualSimplification } from '@/loader/createPrimitive'
import { convertZUpToYUpIfNeeded, normalizeSceneToUnitCube } from '@/utils/normalizeModelToUnitCube'
import { normalizeModelTextureUVs } from '@/utils/normalizeModelTextureUVs'
import { ensureMeshoptSimplifierReady } from '@/utils/meshSimplifier'
import { countTrianglesInObject3D } from '@/utils/geometryExtractor'
import {
  computePhysicsTrimeshVerticesInBodySpace,
  computeVisualTrimeshVerticesInBodySpace,
  symmetricChamferMax,
  verticesBoundingBoxDiagonal,
} from '@/utils/trimeshVisualPhysicsAlignment'
import type { Rotation, Vec3 } from '@/types/world'

const ELEPHANT_GLB = resolve(process.cwd(), 'public/world/assets/elefant(1).glb')

function applyModelTransform(modelScene: THREE.Object3D, modelRotation: Rotation, modelScale: Vec3): void {
  modelScene.rotation.set(modelRotation[0], modelRotation[1], modelRotation[2])
  modelScene.scale.set(modelScale[0], modelScale[1], modelScale[2])
}

async function loadElephantScene(): Promise<THREE.Group | null> {
  if (!existsSync(ELEPHANT_GLB)) {
    return null
  }
  // Copy to a standalone ArrayBuffer: Node Buffer may use a pooled ArrayBuffer with non-zero byteOffset,
  // and GLTFLoader reads from offset 0 of the passed ArrayBuffer.
  const buffer = new Uint8Array(readFileSync(ELEPHANT_GLB)).buffer
  const loader = new GLTFLoader()
  const scene = await new Promise<THREE.Group>((res, rej) => {
    loader.parse(
      buffer,
      '',
      (gltf) => res(gltf.scene as THREE.Group),
      (err) => rej(err ?? new Error('GLTFLoader.parse failed')),
    )
  })
  convertZUpToYUpIfNeeded(scene)
  normalizeSceneToUnitCube(scene)
  normalizeModelTextureUVs(scene)
  return scene
}

function maxAbsComponentDiff(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length)
  let m = 0
  for (let i = 0; i < a.length; i++) {
    m = Math.max(m, Math.abs(a[i]! - b[i]!))
  }
  return m
}

describe('trimesh visual vs physics alignment (body space)', () => {
  beforeAll(async () => {
    await ensureMeshoptSimplifierReady()
  })

  it('identity transforms: physics vertices equal Three.js world extraction (per-vertex)', async () => {
    const scene = await loadElephantScene()
    if (!scene) {
      return
    }
    applyModelTransform(scene, [0, 0, 0], [1, 1, 1])
    const physics = computePhysicsTrimeshVerticesInBodySpace(scene, {
      preSimplified: false,
      entityScale: [1, 1, 1],
    })
    const visual = computeVisualTrimeshVerticesInBodySpace(scene, [1, 1, 1])
    expect(physics).not.toBeNull()
    expect(visual).not.toBeNull()
    expect(maxAbsComponentDiff(physics!, visual!)).toBeLessThan(1e-5)
  })

  it('matches physics and visual vertex clouds without simplification (sanity)', async () => {
    const scene = await loadElephantScene()
    if (!scene) {
      return
    }

    const modelRotation: Rotation = [0.15, -0.2, 0.1]
    const modelScale: Vec3 = [1.1, 0.95, 1.05]
    const entityScale: Vec3 = [1.8, 0.6, 1.2]
    applyModelTransform(scene, modelRotation, modelScale)

    const physics = computePhysicsTrimeshVerticesInBodySpace(scene, {
      preSimplified: false,
      entityScale,
    })
    const visual = computeVisualTrimeshVerticesInBodySpace(scene, entityScale)

    expect(physics).not.toBeNull()
    expect(visual).not.toBeNull()
    expect(physics!.length).toBe(visual!.length)

    const diag = verticesBoundingBoxDiagonal(physics!)
    const chamfer = symmetricChamferMax(physics!, visual!, 3000)
    const relative = diag > 1e-6 ? chamfer / diag : chamfer
    expect(relative).toBeLessThan(1e-4)
  })

  it('matches after meshoptimizer simplification (pre-simplified visual path, same as physics)', async () => {
    const scene = await loadElephantScene()
    if (!scene) {
      return
    }

    const totalTris = countTrianglesInObject3D(scene)
    if (totalTris < 500) {
      return
    }

    const maxTriangles = Math.max(400, Math.floor(totalTris * 0.25))
    const changed = await applyTrimeshVisualSimplification(scene, {
      enabled: true,
      maxTriangles,
      algorithm: 'meshoptimizer',
      maxError: 0.05,
    })
    expect(changed).toBe(true)

    const modelRotation: Rotation = [0.12, 0.25, -0.08]
    const modelScale: Vec3 = [1.08, 1.08, 1.08]
    const entityScale: Vec3 = [2, 0.75, 1.25]
    applyModelTransform(scene, modelRotation, modelScale)

    const physics = computePhysicsTrimeshVerticesInBodySpace(scene, {
      simplification: {
        enabled: true,
        maxTriangles,
        algorithm: 'meshoptimizer',
        maxError: 0.05,
      },
      preSimplified: true,
      entityScale,
    })
    const visual = computeVisualTrimeshVerticesInBodySpace(scene, entityScale)

    expect(physics).not.toBeNull()
    expect(visual).not.toBeNull()
    expect(physics!.length).toBe(visual!.length)

    const diag = verticesBoundingBoxDiagonal(physics!)
    const chamfer = symmetricChamferMax(physics!, visual!, 3000)
    const relative = diag > 1e-6 ? chamfer / diag : chamfer
    expect(relative).toBeLessThan(1e-3)
  })
})
