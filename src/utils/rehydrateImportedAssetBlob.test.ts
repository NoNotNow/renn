import { describe, it, expect } from 'vitest'
import {
  resolveImportMimeType,
  rehydrateImportedAssetBlob,
  synthesizeAssetRefForExport,
} from './rehydrateImportedAssetBlob'

describe('resolveImportMimeType', () => {
  it('maps video ref + octet-stream blob to video/mp4', () => {
    const blob = new Blob([new Uint8Array(4)], { type: 'application/octet-stream' })
    expect(
      resolveImportMimeType(blob, { type: 'video', path: 'assets/clips/a.mp4' }, 'assets/clips/a.mp4'),
    ).toBe('video/mp4')
  })

  it('leaves correctly typed video blobs unchanged', () => {
    const blob = new Blob([], { type: 'video/mp4' })
    expect(resolveImportMimeType(blob, { type: 'video', path: 'assets/a.mp4' }, 'assets/a.mp4')).toBeUndefined()
  })

  it('infers video from zip path when ref is missing', () => {
    const blob = new Blob([], { type: 'application/octet-stream' })
    expect(resolveImportMimeType(blob, undefined, 'assets/foo.mp4')).toBe('video/mp4')
  })
})

describe('rehydrateImportedAssetBlob', () => {
  it('rewrites octet-stream to video/mp4 for video ref', async () => {
    const raw = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' })
    const out = await rehydrateImportedAssetBlob(
      raw,
      { type: 'video', path: 'assets/x.mp4' },
      'assets/x.mp4',
    )
    expect(out.type).toBe('video/mp4')
    expect(out.size).toBe(3)
  })
})

describe('synthesizeAssetRefForExport', () => {
  it('detects MP4 by ftyp header when MIME is missing', async () => {
    const buf = new Uint8Array(12)
    buf[4] = 0x66
    buf[5] = 0x74
    buf[6] = 0x79
    buf[7] = 0x70
    const blob = new Blob([buf], { type: 'application/octet-stream' })
    const ref = await synthesizeAssetRefForExport('orphan_vid', blob)
    expect(ref.type).toBe('video')
    expect(ref.path).toBe('assets/orphan_vid.mp4')
  })
})
