import { useCallback } from 'react'
import type { RennWorld } from '@/types/world'
import { VideoManager } from '@/utils/videoManager'
import Modal from './Modal'
import VideoConversionDialog from './VideoConversionDialog'
import { theme } from '@/config/theme'
import { useTextureDialogAssets } from './textureDialog/useTextureDialogAssets'
import { useTextureDialogUpload } from './textureDialog/useTextureDialogUpload'
import TextureDialogAssetList from './textureDialog/TextureDialogAssetList'
import TextureDialogUploadPanel from './textureDialog/TextureDialogUploadPanel'
import TextureDialogFooter from './textureDialog/TextureDialogFooter'

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
  const browse = useTextureDialogAssets(assets, world, allowVideo)
  const upload = useTextureDialogUpload(allowVideo)

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

  const handleConfirmUpload = useCallback(async () => {
    const preview = upload.uploadPreview
    if (!preview) return

    if (allowVideo && VideoManager.isVideoFile(preview.file)) {
      if (!onCommitConvertedVideo) {
        alert('Video import is not available in this dialog.')
        return
      }
      const content = await VideoManager.validateVideoFileContent(preview.file)
      if (!content.valid) {
        alert(content.error ?? 'Invalid video file.')
        return
      }
      upload.setPendingVideoConversion({ file: preview.file, assetId: preview.assetId })
      return
    }

    try {
      await onUploadTexture(preview.file, preview.assetId)
      onSelectTexture(preview.assetId)
      upload.resetUpload()
      onClose()
    } catch (error) {
      console.error('Failed to upload texture:', error)
      alert('Failed to upload texture. Please try again.')
    }
  }, [upload, allowVideo, onCommitConvertedVideo, onUploadTexture, onSelectTexture, onClose])

  const handlePrimaryAction = useCallback(() => {
    if (upload.uploadPreview) {
      void handleConfirmUpload()
      return
    }
    if (selectedTextureId) {
      handleSelectExisting(selectedTextureId)
    } else {
      onClose()
    }
  }, [upload.uploadPreview, selectedTextureId, handleConfirmUpload, handleSelectExisting, onClose])

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
              value={browse.searchQuery}
              onChange={(e) => browse.setSearchQuery(e.target.value)}
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
            <TextureDialogAssetList
              searchQuery={browse.searchQuery}
              filteredTextures={browse.filteredTextures}
              filteredVideos={browse.filteredVideos}
              dialogGroups={browse.dialogGroups}
              blobById={browse.blobById}
              expandedFamilies={browse.expandedFamilies}
              toggleFamilyExpanded={browse.toggleFamilyExpanded}
              selectedTextureId={selectedTextureId}
              onSelectTexture={handleSelectExisting}
              allowVideo={allowVideo}
              leftColumnEmpty={browse.leftColumnEmpty}
            />
            <TextureDialogUploadPanel
              allowVideo={allowVideo}
              dragActive={upload.dragActive}
              uploadPreview={upload.uploadPreview}
              fileInputRef={upload.fileInputRef}
              onConfirmUpload={() => void handleConfirmUpload()}
              onCancelUpload={() => upload.setUploadPreview(null)}
              onDragEnter={upload.handleDragEnter}
              onDragOver={upload.handleDragOver}
              onDragLeave={upload.handleDragLeave}
              onDrop={upload.handleDrop}
              onOpenFilePicker={upload.openFilePicker}
              onFileInputChange={upload.handleFileInput}
            />
          </div>

          <TextureDialogFooter
            selectedTextureId={selectedTextureId}
            hasUploadPreview={!!upload.uploadPreview}
            onRemove={handleRemoveTexture}
            onCancel={onClose}
            onPrimary={handlePrimaryAction}
          />
        </div>
      </Modal>

      <VideoConversionDialog
        isOpen={!!upload.pendingVideoConversion}
        file={upload.pendingVideoConversion?.file ?? null}
        assetId={upload.pendingVideoConversion?.assetId ?? ''}
        onClose={() => upload.setPendingVideoConversion(null)}
        onComplete={async (blob, aid) => {
          if (!onCommitConvertedVideo || !aid) return
          await onCommitConvertedVideo(blob, aid)
          onSelectTexture(aid)
          upload.resetUpload()
          upload.setPendingVideoConversion(null)
          onClose()
        }}
      />
    </>
  )
}
