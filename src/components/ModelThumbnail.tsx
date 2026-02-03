import { ModelManager } from '@/utils/modelManager'

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

  if (isModel) {
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
            transition: onClick ? 'background-color 0.15s ease' : undefined,
          }}
          onMouseEnter={onClick ? (e) => { e.currentTarget.style.backgroundColor = '#333' } : undefined}
          onMouseLeave={onClick ? (e) => { e.currentTarget.style.backgroundColor = '#2a2a2a' } : undefined}
        >
          📦
        </div>
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
