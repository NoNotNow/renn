import { describe, it, expect } from 'vitest'
import {
  clampVideoTextureMaxAnisotropy,
  DEFAULT_VIDEO_TEXTURE_MAX_ANISOTROPY,
  resolvedLogarithmicDepthBuffer,
  resolvedPixelRatio,
} from './world'

describe('resolvedLogarithmicDepthBuffer', () => {
  it('defaults to enabled when undefined or true', () => {
    expect(resolvedLogarithmicDepthBuffer(undefined)).toBe(true)
    expect(resolvedLogarithmicDepthBuffer({})).toBe(true)
    expect(resolvedLogarithmicDepthBuffer({ logarithmicDepthBuffer: true })).toBe(true)
  })

  it('is disabled only when false', () => {
    expect(resolvedLogarithmicDepthBuffer({ logarithmicDepthBuffer: false })).toBe(false)
  })
})

describe('resolvedPixelRatio', () => {
  it('defaults to medium (min(dpr, 1.5)) when omitted', () => {
    expect(resolvedPixelRatio(undefined, 1)).toBe(1)
    expect(resolvedPixelRatio(undefined, 2)).toBe(1.5)
    expect(resolvedPixelRatio({}, 3)).toBe(1.5)
    expect(resolvedPixelRatio({ renderPixelRatio: 'medium' }, 2)).toBe(1.5)
  })

  it('returns 1 for low regardless of dpr', () => {
    expect(resolvedPixelRatio({ renderPixelRatio: 'low' }, 1)).toBe(1)
    expect(resolvedPixelRatio({ renderPixelRatio: 'low' }, 3)).toBe(1)
  })

  it('returns min(dpr, 2) for high', () => {
    expect(resolvedPixelRatio({ renderPixelRatio: 'high' }, 1)).toBe(1)
    expect(resolvedPixelRatio({ renderPixelRatio: 'high' }, 2)).toBe(2)
    expect(resolvedPixelRatio({ renderPixelRatio: 'high' }, 3)).toBe(2)
  })
})

describe('clampVideoTextureMaxAnisotropy', () => {
  it('defaults to 16 when omitted or non-finite', () => {
    expect(clampVideoTextureMaxAnisotropy(undefined)).toBe(DEFAULT_VIDEO_TEXTURE_MAX_ANISOTROPY)
    expect(clampVideoTextureMaxAnisotropy(Number.NaN)).toBe(DEFAULT_VIDEO_TEXTURE_MAX_ANISOTROPY)
  })

  it('clamps to 1–16', () => {
    expect(clampVideoTextureMaxAnisotropy(0)).toBe(1)
    expect(clampVideoTextureMaxAnisotropy(1)).toBe(1)
    expect(clampVideoTextureMaxAnisotropy(8)).toBe(8)
    expect(clampVideoTextureMaxAnisotropy(16)).toBe(16)
    expect(clampVideoTextureMaxAnisotropy(99)).toBe(16)
  })
})
