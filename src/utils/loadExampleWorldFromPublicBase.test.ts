import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadExampleWorldFromPublicBase } from './loadExampleWorldFromPublicBase'

describe('loadExampleWorldFromPublicBase', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches world.json and hydrates assets from the example folder', async () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [],
      assets: {
        'mesh-1': { path: 'assets/mesh-1.glb', mimeType: 'model/gltf-binary' },
      },
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/exampleWorlds/demo/world.json')) {
        return new Response(JSON.stringify(world), { status: 200 })
      }
      if (url.includes('/exampleWorlds/demo/assets/mesh-1.glb')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'model/gltf-binary' },
        })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const loaded = await loadExampleWorldFromPublicBase('/renn/', 'demo')
    expect(loaded.exampleWorldId).toBe('demo')
    expect(loaded.world.assets?.['mesh-1']).toBeDefined()
    expect(loaded.assets.size).toBe(1)
    expect(loaded.assets.get('mesh-1')?.size).toBe(3)
  })

  it('throws when world.json is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await expect(loadExampleWorldFromPublicBase('/', 'missing')).rejects.toThrow(/not found/)
  })
})
