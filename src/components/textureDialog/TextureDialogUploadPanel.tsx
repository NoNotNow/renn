import { theme } from '@/config/theme'
import { TextureManager } from '@/utils/textureManager'
import { VideoManager } from '@/utils/videoManager'
import { MapMediaThumbnail } from '../VideoThumbnail'
import { assetDropZoneChrome, assetDropZoneHoverHandlers } from '../sharedStyles'
import type { UploadCandidate } from './useTextureDialogUpload'

export interface TextureDialogUploadPanelProps {
  allowVideo: boolean
  dragActive: boolean
  uploadPreview: UploadCandidate | null
  fileInputRef: React.RefObject<HTMLInputElement>
  onConfirmUpload: () => void
  onCancelUpload: () => void
  onDragEnter: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onOpenFilePicker: () => void
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export default function TextureDialogUploadPanel({
  allowVideo,
  dragActive,
  uploadPreview,
  fileInputRef,
  onConfirmUpload,
  onCancelUpload,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenFilePicker,
  onFileInputChange,
}: TextureDialogUploadPanelProps) {
  return (
    <div
      style={{
        width: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.text.primary }}>Upload</h3>

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
              onClick={onConfirmUpload}
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
              onClick={onCancelUpload}
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
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onOpenFilePicker}
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
        onChange={onFileInputChange}
      />
    </div>
  )
}
