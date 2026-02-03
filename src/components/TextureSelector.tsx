/**
 * @deprecated Use TextureDialog instead for better UX
 * This component is kept for backward compatibility but should not be used in new code.
 * 
 * The TextureDialog provides:
 * - Visual grid view of textures
 * - Drag-and-drop upload
 * - Better user experience
 * 
 * See: src/components/TextureDialog.tsx
 */
import { useState, useEffect } from 'react'
import type { RennWorld } from '@/types/world'

export interface TextureSelectorProps {
  assets: Map<string, Blob>
  world: RennWorld
  selectedTextureId?: string
  onSelectTexture: (assetId: string | undefined) => void
  disabled?: boolean
}

function TextureThumbnail({ blob }: { blob: Blob }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    if (blob.type.startsWith('image/')) {
      const url = URL.createObjectURL(blob)
      setThumbnailUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [blob])

  if (blob.type.startsWith('image/') && thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt="texture"
        style={{
          width: 32,
          height: 32,
          objectFit: 'cover',
          borderRadius: 4,
          border: '1px solid #2f3545',
        }}
      />
    )
  }

  return null
}

export default function TextureSelector({
  assets,
  world,
  selectedTextureId,
  onSelectTexture,
  disabled = false,
}: TextureSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Filter to only texture/image assets
  const textureAssets = Array.from(assets.entries()).filter(([id, blob]) => {
    return blob.type.startsWith('image/')
  })

  const selectedBlob = selectedTextureId ? assets.get(selectedTextureId) : null

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9aa4b2' }}>
        Texture
      </label>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {selectedBlob && selectedBlob.type.startsWith('image/') && (
          <TextureThumbnail blob={selectedBlob} />
        )}
        <select
          value={selectedTextureId || ''}
          onChange={(e) => {
            const value = e.target.value
            onSelectTexture(value === '' ? undefined : value)
          }}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '6px 8px',
            borderRadius: 6,
            background: disabled ? '#2a2a2a' : '#1a1a1a',
            border: '1px solid #2f3545',
            color: disabled ? '#666' : '#e6e9f2',
            fontSize: 12,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <option value="">None</option>
          {textureAssets.map(([id]) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
