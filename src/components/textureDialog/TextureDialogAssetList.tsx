import { type CSSProperties, type ReactNode } from 'react'
import { theme } from '@/config/theme'
import { TextureManager } from '@/utils/textureManager'
import TextureThumbnail from '../TextureThumbnail'
import VideoThumbnail from '../VideoThumbnail'
import type { TextureDialogGroup } from '@/utils/textureAssetVersioning'
import type { TextureDialogFilteredItem } from './useTextureDialogAssets'

export interface TextureDialogAssetListProps {
  searchQuery: string
  filteredTextures: TextureDialogFilteredItem[]
  filteredVideos: TextureDialogFilteredItem[]
  dialogGroups: TextureDialogGroup[]
  blobById: Map<string, Blob>
  expandedFamilies: Set<string>
  toggleFamilyExpanded: (stem: string) => void
  selectedTextureId?: string
  onSelectTexture: (assetId: string) => void
  allowVideo: boolean
  leftColumnEmpty: boolean
}

function selectableCardStyle(isSelected: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 6,
    border: isSelected
      ? `2px solid ${theme.border.dropZoneActive}`
      : `1px solid ${theme.border.default}`,
    background: isSelected ? theme.bg.dropZoneActive : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }
}

function attachHoverHandlers(isSelected: boolean) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelected) {
        e.currentTarget.style.background = theme.bg.surface
        e.currentTarget.style.borderColor = theme.border.dropZoneHover
      }
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelected) {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = theme.border.default
      }
    },
  }
}

interface SelectableAssetCardProps {
  id: string
  blob: Blob
  label: string
  isSelected: boolean
  onSelect: (id: string) => void
  thumbnail: ReactNode
}

/**
 * Shared row used for top-level images and videos. A small selectable card
 * with thumbnail on the left and id/label/size on the right.
 */
function SelectableAssetCard({
  id,
  blob,
  label,
  isSelected,
  onSelect,
  thumbnail,
}: SelectableAssetCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(id)}
      style={selectableCardStyle(isSelected)}
      {...attachHoverHandlers(isSelected)}
    >
      {thumbnail}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: theme.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={id}
        >
          {id}
        </div>
        <div style={{ fontSize: 10, color: theme.text.subtle, marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 10, color: theme.text.disabled, marginTop: 2 }}>
          {TextureManager.formatFileSize(blob.size)}
        </div>
      </div>
    </div>
  )
}

interface FamilyGroupCardProps {
  stem: string
  versions: Array<{ id: string; n: number }>
  expanded: boolean
  blobById: Map<string, Blob>
  selectedTextureId?: string
  onToggleExpanded: (stem: string) => void
  onSelectVersion: (id: string) => void
}

function FamilyGroupCard({
  stem,
  versions,
  expanded,
  blobById,
  selectedTextureId,
  onToggleExpanded,
  onSelectVersion,
}: FamilyGroupCardProps) {
  const latest = versions[0]!
  const latestBlob = blobById.get(latest.id)
  return (
    <div
      data-testid={`texture-dialog-family-${stem}`}
      style={{
        borderRadius: 6,
        border: `1px solid ${theme.border.default}`,
        overflow: 'hidden',
        background: theme.bg.thumbnailFrame,
      }}
    >
      <button
        type="button"
        onClick={() => onToggleExpanded(stem)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          background: theme.bg.thumbnailHeader,
          border: 'none',
          cursor: 'pointer',
          color: theme.text.primary,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, width: 14, flexShrink: 0 }} aria-hidden>
          {expanded ? '▼' : '▶'}
        </span>
        {latestBlob ? <TextureThumbnail assetId={latest.id} blob={latestBlob} size={44} /> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{stem}</div>
          <div style={{ fontSize: 10, color: theme.text.subtle }}>
            {versions.length} versions (newest first)
          </div>
        </div>
      </button>
      {expanded ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 10,
            padding: 12,
            borderTop: `1px solid ${theme.border.default}`,
          }}
        >
          {versions.map(({ id: vid, n }) => {
            const vb = blobById.get(vid)
            if (!vb) return null
            const isSelected = selectedTextureId === vid
            return (
              <div
                key={vid}
                role="button"
                tabIndex={0}
                onClick={() => onSelectVersion(vid)}
                onKeyDown={(e) => e.key === 'Enter' && onSelectVersion(vid)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: 8,
                  borderRadius: 6,
                  border: isSelected
                    ? `2px solid ${theme.border.dropZoneActive}`
                    : `1px solid ${theme.border.default}`,
                  background: isSelected ? theme.bg.dropZoneActive : theme.bg.thumbnailTile,
                  cursor: 'pointer',
                }}
              >
                <TextureThumbnail assetId={vid} blob={vb} size={72} />
                <span
                  style={{
                    fontSize: 10,
                    color: theme.text.muted,
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    width: '100%',
                  }}
                  title={vid}
                >
                  edited{n}
                </span>
                <span style={{ fontSize: 9, color: theme.text.disabled }}>
                  {TextureManager.formatFileSize(vb.size)}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default function TextureDialogAssetList({
  searchQuery,
  filteredTextures,
  filteredVideos,
  dialogGroups,
  blobById,
  expandedFamilies,
  toggleFamilyExpanded,
  selectedTextureId,
  onSelectTexture,
  allowVideo,
  leftColumnEmpty,
}: TextureDialogAssetListProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '8px 0',
        }}
      >
        {leftColumnEmpty ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.text.muted,
              fontSize: 14,
            }}
          >
            {searchQuery ? 'No assets match your search' : 'No textures available'}
          </div>
        ) : null}

        {filteredTextures.length > 0 ? (
          <>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
              Images ({filteredTextures.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dialogGroups.map((group) => {
                if (group.kind === 'single') {
                  const id = group.id
                  const blob = blobById.get(id)
                  if (!blob) return null
                  return (
                    <SelectableAssetCard
                      key={id}
                      id={id}
                      blob={blob}
                      label="Image"
                      isSelected={selectedTextureId === id}
                      onSelect={onSelectTexture}
                      thumbnail={<TextureThumbnail assetId={id} blob={blob} size={72} />}
                    />
                  )
                }
                return (
                  <FamilyGroupCard
                    key={group.stem}
                    stem={group.stem}
                    versions={group.versions}
                    expanded={expandedFamilies.has(group.stem)}
                    blobById={blobById}
                    selectedTextureId={selectedTextureId}
                    onToggleExpanded={toggleFamilyExpanded}
                    onSelectVersion={onSelectTexture}
                  />
                )
              })}
            </div>
          </>
        ) : null}

        {allowVideo && filteredVideos.length > 0 ? (
          <>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
              Videos ({filteredVideos.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredVideos.map(({ id, blob }) => (
                <SelectableAssetCard
                  key={id}
                  id={id}
                  blob={blob}
                  label="Video"
                  isSelected={selectedTextureId === id}
                  onSelect={onSelectTexture}
                  thumbnail={<VideoThumbnail assetId={id} blob={blob} size={72} />}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
