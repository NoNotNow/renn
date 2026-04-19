import { useCallback, useRef, useState } from 'react'
import { TextureManager } from '@/utils/textureManager'
import { VideoManager } from '@/utils/videoManager'

export interface UploadCandidate {
  file: File
  assetId: string
}

export interface TextureDialogUploadState {
  dragActive: boolean
  uploadPreview: UploadCandidate | null
  pendingVideoConversion: UploadCandidate | null
  fileInputRef: React.RefObject<HTMLInputElement>
  setUploadPreview: (next: UploadCandidate | null) => void
  setPendingVideoConversion: (next: UploadCandidate | null) => void
  handleDragEnter: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Programmatically open the OS file picker (used by the drop-zone click handler). */
  openFilePicker: () => void
  /** Reset to the initial idle state (clears preview + drag flag, no video pending). */
  resetUpload: () => void
}

/**
 * Owns the texture-picker upload affordance: drag flag, picker preview,
 * pending video conversion, and the drag/drop/file-input handlers.
 *
 * The validation and asset-id derivation lives in `TextureManager` /
 * `VideoManager`; this hook only handles state + event plumbing.
 */
export function useTextureDialogUpload(allowVideo: boolean): TextureDialogUploadState {
  const [dragActive, setDragActive] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<UploadCandidate | null>(null)
  const [pendingVideoConversion, setPendingVideoConversion] = useState<UploadCandidate | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      alert(allowVideo ? 'Please drop an image or video file.' : 'Please drop an image file.')
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
      tryPickUploadFile(files[0])
      e.target.value = ''
    },
    [tryPickUploadFile],
  )

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const resetUpload = useCallback(() => {
    setUploadPreview(null)
    setDragActive(false)
  }, [])

  return {
    dragActive,
    uploadPreview,
    pendingVideoConversion,
    fileInputRef,
    setUploadPreview,
    setPendingVideoConversion,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInput,
    openFilePicker,
    resetUpload,
  }
}
