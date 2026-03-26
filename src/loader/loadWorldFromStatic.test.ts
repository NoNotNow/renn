import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadWorldFromStatic } from './loadWorldFromStatic'

const BASE = 'http://localhost/renn'

function minimalWorldWithAsset(assetId: string) {
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      ambientLight: [0.3, 0.3, 0.35],
      directionalLight: {
        direction: [1, 2, 1],
        color: [1, 0.98, 0.9],
        intensity: 1.2,
      },
      skyColor: [0.4, 0.6, 0.9],
      camera: { control: 'free', mode: 'follow', target: '', distance: 10, height: 2 },
    },
    assets: {
      [assetId]: { path: `assets/${assetId}.jpg`, type: 'texture' },
    },
    entities: [
      {
        id: 'e1',
        name: 'E1',
        bodyType: 'static',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
        material: { color: [1, 1, 1], map: assetId },
      },
    ],
  }
}

describe('loadWorldFromStatic', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects HTML responses so SPA fallback is not stored as asset blob', async () => {
    const world = minimalWorldWithAsset('tex1')
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/world/world.json')) {
        return new Response(JSON.stringify(world), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Simulate Vite dev: missing file returns HTML shell
      return new Response('<!doctype html><html>...</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    })

    const result = await loadWorldFromStatic(BASE)
    expect(result).not.toBeNull()
    expect(result!.world).toBeDefined()
    // No asset should be stored when every fetch returns HTML
    expect(result!.assets.has('tex1')).toBe(false)
  })

  it('accepts non-HTML blob and stores asset', async () => {
    const world = minimalWorldWithAsset('tex2')
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/world/world.json')) {
        return new Response(JSON.stringify(world), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/world/assets/tex2.bin')) {
        const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
        return new Response(buf, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }
      return new Response('not found', { status: 404 })
    })

    const result = await loadWorldFromStatic(BASE)
    expect(result).not.toBeNull()
    expect(result!.assets.has('tex2')).toBe(true)
    const blob = result!.assets.get('tex2')!
    expect(blob.type).not.toContain('html')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('tries assetId-based path before ref.path (bin first wins)', async () => {
    const assetId = 'mytex'
    const world = minimalWorldWithAsset(assetId)
    const fetchMock = vi.mocked(fetch)
    const fetchedUrls: string[] = []
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/world/world.json')) {
        return new Response(JSON.stringify(world), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      fetchedUrls.push(url)
      // ref.path would be assets/mytex.jpg - if tried first and returned HTML, we'd poison the map.
      // We only succeed on assetId.bin
      if (url.endsWith(`/world/assets/${assetId}.bin`)) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }
      if (url.includes('mytex.jpg')) {
        return new Response('<html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return new Response('', { status: 404 })
    })

    const result = await loadWorldFromStatic(BASE)
    expect(result!.assets.has(assetId)).toBe(true)
    expect(result!.assets.get(assetId)!.size).toBe(3)
    // First asset attempt after world.json should be assets/mytex.bin (export order)
    const afterWorldJson = fetchedUrls.filter((u) => u.includes('/world/assets/'))
    expect(afterWorldJson[0]).toContain(`${assetId}.bin`)
  })

  it('loads texture asset referenced only by world.world.skybox', async () => {
    const skyId = 'night_sky'
    const world = {
      version: '1.0',
      world: {
        gravity: [0, -9.81, 0],
        ambientLight: [0.3, 0.3, 0.35],
        directionalLight: {
          direction: [1, 2, 1],
          color: [1, 0.98, 0.9],
          intensity: 1.2,
        },
        skyColor: [0.05, 0.05, 0.1],
        skybox: skyId,
        camera: { control: 'free', mode: 'follow', target: '', distance: 10, height: 2 },
      },
      assets: {
        [skyId]: { path: `assets/${skyId}.png`, type: 'texture' },
      },
      entities: [],
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/world/world.json')) {
        return new Response(JSON.stringify(world), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith(`/world/assets/${skyId}.bin`)) {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }
      return new Response('not found', { status: 404 })
    })

    const result = await loadWorldFromStatic(BASE)
    expect(result).not.toBeNull()
    expect(result!.assets.has(skyId)).toBe(true)
  })
})
