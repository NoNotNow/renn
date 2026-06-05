import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { TransformerDocsContent } from '@/components/TransformerDocs'
import { theme } from '@/config/theme'
import { clamp } from '@/utils/numberUtils'

const DOCS_SPLIT_MIN_PX = 300
const DOCS_SPLIT_MAIN_MIN_PX = 260
const DOCS_SPLIT_HANDLE_PX = 6
const DOCS_WIDTH_STORAGE_KEY = 'rennWorkspaceTransformerDocsWidthPx'

export interface WorkspaceDocsSplitProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Horizontal split for the workspace shell: tab content (left) and transformer reference docs (right).
 */
export default function WorkspaceDocsSplit({ open, onClose, children }: WorkspaceDocsSplitProps) {
  const [docsWidthPx, setDocsWidthPx] = useState(0)
  const [docsAreaWidth, setDocsAreaWidth] = useState(0)
  const splitRowRef = useRef<HTMLDivElement>(null)
  const docsContainerRef = useRef<HTMLDivElement>(null)
  const docsWidthRef = useRef(0)
  docsWidthRef.current = docsWidthPx
  const docsSplitDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const el = docsContainerRef.current
    if (!el) return

    const update = () => {
      setDocsAreaWidth(el.clientWidth)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return
    const row = splitRowRef.current
    if (!row) return

    const readBounds = () => {
      const inner = Math.max(0, row.clientWidth - DOCS_SPLIT_HANDLE_PX)
      const maxDocs = Math.max(DOCS_SPLIT_MIN_PX, inner - DOCS_SPLIT_MAIN_MIN_PX)
      return { inner, maxDocs, minDocs: DOCS_SPLIT_MIN_PX }
    }

    const applySizing = (): void => {
      if (docsSplitDragRef.current !== null) return
      const bounds = readBounds()
      setDocsWidthPx((prev) => {
        let next =
          prev > 0 && Number.isFinite(prev)
            ? prev
            : (() => {
                try {
                  const raw = window.localStorage.getItem(DOCS_WIDTH_STORAGE_KEY)
                  const stored = Number(raw)
                  return Number.isFinite(stored) ? stored : NaN
                } catch {
                  return NaN
                }
              })()
        if (!(next > 0 && Number.isFinite(next))) {
          next = Math.round(bounds.inner * 0.4)
        }
        return clamp(next, bounds.minDocs, bounds.maxDocs)
      })
    }

    applySizing()
    const ro = new ResizeObserver(applySizing)
    ro.observe(row)
    return () => ro.disconnect()
  }, [open])

  const handleDocsSplitMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      e.preventDefault()
      if (!open) return
      const row = splitRowRef.current
      if (!row || row.clientWidth <= 0) return

      const inner = Math.max(0, row.clientWidth - DOCS_SPLIT_HANDLE_PX)
      const maxDocs = Math.max(DOCS_SPLIT_MIN_PX, inner - DOCS_SPLIT_MAIN_MIN_PX)

      const docsMeas = docsContainerRef.current?.getBoundingClientRect()
      const roundedMeas =
        docsMeas != null && docsMeas.width > 0 ? Math.round(docsMeas.width) : 0
      const startBase =
        roundedMeas >= DOCS_SPLIT_MIN_PX
          ? roundedMeas
          : Math.round(Math.max(docsWidthRef.current || 0, DOCS_SPLIT_MIN_PX))

      const startWidth = clamp(startBase, DOCS_SPLIT_MIN_PX, maxDocs)

      docsSplitDragRef.current = { startX: e.clientX, startWidth }

      let lastCommitted = startWidth

      const onMove = (move: MouseEvent): void => {
        const data = docsSplitDragRef.current
        if (data == null) return

        const r = splitRowRef.current
        if (!r || r.clientWidth <= 0) return
        const inW = Math.max(0, r.clientWidth - DOCS_SPLIT_HANDLE_PX)
        const max = Math.max(DOCS_SPLIT_MIN_PX, inW - DOCS_SPLIT_MAIN_MIN_PX)

        const dx = move.clientX - data.startX
        const next = clamp(data.startWidth - dx, DOCS_SPLIT_MIN_PX, max)
        docsWidthRef.current = next
        lastCommitted = next
        setDocsWidthPx(next)
      }

      const onUp = (): void => {
        docsSplitDragRef.current = null
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        try {
          window.localStorage.setItem(DOCS_WIDTH_STORAGE_KEY, String(lastCommitted))
        } catch {
          /* quota */
        }
      }

      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [open],
  )

  return (
    <div
      ref={splitRowRef}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex:
            open
              ? docsWidthPx > 0
                ? '1 1 0%'
                : '1 1 60%'
              : '1 1 100%',
          minWidth: open && docsWidthPx > 0 ? DOCS_SPLIT_MAIN_MIN_PX : 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>

      {open ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize documentation column"
            data-testid="workspace-docs-split-handle"
            onMouseDown={handleDocsSplitMouseDown}
            style={{
              flexShrink: 0,
              width: DOCS_SPLIT_HANDLE_PX,
              alignSelf: 'stretch',
              cursor: 'ew-resize',
              background: theme.border.default,
              borderRadius: 2,
              margin: '4px 0',
            }}
          />
          <div
            ref={docsContainerRef}
            data-testid="workspace-docs-panel"
            style={{
              flex: docsWidthPx > 0 ? 'none' : '1 1 40%',
              width: docsWidthPx > 0 ? docsWidthPx : undefined,
              minWidth: DOCS_SPLIT_MIN_PX,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: theme.bg.panel,
              border: `1px solid ${theme.border.default}`,
              borderRadius: 8,
              padding: '8px 12px 12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexShrink: 0,
                marginBottom: 4,
              }}
            >
              <button
                type="button"
                data-testid="workspace-docs-close"
                onClick={onClose}
                aria-label="Close documentation"
                title="Close documentation"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: theme.text.muted,
                  fontSize: 20,
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <TransformerDocsContent forceCollapsedChapters={docsAreaWidth < 500} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
