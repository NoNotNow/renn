import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  collectMaterialMapAssetIds,
  scheduleMaterialTextureDecodePrefetch,
  warmUpRendererTextures,
} from './prefetchMaterialTextures'
import type { RennWorld } from '@/types/world'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorld(overrides: Partial<RennWorld> = {}): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [],
    ...overrides,
  }
}

function makeBlob(content = 'x'): Blob {
  return new Blob([content], { type: 'image/png' })
}

// ---------------------------------------------------------------------------
// collectMaterialMapAssetIds
// ---------------------------------------------------------------------------

describe('collectMaterialMapAssetIds', () => {
  it('returns empty array when no entities', () => {
    expect(collectMaterialMapAssetIds(makeWorld())).toEqual([])
  })

  it('collects map ids from entity materials', () => {
    const world = makeWorld({
      entities: [
        { id: 'a', material: { map: 'tex1' } },
        { id: 'b', material: { map: 'tex2' } },
        { id: 'c' },
      ],
    })
    const ids = collectMaterialMapAssetIds(world)
    expect(ids).toContain('tex1')
    expect(ids).toContain('tex2')
    expect(ids).toHaveLength(2)
  })

  it('deduplicates when multiple entities share the same texture', () => {
    const world = makeWorld({
      entities: [
        { id: 'a', material: { map: 'shared' } },
        { id: 'b', material: { map: 'shared' } },
      ],
    })
    expect(collectMaterialMapAssetIds(world)).toEqual(['shared'])
  })

  it('ignores entities with no material or no map', () => {
    const world = makeWorld({
      entities: [
        { id: 'a' },
        { id: 'b', material: { color: [1, 0, 0] } },
      ],
    })
    expect(collectMaterialMapAssetIds(world)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// scheduleMaterialTextureDecodePrefetch
// ---------------------------------------------------------------------------

describe('scheduleMaterialTextureDecodePrefetch', () => {
  let origCreateImageBitmap: typeof globalThis.createImageBitmap | undefined
  let origRequestIdleCallback: unknown

  beforeEach(() => {
    origCreateImageBitmap = (globalThis as any).createImageBitmap
    origRequestIdleCallback = (globalThis as any).requestIdleCallback
  })

  afterEach(() => {
    if (origCreateImageBitmap !== undefined) {
      ;(globalThis as any).createImageBitmap = origCreateImageBitmap
    } else {
      delete (globalThis as any).createImageBitmap
    }
    if (origRequestIdleCallback !== undefined) {
      ;(globalThis as any).requestIdleCallback = origRequestIdleCallback
    } else {
      delete (globalThis as any).requestIdleCallback
    }
    vi.restoreAllMocks()
  })

  it('returns a no-op disposer when createImageBitmap is unavailable', () => {
    delete (globalThis as any).createImageBitmap
    const cacheTexture = vi.fn()
    const disposer = scheduleMaterialTextureDecodePrefetch(
      { cacheTexture },
      ['tex1'],
      () => makeBlob(),
    )
    expect(disposer.cancel).toBeDefined()
    disposer.cancel() // must not throw
    expect(cacheTexture).not.toHaveBeenCalled()
  })

  it('returns a no-op disposer when assetIds is empty', () => {
    ;(globalThis as any).createImageBitmap = vi.fn()
    const cacheTexture = vi.fn()
    const disposer = scheduleMaterialTextureDecodePrefetch(
      { cacheTexture },
      [],
      () => makeBlob(),
    )
    disposer.cancel()
    expect((globalThis as any).createImageBitmap).not.toHaveBeenCalled()
  })

  it('skips asset when blob is missing', async () => {
    const bitmap = { close: vi.fn(), width: 1, height: 1 }
    ;(globalThis as any).createImageBitmap = vi.fn().mockResolvedValue(bitmap)
    delete (globalThis as any).requestIdleCallback

    const cacheTexture = vi.fn()
    scheduleMaterialTextureDecodePrefetch(
      { cacheTexture },
      ['missing'],
      () => undefined,
    )

    // Give the setTimeout(120ms) callbacks time to run
    await vi.waitFor(() => {}, { timeout: 200 })
    expect(cacheTexture).not.toHaveBeenCalled()
  })

  it('decodes blob and calls cacheTexture for each asset id', async () => {
    const bitmap = { close: vi.fn(), width: 4, height: 4 }
    ;(globalThis as any).createImageBitmap = vi.fn().mockResolvedValue(bitmap)
    delete (globalThis as any).requestIdleCallback

    const cacheTexture = vi.fn()
    const blob = makeBlob()

    scheduleMaterialTextureDecodePrefetch(
      { cacheTexture },
      ['tex1'],
      () => blob,
    )

    // vi.waitFor retries while the callback throws; stop when cacheTexture has been called.
    await vi.waitFor(() => {
      expect(cacheTexture).toHaveBeenCalledOnce()
    }, { timeout: 500 })

    const [id, texture, calledBlob] = cacheTexture.mock.calls[0]!
    expect(id).toBe('tex1')
    expect(texture).toBeInstanceOf(THREE.Texture)
    expect(calledBlob).toBe(blob)
  })

  it('cancels pending work and closes decoded bitmap', async () => {
    let resolveDecodePromise: ((v: unknown) => void) | undefined
    const bitmap = { close: vi.fn() }
    ;(globalThis as any).createImageBitmap = vi.fn().mockImplementation(
      () => new Promise((res) => { resolveDecodePromise = res }),
    )
    delete (globalThis as any).requestIdleCallback

    const cacheTexture = vi.fn()
    const disposer = scheduleMaterialTextureDecodePrefetch(
      { cacheTexture },
      ['tex1'],
      () => makeBlob(),
    )

    // Wait for the createImageBitmap call to be in-flight (setTimeout 120ms runs first).
    await vi.waitFor(() => {
      expect((globalThis as any).createImageBitmap).toHaveBeenCalled()
    }, { timeout: 400 })

    // Now cancel while decode is in-flight and resolve the promise.
    disposer.cancel()
    resolveDecodePromise!(bitmap)

    // Wait one tick to let the promise chain run.
    await new Promise((r) => setTimeout(r, 50))
    expect(cacheTexture).not.toHaveBeenCalled()
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('uses requestIdleCallback when available', () => {
    const idleCallbacks: Array<() => void> = []
    ;(globalThis as any).requestIdleCallback = vi.fn((cb: () => void) => {
      idleCallbacks.push(cb)
      return idleCallbacks.length - 1
    })
    ;(globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({ close: vi.fn() })

    const cacheTexture = vi.fn()
    scheduleMaterialTextureDecodePrefetch(
      { cacheTexture },
      ['tex1'],
      () => makeBlob(),
    )

    expect((globalThis as any).requestIdleCallback).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// warmUpRendererTextures
// ---------------------------------------------------------------------------

describe('warmUpRendererTextures', () => {
  it('calls renderer.initTexture for each material texture in the scene', () => {
    const initTexture = vi.fn()
    const renderer = { initTexture } as unknown as THREE.WebGLRenderer

    const tex = new THREE.Texture()
    const mat = new THREE.MeshStandardMaterial({ map: tex })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    const scene = new THREE.Scene()
    scene.add(mesh)

    warmUpRendererTextures(renderer, scene)

    expect(initTexture).toHaveBeenCalledWith(tex)
  })

  it('skips VideoTexture instances', () => {
    const initTexture = vi.fn()
    const renderer = { initTexture } as unknown as THREE.WebGLRenderer

    const video = document.createElement('video')
    const videoTex = new THREE.VideoTexture(video)
    const mat = new THREE.MeshStandardMaterial({ map: videoTex })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    const scene = new THREE.Scene()
    scene.add(mesh)

    warmUpRendererTextures(renderer, scene)

    expect(initTexture).not.toHaveBeenCalled()
  })

  it('handles scenes with no meshes without throwing', () => {
    const renderer = { initTexture: vi.fn() } as unknown as THREE.WebGLRenderer
    const scene = new THREE.Scene()
    expect(() => warmUpRendererTextures(renderer, scene)).not.toThrow()
  })

  it('handles array materials on a single mesh', () => {
    const initTexture = vi.fn()
    const renderer = { initTexture } as unknown as THREE.WebGLRenderer

    const tex1 = new THREE.Texture()
    const tex2 = new THREE.Texture()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshStandardMaterial({ map: tex1 }),
      new THREE.MeshStandardMaterial({ map: tex2 }),
    ])
    const scene = new THREE.Scene()
    scene.add(mesh)

    warmUpRendererTextures(renderer, scene)
    expect(initTexture).toHaveBeenCalledWith(tex1)
    expect(initTexture).toHaveBeenCalledWith(tex2)
  })
})
