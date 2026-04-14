/**
 * Integration: video map assets — validation, static load, resolver VideoTexture, optional ffmpeg.wasm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { loadWorldFromStatic } from '@/loader/loadWorldFromStatic'
import { loadWorld } from '@/loader/loadWorld'
import { createAssetResolver } from '@/loader/assetResolverImpl'
import { disposeMaterialOrArray } from '@/utils/videoTextureLifecycle'
import { VideoManager, isVideoMapAsset } from '@/utils/videoManager'
import { saveVideoMapBlob } from '@/utils/assetUpload'
import type { RennWorld } from '@/types/world'
import { sampleWorld } from '@/data/sampleWorld'
import { minimalMp4Blob, MINIMAL_MP4_BYTES } from '@/test/fixtures/minimalVideoMp4'
import { defaultPersistence } from '@/persistence/indexedDb'

function installVideoElementStub(): void {
  const orig = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === 'video') {
      const v = orig('video', options)
      vi.spyOn(v, 'load').mockImplementation(() => {
        Object.defineProperty(v, 'videoWidth', { configurable: true, value: 64 })
        Object.defineProperty(v, 'videoHeight', { configurable: true, value: 64 })
        queueMicrotask(() => v.dispatchEvent(new Event('loadeddata')))
      })
      vi.spyOn(v, 'play').mockResolvedValue(undefined)
      return v
    }
    return orig(tagName, options)
  })
}

describe('video texture pipeline (integration)', () => {
  describe('VideoManager.validateVideoFile / validateVideoFileContent', () => {
    it('accepts minimal MP4-shaped file with video MIME', async () => {
      const f = new File([MINIMAL_MP4_BYTES], 'clip.mp4', { type: 'video/mp4' })
      expect(VideoManager.validateVideoFile(f).valid).toBe(true)
      await expect(VideoManager.validateVideoFileContent(f)).resolves.toEqual({ valid: true })
    })

    it('rejects HTML stub disguised as MP4', async () => {
      const f = new File(['<!DOCTYPE html><html><title>x</title></html>'], 'fake.mp4', { type: 'video/mp4' })
      expect(VideoManager.validateVideoFile(f).valid).toBe(true)
      const r = await VideoManager.validateVideoFileContent(f)
      expect(r.valid).toBe(false)
      expect(r.error).toMatch(/html|web page/i)
    })

    it('rejects oversize file', () => {
      const f = new File([new Uint8Array(1)], 'huge.mp4', { type: 'video/mp4' })
      Object.defineProperty(f, 'size', { value: VideoManager.MAX_FILE_SIZE + 1 })
      const r = VideoManager.validateVideoFile(f)
      expect(r.valid).toBe(false)
    })

    it('detects video blob MIME for isVideoMapAsset', () => {
      const assets = new Map<string, Blob>([['v', minimalMp4Blob()]])
      expect(isVideoMapAsset('v', {}, assets)).toBe(true)
    })
  })

  describe('loadWorldFromStatic + video asset', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn> | undefined

    afterEach(() => {
      fetchSpy?.mockRestore()
      vi.unstubAllGlobals()
    })

    it('loads video asset blob with non-HTML content-type', async () => {
      const worldDoc = structuredClone(sampleWorld) as RennWorld
      worldDoc.assets = { ...worldDoc.assets, v1: { path: 'assets/v1.mp4', type: 'video' } }

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url
        if (url.endsWith('/world/world.json')) {
          return new Response(JSON.stringify(worldDoc), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.includes('/world/assets/v1.mp4')) {
          return new Response(new Uint8Array(MINIMAL_MP4_BYTES), {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          })
        }
        return new Response('missing', { status: 404 })
      })

      const out = await loadWorldFromStatic('http://localhost:5173/renn')
      expect(out).not.toBeNull()
      const blob = out!.assets.get('v1')
      expect(blob).toBeDefined()
      expect(blob!.type.startsWith('video/')).toBe(true)
      expect(blob!.size).toBe(MINIMAL_MP4_BYTES.length)
    })

    it('rejects SPA HTML fallback for mp4 URL', async () => {
      const worldDoc = structuredClone(sampleWorld) as RennWorld
      worldDoc.assets = { ...worldDoc.assets, v1: { path: 'assets/v1.mp4', type: 'video' } }

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url
        if (url.endsWith('/world/world.json')) {
          return new Response(JSON.stringify(worldDoc), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.includes('/world/assets/v1.mp4')) {
          return new Response('<!DOCTYPE html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
        }
        return new Response('missing', { status: 404 })
      })

      const out = await loadWorldFromStatic('http://localhost:5173/renn')
      expect(out).not.toBeNull()
      expect(out!.assets.get('v1')).toBeUndefined()
    })
  })

  describe('assetResolverImpl.loadVideoTexture', () => {
    beforeEach(() => {
      installVideoElementStub()
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns VideoTexture for video/mp4 blob', async () => {
      const assets = new Map<string, Blob>([['vid', minimalMp4Blob()]])
      const resolver = createAssetResolver(assets, {
        isVideoAsset: (id) => isVideoMapAsset(id, { vid: { type: 'video', path: 'x' } }, assets),
      })
      const tex = await resolver.loadVideoTexture('vid')
      expect(tex).toBeInstanceOf(THREE.VideoTexture)
      tex?.dispose()
      resolver.dispose()
    })
  })

  /**
   * Vitest/happy-dom does not implement `HTMLMediaElement.load()` / reliable `error` after revoke.
   * We still assert the mechanism that causes `net::ERR_FILE_NOT_FOUND` in real browsers: `dispose()` → `revokeObjectURL`.
   */
  describe('assetResolver blob URL lifecycle', () => {
    it('dispose revokes resolve() URLs (do not dispose resolver while VideoTexture still uses that src)', () => {
      const assets = new Map<string, Blob>([['vid', minimalMp4Blob()]])
      const resolver = createAssetResolver(assets, {
        isVideoAsset: (id) => isVideoMapAsset(id, { vid: { type: 'video', path: 'x' } }, assets),
      })
      const u = resolver.resolve('vid')
      expect(u).toMatch(/^blob:/)
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
      try {
        resolver.dispose()
        expect(revokeSpy).toHaveBeenCalledWith(u)
      } finally {
        revokeSpy.mockRestore()
      }
    })
  })

  describe('loadWorld with assets getter', () => {
    beforeEach(() => {
      installVideoElementStub()
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('reuses same object URL for an id across resolve (getter-backed resolver)', async () => {
      const assets = new Map<string, Blob>([['vid', minimalMp4Blob()]])
      const world: RennWorld = {
        version: '1.0',
        world: {
          gravity: [0, -9.81, 0],
          camera: { control: 'free', mode: 'follow', target: 'b', distance: 10, height: 2 },
        },
        assets: { vid: { path: 'assets/vid.mp4', type: 'video' } },
        entities: [
          {
            id: 'b',
            name: 'Box',
            bodyType: 'static',
            shape: { type: 'box', width: 1, height: 1, depth: 1 },
            position: [0, 0, 0],
            material: { color: [1, 1, 1], map: 'vid' },
          },
        ],
      }

      const { assetResolver, scene } = await loadWorld(world, () => assets)
      expect(assetResolver).not.toBeNull()
      const u1 = assetResolver!.resolve('vid')
      const u2 = assetResolver!.resolve('vid')
      expect(u1).toBeTruthy()
      expect(u1).toBe(u2)

      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          disposeMaterialOrArray(o.material)
        }
      })
      assetResolver!.dispose()
    })
  })

  describe('saveVideoMapBlob + resolver (flow)', () => {
    beforeEach(() => {
      installVideoElementStub()
      vi.spyOn(defaultPersistence, 'saveAsset').mockResolvedValue(undefined)
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('persists blob and loadVideoTexture succeeds', async () => {
      const assets = new Map<string, Blob>()
      const world: RennWorld = { version: '1.0', world: sampleWorld.world, entities: [] }
      const { nextAssets } = await saveVideoMapBlob(minimalMp4Blob(), 'map_vid', assets)
      expect(defaultPersistence.saveAsset).toHaveBeenCalledWith('map_vid', expect.any(Blob))
      const blob = nextAssets.get('map_vid')
      expect(blob?.type).toBe('video/mp4')

      const resolver = createAssetResolver(nextAssets, {
        isVideoAsset: (id) => isVideoMapAsset(id, world.assets, nextAssets),
      })
      const tex = await resolver.loadVideoTexture('map_vid')
      expect(tex).toBeInstanceOf(THREE.VideoTexture)
      tex?.dispose()
      resolver.dispose()
    })
  })
})

const runFfmpegIntegration = process.env.RUN_FFMPEG_TESTS === '1'

describe.skipIf(!runFfmpegIntegration)('convertVideoToWebMp4 (network + wasm)', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it(
    'transcodes public fixture to mp4 and reports encoder + encode phases',
    async () => {
      const { convertVideoToWebMp4, resetFfmpegForTests } = await import('@/utils/videoConverter')
      resetFfmpegForTests()

      const dir = path.dirname(fileURLToPath(import.meta.url))
      const candidates = [
        path.join(dir, '../../../public/world/assets/7947392-hd_1920_1080_30fps.mp4'),
        path.join(dir, '../../../public/world/assets/1181911-uhd_4096_2160_24fps.mp4'),
      ]
      const fixturePath = candidates.find((p) => existsSync(p))
      if (!fixturePath) {
        throw new Error(`Missing fixture: tried ${candidates.join(', ')}`)
      }
      const buf = readFileSync(fixturePath)
      const base = path.basename(fixturePath)
      const file = new File([buf], base, { type: 'video/mp4' })

      const states: string[] = []
      const progress: number[] = []

      const blob = await convertVideoToWebMp4(file, {
        onEncoderLoadState: (s) => states.push(s),
        onProgress: (p) => progress.push(p),
      })

      expect(blob.type).toBe('video/mp4')
      expect(blob.size).toBeGreaterThan(10_000)
      expect(states).toContain('downloading')
      expect(states).toContain('ready')
      // Staged UI progress (encode phase); wasm may still emit zero `progress` events from ffmpeg.
      expect(progress.some((p) => p >= 0.07 && p < 1)).toBe(true)
      expect(progress[progress.length - 1]).toBe(1)

      resetFfmpegForTests()
    },
    300_000,
  )
})
