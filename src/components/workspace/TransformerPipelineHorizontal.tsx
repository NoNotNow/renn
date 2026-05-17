import {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import type { TransformerConfig } from '@/types/transformer'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { theme } from '@/config/theme'
import {
  hasNonZeroSemanticActions,
  serializeTransformerTraceOutputJson,
  summarizeActions,
  summarizeTransformerTraceOutputBrief,
  type TransformerTraceStep,
} from '@/transformers/transformerTrace'
import { TRANSFORMER_PRESET_OPTIONS, getDefaultTransformerConfig } from '@/transformers/transformerPresets'
import { syncPriorities, sortAndSyncPriorities } from '@/transformers/transformerUtils'
import { labelCustomTransformer, nextUniqueCustomTransformerName } from '@/transformers/customTransformerNaming'

/** Pipeline geometry — shared so ports, shafts, and chevrons stay on one horizontal axis. */
const PIPELINE_AXIS_Y = 7
const PIPELINE_LINK_H = 14
const PIPELINE_PORT_R = 4
const PIPELINE_PORT_STROKE = 1.25
const PIPELINE_PORT_SIZE = PIPELINE_PORT_R * 2 + PIPELINE_PORT_STROKE
/** Brighter periwinkle chrome for port ring + arrows (mockup). */
const PIPELINE_CHROME = '#a3b1d6'
const PIPELINE_ARROW_STROKE_W = 1.5
/** Small gap between port ring and arrow shaft (mockup). */
const PIPELINE_PORT_TO_SHAFT_GAP = 2
/** Shaft begins at the outer edge of the port ring (center on card border + radius + half stroke). */
const PIPELINE_SHAFT_START_X = PIPELINE_PORT_R + PIPELINE_PORT_STROKE / 2
/** Cards sit below link SVGs so chevrons are not covered by the next stage (DOM order). */
const PIPELINE_Z_CARD = 1
const PIPELINE_Z_LINK = 2
/** Stack above connectors so selection glow paints over pipeline links. */
const PIPELINE_Z_CARD_SELECTED = 4
const PIPELINE_Z_CARD_DRAGGING = 10

type PipelineArrowGlyphProps = {
  width: number
  shaftStartX: number
  shaftEndX: number
  tipX: number
}

/** Shared shaft + wide 45° chevron (tip ends before the next stage box). */
function PipelineArrowGlyph({ width, shaftStartX, shaftEndX, tipX }: PipelineArrowGlyphProps) {
  const cy = PIPELINE_AXIS_Y
  /** 45° chevron: vertical spread matches horizontal run to the tip. */
  const spread = Math.max(2, tipX - shaftEndX)
  return (
    <svg width={width} height={PIPELINE_LINK_H} viewBox={`0 0 ${width} ${PIPELINE_LINK_H}`} fill="none" style={{ display: 'block' }}>
      <line
        x1={shaftStartX}
        y1={cy}
        x2={shaftEndX}
        y2={cy}
        stroke={PIPELINE_CHROME}
        strokeWidth={PIPELINE_ARROW_STROKE_W}
        strokeLinecap="round"
      />
      <path
        d={`M${shaftEndX} ${cy - spread} L${tipX} ${cy} L${shaftEndX} ${cy + spread}`}
        stroke={PIPELINE_CHROME}
        strokeWidth={PIPELINE_ARROW_STROKE_W}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  )
}

/** Hollow outlet ring centered on the card’s right border. */
function PipelineStagePort({ fill }: { fill: string }) {
  const half = PIPELINE_PORT_SIZE / 2
  return (
    <div
      aria-hidden={true}
      style={{
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: 'translate(50%, -50%)',
        width: PIPELINE_PORT_SIZE,
        height: PIPELINE_PORT_SIZE,
        zIndex: 3,
        pointerEvents: 'none',
      }}
    >
      <svg
        width={PIPELINE_PORT_SIZE}
        height={PIPELINE_PORT_SIZE}
        viewBox={`0 0 ${PIPELINE_PORT_SIZE} ${PIPELINE_PORT_SIZE}`}
        fill="none"
        style={{ display: 'block' }}
      >
        <circle
          cx={half}
          cy={half}
          r={PIPELINE_PORT_R}
          fill={fill}
          stroke={PIPELINE_CHROME}
          strokeWidth={PIPELINE_PORT_STROKE}
        />
      </svg>
    </div>
  )
}

/** Horizontal shaft + chevron between stages (port lives on the card). */
function PipelineConnector() {
  const w = 18
  return (
    <div
      aria-hidden={true}
      style={{
        flexShrink: 0,
        width: w,
        height: PIPELINE_LINK_H,
        alignSelf: 'center',
        marginRight: 0,
        position: 'relative',
        zIndex: PIPELINE_Z_LINK,
      }}
    >
      <PipelineArrowGlyph
        width={w}
        shaftStartX={PIPELINE_SHAFT_START_X + PIPELINE_PORT_TO_SHAFT_GAP}
        shaftEndX={8}
        tipX={14}
      />
    </div>
  )
}

/** Incoming flow into the first stage. */
function PipelineLeadInArrow() {
  const w = 14
  return (
    <div
      aria-hidden={true}
      style={{
        flexShrink: 0,
        width: w,
        height: PIPELINE_LINK_H,
        alignSelf: 'center',
        marginRight: 0,
        position: 'relative',
        zIndex: PIPELINE_Z_LINK,
      }}
    >
      <PipelineArrowGlyph width={w} shaftStartX={0} shaftEndX={5} tipX={11} />
    </div>
  )
}

/** Outgoing flow after the “+ Add” stage (no port ring on dashed tile). */
function PipelineTrailOutArrow() {
  const w = 14
  return (
    <div
      aria-hidden={true}
      style={{
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: 'translate(50%, -50%)',
        width: w,
        height: PIPELINE_LINK_H,
        zIndex: PIPELINE_Z_LINK,
        pointerEvents: 'none',
      }}
    >
      <PipelineArrowGlyph width={w} shaftStartX={0} shaftEndX={5} tipX={11} />
    </div>
  )
}

const TRACE_JSON_DRAWER_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  zIndex: 100,
  margin: 0,
  padding: 8,
  width: 360,
  overflow: 'auto',
  background: theme.bg.modalGlassHeader,
  backdropFilter: 'blur(12px)',
  border: `1px solid ${theme.border.default}`,
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: theme.text.muted,
  fontSize: 11,
  textAlign: 'left',
}

function MovableTraceDrawer({
  title,
  children,
  onClose,
  initialLeft,
  initialTop,
  portalTarget,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  initialLeft: number
  initialTop: number
  portalTarget: Element
}) {
  const [pos, setPos] = useState({ x: initialLeft, y: initialTop })
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)

  const handleMouseDown = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return

    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
    const onMove = (move: MouseEvent) => {
      if (!dragRef.current) return
      const dx = move.clientX - dragRef.current.startX
      const dy = move.clientY - dragRef.current.startY
      setPos({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return createPortal(
    <div
      style={{
        ...TRACE_JSON_DRAWER_STYLE,
        position: 'absolute',
        top: pos.y,
        left: pos.x,
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: theme.bg.modalGlassHeader,
          borderBottom: `1px solid ${theme.border.default}`,
          cursor: 'move',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: theme.text.secondary, textTransform: 'uppercase' }}>
          {title}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.text.muted,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close"
        >
          ×
        </button>
      </div>
      <div style={{ padding: 8, overflow: 'auto', flex: 1 }}>
        {children}
      </div>
    </div>,
    portalTarget
  )
}

function TransformerTraceItem({
  index,
  stackIndex,
  transformer,
  step,
  headerRef,
  traceBarRef,
  scrollLeft,
  onRemove,
  onToggleEnabled,
  onUpdate,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelectCode,
  isSelected,
  isDragOver,
  isDragging,
}: {
  index: number
  /** Index of this transformer in the full entity stack (for custom display names). */
  stackIndex: number
  transformer: TransformerConfig
  step: TransformerTraceStep | undefined
  headerRef: RefObject<HTMLDivElement>
  traceBarRef: RefObject<HTMLDivElement>
  scrollLeft: number
  onRemove: () => void
  onToggleEnabled: () => void
  onUpdate: (config: TransformerConfig) => void
  onDragStart: () => void
  onDragOver: (e: ReactDragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
  onSelectCode?: () => void
  isSelected?: boolean
  isDragOver: boolean
  isDragging: boolean
}) {
  const [inOpen, setInOpen] = useState(false)
  const [outOpen, setOutOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)

  const rowLabel =
    transformer.type === 'custom' ? labelCustomTransformer(transformer, stackIndex) : String(transformer.type)

  const enabled = transformer.enabled ?? true
  const showSelectedChrome = Boolean(isSelected && !isDragging && transformer.type === 'custom')
  const inputLit = Boolean(step && !step.skipped && hasNonZeroSemanticActions(step.inputBefore))
  const outputLit = Boolean(step && !step.skipped && step.outputLedActive)

  const traceInputSummaryColor =
    step?.skipped || !step
      ? theme.text.muted
      : inputLit
        ? theme.status.enabled
        : theme.text.secondary
  const traceOutputSummaryColor =
    step?.skipped || !step
      ? theme.text.muted
      : outputLit
        ? theme.status.enabled
        : theme.text.secondary

  const traceInputBrief = step?.skipped
    ? '(disabled)'
    : step?.inputBefore
      ? summarizeActions(step.inputBefore.actions)
      : '(idle)'
  const traceOutputBrief = step
    ? summarizeTransformerTraceOutputBrief(transformer.type, step)
    : '(none)'

  const summaryBaseStyle: CSSProperties = {
    cursor: 'pointer',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 160,
    listStyle: 'none',
  }

  // Calculate left position relative to the header.
  // We use the traceBar's offset within the header + the item's offset within the traceBar - scroll.
  const headerWidth = headerRef.current?.clientWidth ?? 0
  const drawerWidth = 360
  let baseLeft =
    (traceBarRef.current?.offsetLeft ?? 0) + (itemRef.current?.offsetLeft ?? 0) - scrollLeft

  if (headerWidth > 0 && baseLeft + drawerWidth > headerWidth) {
    baseLeft = Math.max(10, headerWidth - drawerWidth - 10)
  }

  return (
    <div
      ref={itemRef}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      data-testid={`transformer-horizontal-item-${index}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '8px 10px',
        boxSizing: 'border-box',
        border: showSelectedChrome ? `1px solid ${theme.accent}` : `1px solid ${theme.border.default}`,
        borderRadius: 6,
        background: isDragOver ? theme.bg.panelAlt : theme.bg.thumbnailFrame,
        minWidth: 100,
        maxWidth: 200,
        flex: '0 0 auto',
        opacity: isDragging ? 0.4 : 1,
        transition:
          'background 0.2s ease, opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        zIndex: isDragging
          ? PIPELINE_Z_CARD_DRAGGING
          : showSelectedChrome
            ? PIPELINE_Z_CARD_SELECTED
            : PIPELINE_Z_CARD,
        overflow: 'visible',
        boxShadow: showSelectedChrome ? '0 0 6px rgba(138, 180, 255, 0.18)' : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          marginBottom: 1,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontFamily: 'cursive',
            fontWeight: 700,
            color: theme.text.primary,
            userSelect: 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rowLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleEnabled()
            }}
            title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
            data-testid={`transformer-horizontal-enabled-toggle-${index}`}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 2px',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: enabled ? theme.status.enabled : theme.status.disabled,
              }}
            />
          </button>
          {transformer.type === 'custom' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelectCode?.()
              }}
              title="Show code"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 2px',
                opacity: isSelected ? 1 : 0.6,
                color: isSelected ? theme.accent : theme.text.muted,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.opacity = '0.6'
              }}
            >
              {EntityPanelIcons.code}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setConfigOpen(!configOpen)
            }}
            title="Edit configuration"
            data-testid={`transformer-horizontal-config-toggle-${index}`}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.text.muted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 2px',
              opacity: configOpen ? 1 : 0.6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => {
              if (!configOpen) e.currentTarget.style.opacity = '0.6'
            }}
          >
            {EntityPanelIcons.settings}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.text.muted,
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
              padding: '0 2px',
              opacity: 0.6,
            }}
            title="Remove transformer"
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          >
            ×
          </button>
        </div>
      </div>
      <div
        className="transformer-trace-content"
        style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}
      >
        <details
          className="transformer-trace-io-row"
          onToggle={(e) => setInOpen(e.currentTarget.open)}
          open={inOpen}
        >
          <summary
            style={{ ...summaryBaseStyle, color: traceInputSummaryColor }}
            title={`Input: ${traceInputBrief}`}
          >
            IN: {traceInputBrief}
          </summary>
          {inOpen && step && !step.skipped && step.inputBefore && headerRef.current ? (
            <MovableTraceDrawer
              title="Input"
              onClose={() => setInOpen(false)}
              initialLeft={baseLeft}
              initialTop={40}
              portalTarget={headerRef.current}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(step.inputBefore, null, 2)}
              </pre>
            </MovableTraceDrawer>
          ) : null}
        </details>
        <details
          className="transformer-trace-io-row"
          onToggle={(e) => setOutOpen(e.currentTarget.open)}
          open={outOpen}
        >
          <summary
            style={{ ...summaryBaseStyle, color: traceOutputSummaryColor }}
            title={`Output: ${traceOutputBrief}`}
          >
            OUT: {traceOutputBrief}
          </summary>
          {outOpen && step && !step.skipped && (step.transformOutput !== undefined || step.actionsAfter !== undefined) && headerRef.current ? (
            <MovableTraceDrawer
              title="Output"
              onClose={() => setOutOpen(false)}
              initialLeft={baseLeft}
              initialTop={80}
              portalTarget={headerRef.current}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(serializeTransformerTraceOutputJson(step), null, 2)}
              </pre>
            </MovableTraceDrawer>
          ) : null}
        </details>
        {configOpen && headerRef.current ? (
          <MovableTraceDrawer
            title={`Config: ${rowLabel}`}
            onClose={() => setConfigOpen(false)}
            initialLeft={baseLeft}
            initialTop={120}
            portalTarget={headerRef.current}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ValidatedJsonTextarea
                value={JSON.stringify(transformer, null, 2)}
                onApply={(updated) => {
                  onUpdate(updated as TransformerConfig)
                  setConfigOpen(false)
                }}
                applyVariant="icon"
                textareaTestId={`transformer-horizontal-config-textarea-${index}`}
                applyTestId={`transformer-horizontal-config-apply-${index}`}
              />
            </div>
          </MovableTraceDrawer>
        ) : null}
      </div>
      <PipelineStagePort fill={isDragOver ? theme.bg.panelAlt : theme.bg.thumbnailFrame} />
    </div>
  )
}

export function TransformerHorizontalPipeline({
  transformers,
  liveTraceSteps,
  headerRef,
  onCommit,
  onSelectCode,
  selectedListIndex,
}: {
  transformers: TransformerConfig[]
  liveTraceSteps: TransformerTraceStep[] | null
  headerRef: RefObject<HTMLDivElement>
  onCommit: (next: TransformerConfig[]) => void
  onSelectCode?: (index: number) => void
  selectedListIndex?: number
}) {
  const [scrollLeft, setScrollLeft] = useState(0)
  const [addSelectValue, setAddSelectValue] = useState('')
  const [dragState, setDragState] = useState<{
    items: { config: TransformerConfig; id: string; originalIndex: number }[]
    draggedId: string | null
    dragOverId: string | null
  } | null>(null)

  const traceBarRef = useRef<HTMLDivElement>(null)
  const configIdMap = useRef<WeakMap<TransformerConfig, string>>(new WeakMap())

  const getStableId = useCallback((t: TransformerConfig) => {
    let id = configIdMap.current.get(t)
    if (!id) {
      id = `t-${Math.random().toString(36).slice(2, 9)}`
      configIdMap.current.set(t, id)
    }
    return id
  }, [])

  const handleAddTransformer = (type: string) => {
    if (!type) return
    const config = getDefaultTransformerConfig(type)
    const withName =
      type === 'custom' ? { ...config, name: nextUniqueCustomTransformerName(transformers) } : config
    onCommit(syncPriorities([...transformers, withName]))
    setAddSelectValue('')
  }

  const handleRemoveTransformer = (index: number) => {
    const next = transformers.filter((_, i) => i !== index)
    onCommit(syncPriorities(next))
  }

  const handleToggleEnabled = (index: number) => {
    const next = transformers.map((t, i) =>
      i === index ? { ...t, enabled: !(t.enabled ?? true) } : t
    )
    onCommit(syncPriorities(next))
  }

  const handleUpdateTransformer = (index: number, config: TransformerConfig) => {
    const next = [...transformers]
    next[index] = config
    onCommit(sortAndSyncPriorities(next))
  }

  const handleDragStart = (index: number) => {
    const items = transformers.map((t, i) => ({
      config: t,
      id: getStableId(t),
      originalIndex: i,
    }))
    setDragState({
      items,
      draggedId: items[index].id,
      dragOverId: null,
    })
  }

  const handleDragOver = (e: ReactDragEvent, targetIndex: number) => {
    e.preventDefault()
    setDragState((prev) => {
      if (!prev) return null
      const { items, draggedId } = prev
      if (!draggedId) return prev

      const currentIndex = items.findIndex((item) => item.id === draggedId)
      if (currentIndex === -1 || currentIndex === targetIndex) {
        if (prev.dragOverId !== items[targetIndex].id) {
          return { ...prev, dragOverId: items[targetIndex].id }
        }
        return prev
      }

      const nextItems = [...items]
      const [removed] = nextItems.splice(currentIndex, 1)
      nextItems.splice(targetIndex, 0, removed)

      return {
        ...prev,
        items: nextItems,
        dragOverId: nextItems[targetIndex].id,
      }
    })
  }

  const handleDragEnd = () => {
    if (dragState) {
      const next = syncPriorities(dragState.items.map((item) => item.config))
      // Only commit if the order actually changed
      const changed = next.some((t, i) => t !== transformers[i] || t.priority !== transformers[i].priority)
      if (changed) {
        onCommit(next)
      }
    }
    setDragState(null)
  }

  const traceByStackIndex = useMemo(() => {
    if (!liveTraceSteps) return null
    const m = new Map<number, TransformerTraceStep>()
    for (const s of liveTraceSteps) {
      m.set(s.configStackIndex, s)
    }
    return m
  }, [liveTraceSteps])

  const displayItems = useMemo(() => {
    if (dragState) return dragState.items
    return transformers.map((t, i) => ({
      config: t,
      id: getStableId(t),
      originalIndex: i,
    }))
  }, [transformers, dragState, getStableId])

  return (
    <div
      ref={traceBarRef}
      className="custom-transformer-trace-scroll"
      onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
        margin: 0,
        padding: '1px 0',
        flex: 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <style>{`
        .custom-transformer-trace-scroll {
          overflow-x: auto;
          overflow-y: visible;
          overflow-clip-margin: 10px;
        }
        .transformer-trace-io-row > summary::-webkit-details-marker { display: none; }
        .transformer-trace-io-row > summary::marker { content: ''; }
      `}</style>
      {displayItems.length > 0 ? <PipelineLeadInArrow /> : null}
      {displayItems.map((item, i) => (
        <Fragment key={item.id}>
          <div
            style={{
              position: 'relative',
              flex: '0 0 auto',
              alignSelf: 'center',
              overflow: 'visible',
            }}
          >
            <TransformerTraceItem
              index={i}
              stackIndex={item.originalIndex}
              transformer={item.config}
              step={traceByStackIndex?.get(item.originalIndex)}
              headerRef={headerRef}
              traceBarRef={traceBarRef}
              scrollLeft={scrollLeft}
              onRemove={() => handleRemoveTransformer(item.originalIndex)}
              onToggleEnabled={() => handleToggleEnabled(item.originalIndex)}
              onUpdate={(config) => handleUpdateTransformer(item.originalIndex, config)}
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={handleDragEnd}
              onDragEnd={handleDragEnd}
              onSelectCode={() => onSelectCode?.(item.originalIndex)}
              isSelected={item.originalIndex === selectedListIndex}
              isDragging={dragState?.draggedId === item.id}
              isDragOver={dragState?.dragOverId === item.id && dragState?.draggedId !== item.id}
            />
          </div>
          <PipelineConnector />
        </Fragment>
      ))}
      <div
        style={{
          position: 'relative',
          margin: 0,
          padding: '6px 10px',
          boxSizing: 'border-box',
          border: `1px dashed ${theme.border.default}`,
          borderRadius: 6,
          background: theme.bg.thumbnailFrame,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          alignSelf: 'center',
          zIndex: PIPELINE_Z_CARD,
          overflow: 'visible',
        }}
      >
        <select
          value={addSelectValue}
          onChange={(e) => handleAddTransformer(e.target.value)}
          aria-label="Add transformer stage"
          style={{
            padding: '6px 8px',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.35,
            background: theme.bg.codeOverlay,
            border: `1px solid ${theme.border.default}`,
            borderRadius: 4,
            color: theme.text.primary,
            cursor: 'pointer',
            minWidth: 100,
            maxWidth: 160,
          }}
        >
          <option value="">+ Add ▾</option>
          {TRANSFORMER_PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {displayItems.length > 0 ? <PipelineTrailOutArrow /> : null}
      </div>
    </div>
  )
}

