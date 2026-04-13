import { describe, it, expect } from 'vitest'
import { VideoManager, isVideoMapAsset } from './videoManager'

describe('VideoManager', () => {
  it('validateVideoFile rejects non-video', () => {
    const f = new File(['x'], 'a.txt', { type: 'text/plain' })
    const r = VideoManager.validateVideoFile(f)
    expect(r.valid).toBe(false)
  })

  it('validateVideoFile accepts video MIME', () => {
    const f = new File(['x'], 'a.mp4', { type: 'video/mp4' })
    const r = VideoManager.validateVideoFile(f)
    expect(r.valid).toBe(true)
  })

  it('isVideoMapAsset uses world.assets type', () => {
    const assets = new Map<string, Blob>()
    expect(
      isVideoMapAsset('v1', { v1: { type: 'video', path: 'assets/v1.mp4' } }, assets),
    ).toBe(true)
    expect(isVideoMapAsset('v1', { v1: { type: 'texture' } }, assets)).toBe(false)
  })

  it('isVideoMapAsset falls back to blob MIME', () => {
    const assets = new Map<string, Blob>([['x', new Blob([], { type: 'video/mp4' })]])
    expect(isVideoMapAsset('x', {}, assets)).toBe(true)
  })
})
