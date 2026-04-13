import { useState, useEffect } from 'react'
import { VideoManager } from '@/utils/videoManager'
import { TextureManager } from '@/utils/textureManager'
import TextureThumbnail from './TextureThumbnail'

export interface VideoThumbnailProps {
  assetId: string
  blob: Blob | undefined
  size?: number
  showName?: boolean
}

/**
 * Static poster frame from a video blob (first decodable frame).
 */
export default function VideoThumbnail({
  assetId,
  blob,
  size = 40,
  showName = false,
}: VideoThumbnailProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!blob || !VideoManager.isVideoBlob(blob)) {
      setDataUrl(null)
      setFailed(false)
      return
    }

    let cancelled = false
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.src = url

    const capture = (): void => {
      if (cancelled || !video.videoWidth) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setFailed(true)
          return
        }
        ctx.drawImage(video, 0, 0)
        setDataUrl(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        setFailed(true)
      }
    }

    const onLoaded = (): void => {
      const t = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.05, video.duration * 0.02)
        : 0.05
      try {
        video.currentTime = t
      } catch {
        capture()
      }
    }

    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('seeked', capture)

    video.load()

    return () => {
      cancelled = true
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('seeked', capture)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
    }
  }, [blob])

  if (blob && VideoManager.isVideoBlob(blob) && dataUrl && !failed) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div style={{ position: 'relative', width: size, height: size }}>
          <img
            src={dataUrl}
            alt=""
            style={{
              width: size,
              height: size,
              objectFit: 'cover',
              borderRadius: 4,
              border: '1px solid #2f3545',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: 2,
              bottom: 2,
              fontSize: Math.max(7, size * 0.18),
              lineHeight: 1,
              background: 'rgba(0,0,0,0.7)',
              color: '#e6e9f2',
              padding: '1px 3px',
              borderRadius: 2,
            }}
            title="Video"
          >
            Video
          </span>
        </div>
        {showName ? (
          <span
            style={{
              fontSize: 10,
              color: '#9aa4b2',
              maxWidth: size + 20,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {assetId}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        border: '1px solid #2f3545',
        background: '#2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(9, size * 0.22),
        color: '#9aa4b2',
      }}
      title={assetId}
    >
      {failed ? '!' : '…'}
    </div>
  )
}

/** Image or video thumbnail for a material `map` asset. */
export function MapMediaThumbnail(props: VideoThumbnailProps) {
  const { blob, assetId, size, showName } = props
  if (blob && VideoManager.isVideoBlob(blob)) {
    return <VideoThumbnail assetId={assetId} blob={blob} size={size} showName={showName} />
  }
  if (blob && TextureManager.isImageFile(blob)) {
    return <TextureThumbnail assetId={assetId} blob={blob} size={size} showName={showName} />
  }
  return <TextureThumbnail assetId={assetId} blob={blob} size={size} showName={showName} />
}
