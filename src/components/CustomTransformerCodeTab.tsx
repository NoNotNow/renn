import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { TransformerConfig } from '@/types/transformer'
import CopyableArea from '@/components/CopyableArea'
import TransformerCustomCodeEditor, { CUSTOM_CODE_EDITOR_HEIGHT_DEFAULT_PX } from '@/components/TransformerCustomCodeEditor'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import { fieldLabelStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import { getDefaultTransformerConfig } from '@/transformers/transformerPresets'
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
}

export default function CustomTransformerCodeTab({
  selectedEntityIds,
  entityCount,
  mergedTransformers,
  transformersMixed,
  anyLocked,
  onTransformersCommit,
  onTransformerCodePopoutOpen,
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
      if (prev !== null && customSlots.some((s) => s.index === prev)) return prev
      return customSlots[0]!.index
    })
  }, [customSlots])

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

  useEffect(() => {
    if (!codePopoutOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCodePopout()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [codePopoutOpen, closeCodePopout])

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

  const changeSelectedIndex = (nextIdx: number) => {
    flushPendingCode()
    setSelectedIndex(nextIdx)
  }

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
              inset: 0,
              backgroundColor: theme.bg.modalBackdropSoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: theme.zIndex.modal,
              padding: 16,
              boxSizing: 'border-box',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeCodePopout()
            }}
          >
            <div
              style={{
                width: 'min(95vw, 1600px)',
                height: 'min(92vh, 1200px)',
                backgroundColor: theme.bg.modalGlass,
                backdropFilter: theme.effects.modalGlassBlur,
                WebkitBackdropFilter: theme.effects.modalGlassBlur,
                border: `1px solid ${theme.border.default}`,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${theme.border.default}`,
                  backgroundColor: theme.bg.modalGlassHeader,
                  backdropFilter: theme.effects.modalGlassBlur,
                  WebkitBackdropFilter: theme.effects.modalGlassBlur,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}
              >
                <h2
                  id="custom-transformer-code-popout-title"
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    color: theme.text.primary,
                  }}
                >
                  {popoutTitle}
                </h2>
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
              <div
                data-testid="custom-transformer-code-popout-body"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 16,
                  overflow: 'hidden',
                  gap: 0,
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
                    transparent
                    value={codeDraft}
                    onChange={handleCodeChange}
                    disabled={anyLocked}
                  />
                </div>
                {compileErrorPanel}
                {runtimeErrorPanel}
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
