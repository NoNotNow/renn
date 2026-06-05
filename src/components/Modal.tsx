import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/config/theme'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  resizable?: boolean
  headerExtra?: React.ReactNode
  subheader?: React.ReactNode
  footer?: React.ReactNode
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  width = 600,
  height,
  minWidth = 360,
  minHeight = 280,
  resizable = false,
  headerExtra,
  subheader,
  footer,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number | undefined }>({
    width,
    height,
  })
  const resizeDragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSize({ width, height })
    }
  }, [isOpen, width, height])

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const panelHeight = size.height ?? height

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizable) return
    e.preventDefault()
    e.stopPropagation()
    const rect = modalRef.current?.getBoundingClientRect()
    resizeDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect?.width ?? size.width,
      startH: rect?.height ?? panelHeight ?? minHeight,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current
    if (!drag) return
    const nextW = Math.max(minWidth, drag.startW + (e.clientX - drag.startX))
    const nextH = Math.max(minHeight, drag.startH + (e.clientY - drag.startY))
    setSize({ width: nextW, height: nextH })
  }

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return
    resizeDragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.bg.modalBackdrop,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: theme.zIndex.modal,
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div
        ref={modalRef}
        style={{
          position: 'relative',
          backgroundColor: theme.bg.panelAlt,
          border: `1px solid ${theme.border.default}`,
          borderRadius: 8,
          width: `${size.width}px`,
          maxWidth: '95vw',
          height: panelHeight ? `${panelHeight}px` : undefined,
          maxHeight: panelHeight ? '95vh' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          animation: 'slideUp 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            id="modal-title"
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: theme.text.primary,
            }}
          >
            {title}
          </h2>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.text.muted,
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.bg.surface
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Subheader */}
        {subheader && (
          <div
            style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${theme.border.default}`,
              flexShrink: 0,
            }}
          >
            {subheader}
          </div>
        )}

        {/* Content */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '20px',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: `1px solid ${theme.border.default}`,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}

        {resizable ?
          <div
            aria-hidden={true}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
            data-testid="modal-resize-handle"
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: 'nwse-resize',
              touchAction: 'none',
            }}
          />
        : null}
      </div>
    </div>,
    document.body
  )
}
