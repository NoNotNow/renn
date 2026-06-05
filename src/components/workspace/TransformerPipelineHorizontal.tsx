import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from 'react'
import type { TransformerConfig } from '@/types/transformer'
import WorkspaceFloatingDrawer from '@/components/workspace/WorkspaceFloatingDrawer'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { theme } from '@/config/theme'
import {
  hasNonZeroSemanticActions,
  serializeTransformerTraceOutputJson,
  serializeTransformInputForDisplay,
  summarizeActions,
  summarizeTransformInputBrief,
  summarizeTransformerTraceOutputBrief,
  type TransformerTraceStep,
} from '@/transformers/transformerTrace'
import { getDefaultTransformerConfig } from '@/transformers/transformerPresets'
import { syncPriorities } from '@/transformers/transformerUtils'
import { labelCustomTransformer, nextUniqueCustomTransformerName } from '@/transformers/customTransformerNaming'
import AddTransformerDialog, { type AddExistingTransformerMode } from '@/components/workspace/AddTransformerDialog'
import {
  mergeConfigureDrawerApply,
  transformerConfigForConfigureDrawer,
} from '@/transformers/transformerConfigureDrawer'
import { allocateTransformerRegistryId } from '@/utils/commitTransformerConfigsToWorld'
import {
  isTransformerTraceBriefLineWider,
} from './transformerTraceBriefMeasure'

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

function suggestCopyRegistryId(
  baseId: string,
  registry: Record<string, TransformerConfig>,
  used: Set<string>,
): string {
  const taken = new Set([...Object.keys(registry), ...used])
  let i = 0
  let candidate = `${baseId}_copy`
  while (taken.has(candidate)) {
    i += 1
    candidate = `${baseId}_copy${i}`
  }
  return candidate
}

export type TransformerCardErrorKind = 'compile' | 'runtime'

function transformerCardBorder(
  cardError: TransformerCardErrorKind | undefined,
  showSelectedChrome: boolean,
): string {
  if (cardError === 'compile') return `1px solid ${theme.border.error}`
  if (cardError === 'runtime') return `1px solid ${theme.text.warning}`
  if (showSelectedChrome) return `1px solid ${theme.accent}`
  return `1px solid ${theme.border.default}`
}

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
  usageCount,
  onMakeUnique,
  makeUniqueDisabledReason,
  isSelected,
  isDragOver,
  isDragging,
  cardError,
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
  usageCount?: number
  onMakeUnique?: () => void
  makeUniqueDisabledReason?: string
  isSelected?: boolean
  isDragOver: boolean
  isDragging: boolean
  cardError?: TransformerCardErrorKind
}) {
  const [inOpen, setInOpen] = useState(false)
  const [outOpen, setOutOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [isToolsExpanded, setIsToolsExpanded] = useState(true)
  const itemRef = useRef<HTMLDivElement>(null)
  const traceFontRef = useRef('10px sans-serif')

  const syncTraceFont = useCallback(() => {
    if (!itemRef.current) return
    traceFontRef.current = getComputedStyle(itemRef.current).font
  }, [])

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
      ? summarizeTransformInputBrief(step.inputBefore)
      : '(idle)'
  const traceOutputBrief = step
    ? summarizeTransformerTraceOutputBrief(transformer.type, step)
    : '(none)'

  // Cache the widest seen trace strings (by rendered px, not char count) to keep card width stable.
  const maxInBriefRef = useRef(traceInputBrief)
  const maxOutBriefRef = useRef(traceOutputBrief)
  const [maxInBrief, setMaxInBrief] = useState(traceInputBrief)
  const [maxOutBrief, setMaxOutBrief] = useState(traceOutputBrief)

  // Measure before paint so live trace updates do not flash a narrower-then-wider card.
  useLayoutEffect(() => {
    syncTraceFont()
    const font = traceFontRef.current
    const prev = maxInBriefRef.current
    if (isTransformerTraceBriefLineWider('IN', traceInputBrief, prev, font)) {
      maxInBriefRef.current = traceInputBrief
      setMaxInBrief(traceInputBrief)
    }
  }, [syncTraceFont, traceInputBrief])

  useLayoutEffect(() => {
    syncTraceFont()
    const font = traceFontRef.current
    const prev = maxOutBriefRef.current
    if (isTransformerTraceBriefLineWider('OUT', traceOutputBrief, prev, font)) {
      maxOutBriefRef.current = traceOutputBrief
      setMaxOutBrief(traceOutputBrief)
    }
  }, [syncTraceFont, traceOutputBrief])

  // Reset max strings if the transformer type changes (e.g. from preset to custom)
  useLayoutEffect(() => {
    maxInBriefRef.current = traceInputBrief
    maxOutBriefRef.current = traceOutputBrief
    setMaxInBrief(traceInputBrief)
    setMaxOutBrief(traceOutputBrief)
  }, [transformer.type])

  const summaryBaseStyle: CSSProperties = {
    cursor: 'pointer',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    listStyle: 'none',
  }

  const [baseLeft, setBaseLeft] = useState(0)

  const updateBaseLeft = useCallback(() => {
    if (!headerRef.current || !traceBarRef.current || !itemRef.current) return
    const headerWidth = headerRef.current.clientWidth
    const drawerWidth = 360
    let nextBaseLeft =
      traceBarRef.current.offsetLeft + itemRef.current.offsetLeft - scrollLeft

    if (headerWidth > 0 && nextBaseLeft + drawerWidth > headerWidth) {
      nextBaseLeft = Math.max(10, headerWidth - drawerWidth - 10)
    }
    setBaseLeft(nextBaseLeft)
  }, [headerRef, traceBarRef, scrollLeft])

  // Only calculate position when a drawer is open or scroll changes while open.
  // This avoids expensive layout reads (clientWidth/offsetLeft) on every render during live trace.
  useLayoutEffect(() => {
    if (inOpen || outOpen || configOpen) {
      updateBaseLeft()
    }
  }, [inOpen, outOpen, configOpen, updateBaseLeft])

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
      data-card-error={cardError ?? undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '8px 10px',
        boxSizing: 'border-box',
        border: transformerCardBorder(cardError, showSelectedChrome),
        borderRadius: 6,
        background: isDragOver ? theme.bg.panelAlt : theme.bg.thumbnailFrame,
        minWidth: 100,
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
      {/* Top Toolbar - Unifies tools and adds collapse/expand functionality */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: theme.bg.thumbnailHeader,
          borderBottom: `1px solid ${theme.border.default}`,
          margin: '-8px -10px 6px -10px',
          padding: '2px 6px',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          minHeight: 22,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setIsToolsExpanded(!isToolsExpanded)}
            title={isToolsExpanded ? 'Collapse tools' : 'Expand tools'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: theme.text.muted,
              display: 'flex',
              alignItems: 'center',
              padding: 0,
              transition: 'transform 0.2s ease',
              transform: isToolsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          >
            {EntityPanelIcons.chevronDown}
          </button>

          {usageCount !== undefined && usageCount > 1 && (
            <button
              type="button"
              disabled={!onMakeUnique}
              data-testid={`transformer-shared-usage-${index}`}
              onClick={(e) => {
                e.stopPropagation()
                if (!onMakeUnique) return
                const ok = window.confirm(
                  `${usageCount} entities share this transformer stage. Separate it for the selected entity only? Other entities will keep the shared version.`,
                )
                if (ok) onMakeUnique()
              }}
              title={
                onMakeUnique ?
                  `${usageCount} entities share this stage — click to separate for the selected entity`
                : (makeUniqueDisabledReason ??
                  `${usageCount} entities use this transformer. Changes affect all of them.`)
              }
              style={{
                fontSize: 9,
                color: theme.text.accentBlue,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: '1px 4px',
                margin: 0,
                border: `1px solid ${onMakeUnique ? 'rgba(74, 158, 255, 0.35)' : theme.border.default}`,
                borderRadius: 3,
                background: onMakeUnique ? 'rgba(74, 158, 255, 0.1)' : 'transparent',
                cursor: onMakeUnique ? 'pointer' : 'not-allowed',
                opacity: onMakeUnique ? 1 : 0.5,
              }}
            >
              👤 x{usageCount}
            </button>
          )}

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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isToolsExpanded && (
            <>
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
            </>
          )}
        </div>
      </div>
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
            <WorkspaceFloatingDrawer
              title={`${rowLabel} · Input`}
              onClose={() => setInOpen(false)}
              initialLeft={baseLeft}
              initialTop={40}
              portalTarget={headerRef.current}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(serializeTransformInputForDisplay(step.inputBefore), null, 2)}
              </pre>
            </WorkspaceFloatingDrawer>
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
            <WorkspaceFloatingDrawer
              title={`${rowLabel} · Output`}
              onClose={() => setOutOpen(false)}
              initialLeft={baseLeft}
              initialTop={80}
              portalTarget={headerRef.current}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(serializeTransformerTraceOutputJson(step), null, 2)}
              </pre>
            </WorkspaceFloatingDrawer>
          ) : null}
        </details>
        {configOpen && headerRef.current ? (
          <WorkspaceFloatingDrawer
            title={`Config: ${rowLabel}`}
            onClose={() => setConfigOpen(false)}
            initialLeft={baseLeft}
            initialTop={120}
            portalTarget={headerRef.current}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {transformer.type === 'custom' ? (
                <p style={{ margin: 0, fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>
                  Edit TypeScript in the code editor. This JSON is name, priority, params, and enabled only.
                </p>
              ) : null}
              <ValidatedJsonTextarea
                value={JSON.stringify(transformerConfigForConfigureDrawer(transformer), null, 2)}
                onApply={(updated) => {
                  onUpdate(mergeConfigureDrawerApply(transformer, updated as TransformerConfig))
                  setConfigOpen(false)
                }}
                applyVariant="icon"
                textareaTestId={`transformer-horizontal-config-textarea-${index}`}
                applyTestId={`transformer-horizontal-config-apply-${index}`}
              />
            </div>
          </WorkspaceFloatingDrawer>
        ) : null}
        {/* Invisible element to maintain consistent width based on maximum seen trace text */}
        <div
          aria-hidden="true"
          style={{
            height: 0,
            overflow: 'hidden',
            visibility: 'hidden',
            whiteSpace: 'nowrap',
            fontSize: 10,
            padding: '0 6px',
            pointerEvents: 'none',
          }}
        >
          <div>IN: {maxInBrief}</div>
          <div>OUT: {maxOutBrief}</div>
        </div>
      </div>
      <PipelineStagePort fill={isDragOver ? theme.bg.panelAlt : theme.bg.thumbnailFrame} />
    </div>
  )
}

export function TransformerHorizontalPipeline({
  transformers,
  transformerIds,
  registryEntityId,
  liveTraceSteps,
  headerRef,
  onCommit,
  onSelectCode,
  onMakeUnique,
  makeUniqueDisabledReason,
  usageCounts,
  existingRegistry,
  selectedId,
  cardErrorsByStackIndex,
}: {
  transformers: TransformerConfig[]
  /** Stable IDs from the registry, matching transformers array 1:1. */
  transformerIds?: string[]
  /** When set, new stages get `${entityId}_tfN` ids instead of ephemeral drag ids. */
  registryEntityId?: string
  liveTraceSteps: TransformerTraceStep[] | null
  headerRef: RefObject<HTMLDivElement>
  onCommit: (next: TransformerConfig[], orderedRegistryIds?: string[]) => void
  onSelectCode?: (id: string) => void
  onMakeUnique?: (id: string) => void
  makeUniqueDisabledReason?: string
  usageCounts?: Record<string, number>
  existingRegistry?: Record<string, TransformerConfig>
  selectedId?: string | null
  /** Per-stage error chrome keyed by stack index (compile overrides runtime on the same card). */
  cardErrorsByStackIndex?: Record<number, TransformerCardErrorKind>
}) {
  const [scrollLeft, setScrollLeft] = useState(0)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const dragEndCommittedRef = useRef(false)
  const [dragState, setDragState] = useState<{
    items: { config: TransformerConfig; id: string; originalIndex: number }[]
    draggedId: string | null
    dragOverId: string | null
  } | null>(null)

  const traceBarRef = useRef<HTMLDivElement>(null)
  const configIdMap = useRef<WeakMap<TransformerConfig, string>>(new WeakMap())

  const getStableId = useCallback((t: TransformerConfig, index: number) => {
    if (transformerIds?.[index]) return transformerIds[index]
    let id = configIdMap.current.get(t)
    if (!id) {
      id = `t-${Math.random().toString(36).slice(2, 9)}`
      configIdMap.current.set(t, id)
    }
    return id
  }, [transformerIds])

  const registryIdsForList = useCallback(
    () => transformers.map((t, i) => getStableId(t, i)),
    [transformers, getStableId],
  )

  const commitWithRegistryIds = useCallback(
    (next: TransformerConfig[], ids?: string[]) => {
      onCommit(next, ids ?? registryIdsForList())
    },
    [onCommit, registryIdsForList],
  )

  const handleAddPreset = (type: string) => {
    const ids = registryIdsForList()
    const used = new Set(ids)

    let config = getDefaultTransformerConfig(type)
    if (type === 'custom') {
      config = { ...config, name: nextUniqueCustomTransformerName(transformers) }
    }
    const newId =
      registryEntityId ?
        allocateTransformerRegistryId(registryEntityId, {}, used)
      : getStableId(config, transformers.length)

    commitWithRegistryIds(syncPriorities([...transformers, config]), [...ids, newId])
  }

  const handleAddExistingTransformer = (registryId: string, mode: AddExistingTransformerMode) => {
    const existing = existingRegistry?.[registryId]
    if (!existing) return

    const ids = registryIdsForList()
    const used = new Set(ids)
    let config: TransformerConfig
    let newId: string

    if (mode === 'link') {
      config = existing
      newId = registryId
    } else {
      config = JSON.parse(JSON.stringify(existing)) as TransformerConfig
      newId =
        registryEntityId ?
          allocateTransformerRegistryId(registryEntityId, existingRegistry ?? {}, used)
        : suggestCopyRegistryId(registryId, existingRegistry ?? {}, used)
    }

    commitWithRegistryIds(syncPriorities([...transformers, config]), [...ids, newId])
  }

  const handleRemoveTransformer = (index: number) => {
    const next = transformers.filter((_, i) => i !== index)
    const nextIds = registryIdsForList().filter((_, i) => i !== index)
    commitWithRegistryIds(syncPriorities(next), nextIds)
  }

  const handleToggleEnabled = (index: number) => {
    const next = transformers.map((t, i) =>
      i === index ? { ...t, enabled: !(t.enabled ?? true) } : t
    )
    commitWithRegistryIds(syncPriorities(next))
  }

  const handleUpdateTransformer = (index: number, config: TransformerConfig) => {
    const next = [...transformers]
    next[index] = config
    commitWithRegistryIds(syncPriorities(next), registryIdsForList())
  }

  const handleDragStart = (index: number) => {
    dragEndCommittedRef.current = false
    const items = transformers.map((t, i) => ({
      config: t,
      id: getStableId(t, i),
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
    if (dragState && !dragEndCommittedRef.current) {
      const orderedIds = dragState.items.map((item) => item.id)
      const next = syncPriorities(dragState.items.map((item) => item.config))
      const changed = orderedIds.some((id, i) => id !== registryIdsForList()[i])
      if (changed) {
        dragEndCommittedRef.current = true
        onCommit(next, orderedIds)
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
      id: getStableId(t, i),
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
              onSelectCode={() => onSelectCode?.(item.id)}
              usageCount={usageCounts?.[item.id]}
              onMakeUnique={onMakeUnique ? () => onMakeUnique(item.id) : undefined}
              makeUniqueDisabledReason={makeUniqueDisabledReason}
              isSelected={item.id === selectedId}
              isDragging={dragState?.draggedId === item.id}
              isDragOver={dragState?.dragOverId === item.id && dragState?.draggedId !== item.id}
              cardError={cardErrorsByStackIndex?.[item.originalIndex]}
            />
          </div>
          <PipelineConnector />
        </Fragment>
      ))}
      <div
        style={{
          position: 'relative',
          margin: 0,
          padding: 4,
          boxSizing: 'border-box',
          border: `1px dashed ${theme.border.default}`,
          borderRadius: 6,
          background: theme.bg.thumbnailFrame,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          alignSelf: 'center',
          zIndex: PIPELINE_Z_CARD,
          overflow: 'visible',
        }}
      >
        <button
          type="button"
          onClick={() => setAddDialogOpen(true)}
          aria-label="Add transformer"
          title="Add transformer"
          data-testid="add-transformer-button"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1,
            background: theme.bg.codeOverlay,
            border: `1px solid ${theme.border.default}`,
            borderRadius: 4,
            color: theme.text.muted,
            cursor: 'pointer',
          }}
        >
          +
        </button>
        <AddTransformerDialog
          isOpen={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          existingRegistry={existingRegistry ?? {}}
          excludedIds={registryIdsForList()}
          onAddPreset={handleAddPreset}
          onAddExisting={handleAddExistingTransformer}
        />
        {displayItems.length > 0 ? <PipelineTrailOutArrow /> : null}
      </div>
    </div>
  )
}

