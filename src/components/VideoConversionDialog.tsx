import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { convertVideoToWebMp4 } from '@/utils/videoConverter'

export interface VideoConversionDialogProps {
  isOpen: boolean
  file: File | null
  /** Target map asset id (persists under this key). */
  assetId: string
  onClose: () => void
  /** Called after successful transcode; may be async (persist assets). */
  onComplete: (blob: Blob, assetId: string) => void | Promise<void>
}

export default function VideoConversionDialog({
  isOpen,
  file,
  assetId,
  onClose,
  onComplete,
}: VideoConversionDialogProps) {
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const onCompleteRef = useRef(onComplete)
  const assetIdRef = useRef(assetId)
  onCompleteRef.current = onComplete
  assetIdRef.current = assetId

  useEffect(() => {
    if (!isOpen || !file) {
      setProgress(0)
      setError(null)
      setWorking(false)
      return
    }

    setProgress(0)
    setError(null)
    setWorking(true)
    const ac = new AbortController()
    abortRef.current = ac

    void (async () => {
      try {
        const blob = await convertVideoToWebMp4(file, {
          onProgress: (p) => setProgress(p),
          signal: ac.signal,
        })
        await onCompleteRef.current(blob, assetIdRef.current)
      } catch (e) {
        if (ac.signal.aborted) return
        const msg = e instanceof Error ? e.message : 'Conversion failed'
        setError(msg)
      } finally {
        if (!ac.signal.aborted) setWorking(false)
      }
    })()

    return () => {
      ac.abort()
      abortRef.current = null
    }
  }, [isOpen, file])

  const handleCancel = (): void => {
    abortRef.current?.abort()
    onClose()
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Converting video" width={440} height={220}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 4 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#9aa4b2' }}>
          Transcoding to MP4 (max 720p). First run downloads the encoder; please wait.
        </p>
        {file ? (
          <div style={{ fontSize: 11, color: '#666', wordBreak: 'break-word' }}>{file.name}</div>
        ) : null}
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: '#2a2a2a',
            overflow: 'hidden',
            border: '1px solid #2f3545',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.round(progress * 100)}%`,
              background: working ? '#4a9eff' : '#3d5a3d',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 12, color: '#e6e9f2' }}>
          {error ? (
            <span style={{ color: '#f4a4a4' }}>{error}</span>
          ) : working ? (
            `${Math.round(progress * 100)}%`
          ) : (
            'Done'
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid #2f3545',
              color: '#9aa4b2',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {working ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
