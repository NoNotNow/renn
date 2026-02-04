import { useEffect, useState } from 'react'
import { ModelManager } from '@/utils/modelManager'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'

const persistence = createIndexedDbPersistence()

export interface ModelThumbnailProps {
  assetId: string
  blob: Blob | undefined
  size?: number
  showName?: boolean
  onClick?: () => void
}

export default function ModelThumbnail({
  assetId,
  blob,
  size = 40,
  showName = false,
  onClick,
}: ModelThumbnailProps) {
  const isModel = blob && ModelManager.isModelFile(blob)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    let cancelled = false

    if (!isModel) {
      setThumbnailUrl(null)
      return
    }

    persistence.loadAssetPreview(assetId).then((previewBlob) => {
      if (cancelled) return
      if (!previewBlob) {
        setThumbnailUrl(null)
        return
      }
      url = URL.createObjectURL(previewBlob)
      setThumbnailUrl(url)
    }).catch((error) => {
      console.error(`Failed to load preview for ${assetId}:`, error)
      setThumbnailUrl(null)
    })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [assetId, isModel])

  if (isModel && thumbnailUrl) {
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

  // Fallback for missing blob or invalid model
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
