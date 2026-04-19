import { useState, useRef, useCallback, useMemo } from 'react'
import type { RennWorld } from '@/types/world'
import { TextureManager } from '@/utils/textureManager'
import { VideoManager, listVideoMapPickerAssets } from '@/utils/videoManager'
import { buildTextureDialogGroups, isInternalTextureAssetKey } from '@/utils/textureAssetVersioning'
import Modal from './Modal'
import TextureThumbnail from './TextureThumbnail'
import VideoThumbnail, { MapMediaThumbnail } from './VideoThumbnail'
import VideoConversionDialog from './VideoConversionDialog'
import { assetDropZoneChrome, assetDropZoneHoverHandlers } from './sharedStyles'
import { theme } from '@/config/theme'

export interface TextureDialogProps {
  isOpen: boolean
  onClose: () => void
  assets: Map<string, Blob>
  world: RennWorld
  selectedTextureId?: string
  onSelectTexture: (assetId: string | undefined) => void
  onUploadTexture: (file: File, assetId: string) => Promise<void>
  /** Required for material map video uploads (after ffmpeg). */
  onCommitConvertedVideo?: (blob: Blob, assetId: string) => Promise<void>
  /** When false (e.g. sky dome), only images are listed and accepted. */
  allowVideo?: boolean
}

export default function TextureDialog({
  isOpen,
  onClose,
  assets,
  world,
  selectedTextureId,
  onSelectTexture,
  onUploadTexture,
  onCommitConvertedVideo,
  allowVideo = true,
}: TextureDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{ file: File; assetId: string } | null>(null)
  const [pendingVideoConversion, setPendingVideoConversion] = useState<{ file: File; assetId: string } | null>(
    null,
  )
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(() => new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const userTextureAssets = useMemo(
    () => TextureManager.getTextureAssets(assets).filter(({ id }) => !isInternalTextureAssetKey(id)),
    [assets],
  )
  const filteredTextures = useMemo(
    () =>
      userTextureAssets.filter(({ id }) => id.toLowerCase().includes(searchQuery.toLowerCase())),
    [userTextureAssets, searchQuery],
  )
  const dialogGroups = useMemo(
    () => buildTextureDialogGroups(filteredTextures.map((t) => t.id)),
    [filteredTextures],
  )
  const blobById = useMemo(
    () => new Map(filteredTextures.map((t) => [t.id, t.blob])),
    [filteredTextures],
  )

  const videoPickerAssets = useMemo(
    () => listVideoMapPickerAssets(assets, world),
    [assets, world],
  )
  const filteredVideos = useMemo(
    () =>
      allowVideo
        ? videoPickerAssets.filter(({ id }) => id.toLowerCase().includes(searchQuery.toLowerCase()))
        : [],
    [allowVideo, videoPickerAssets, searchQuery],
  )

  const toggleFamilyExpanded = useCallback((stem: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(stem)) next.delete(stem)
      else next.add(stem)
      return next
    })
  }, [])

  const tryPickUploadFile = useCallback(
    (file: File | undefined): void => {
      if (!file) return
      if (TextureManager.isImageFile(file)) {
        const validation = TextureManager.validateTextureFile(file)
        if (validation.valid) {
          setUploadPreview({ file, assetId: TextureManager.generateAssetId(file.name) })
        } else {
          alert(validation.error)
        }
        return
      }
      if (allowVideo && VideoManager.isVideoFile(file)) {
        const validation = VideoManager.validateVideoFile(file)
        if (validation.valid) {
          setUploadPreview({ file, assetId: VideoManager.generateAssetId(file.name) })
        } else {
          alert(validation.error)
        }
        return
      }
      alert(
        allowVideo
          ? 'Please drop an image or video file.'
          : 'Please drop an image file.',
      )
    },
    [allowVideo],
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      const files = Array.from(e.dataTransfer.files)
      const imageFile = files.find((f) => TextureManager.isImageFile(f))
      if (imageFile) {
        tryPickUploadFile(imageFile)
        return
      }
      const videoFile = allowVideo ? files.find((f) => VideoManager.isVideoFile(f)) : undefined
      tryPickUploadFile(videoFile)
    },
    [allowVideo, tryPickUploadFile],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      const first = files[0]
      tryPickUploadFile(first)
      e.target.value = ''
    },
    [tryPickUploadFile],
  )

  const handleConfirmUpload = useCallback(async () => {
    if (!uploadPreview) return

    if (allowVideo && VideoManager.isVideoFile(uploadPreview.file)) {
      if (!onCommitConvertedVideo) {
        alert('Video import is not available in this dialog.')
        return
      }
      const content = await VideoManager.validateVideoFileContent(uploadPreview.file)
      if (!content.valid) {
        alert(content.error ?? 'Invalid video file.')
        return
      }
      setPendingVideoConversion({ file: uploadPreview.file, assetId: uploadPreview.assetId })
      return
    }

    try {
      await onUploadTexture(uploadPreview.file, uploadPreview.assetId)
      onSelectTexture(uploadPreview.assetId)
      setUploadPreview(null)
      onClose()
    } catch (error) {
      console.error('Failed to upload texture:', error)
      alert('Failed to upload texture. Please try again.')
    }
  }, [uploadPreview, allowVideo, onCommitConvertedVideo, onUploadTexture, onSelectTexture, onClose])

  const handleSelectExisting = useCallback(
    (assetId: string) => {
      onSelectTexture(assetId)
      onClose()
    },
    [onSelectTexture, onClose],
  )

  const handleRemoveTexture = useCallback(() => {
    onSelectTexture(undefined)
    onClose()
  }, [onSelectTexture, onClose])

  const leftColumnEmpty =
    filteredTextures.length === 0 && (!allowVideo || filteredVideos.length === 0)

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={allowVideo ? 'Select texture or video' : 'Select Texture'}
        width={800}
        height={600}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
          <div>
            <input
              type="text"
              placeholder={allowVideo ? 'Search images and videos…' : 'Search textures…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                background: theme.bg.panelAlt,
                border: `1px solid ${theme.border.default}`,
                color: theme.text.primary,
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
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
                            <div
                              key={id}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleSelectExisting(id)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSelectExisting(id)}
                              style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                padding: 10,
                                borderRadius: 6,
                                border:
                                  selectedTextureId === id
                                    ? `2px solid ${theme.border.dropZoneActive}`
                                    : `1px solid ${theme.border.default}`,
                                background:
                                  selectedTextureId === id ? theme.bg.dropZoneActive : 'transparent',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                if (selectedTextureId !== id) {
                                  e.currentTarget.style.background = theme.bg.surface
                                  e.currentTarget.style.borderColor = theme.border.dropZoneHover
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (selectedTextureId !== id) {
                                  e.currentTarget.style.background = 'transparent'
                                  e.currentTarget.style.borderColor = theme.border.default
                                }
                              }}
                            >
                              <TextureThumbnail assetId={id} blob={blob} size={72} />
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
                                <div style={{ fontSize: 10, color: theme.text.subtle, marginTop: 4 }}>Image</div>
                                <div style={{ fontSize: 10, color: theme.text.disabled, marginTop: 2 }}>
                                  {TextureManager.formatFileSize(blob.size)}
                                </div>
                              </div>
                            </div>
                          )
                        }

                        const { stem, versions } = group
                        const expanded = expandedFamilies.has(stem)
                        const latest = versions[0]!
                        const latestBlob = blobById.get(latest.id)

                        return (
                          <div
                            key={stem}
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
                              onClick={() => toggleFamilyExpanded(stem)}
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
                                {expanded ? "▼" : "▶"}
                              </span>
                              {latestBlob ? (
                                <TextureThumbnail assetId={latest.id} blob={latestBlob} size={44} />
                              ) : null}
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
                                  return (
                                    <div
                                      key={vid}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => handleSelectExisting(vid)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleSelectExisting(vid)}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: 8,
                                        borderRadius: 6,
                                        border:
                                          selectedTextureId === vid
                                            ? `2px solid ${theme.border.dropZoneActive}`
                                            : `1px solid ${theme.border.default}`,
                                        background:
                                          selectedTextureId === vid
                                            ? theme.bg.dropZoneActive
                                            : theme.bg.thumbnailTile,
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
                        <div
                          key={id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectExisting(id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSelectExisting(id)}
                          style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            padding: 10,
                            borderRadius: 6,
                            border:
                              selectedTextureId === id
                                ? `2px solid ${theme.border.dropZoneActive}`
                                : `1px solid ${theme.border.default}`,
                            background:
                              selectedTextureId === id ? theme.bg.dropZoneActive : 'transparent',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (selectedTextureId !== id) {
                              e.currentTarget.style.background = theme.bg.surface
                              e.currentTarget.style.borderColor = theme.border.dropZoneHover
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedTextureId !== id) {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.borderColor = theme.border.default
                            }
                          }}
                        >
                          <VideoThumbnail assetId={id} blob={blob} size={72} />
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
                            <div style={{ fontSize: 10, color: theme.text.subtle, marginTop: 4 }}>Video</div>
                            <div style={{ fontSize: 10, color: theme.text.disabled, marginTop: 2 }}>
                              {TextureManager.formatFileSize(blob.size)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div
              style={{
                width: 200,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
                Upload
              </h3>

              {uploadPreview ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 12,
                    borderRadius: 6,
                    border: `1px solid ${theme.border.default}`,
                    background: theme.bg.panelAlt,
                  }}
                >
                  <MapMediaThumbnail
                    assetId={uploadPreview.assetId}
                    blob={uploadPreview.file}
                    size={120}
                  />
                  <div style={{ fontSize: 11, color: theme.text.muted, wordBreak: 'break-word' }}>
                    {uploadPreview.assetId}
                  </div>
                  <div style={{ fontSize: 10, color: theme.text.disabled }}>
                    {TextureManager.formatFileSize(uploadPreview.file.size)}
                    {VideoManager.isVideoFile(uploadPreview.file) ? ' · will transcode' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void handleConfirmUpload()}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        background: theme.feedback.successBg,
                        border: `1px solid ${theme.feedback.successBorder}`,
                        color: theme.feedback.successText,
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadPreview(null)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        background: 'transparent',
                        border: `1px solid ${theme.border.default}`,
                        color: theme.text.muted,
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: 24,
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    minHeight: 200,
                    ...assetDropZoneChrome(dragActive),
                  }}
                  {...assetDropZoneHoverHandlers(dragActive)}
                >
                  <div style={{ fontSize: 32 }} aria-hidden>
                    ↑
                  </div>
                  <div style={{ fontSize: 12, color: theme.text.muted, textAlign: 'center' }}>
                    {dragActive
                      ? 'Drop file here'
                      : allowVideo
                        ? 'Click or drag image / video'
                        : 'Click or drag image to upload'}
                  </div>
                  <div style={{ fontSize: 10, color: theme.text.disabled, textAlign: 'center' }}>
                    {allowVideo ? 'PNG, JPG, … · MP4, WebM, MOV, …' : 'PNG, JPG, GIF, WEBP'}
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={allowVideo ? 'image/*,video/*' : 'image/*'}
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 16,
              borderTop: `1px solid ${theme.border.default}`,
            }}
          >
            <button
              type="button"
              onClick={handleRemoveTexture}
              disabled={!selectedTextureId}
              style={{
                padding: '8px 16px',
                background: selectedTextureId ? theme.bg.destructive : theme.bg.surface,
                border: selectedTextureId
                  ? `1px solid ${theme.border.destructive}`
                  : `1px solid ${theme.border.default}`,
                color: selectedTextureId ? theme.text.destructive : theme.text.disabled,
                borderRadius: 6,
                cursor: selectedTextureId ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              Remove Texture
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: `1px solid ${theme.border.default}`,
                  color: theme.text.muted,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (uploadPreview) {
                    void handleConfirmUpload()
                    return
                  }
                  if (selectedTextureId) {
                    handleSelectExisting(selectedTextureId)
                  } else {
                    onClose()
                  }
                }}
                disabled={!selectedTextureId && !uploadPreview}
                style={{
                  padding: '8px 16px',
                  background:
                    selectedTextureId || uploadPreview ? theme.feedback.successBg : theme.bg.surface,
                  border:
                    selectedTextureId || uploadPreview
                      ? `1px solid ${theme.feedback.successBorder}`
                      : `1px solid ${theme.border.default}`,
                  color:
                    selectedTextureId || uploadPreview
                      ? theme.feedback.successText
                      : theme.text.disabled,
                  borderRadius: 6,
                  cursor: selectedTextureId || uploadPreview ? 'pointer' : 'not-allowed',
                  fontSize: 12,
                }}
              >
                {uploadPreview ? 'Upload & Select' : 'Select'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <VideoConversionDialog
        isOpen={!!pendingVideoConversion}
        file={pendingVideoConversion?.file ?? null}
        assetId={pendingVideoConversion?.assetId ?? ''}
        onClose={() => setPendingVideoConversion(null)}
        onComplete={async (blob, aid) => {
          if (!onCommitConvertedVideo || !aid) return
          await onCommitConvertedVideo(blob, aid)
          onSelectTexture(aid)
          setUploadPreview(null)
          setPendingVideoConversion(null)
          onClose()
        }}
      />
    </>
  )
}
