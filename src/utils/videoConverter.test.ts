import { describe, it, expect } from 'vitest'
import { encodeProgressFromFfmpegRatio } from './videoConverter'

describe('encodeProgressFromFfmpegRatio', () => {
  it('maps 0 to start and 1 to start+span (staged bar when wasm emits no events)', () => {
    expect(encodeProgressFromFfmpegRatio(0)).toBeCloseTo(0.08, 5)
    expect(encodeProgressFromFfmpegRatio(1)).toBeCloseTo(0.95, 5)
  })

  it('clamps out-of-range values', () => {
    expect(encodeProgressFromFfmpegRatio(-1)).toBeCloseTo(0.08, 5)
    expect(encodeProgressFromFfmpegRatio(2)).toBeCloseTo(0.95, 5)
  })
})
