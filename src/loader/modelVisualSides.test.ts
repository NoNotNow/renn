import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { applyModelVisualSides, materialFromRef, type OriginalMaterialEntry } from '@/loader/createPrimitive'

describe('applyModelVisualSides', () => {
  function leafMesh(side: THREE.Side): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ side }),
    )
  }

  it('sets DoubleSide on all meshes when forceDoubleSide is true (no override)', () => {
    const root = new THREE.Group()
    const a = leafMesh(THREE.FrontSide)
    const b = leafMesh(THREE.BackSide)
    root.add(a, b)

    const entries: OriginalMaterialEntry[] = [
      { mesh: a, material: (a.material as THREE.MeshStandardMaterial).clone() },
      { mesh: b, material: (b.material as THREE.MeshStandardMaterial).clone() },
    ]

    applyModelVisualSides(root, entries, true, false)
    expect((a.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide)
    expect((b.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide)
  })

  it('when not forced and not override, copies side from stored material clone per mesh', () => {
    const root = new THREE.Group()
    const mesh = leafMesh(THREE.DoubleSide)
    root.add(mesh)

    const cloned = (mesh.material as THREE.MeshStandardMaterial).clone()
    cloned.side = THREE.BackSide // synthetic "asset default"
    mesh.material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }) // simulated override replaced

    const entries: OriginalMaterialEntry[] = [{ mesh, material: cloned }]

    applyModelVisualSides(root, entries, false, false)
    expect((mesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.BackSide)
  })

  it('syncs multi-material arrays from paired stored clones per slot', () => {
    const root = new THREE.Group()
    const m0 = new THREE.MeshStandardMaterial({ side: THREE.FrontSide })
    const m1 = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [m0, m1])
    root.add(mesh)

    const stored0 = m0.clone()
    const stored1 = m1.clone()
    stored0.side = THREE.BackSide
    stored1.side = THREE.FrontSide

    const entries: OriginalMaterialEntry[] = [{ mesh, material: [stored0, stored1] }]

    applyModelVisualSides(root, entries, false, false)
    const mats = mesh.material as THREE.MeshStandardMaterial[]
    expect(mats[0]!.side).toBe(THREE.BackSide)
    expect(mats[1]!.side).toBe(THREE.FrontSide)
  })

  it('when using material override and not forced, forces FrontSide', () => {
    const root = new THREE.Group()
    const mesh = leafMesh(THREE.DoubleSide)
    root.add(mesh)
    applyModelVisualSides(root, [], false, true)
    expect((mesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.FrontSide)
  })

  it('when using material override and forced, uses DoubleSide', () => {
    const root = new THREE.Group()
    const mesh = leafMesh(THREE.FrontSide)
    root.add(mesh)
    applyModelVisualSides(root, [], true, true)
    expect((mesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide)
  })
})

describe('materialFromRef side options', () => {
  it('defaults to FrontSide when options omitted', async () => {
    const mat = await materialFromRef({ color: [1, 0, 0] })
    expect(mat.side).toBe(THREE.FrontSide)
  })

  it('sets DoubleSide when forceDoubleSided is true', async () => {
    const mat = await materialFromRef({ color: [1, 0, 0] }, undefined, { forceDoubleSided: true })
    expect(mat.side).toBe(THREE.DoubleSide)
  })
})
