import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorldAudio, type SoundPlaybackCommand } from '@/hooks/useWorldAudio'
import type { SoundSettings } from '@/types/world'

interface MockAudioInstance {
  loop: boolean
  volume: number
  src: string
  dataset: DOMStringMap
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  _url?: string
}

let createdAudios: MockAudioInstance[] = []
let createdUrls: string[] = []
let revokedUrls: string[] = []

class MockAudio implements MockAudioInstance {
  loop = false
  volume = 1
  src = ''
  dataset: DOMStringMap = {}
  play = vi.fn(async () => {})
  pause = vi.fn(() => {})
  _url?: string
  constructor(url?: string) {
    this._url = url
    createdAudios.push(this)
  }
}

describe('useWorldAudio', () => {
  let originalAudio: typeof Audio
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL

  beforeEach(() => {
    createdAudios = []
    createdUrls = []
    revokedUrls = []
    originalAudio = globalThis.Audio
    globalThis.Audio = MockAudio as unknown as typeof Audio

    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    let urlCounter = 0
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:mock-${urlCounter++}`
      createdUrls.push(url)
      return url
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url)
    }) as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    globalThis.Audio = originalAudio
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  function makeAssets(entries: Array<[string, Blob]>): Map<string, Blob> {
    return new Map(entries)
  }

  it('does nothing when sound is undefined', () => {
    renderHook(() => useWorldAudio({ sound: undefined, assets: new Map() }))
    expect(createdAudios).toHaveLength(0)
  })

  it('creates an audio element with autoplay, loop, and volume from sound settings', () => {
    const blob = new Blob(['x'], { type: 'audio/mpeg' })
    const assets = makeAssets([['snd', blob]])
    const sound: SoundSettings = { assetId: 'snd', volume: 0.5, loop: false, autoplay: true }
    renderHook(() => useWorldAudio({ sound, assets }))
    expect(createdAudios).toHaveLength(1)
    const a = createdAudios[0]!
    expect(a.dataset.assetId).toBe('snd')
    expect(a.loop).toBe(false)
    expect(a.volume).toBe(0.5)
    expect(a.play).toHaveBeenCalledTimes(1)
  })

  it('does not call play when autoplay is false', () => {
    const blob = new Blob(['x'])
    const assets = makeAssets([['snd', blob]])
    renderHook(() =>
      useWorldAudio({ sound: { assetId: 'snd', autoplay: false }, assets }),
    )
    expect(createdAudios[0]!.play).not.toHaveBeenCalled()
  })

  it('reuses the same audio element when only volume/loop change', () => {
    const blob = new Blob(['x'])
    const assets = makeAssets([['snd', blob]])
    const { rerender } = renderHook(
      ({ sound }: { sound: SoundSettings }) => useWorldAudio({ sound, assets }),
      { initialProps: { sound: { assetId: 'snd', volume: 1, loop: true } as SoundSettings } },
    )
    expect(createdAudios).toHaveLength(1)
    rerender({ sound: { assetId: 'snd', volume: 0.25, loop: false } as SoundSettings })
    expect(createdAudios).toHaveLength(1)
    expect(createdAudios[0]!.volume).toBe(0.25)
    expect(createdAudios[0]!.loop).toBe(false)
  })

  it('replaces the audio element when assetId changes and revokes the previous URL', () => {
    const a1 = new Blob(['a'])
    const a2 = new Blob(['b'])
    const assets = makeAssets([['a1', a1], ['a2', a2]])
    const { rerender } = renderHook(
      ({ sound }: { sound: SoundSettings }) => useWorldAudio({ sound, assets }),
      { initialProps: { sound: { assetId: 'a1' } as SoundSettings } },
    )
    expect(createdAudios).toHaveLength(1)
    rerender({ sound: { assetId: 'a2' } as SoundSettings })
    expect(createdAudios).toHaveLength(2)
    expect(revokedUrls).toContain(createdUrls[0])
  })

  it('clamps volume into [0, 1]', () => {
    const blob = new Blob(['x'])
    const assets = makeAssets([['snd', blob]])
    renderHook(() =>
      useWorldAudio({ sound: { assetId: 'snd', volume: 5 }, assets }),
    )
    expect(createdAudios[0]!.volume).toBe(1)
  })

  it('tears down the audio when sound becomes undefined', () => {
    const blob = new Blob(['x'])
    const assets = makeAssets([['snd', blob]])
    const { rerender } = renderHook(
      ({ sound }: { sound: SoundSettings | undefined }) => useWorldAudio({ sound, assets }),
      { initialProps: { sound: { assetId: 'snd' } as SoundSettings | undefined } },
    )
    expect(createdAudios[0]!.pause).not.toHaveBeenCalled()
    rerender({ sound: undefined })
    expect(createdAudios[0]!.pause).toHaveBeenCalled()
    expect(revokedUrls).toContain(createdUrls[0])
  })

  it('honors playbackCommand to stop playback', () => {
    const blob = new Blob(['x'])
    const assets = makeAssets([['snd', blob]])
    const sound: SoundSettings = { assetId: 'snd', autoplay: true }
    const { rerender } = renderHook(
      ({ playbackCommand }: { playbackCommand: SoundPlaybackCommand | null }) =>
        useWorldAudio({ sound, assets, playbackCommand }),
      { initialProps: { playbackCommand: null as SoundPlaybackCommand | null } },
    )
    const audio = createdAudios[0]!
    const initialPlayCalls = audio.play.mock.calls.length
    expect(initialPlayCalls).toBeGreaterThanOrEqual(1)

    rerender({ playbackCommand: { action: 'stop', nonce: 1 } })
    expect(audio.pause).toHaveBeenCalledTimes(1)

    rerender({ playbackCommand: { action: 'play', nonce: 2 } })
    expect(audio.play.mock.calls.length).toBe(initialPlayCalls + 1)
  })

  it('cleans up on unmount', () => {
    const blob = new Blob(['x'])
    const assets = makeAssets([['snd', blob]])
    const { unmount } = renderHook(() =>
      useWorldAudio({ sound: { assetId: 'snd' }, assets }),
    )
    expect(createdAudios).toHaveLength(1)
    unmount()
    expect(createdAudios[0]!.pause).toHaveBeenCalled()
    expect(revokedUrls).toContain(createdUrls[0])
  })

  // Suppress unused warning
  void act
})
