import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import * as THREE from 'three'
import { useSkyDome, SKY_DOME_RADIUS, disposeSkyDomeMesh } from '@/hooks/useSkyDome'

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
  }
}

// Spy on the TextureLoader prototype so every `new THREE.TextureLoader()` uses
// our stub without reassigning the (read-only) ESM module binding.
const stubLoadAsync = vi
  .spyOn(THREE.TextureLoader.prototype, 'loadAsync')
  .mockImplementation(async (_url: string) => new THREE.Texture())

afterEach(() => {
  stubLoadAsync.mockClear()
  stubLoadAsync.mockImplementation(async (_url: string) => new THREE.Texture())
})

describe('disposeSkyDomeMesh', () => {
  it('is a no-op for null', () => {
    expect(() => disposeSkyDomeMesh(null)).not.toThrow()
  })

  it('removes from parent and disposes geometry, material, and map', () => {
    const scene = new THREE.Scene()
    const map = new THREE.Texture()
    const mat = new THREE.MeshBasicMaterial({ map })
    const geo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 8, 8)
    const mesh = new THREE.Mesh(geo, mat)
    scene.add(mesh)
    const matSpy = vi.spyOn(mat, 'dispose')
    const mapSpy = vi.spyOn(map, 'dispose')
    const geoSpy = vi.spyOn(geo, 'dispose')
    disposeSkyDomeMesh(mesh)
    expect(scene.children).not.toContain(mesh)
    expect(matSpy).toHaveBeenCalled()
    expect(mapSpy).toHaveBeenCalled()
    expect(geoSpy).toHaveBeenCalled()
  })
})

describe('useSkyDome', () => {
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL
  let createdUrls: string[]
  let revokedUrls: string[]

  beforeEach(() => {
    createdUrls = []
    revokedUrls = []
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    let counter = 0
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:sky-${counter++}`
      createdUrls.push(url)
      return url
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url)
    }) as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('returns a stable ref pointing at null when scene is missing', () => {
    const { result } = renderHook(() =>
      useSkyDome({ scene: null, skyboxAssetId: undefined, assets: new Map() }),
    )
    expect(result.current.skyDomeRef.current).toBe(null)
  })

  it('does not load when skyboxAssetId is missing or empty', async () => {
    const scene = new THREE.Scene()
    renderHook(() => useSkyDome({ scene, skyboxAssetId: '   ', assets: new Map() }))
    await Promise.resolve()
    expect(stubLoadAsync).not.toHaveBeenCalled()
  })

  it('warns when the asset id is not in the assets map', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const scene = new THREE.Scene()
    renderHook(() => useSkyDome({ scene, skyboxAssetId: 'missing', assets: new Map() }))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing'))
    warn.mockRestore()
  })

  it('loads, configures, and adds a sky dome mesh to the scene', async () => {
    const scene = new THREE.Scene()
    const blob = new Blob(['x'], { type: 'image/png' })
    const { result, unmount } = renderHook(() =>
      useSkyDome({ scene, skyboxAssetId: 'sky', assets: new Map([['sky', blob]]) }),
    )
    await flushAsync()

    const mesh = result.current.skyDomeRef.current
    expect(mesh).not.toBeNull()
    expect(mesh!.name).toBe('__renn_sky_dome')
    expect(mesh!.frustumCulled).toBe(false)
    expect(mesh!.renderOrder).toBe(-1)
    expect(scene.children).toContain(mesh)
    const mat = mesh!.material as THREE.MeshBasicMaterial
    expect(mat.side).toBe(THREE.BackSide)
    expect(mat.depthWrite).toBe(false)
    expect(mat.depthTest).toBe(false)
    expect(mat.map?.colorSpace).toBe(THREE.SRGBColorSpace)

    expect(revokedUrls).toContain(createdUrls[0])

    unmount()
    expect(scene.children).not.toContain(mesh)
  })

  it('disposes the mesh when scene becomes null', async () => {
    const scene = new THREE.Scene()
    const blob = new Blob(['x'])
    const { result, rerender } = renderHook(
      ({ scene: s }: { scene: THREE.Scene | null }) =>
        useSkyDome({ scene: s, skyboxAssetId: 'sky', assets: new Map([['sky', blob]]) }),
      { initialProps: { scene: scene as THREE.Scene | null } },
    )
    await flushAsync()
    expect(result.current.skyDomeRef.current).not.toBeNull()
    rerender({ scene: null })
    expect(result.current.skyDomeRef.current).toBeNull()
  })
})
