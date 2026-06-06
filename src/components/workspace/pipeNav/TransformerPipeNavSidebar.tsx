import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import type { Entity, RennWorld } from '@/types/world'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import { theme } from '@/config/theme'
import { clamp } from '@/utils/numberUtils'
import { pipeNavButtonStyle } from './pipeNavStyles'
import PipeNavTree, { type PipeTreeNode } from './PipeNavTree'

const SIDEBAR_MIN_PX = 200
const SIDEBAR_MAX_PX = 420
const SIDEBAR_DEFAULT_PX = 240
const HANDLE_PX = 5
const OPEN_KEY = 'rennTransformerPipeNavOpen'
const WIDTH_KEY = 'rennTransformerPipeNavWidthPx'

export interface TransformerPipeNavSidebarProps {
  world: RennWorld
  entity: Entity
  focusPath: PipeNavPathSegment[]
  selectedIndex: number
  focusedPipeName: string
  canGoUp: boolean
  siblingCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPathChange: (path: PipeNavPathSegment[], index: number, stageId?: string) => void
  onGoUp: () => void
  onGoLeft: () => void
  onGoRight: () => void
  onRenamePipe?: (name: string) => void
  onTreeDelete?: (node: PipeTreeNode) => void
  onTreeContext?: (
    action: 'add_before' | 'add_after' | 'add_child' | 'delete',
    node: PipeTreeNode,
  ) => void
  onReorderStack?: (from: number, to: number) => void
  onReorderMember?: (pipeId: string, from: number, to: number) => void
  drawerPortalTarget?: RefObject<HTMLDivElement | null>
  stackIndexForPipeId?: (pipeId: string) => number
  onPipeControlToggle?: (opts: {
    pipeId: string
    stackIndex?: number
    memberParentPipeId?: string
    memberIndex?: number
  }) => void
  onPipeParamChange?: (opts: {
    pipeId: string
    stackIndex?: number
    key: string
    value: unknown
    useSharedDefaults?: boolean
  }) => void
  onDecouplePipeBinding?: (stackIndex: number) => void
}

export function readPipeNavOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writePipeNavOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    /* ignore */
  }
}

export function readPipeNavWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(n) && n >= SIDEBAR_MIN_PX ? n : SIDEBAR_DEFAULT_PX
  } catch {
    return SIDEBAR_DEFAULT_PX
  }
}

export default function TransformerPipeNavSidebar({
  world,
  entity,
  focusPath,
  selectedIndex,
  focusedPipeName,
  canGoUp,
  siblingCount,
  open,
  onOpenChange,
  onPathChange,
  onGoUp,
  onGoLeft,
  onGoRight,
  onRenamePipe,
  onTreeDelete,
  onTreeContext,
  onReorderStack,
  onReorderMember,
  drawerPortalTarget,
  stackIndexForPipeId,
  onPipeControlToggle,
  onPipeParamChange,
  onDecouplePipeBinding,
}: TransformerPipeNavSidebarProps) {
  const [widthPx, setWidthPx] = useState(readPipeNavWidth)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(focusedPipeName)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    setTitleDraft(focusedPipeName)
  }, [focusedPipeName])

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(widthPx))
    } catch {
      /* ignore */
    }
  }, [widthPx])

  const onResizePointerDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: widthPx }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const next = clamp(d.startW + (ev.clientX - d.startX), SIDEBAR_MIN_PX, SIDEBAR_MAX_PX)
      setWidthPx(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [widthPx])

  if (!open) return null

  return (
    <div
      data-testid="pipe-nav-sidebar"
      style={{
        width: widthPx,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: theme.pipeNav.sidebarBg,
        borderRight: `1px solid ${theme.pipeNav.accentMuted}`,
        position: 'relative',
      }}
    >
      <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${theme.pipeNav.accentMuted}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button type="button" title="Collapse sidebar" onClick={() => onOpenChange(false)} style={collapseBtn}>
            «
          </button>
          {editingTitle ?
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                setEditingTitle(false)
                if (titleDraft.trim() && titleDraft !== focusedPipeName) onRenamePipe?.(titleDraft.trim())
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEditingTitle(false)
                  if (titleDraft.trim()) onRenamePipe?.(titleDraft.trim())
                }
                if (e.key === 'Escape') {
                  setEditingTitle(false)
                  setTitleDraft(focusedPipeName)
                }
              }}
              style={titleInputStyle}
            />
          : <button
              type="button"
              title="Rename pipe"
              onClick={() => onRenamePipe && setEditingTitle(true)}
              style={titleBtnStyle}
            >
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {focusedPipeName}
              </span>
              {onRenamePipe ?
                <span style={{ color: theme.pipeNav.accent, fontSize: 12 }}>✎</span>
              : null}
            </button>
          }
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            title="Up one level"
            disabled={!canGoUp}
            onClick={onGoUp}
            style={pipeNavButtonStyle(!canGoUp)}
          >
            ↑
          </button>
          <button
            type="button"
            title="Previous sibling"
            disabled={siblingCount <= 1}
            onClick={onGoLeft}
            style={pipeNavButtonStyle(siblingCount <= 1)}
          >
            ←
          </button>
          <button
            type="button"
            title="Next sibling"
            disabled={siblingCount <= 1}
            onClick={onGoRight}
            style={pipeNavButtonStyle(siblingCount <= 1)}
          >
            →
          </button>
        </div>
      </div>
      <PipeNavTree
        world={world}
        entity={entity}
        focusPath={focusPath}
        selectedIndex={selectedIndex}
        onSelectPath={onPathChange}
        onDeleteNode={onTreeDelete}
        onContextAction={onTreeContext}
        onReorderStack={onReorderStack}
        onReorderMember={onReorderMember}
        drawerPortalTarget={drawerPortalTarget}
        stackIndexForPipeId={stackIndexForPipeId}
        onPipeControlToggle={onPipeControlToggle}
        onPipeParamChange={onPipeParamChange}
        onDecouplePipeBinding={onDecouplePipeBinding}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onResizePointerDown}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: HANDLE_PX,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 2,
        }}
      />
    </div>
  )
}

const collapseBtn: CSSProperties = {
  width: 24,
  height: 24,
  padding: 0,
  border: `1px solid ${theme.pipeNav.accentMuted}`,
  borderRadius: 4,
  background: 'transparent',
  color: theme.pipeNav.accent,
  cursor: 'pointer',
  flexShrink: 0,
}

const titleBtnStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  border: `1px solid ${theme.pipeNav.accentBorder}`,
  borderRadius: 6,
  background: theme.pipeNav.levelBg[0],
  color: theme.text.primary,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  minWidth: 0,
}

const titleInputStyle: CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  border: `1px solid ${theme.pipeNav.accent}`,
  borderRadius: 6,
  background: theme.bg.input,
  color: theme.text.primary,
  fontSize: 12,
  fontWeight: 700,
}
