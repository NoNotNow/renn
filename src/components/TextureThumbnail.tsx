import { useState, useEffect } from 'react'
import { TextureManager } from '@/utils/textureManager'

export interface TextureThumbnailProps {
  assetId: string
  blob: Blob | undefined
  size?: number
  showName?: boolean
  onClick?: () => void
}

export default function TextureThumbnail({
  assetId,
  blob,
  size = 40,
  showName = false,
  onClick,
}: TextureThumbnailProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setThumbnailUrl(null)
      return
    }

    if (TextureManager.isImageFile(blob)) {
      const url = TextureManager.createThumbnailUrl(blob)
      setThumbnailUrl(url)
      return () => {
        // Note: We don't revoke here because TextureManager caches URLs
        // Cleanup happens via TextureManager.cleanupThumbnailUrls()
      }
    } else {
      setThumbnailUrl(null)
    }
  }, [blob])

  const isImage = blob && TextureManager.isImageFile(blob)

  if (isImage && thumbnailUrl) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={onClick}
      >
        <img
          src={thumbnailUrl}
          alt={assetId}
          style={{
            width: size,
            height: size,
            objectFit: 'cover',
            borderRadius: 4,
            border: '1px solid #2f3545',
            transition: onClick ? 'opacity 0.15s ease' : undefined,
          }}
          onMouseEnter={onClick ? (e) => { e.currentTarget.style.opacity = '0.8' } : undefined}
          onMouseLeave={onClick ? (e) => { e.currentTarget.style.opacity = '1' } : undefined}
        />
        {showName && (
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
        )}
      </div>
    )
  }

  // Icon for non-image assets or missing blob
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
        fontSize: size * 0.5,
        cursor: onClick ? 'pointer' : 'default',
        transition: onClick ? 'background-color 0.15s ease' : undefined,
      }}
      onClick={onClick}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.backgroundColor = '#333' } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.backgroundColor = '#2a2a2a' } : undefined}
    >
      📦
    </div>
  )
}
