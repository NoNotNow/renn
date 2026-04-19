import { useEffect, useRef } from 'react'
import type { SoundSettings } from '@/types/world'

export interface SoundPlaybackCommand {
  action: 'play' | 'stop'
  nonce: number
}

export interface UseWorldAudioArgs {
  sound: SoundSettings | undefined
  assets: Map<string, Blob>
  /**
   * Optional manual play/stop command (Builder sound panel). Identified by
   * `nonce` so each invocation re-runs even if action is unchanged.
   */
  playbackCommand?: SoundPlaybackCommand | null
}

/**
 * Owns the lifecycle of a single world background-audio `<audio>` element.
 *
 * - Re-creates the underlying element when `sound.assetId` changes (and
 *   revokes the previous object URL).
 * - Reapplies `loop`, `volume`, and (optionally) `autoplay` whenever the
 *   `sound` settings change without re-creating the element.
 * - Honors a manual `playbackCommand` (`{ action, nonce }`) by toggling
 *   play/pause on the same element.
 *
 * Cleans up the audio element and revokes the object URL on unmount.
 */
export function useWorldAudio({ sound, assets, playbackCommand }: UseWorldAudioArgs): void {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    const assetId = sound?.assetId?.trim()
    const blob = assetId ? assets.get(assetId) : undefined
    const volume = Math.max(0, Math.min(1, sound?.volume ?? 1))
    const loop = sound?.loop ?? true
    const autoplay = sound?.autoplay ?? true

    if (!assetId || !blob) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
      return
    }

    const prev = audioRef.current
    const sameSource = prev?.dataset.assetId === assetId
    if (!sameSource) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
      }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.dataset.assetId = assetId
      audioRef.current = audio
      urlRef.current = url
    }

    const audio = audioRef.current
    if (!audio) return
    audio.loop = loop
    audio.volume = volume
    if (autoplay) {
      void audio.play().catch(() => {
        // Browsers may block autoplay until user interaction.
      })
    }
  }, [sound, assets])

  useEffect(() => {
    if (!playbackCommand) return
    const audio = audioRef.current
    if (!audio) return
    if (playbackCommand.action === 'play') {
      void audio.play().catch(() => {
        // If blocked by autoplay policy, user can retry after interaction.
      })
      return
    }
    audio.pause()
  }, [playbackCommand])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [])
}
