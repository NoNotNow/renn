import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { TransformerConfig } from '@/types/transformer'
import CopyableArea from '@/components/CopyableArea'
import TransformerCustomCodeEditor, { CUSTOM_CODE_EDITOR_HEIGHT_DEFAULT_PX } from '@/components/TransformerCustomCodeEditor'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import { TransformerDocsContent } from './TransformerDocs'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { entityPanelIconButtonStyle, fieldLabelStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import {
  hasNonZeroSemanticActions,
  serializeTransformerTraceOutputJson,
  summarizeActions,
  summarizeTransformerTraceOutputBrief,
  type TransformerTraceStep,
} from '@/transformers/transformerTrace'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
} from '@/transformers/transformerPresets'
import { effectiveCustomTransformerCode, validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import {
  ensureUniqueCustomTransformerName,
  labelCustomTransformer,
  nextUniqueCustomTransformerName,
} from '@/transformers/customTransformerNaming'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { useCopyMenu } from '@/contexts/CopyContext'
import {
  getCustomTransformerRuntimeError,
  subscribeCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import { addFullscreenChangeListener, getFullscreenElement } from '@/utils/fullscreenApi'
import { isKeyboardEventInEditableContext } from '@/input/rawInput'

/**
 * Portal root for transformer code pop-out.
 *
 * - **Native fullscreen** — Only `document.fullscreenElement`'s subtree is shown; portals must attach
 *   there (typically the Builder column).
 * - **Normal window — `document.body`**: Monaco appends auxiliary nodes (often a **`monaco-area-container`**
 *   sibling under `document.body`) for overflow widgets/hit-testing; portaling the editor under nested
 *   Builder markup desynchronizes that layout (~1×1 / invisible editor).
 *
 * Mirrors the previous `document.fullscreenElement ?? document.body` strategy, reactive on
 * `fullscreenchange`.
 */
function useTransformerCodePopoutPortalRoot(): Element {
  const [target, setTarget] = useState<Element>(() => getFullscreenElement() ?? document.body)

  useEffect(() => {
    const sync = () => setTarget(getFullscreenElement() ?? document.body)
    const remove = addFullscreenChangeListener(sync)
    sync()
    return remove
  }, [])

  return target
}

/** Pixels from viewport top to the bottom of `#builder-app-header`, so the code pop-out leaves the Builder menu bar visible. */
function useBuilderHeaderBottomInsetPx(active: boolean): number {
  const [inset, setInset] = useState(0)

  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return
    const el = document.getElementById('builder-app-header')
    if (!el) {
      setInset(0)
      return
    }
    const update = (): void => {
      const bot = el.getBoundingClientRect().bottom
      setInset(Number.isFinite(bot) && bot > 0 ? bot : 0)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [active])

  return inset
}

const CODE_DEBOUNCE_MS = 350

function formatCustomRuntimeErrorClipboard(snapshot: {
  message: string
  stack?: string
  code: string
}): string {
  let out = snapshot.message
  if (snapshot.stack?.trim()) {
    out += `\n\n${snapshot.stack.trim()}`
  }
  if (snapshot.code.trim()) {
    out += '\n\n---\nTransformer code\n\n'
    out += snapshot.code
  }
  return out
}

const TRACE_JSON_DRAWER_STYLE: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 100,
  margin: '4px 0 0',
  padding: 8,
  maxHeight: 320,
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

function TransformerTraceItem({
  index,
  transformer,
  step,
  headerRef,
  traceBarRef,
  scrollLeft,
  onToggleExpanded,
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
  transformer: TransformerConfig
  step: TransformerTraceStep | undefined
  headerRef: React.RefObject<HTMLDivElement>
  traceBarRef: React.RefObject<HTMLDivElement>
  scrollLeft: number
  onToggleExpanded: () => void
  onRemove: () => void
  onToggleEnabled: () => void
  onUpdate: (config: TransformerConfig) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
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

  const enabled = transformer.enabled ?? true
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

  const traceInputBrief =
    step?.skipped ? '(disabled)' : step?.inputBefore ? summarizeActions(step.inputBefore.actions) : '—'
  const traceOutputBrief = summarizeTransformerTraceOutputBrief(transformer.type, step)

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
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '0 8px',
        borderLeft: index === 0 ? 'none' : `1px solid ${theme.border.default}`,
        minWidth: 80,
        maxWidth: 180,
        opacity: isDragging ? 0.4 : 1,
        background: isDragOver ? theme.bg.panelAlt : 'transparent',
        transition: 'background 0.2s ease, opacity 0.2s ease, transform 0.2s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        zIndex: isDragging ? 10 : 1,
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
            fontSize: 9,
            fontWeight: 700,
            color: theme.text.muted,
            textTransform: 'uppercase',
            cursor: 'pointer',
            userSelect: 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onClick={onToggleExpanded}
        >
          {transformer.type}
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
                color: theme.text.muted,
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
      <div className="transformer-trace-content" style={{ flexDirection: 'column', gap: 2, marginTop: 2 }}>
        <details
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
            createPortal(
              <pre style={{ ...TRACE_JSON_DRAWER_STYLE, left: baseLeft }}>
                {JSON.stringify(step.inputBefore, null, 2)}
              </pre>,
              headerRef.current,
            )
          ) : null}
        </details>
        <details
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
            createPortal(
              <pre style={{ ...TRACE_JSON_DRAWER_STYLE, left: baseLeft }}>
                {JSON.stringify(serializeTransformerTraceOutputJson(step), null, 2)}
              </pre>,
              headerRef.current,
            )
          ) : null}
        </details>
        {configOpen && headerRef.current ? (
          createPortal(
            <div
              style={{
                ...TRACE_JSON_DRAWER_STYLE,
                left: baseLeft,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: theme.text.secondary, textTransform: 'uppercase' }}>
                Config: {transformer.type}
              </div>
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
            </div>,
            headerRef.current,
          )
        ) : null}
      </div>
    </div>
  )
}

function TransformerHorizontalTrace({
  transformers,
  liveTraceSteps,
  headerRef,
  onCommit,
  onSelectCode,
  selectedListIndex,
}: {
  transformers: TransformerConfig[]
  liveTraceSteps: TransformerTraceStep[] | null
  headerRef: React.RefObject<HTMLDivElement>
  onCommit: (next: TransformerConfig[]) => void
  onSelectCode?: (index: number) => void
  selectedListIndex?: number
}) {
  const [scrollLeft, setScrollLeft] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
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

  const onToggleExpanded = useCallback(() => setIsExpanded((prev) => !prev), [])

  const handleAddTransformer = (type: string) => {
    if (!type) return
    const config = getDefaultTransformerConfig(type)
    const withName =
      type === 'custom' ? { ...config, name: nextUniqueCustomTransformerName(transformers) } : config
    onCommit([...transformers, withName])
    setAddSelectValue('')
  }

  const handleRemoveTransformer = (index: number) => {
    const next = transformers.filter((_, i) => i !== index)
    onCommit(next)
  }

  const handleToggleEnabled = (index: number) => {
    const next = transformers.map((t, i) =>
      i === index ? { ...t, enabled: !(t.enabled ?? true) } : t
    )
    onCommit(next)
  }

  const handleUpdateTransformer = (index: number, config: TransformerConfig) => {
    const next = [...transformers]
    next[index] = config
    onCommit(next)
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

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
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
      const next = dragState.items.map((item) => item.config)
      // Only commit if the order actually changed
      const changed = next.some((t, i) => t !== transformers[i])
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
      className={isExpanded ? 'is-expanded' : ''}
      onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
        overflowX: 'auto',
        overflowY: 'visible',
        padding: '4px 0',
        flex: 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <style>{`
        .transformer-trace-content { display: none; }
        .is-expanded .transformer-trace-content { display: flex; }
        .transformer-trace-item {
          transition: background 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
        }
      `}</style>
      {displayItems.map((item, i) => (
        <TransformerTraceItem
          key={item.id}
          index={i}
          transformer={item.config}
          step={traceByStackIndex?.get(item.originalIndex)}
          headerRef={headerRef}
          traceBarRef={traceBarRef}
          scrollLeft={scrollLeft}
          onToggleExpanded={onToggleExpanded}
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
      ))}
      <div style={{ padding: '0 8px', borderLeft: `1px solid ${theme.border.default}`, display: 'flex', alignItems: 'center' }}>
        <select
          value={addSelectValue}
          onChange={(e) => handleAddTransformer(e.target.value)}
          style={{
            padding: '2px 4px',
            fontSize: 10,
            background: theme.bg.codeOverlay,
            border: `1px solid ${theme.border.default}`,
            borderRadius: 4,
            color: theme.text.muted,
            cursor: 'pointer',
            maxWidth: 80,
          }}
        >
          <option value="">+ Add</option>
          {TRANSFORMER_PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export interface CustomTransformerCodeTabProps {
  selectedEntityIds: string[]
  entityCount: number
  /** Merged stack when all selected entities agree; null if mixed. */
  mergedTransformers: TransformerConfig[] | null
  transformersMixed: boolean
  anyLocked: boolean
  onTransformersCommit: (next: TransformerConfig[]) => void
  /** Runs when user opens the floating code editor — e.g. collapse side drawers. */
  onTransformerCodePopoutOpen?: () => void
  /** Same handler as the properties/Code tab strip “restore saved pose” control (optional). */
  onResetPoseToSavedWorld?: (entityIds: string[]) => void
  onOpenTransformerDocs?: () => void
  canResetPoseToSaved?: boolean
  resetPoseTitle?: string
  liveTraceSteps?: TransformerTraceStep[] | null
}

export default function CustomTransformerCodeTab({
  selectedEntityIds,
  entityCount,
  mergedTransformers,
  transformersMixed,
  anyLocked,
  onTransformersCommit,
  onTransformerCodePopoutOpen,
  onOpenTransformerDocs,
  onResetPoseToSavedWorld,
  canResetPoseToSaved = false,
  resetPoseTitle = 'Restore saved position and rotation (from world)',
  liveTraceSteps = null,
}: CustomTransformerCodeTabProps) {
  const undo = useEditorUndo()
  const { openMenu } = useCopyMenu()
  const portalTarget = useTransformerCodePopoutPortalRoot()
  const list = mergedTransformers ?? []

  const customSlots = useMemo(
    () =>
      list
        .map((config, index) => ({ config, index }))
        .filter((x) => x.config.type === 'custom'),
    [list],
  )

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [codeEditorHeightPx, setCodeEditorHeightPx] = useState(CUSTOM_CODE_EDITOR_HEIGHT_DEFAULT_PX)
  const [codePopoutOpen, setCodePopoutOpen] = useState(false)
  const [codePopoutOpaque, setCodePopoutOpaque] = useState(false)
  const [docsOpenInPopout, setDocsOpenInPopout] = useState(false)
  const [docsAreaWidth, setDocsAreaWidth] = useState(0)
  const builderHeaderBottomInsetPx = useBuilderHeaderBottomInsetPx(codePopoutOpen)

  const popoutHeaderRef = useRef<HTMLDivElement>(null)
  const docsContainerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef(list)
  listRef.current = list
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  const codeDraftRef = useRef(codeDraft)
  codeDraftRef.current = codeDraft
  const onCommitRef = useRef(onTransformersCommit)
  onCommitRef.current = onTransformersCommit

  const codeUndoPrimedRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (customSlots.length === 0) {
      setSelectedIndex(null)
      return
    }
    setSelectedIndex((prev) => {
      // If we already have a valid selection that is still in customSlots, keep it
      if (prev !== null && customSlots.some((s) => s.index === prev)) return prev
      // Otherwise, default to the first custom slot
      return customSlots[0]!.index
    })
  }, [customSlots])

  // Ensure selectedIndex is set when the popout opens if it wasn't already
  useEffect(() => {
    if (codePopoutOpen && selectedIndex === null && customSlots.length > 0) {
      setSelectedIndex(customSlots[0].index)
    }
  }, [codePopoutOpen, selectedIndex, customSlots])

  const selectedSlot =
    selectedIndex !== null ? customSlots.find((s) => s.index === selectedIndex) : null

  const selectedConfig =
    selectedIndex !== null && list[selectedIndex]?.type === 'custom' ? list[selectedIndex]! : null

  const customCompileKey =
    selectedConfig != null ? `custom:p${selectedConfig.priority ?? 10}` : 'custom'

  const compileError = useMemo(
    () => validateCustomTransformerSource(codeDraft, customCompileKey),
    [codeDraft, customCompileKey],
  )

  const runtimeSnapshot = useSyncExternalStore(
    subscribeCustomTransformerRuntimeError,
    getCustomTransformerRuntimeError,
    () => null,
  )

  const runtimeErrorForSelection = useMemo(() => {
    if (runtimeSnapshot == null || selectedIndex === null) return null
    if (!selectedEntityIds.includes(runtimeSnapshot.entityId)) return null
    if (runtimeSnapshot.configStackIndex !== selectedIndex) return null
    return {
      message: runtimeSnapshot.message,
      stack: runtimeSnapshot.stack,
      code: runtimeSnapshot.code,
    }
  }, [runtimeSnapshot, selectedIndex, selectedEntityIds])

  const handleRuntimeErrorContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      if (runtimeErrorForSelection == null) return
      e.preventDefault()
      e.stopPropagation()
      openMenu(e, () => formatCustomRuntimeErrorClipboard(runtimeErrorForSelection))
    },
    [openMenu, runtimeErrorForSelection],
  )

  const syncKey = selectedConfig
    ? `${selectedIndex}:${selectedConfig.code ?? ''}:${selectedConfig.name ?? ''}`
    : ''

  useEffect(() => {
    if (!selectedConfig || selectedIndex === null) {
      setCodeDraft('')
      setNameDraft('')
      return
    }
    setCodeDraft(effectiveCustomTransformerCode(selectedConfig))
    setNameDraft(typeof selectedConfig.name === 'string' ? selectedConfig.name : '')
    codeUndoPrimedRef.current = false
  }, [syncKey, selectedConfig, selectedIndex])

  useEffect(() => {
    if (!codePopoutOpen || !docsOpenInPopout || typeof window === 'undefined') return
    const el = docsContainerRef.current
    if (!el) return

    const update = () => {
      setDocsAreaWidth(el.clientWidth)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [codePopoutOpen, docsOpenInPopout])

  const flushPendingCode = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const idx = selectedIndexRef.current
    if (idx === null) return
    const cur = listRef.current
    if (cur[idx]?.type !== 'custom') return
    const text = codeDraftRef.current
    const prevEffective = effectiveCustomTransformerCode(cur[idx]!)
    if (text === prevEffective) return
    onCommitRef.current(cur.map((t, i) => (i === idx ? { ...t, code: text } : t)))
  }, [])

  const closeCodePopout = useCallback(() => {
    flushPendingCode()
    setCodePopoutOpen(false)
  }, [flushPendingCode])

  /** Close + reopen pop-out so Monaco remounts (escape hatch for bad first paint). */
  const refreshPopoutMonaco = useCallback(() => {
    flushPendingCode()
    setCodePopoutOpen(false)
    window.setTimeout(() => setCodePopoutOpen(true), 0)
  }, [flushPendingCode])

  useEffect(() => {
    if (!codePopoutOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.shiftKey) return
      e.preventDefault()
      e.stopPropagation()
      closeCodePopout()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [codePopoutOpen, closeCodePopout])

  /** Shift+Escape reopens pop-out after Escape closed it (Transformer code segment only). */
  useEffect(() => {
    if (codePopoutOpen) return
    if (selectedEntityIds.length === 0 || transformersMixed || customSlots.length === 0 || anyLocked) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !e.shiftKey) return
      if (isKeyboardEventInEditableContext(e)) return
      e.preventDefault()
      e.stopPropagation()
      onTransformerCodePopoutOpen?.()
      setCodePopoutOpen(true)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    codePopoutOpen,
    selectedEntityIds.length,
    transformersMixed,
    customSlots.length,
    anyLocked,
    onTransformerCodePopoutOpen,
  ])

  useEffect(() => {
    if (!codePopoutOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [codePopoutOpen])

  useEffect(() => {
    if (customSlots.length === 0) setCodePopoutOpen(false)
  }, [customSlots.length])

  useEffect(() => {
    if (selectedEntityIds.length === 0 || transformersMixed) setCodePopoutOpen(false)
  }, [selectedEntityIds.length, transformersMixed])

  useEffect(
    () => () => {
      flushPendingCode()
    },
    [flushPendingCode],
  )

  const changeSelectedIndex = useCallback(
    (nextIdx: number) => {
      flushPendingCode()
      setSelectedIndex(nextIdx)
    },
    [flushPendingCode],
  )

  const handleSelectCodeFromTrace = useCallback(
    (listIndex: number) => {
      changeSelectedIndex(listIndex)
    },
    [changeSelectedIndex],
  )

  const scheduleCodeCommit = (text: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      const idx = selectedIndexRef.current
      if (idx === null) return
      const cur = listRef.current
      if (cur[idx]?.type !== 'custom') return
      onCommitRef.current(cur.map((t, i) => (i === idx ? { ...t, code: text } : t)))
    }, CODE_DEBOUNCE_MS)
  }

  const handleCodeChange = (text: string) => {
    if (!codeUndoPrimedRef.current) {
      undo?.pushBeforeEdit()
      codeUndoPrimedRef.current = true
    }
    setCodeDraft(text)
    scheduleCodeCommit(text)
  }

  const commitName = () => {
    if (selectedIndex === null) return
    const c = list[selectedIndex]
    if (c?.type !== 'custom') return
    const unique = ensureUniqueCustomTransformerName(nameDraft, list, selectedIndex)
    if (unique !== nameDraft.trim()) setNameDraft(unique)
    onTransformersCommit(list.map((t, i) => (i === selectedIndex ? { ...t, name: unique } : t)))
  }

  const handleAddCustom = () => {
    flushPendingCode()
    undo?.pushBeforeEdit()
    const next = [
      ...list,
      { ...getDefaultTransformerConfig('custom'), name: nextUniqueCustomTransformerName(list) },
    ]
    onTransformersCommit(next)
    setSelectedIndex(next.length - 1)
  }

  const copyPayload = useMemo(
    () => ({
      transformers: mergedTransformers,
      selectedEntityIds,
      customTab: true as const,
    }),
    [mergedTransformers, selectedEntityIds],
  )

  if (selectedEntityIds.length === 0) {
    return (
      <CopyableArea
        copyPayload={{ ...copyPayload, message: 'empty' }}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: theme.text.muted }}>
            Select an entity to edit custom transformer code.
          </p>
        </div>
      </CopyableArea>
    )
  }

  if (transformersMixed) {
    return (
      <CopyableArea copyPayload={copyPayload} style={{ flex: 1, padding: 8 }}>
        <p style={{ margin: 0, fontSize: 12, color: theme.text.muted }}>
          Transformer stacks differ across the selection. Align stacks in the Transformers tab or select entities
          with the same stack.
        </p>
      </CopyableArea>
    )
  }

  const enabled = selectedConfig ? (selectedConfig.enabled ?? true) : true

  const popoutTitle =
    selectedConfig != null && selectedIndex !== null
      ? `Code · ${labelCustomTransformer(selectedConfig, selectedIndex)}`
      : 'Custom transformer code'

  const compileErrorPanel = compileError ? (
    <div
      data-testid="custom-transformer-compile-error"
      style={{
        marginTop: 8,
        padding: '8px 10px',
        fontSize: 12,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: theme.text.error,
        border: `1px solid ${theme.border.error}`,
        borderRadius: 6,
        background: theme.bg.errorFallback,
        flexShrink: 0,
        overflow: 'auto',
        maxHeight: 200,
      }}
    >
      {compileError}
    </div>
  ) : null

  const runtimeErrorPanel = runtimeErrorForSelection ? (
    <div
      data-testid="custom-transformer-runtime-error"
      onContextMenu={handleRuntimeErrorContextMenu}
      style={{
        marginTop: 8,
        padding: '8px 10px',
        fontSize: 12,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: theme.text.warning,
        border: `1px solid ${theme.text.warning}`,
        borderRadius: 6,
        background: theme.bg.sectionMuted,
        flexShrink: 0,
        overflow: 'auto',
        maxHeight: 280,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11 }}>Runtime error</div>
      <div style={{ marginBottom: 4 }}>{runtimeErrorForSelection.message}</div>
      {runtimeErrorForSelection.stack ? (
        <details
          data-testid="custom-transformer-runtime-stack"
          style={{ marginTop: 6, marginBottom: runtimeErrorForSelection.code.trim() ? 6 : 0 }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              userSelect: 'none',
            }}
          >
            Stack trace
          </summary>
          <pre
            style={{
              margin: '6px 0 0',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {runtimeErrorForSelection.stack}
          </pre>
        </details>
      ) : null}
      {runtimeErrorForSelection.code.trim() ? (
        <details data-testid="custom-transformer-runtime-code">
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              userSelect: 'none',
            }}
          >
            Transformer code
          </summary>
          <pre
            style={{
              margin: '6px 0 0',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {runtimeErrorForSelection.code}
          </pre>
        </details>
      ) : null}
    </div>
  ) : null

  const codePopoutPortal =
    codePopoutOpen && customSlots.length > 0
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-transformer-code-popout-title"
            data-testid="custom-transformer-code-popout-backdrop"
            style={{
              position: 'fixed',
              top: builderHeaderBottomInsetPx,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.bg.modalBackdropSoft,
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'stretch',
              zIndex: theme.zIndex.modal,
              padding: 0,
              boxSizing: 'border-box',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeCodePopout()
            }}
          >
            <div
                style={{
                  flex: '1 1 auto',
                  width: '100%',
                  minHeight: 0,
                  backgroundColor: codePopoutOpaque ? theme.bg.panelAlt : theme.bg.modalGlass,
                  border: `1px solid ${theme.border.default}`,
                  borderRadius: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'none',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  ref={popoutHeaderRef}
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${theme.border.default}`,
                    backgroundColor: codePopoutOpaque ? theme.bg.panel : theme.bg.modalGlassHeader,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                    gap: 12,
                    position: 'relative',
                  }}
                >
                <h2
                  id="custom-transformer-code-popout-title"
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    color: theme.text.primary,
                    flex: '0 0 auto',
                    minWidth: 0,
                  }}
                >
                  {popoutTitle}
                </h2>
      <TransformerHorizontalTrace
        transformers={list}
        liveTraceSteps={liveTraceSteps}
        headerRef={popoutHeaderRef}
        onCommit={onTransformersCommit}
        onSelectCode={handleSelectCodeFromTrace}
        selectedListIndex={selectedSlot?.index}
      />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    data-testid="custom-transformer-code-popout-opaque-toggle"
                    title={codePopoutOpaque ? 'Make window transparent (50%)' : 'Make window fully opaque'}
                    aria-label="Toggle window opacity"
                    onClick={() => setCodePopoutOpaque(!codePopoutOpaque)}
                    style={{
                      ...entityPanelIconButtonStyle,
                      opacity: codePopoutOpaque ? 1 : 0.65,
                      color: codePopoutOpaque ? theme.accent : theme.text.muted,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => {
                      if (!codePopoutOpaque) e.currentTarget.style.opacity = '0.65'
                    }}
                  >
                    {EntityPanelIcons.opacity}
                  </button>
                  <button
                    type="button"
                    data-testid="custom-transformer-code-popout-docs-toggle"
                    title={docsOpenInPopout ? 'Hide documentation' : 'Show documentation'}
                    aria-label="Toggle documentation"
                    onClick={() => setDocsOpenInPopout(!docsOpenInPopout)}
                    style={{
                      ...entityPanelIconButtonStyle,
                      opacity: docsOpenInPopout ? 1 : 0.65,
                      color: docsOpenInPopout ? theme.accent : theme.text.muted,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => {
                      if (!docsOpenInPopout) e.currentTarget.style.opacity = '0.65'
                    }}
                  >
                    {EntityPanelIcons.document}
                  </button>
                  {onResetPoseToSavedWorld ? (
                    <button
                      type="button"
                      data-testid="custom-transformer-code-popout-restore-pose"
                      title={resetPoseTitle}
                      aria-label="Restore saved position and rotation"
                      disabled={!canResetPoseToSaved}
                      onClick={() => onResetPoseToSavedWorld(selectedEntityIds)}
                      style={{
                        ...entityPanelIconButtonStyle,
                        cursor: canResetPoseToSaved ? 'pointer' : 'not-allowed',
                        opacity: canResetPoseToSaved ? 0.85 : 0.45,
                      }}
                      onMouseEnter={(e) => {
                        if (canResetPoseToSaved) e.currentTarget.style.opacity = '1'
                      }}
                      onMouseLeave={(e) => {
                        if (canResetPoseToSaved) e.currentTarget.style.opacity = '0.85'
                      }}
                    >
                      {EntityPanelIcons.reset}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="custom-transformer-code-popout-refresh-editor"
                    onClick={refreshPopoutMonaco}
                    disabled={anyLocked}
                    title="Reload editor (closes and reopens this window)"
                    aria-label="Reload editor layout"
                    style={{
                      padding: '6px 10px',
                      fontSize: 12,
                      borderRadius: 6,
                      border: `1px solid ${theme.border.default}`,
                      background: theme.bg.surface,
                      color: theme.text.primary,
                      cursor: anyLocked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Refresh editor
                  </button>
                  <button
                    type="button"
                    data-testid="custom-transformer-code-popout-close"
                    onClick={closeCodePopout}
                    aria-label="Close pop-out editor"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.text.muted,
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: 'pointer',
                      padding: 4,
                      borderRadius: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div
                data-testid="custom-transformer-code-popout-body"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'row',
                  padding: 16,
                  overflow: 'hidden',
                  gap: docsOpenInPopout ? 16 : 0,
                }}
              >
                <div
                  style={{
                    flex: docsOpenInPopout ? '1 1 60%' : '1 1 100%',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <TransformerCustomCodeEditor
                      layout="fill"
                      transparent={!codePopoutOpaque}
                      delayedLayoutMs={200}
                      value={codeDraft}
                      onChange={handleCodeChange}
                      disabled={anyLocked}
                    />
                  </div>
                  {compileErrorPanel}
                  {runtimeErrorPanel}
                </div>

                {docsOpenInPopout && (
                  <div
                    ref={docsContainerRef}
                    style={{
                      flex: '1 1 40%',
                      minWidth: 300,
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      background: theme.bg.panel,
                      border: `1px solid ${theme.border.default}`,
                      borderRadius: 8,
                      padding: 16,
                    }}
                  >
                    <TransformerDocsContent forceCollapsedChapters={docsAreaWidth < 500} />
                  </div>
                )}
              </div>
            </div>
          </div>,
          portalTarget,
        )
      : null

  return (
    <>
    <CopyableArea
      copyPayload={copyPayload}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: 8,
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.text.primary, flex: '1 1 auto' }}>
          Custom transformer
          {entityCount > 1 ? ` (${entityCount} entities)` : ''}
        </h3>
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={anyLocked}
          style={{
            padding: '6px 10px',
            fontSize: 12,
            borderRadius: 6,
            border: `1px solid ${theme.border.default}`,
            background: theme.bg.surface,
            color: theme.text.primary,
            cursor: anyLocked ? 'not-allowed' : 'pointer',
          }}
          data-testid="custom-transformer-add"
        >
          Add custom
        </button>
      </div>

      {customSlots.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: theme.text.muted }}>
          No custom transformers on this stack. Add one here or from the Transformers tab.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: theme.text.secondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              Custom
              <select
                value={selectedIndex ?? ''}
                onChange={(e) => changeSelectedIndex(Number(e.target.value))}
                disabled={anyLocked}
                data-testid="custom-transformer-select"
                style={{
                  minWidth: 140,
                  padding: '4px 8px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: `1px solid ${theme.border.default}`,
                  background: theme.bg.panelAlt,
                  color: theme.text.primary,
                }}
              >
                {customSlots.map(({ config, index }) => (
                  <option key={index} value={index}>
                    {labelCustomTransformer(config, index)}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 12, color: theme.text.secondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              Name
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => commitName()}
                disabled={anyLocked}
                data-testid="custom-transformer-name"
                style={{
                  width: 140,
                  padding: '4px 8px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: `1px solid ${theme.border.default}`,
                  background: theme.bg.panelAlt,
                  color: theme.text.primary,
                }}
              />
            </label>

            <button
              type="button"
              title={enabled ? 'Transformer enabled' : 'Transformer disabled'}
              aria-pressed={enabled}
              disabled={anyLocked || selectedIndex === null}
              onClick={() => {
                if (selectedIndex === null) return
                flushPendingCode()
                undo?.pushBeforeEdit()
                onTransformersCommit(
                  list.map((t, i) =>
                    i === selectedIndex ? { ...t, enabled: !(t.enabled ?? true) } : t,
                  ),
                )
              }}
              data-testid="custom-transformer-enabled-led"
              style={{
                width: 28,
                height: 18,
                borderRadius: 9,
                border: `1px solid ${theme.border.default}`,
                padding: 0,
                background: enabled ? theme.feedback.successBg : theme.bg.surface,
                boxShadow: enabled ? `inset 0 0 8px rgba(0, 160, 80, 0.35)` : undefined,
                cursor: anyLocked || selectedIndex === null ? 'not-allowed' : 'pointer',
              }}
            />

            <label
              style={{
                fontSize: 12,
                color: theme.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              title="Lower runs earlier in the chain."
            >
              Priority
              <input
                type="number"
                value={selectedConfig?.priority ?? 10}
                disabled={anyLocked || selectedIndex === null}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!Number.isFinite(n) || selectedIndex === null) return
                  flushPendingCode()
                  onTransformersCommit(list.map((t, i) => (i === selectedIndex ? { ...t, priority: n } : t)))
                }}
                style={{
                  width: 64,
                  padding: '4px 6px',
                  borderRadius: 4,
                  border: `1px solid ${theme.border.default}`,
                  background: theme.bg.panelAlt,
                  color: theme.text.primary,
                  fontSize: 12,
                }}
              />
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{ ...fieldLabelStyle, cursor: 'help', flex: '1 1 auto' }}
              title="Debounced live apply to the entity stack."
            >
              Code
            </div>
            {!codePopoutOpen ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  data-testid="custom-transformer-code-popout-open"
                  disabled={anyLocked}
                  onClick={() => {
                    onTransformerCodePopoutOpen?.()
                    setCodePopoutOpen(true)
                  }}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${theme.border.default}`,
                    background: theme.bg.surface,
                    color: theme.text.primary,
                    cursor: anyLocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  Pop out
                </button>
                <button
                  type="button"
                  title="Open transformer coding documentation"
                  onClick={onOpenTransformerDocs}
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${theme.border.default}`,
                    background: theme.bg.surface,
                    color: theme.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  Help
                </button>
              </div>
            ) : null}
          </div>

          {!codePopoutOpen ? (
            <>
              <TransformerCustomCodeEditor
                value={codeDraft}
                onChange={handleCodeChange}
                disabled={anyLocked}
                heightPx={codeEditorHeightPx}
                onHeightPxChange={setCodeEditorHeightPx}
              />
              {compileError ? (
                <div
                  data-testid="custom-transformer-compile-error"
                  style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: theme.text.error,
                    border: `1px solid ${theme.border.error}`,
                    borderRadius: 6,
                    background: theme.bg.errorFallback,
                  }}
                >
                  {compileError}
                </div>
              ) : null}
              {runtimeErrorForSelection ? (
                <div
                  data-testid="custom-transformer-runtime-error"
                  onContextMenu={handleRuntimeErrorContextMenu}
                  style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: theme.text.warning,
                    border: `1px solid ${theme.text.warning}`,
                    borderRadius: 6,
                    background: theme.bg.sectionMuted,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11 }}>Runtime error</div>
                  <div style={{ marginBottom: 4 }}>{runtimeErrorForSelection.message}</div>
                  {runtimeErrorForSelection.stack ? (
                    <details
                      data-testid="custom-transformer-runtime-stack"
                      style={{
                        marginTop: 6,
                        marginBottom: runtimeErrorForSelection.code.trim() ? 6 : 0,
                      }}
                    >
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          userSelect: 'none',
                        }}
                      >
                        Stack trace
                      </summary>
                      <pre
                        style={{
                          margin: '6px 0 0',
                          fontSize: 11,
                          fontFamily: 'ui-monospace, monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {runtimeErrorForSelection.stack}
                      </pre>
                    </details>
                  ) : null}
                  {runtimeErrorForSelection.code.trim() ? (
                    <details data-testid="custom-transformer-runtime-code">
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          userSelect: 'none',
                        }}
                      >
                        Transformer code
                      </summary>
                      <pre
                        style={{
                          margin: '6px 0 0',
                          fontSize: 11,
                          fontFamily: 'ui-monospace, monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 240,
                          overflow: 'auto',
                        }}
                      >
                        {runtimeErrorForSelection.code}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div
              data-testid="custom-transformer-code-docked-placeholder"
              style={{
                marginBottom: 8,
                padding: '10px 12px',
                borderRadius: 6,
                border: `1px solid ${theme.border.default}`,
                background: theme.bg.sectionMuted,
                fontSize: 12,
                color: theme.text.secondary,
              }}
            >
              <div style={{ marginBottom: 8 }}>The code editor is open in a pop-out window.</div>
              <button
                type="button"
                data-testid="custom-transformer-code-popout-dock"
                onClick={closeCodePopout}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: `1px solid ${theme.border.default}`,
                  background: theme.bg.surface,
                  color: theme.text.primary,
                  cursor: 'pointer',
                }}
              >
                Dock editor
              </button>
            </div>
          )}

          <div style={{ ...fieldLabelStyle, cursor: 'help', marginTop: 12 }} title='"params" only; merged into this transformer.'>
            Params (JSON)
          </div>
          <ValidatedJsonTextarea
            value={JSON.stringify(selectedConfig?.params ?? {}, null, 2)}
            onApply={(updated) => {
              if (selectedIndex === null) return
              const patch =
                typeof updated === 'object' && updated !== null && !Array.isArray(updated)
                  ? (updated as Record<string, unknown>)
                  : {}
              flushPendingCode()
              undo?.pushBeforeEdit()
              onTransformersCommit(list.map((t, i) => (i === selectedIndex ? { ...t, params: patch } : t)))
            }}
            disabled={anyLocked}
            applyVariant="icon"
            textareaTestId="custom-transformer-params-textarea"
            applyTestId="custom-transformer-params-apply"
          />
        </>
      )}
    </CopyableArea>
    {codePopoutPortal}
    </>
  )
}
