import { useCallback } from 'react'
import type { RennWorld } from '@/types/world'
import { VideoManager } from '@/utils/videoManager'
import VideoConversionDialog from './VideoConversionDialog'
import AssetPickerDialogLayout from './assetDialog/AssetPickerDialogLayout'
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
      <AssetPickerDialogLayout
        isOpen={isOpen}
        onClose={onClose}
        title={allowVideo ? 'Select texture or video' : 'Select Texture'}
        searchPlaceholder={allowVideo ? 'Search images and videos…' : 'Search textures…'}
        searchQuery={browse.searchQuery}
        onSearchChange={browse.setSearchQuery}
        assetList={
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
        }
        uploadPanel={
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
        }
        footer={
          <TextureDialogFooter
            selectedTextureId={selectedTextureId}
            hasUploadPreview={!!upload.uploadPreview}
            onRemove={handleRemoveTexture}
            onCancel={onClose}
            onPrimary={handlePrimaryAction}
          />
        }
      />

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
