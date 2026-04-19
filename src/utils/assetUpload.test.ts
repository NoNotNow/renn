import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/persistence/indexedDb', () => ({
  defaultPersistence: {
    saveAsset: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/utils/modelPreview', () => ({
  generateModelPreview: vi.fn().mockResolvedValue(new Blob(['preview'], { type: 'image/png' })),
}))

vi.mock('@/utils/videoConverter', () => ({
  convertVideoToWebMp4: vi.fn(),
}))

import { defaultPersistence } from '@/persistence/indexedDb'
import { convertVideoToWebMp4 } from '@/utils/videoConverter'
import { generateModelPreview } from '@/utils/modelPreview'
import {
  uploadAudio,
  uploadModel,
  uploadTexture,
  uploadVideo,
  saveVideoMapBlob,
} from './assetUpload'

const saveAssetMock = vi.mocked(defaultPersistence.saveAsset)
const generatePreviewMock = vi.mocked(generateModelPreview)
const convertMock = vi.mocked(convertVideoToWebMp4)

const GLB_TYPE = 'model/gltf-binary'

beforeEach(() => {
  saveAssetMock.mockClear().mockResolvedValue(undefined)
  generatePreviewMock.mockClear().mockResolvedValue(new Blob(['p'], { type: 'image/png' }))
  convertMock.mockReset()
})

describe('uploadModel', () => {
  it('persists the file and returns a model asset entry', async () => {
    const file = new File(['glb'], 'cube.glb', { type: GLB_TYPE })
    const assets = new Map<string, Blob>()

    const result = await uploadModel(file, 'cube-1', assets)

    expect(generatePreviewMock).toHaveBeenCalledWith(file)
    expect(saveAssetMock).toHaveBeenCalledWith('cube-1', file, expect.any(Blob))
    expect(result.worldAssetEntry).toEqual({ path: 'assets/cube.glb', type: 'model' })
    expect(result.nextAssets.get('cube-1')).toBe(file)
    expect(assets.size).toBe(0)
  })

  it('rejects invalid model files without persisting', async () => {
    const file = new File(['x'], 'broken.obj', { type: 'model/obj' })
    await expect(uploadModel(file, 'broken', new Map())).rejects.toThrow(/Invalid file type/)
    expect(saveAssetMock).not.toHaveBeenCalled()
    expect(generatePreviewMock).not.toHaveBeenCalled()
  })
})

describe('uploadTexture', () => {
  it('persists the file and returns a texture asset entry', async () => {
    const file = new File(['png-bytes'], 'rock.png', { type: 'image/png' })
    const assets = new Map<string, Blob>([['existing', new Blob(['e'])]])

    const result = await uploadTexture(file, 'rock-tex', assets)

    expect(saveAssetMock).toHaveBeenCalledWith('rock-tex', file)
    expect(result.worldAssetEntry).toEqual({ path: 'assets/rock.png', type: 'texture' })
    expect(result.nextAssets.get('rock-tex')).toBe(file)
    expect(result.nextAssets.get('existing')).toBeDefined()
    expect(assets.has('rock-tex')).toBe(false)
  })

  it('rejects invalid texture files', async () => {
    const file = new File(['x'], 'bad.exe', { type: 'application/octet-stream' })
    await expect(uploadTexture(file, 'bad', new Map())).rejects.toThrow()
    expect(saveAssetMock).not.toHaveBeenCalled()
  })
})

describe('uploadAudio', () => {
  it('accepts files with audio mime type', async () => {
    const file = new File(['snd'], 'beep.mp3', { type: 'audio/mpeg' })
    const result = await uploadAudio(file, 'beep', new Map())

    expect(saveAssetMock).toHaveBeenCalledWith('beep', file)
    expect(result.worldAssetEntry).toEqual({ path: 'assets/beep.mp3', type: 'audio' })
    expect(result.nextAssets.get('beep')).toBe(file)
  })

  it('accepts files with audio extension even if mime is missing', async () => {
    const file = new File(['snd'], 'tone.flac', { type: '' })
    const result = await uploadAudio(file, 'tone', new Map())
    expect(result.worldAssetEntry.type).toBe('audio')
  })

  it('rejects non-audio files with friendly error', async () => {
    const file = new File(['x'], 'doc.txt', { type: 'text/plain' })
    await expect(uploadAudio(file, 'doc', new Map())).rejects.toThrow(/Unsupported audio file/)
    expect(saveAssetMock).not.toHaveBeenCalled()
  })
})

describe('uploadVideo', () => {
  it('transcodes, persists the converted blob, and returns a video entry', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 3])], 'clip.webm', { type: 'video/webm' })
    const converted = new Blob(['mp4'], { type: 'video/mp4' })
    convertMock.mockResolvedValue(converted)

    const onConversionProgress = vi.fn()
    const result = await uploadVideo(file, 'clip-1', new Map(), { onConversionProgress })

    expect(convertMock).toHaveBeenCalledWith(file, expect.objectContaining({ onProgress: onConversionProgress }))
    expect(saveAssetMock).toHaveBeenCalledWith('clip-1', converted)
    expect(result.worldAssetEntry).toEqual({ path: 'assets/clip-1.mp4', type: 'video' })
    expect(result.nextAssets.get('clip-1')).toBe(converted)
  })

  it('skips conversion and persistence when validation fails', async () => {
    const file = new File(['x'], 'thing.txt', { type: 'text/plain' })
    await expect(uploadVideo(file, 'bad', new Map())).rejects.toThrow()
    expect(convertMock).not.toHaveBeenCalled()
    expect(saveAssetMock).not.toHaveBeenCalled()
  })
})

describe('saveVideoMapBlob', () => {
  it('saves an already-encoded video blob as-is when mime is video/*', async () => {
    const blob = new Blob(['mp4'], { type: 'video/mp4' })
    const result = await saveVideoMapBlob(blob, 'video-1', new Map())

    expect(saveAssetMock).toHaveBeenCalledWith('video-1', blob)
    expect(result.nextAssets.get('video-1')).toBe(blob)
    expect(result.worldAssetEntry).toEqual({ path: 'assets/video-1.mp4', type: 'video' })
  })

  it('wraps non-video blobs in a video/mp4 blob before persisting', async () => {
    const blob = new Blob(['raw'], { type: '' })
    const result = await saveVideoMapBlob(blob, 'video-2', new Map())

    expect(saveAssetMock).toHaveBeenCalledTimes(1)
    const stored = saveAssetMock.mock.calls[0]![1] as Blob
    expect(stored).not.toBe(blob)
    expect(stored.type).toBe('video/mp4')
    expect(result.nextAssets.get('video-2')).toBe(stored)
  })
})
