import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PresetTransformerType, TransformerConfig, TransformOutput } from '@/types/transformer'
import CopyableArea from './CopyableArea'
import TransformerFieldReference from './TransformerFieldReference'
import TransformerTemplateDialog from './TransformerTemplateDialog'
import ValidatedJsonTextarea from './ValidatedJsonTextarea'
import TransformerCustomCodeEditor from './TransformerCustomCodeEditor'
import { fieldLabelStyle, entityPanelIconButtonStyle, removeButtonStyle, removeButtonStyleDisabled } from './sharedStyles'
import { theme } from '@/config/theme'
import { EntityPanelIcons } from './EntityPanelIcons'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
  isPresetTransformerType,
} from '@/transformers/transformerPresets'
import { nextUniqueCustomTransformerName } from '@/transformers/customTransformerNaming'
import { effectiveCustomTransformerCode } from '@/transformers/customCodeTransformer'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import type { TransformerTraceStep } from '@/transformers/transformerTrace'
import {
  actionsMapsDiffer,
  hasNonZeroSemanticActions,
  isStructuralTransformOutputActive,
  serializeTransformerTraceOutputJson,
  summarizeActions,
  summarizePublishedActionsDelta,
  summarizeTransformerTraceOutputBrief,
} from '@/transformers/transformerTrace'

const TRACE_JSON_PRE_STYLE: CSSProperties = {
  margin: '3px 0 0',
  padding: 6,
  maxHeight: 220,
  overflow: 'auto',
  background: theme.bg.codeOverlay,
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: theme.text.muted,
  fontSize: 11,
  textAlign: 'left',
}

const COLLAPSIBLE_TRACE_DETAILS_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
}

function TransformerLiveTraceDetails({
  index,
  step,
  summaryRowStyle,
  traceInputSummaryColor,
  traceOutputSummaryColor,
  traceInputBrief,
  traceOutputBrief,
}: {
  index: number
  step: TransformerTraceStep | undefined
  summaryRowStyle: CSSProperties
  traceInputSummaryColor: string
  traceOutputSummaryColor: string
  traceInputBrief: string
  traceOutputBrief: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 2,
      }}
    >
      <details style={COLLAPSIBLE_TRACE_DETAILS_STYLE}>
        <summary
          title={
            step?.skipped
              ? 'Transformer skipped (disabled)'
              : 'Semantic actions on wire into this step'
          }
          style={{
            ...summaryRowStyle,
            color: traceInputSummaryColor,
          }}
          data-testid={`transformer-trace-summary-input-${index}`}
        >
          Input snapshot · {traceInputBrief}
        </summary>
        {step && !step.skipped && step.inputBefore ? (
          <pre data-testid={`transformer-trace-input-json-${index}`} style={TRACE_JSON_PRE_STYLE}>
            {JSON.stringify(step.inputBefore, null, 2)}
          </pre>
        ) : null}
      </details>
      <details style={COLLAPSIBLE_TRACE_DETAILS_STYLE}>
        <summary
          title={
            step?.skipped
              ? 'Transformer skipped (disabled)'
              : 'Return value from transform(); includes published actions for input transformer'
          }
          style={{
            ...summaryRowStyle,
            color: traceOutputSummaryColor,
          }}
          data-testid={`transformer-trace-summary-output-${index}`}
        >
          Transform output · {traceOutputBrief}
        </summary>
        {step && !step.skipped && (step.transformOutput !== undefined || step.actionsAfter !== undefined) ? (
          <pre data-testid={`transformer-trace-output-json-${index}`} style={TRACE_JSON_PRE_STYLE}>
            {JSON.stringify(serializeTransformerTraceOutputJson(step), null, 2)}
          </pre>
        ) : null}
      </details>
    </div>
  )
}

function padFieldRefPanelOpen(open: boolean[], length: number): boolean[] {
  return Array.from({ length }, (_, i) => open[i] ?? false)
}

function supportsTemplatePickers(type: string): boolean {
  return isPresetTransformerType(type) && type !== 'custom'
}

export interface TransformerEditorProps {
  transformers?: TransformerConfig[]
  /** Multi-select: stacks differ; edits replace all selected entities' stacks. */
  transformersMixed?: boolean
  onChange?: (transformers: TransformerConfig[]) => void
  disabled?: boolean
  /**
   * Builder live trace for the selected entity (Transformers tab + single selection).
   * When non-null, shows per-row collapsible JSON snapshots (placement differs for custom vs preset).
   */
  liveTraceSteps?: TransformerTraceStep[] | null
}

export default function TransformerEditor({
  transformers,
  transformersMixed = false,
  onChange,
  disabled = false,
  liveTraceSteps = null,
}: TransformerEditorProps) {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()
  const [addSelectValue, setAddSelectValue] = useState('')
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateDialogTargetIndex, setTemplateDialogTargetIndex] = useState<number | null>(null)
  const [fieldRefPanelOpen, setFieldRefPanelOpen] = useState<boolean[]>([])
  const [customCodeDrafts, setCustomCodeDrafts] = useState<Record<number, string>>({})
  const list = transformers ?? []

  const traceByStackIndex = useMemo(() => {
    if (!liveTraceSteps) return null
    const m = new Map<number, TransformerTraceStep>()
    for (const s of liveTraceSteps) {
      m.set(s.configStackIndex, s)
    }
    return m
  }, [liveTraceSteps])

  const customCodeSyncKey = useMemo(
    () =>
      JSON.stringify(
        list.map((t, i) =>
          t.type === 'custom'
            ? {
                i,
                c: effectiveCustomTransformerCode(t),
                p: t.priority ?? null,
                pr: JSON.stringify(t.params ?? {}),
                n: t.name ?? '',
              }
            : { i, t: t.type },
        ),
      ),
    [list],
  )
  const lastCustomSyncKeyRef = useRef('')
  useEffect(() => {
    if (customCodeSyncKey === lastCustomSyncKeyRef.current) return
    lastCustomSyncKeyRef.current = customCodeSyncKey
    const next: Record<number, string> = {}
    list.forEach((t, i) => {
      if (t.type === 'custom') next[i] = effectiveCustomTransformerCode(t)
    })
    setCustomCodeDrafts(next)
  }, [list, customCodeSyncKey])

  useEffect(() => {
    setFieldRefPanelOpen((prev) => padFieldRefPanelOpen(prev, list.length))
  }, [list.length])

  const handleAddTransformer = (type: string) => {
    if (!type) return
    const config = getDefaultTransformerConfig(type)
    const withName =
      type === 'custom' ? { ...config, name: nextUniqueCustomTransformerName(list) } : config
    onChange?.([...list, withName])
    setAddSelectValue('')
  }

  const handleRemoveTransformer = (index: number) => {
    const next = list.filter((_, i) => i !== index)
    onChange?.(next)
    setFieldRefPanelOpen((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveTransformer = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= list.length) return
    const next = [...list]
    ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
    onChange?.(next)
    setFieldRefPanelOpen((prev) => {
      const p = padFieldRefPanelOpen(prev, list.length)
      const open = [...p]
      ;[open[fromIndex], open[toIndex]] = [open[toIndex]!, open[fromIndex]!]
      return open
    })
  }

  const handleToggleEnabled = (index: number) => {
    const next = list.map((t, i) =>
      i === index ? { ...t, enabled: !(t.enabled ?? true) } : t
    )
    onChange?.(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {transformersMixed && (
        <p style={{ margin: 0, fontSize: 12, color: theme.text.muted }}>
          Transformer stacks differ. Adding or editing replaces the stack on all selected entities.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{ ...fieldLabelStyle, cursor: 'help' }}
          title="Append a preset transformer to the end of the stack. Order matters: earlier modules run first."
        >
          Add transformer
        </div>
        <select
          value={addSelectValue}
          onChange={(e) => handleAddTransformer(e.target.value)}
          disabled={disabled}
          style={{
            padding: '6px 8px',
            fontSize: 12,
            background: theme.bg.codeOverlay,
            border: `1px solid ${theme.border.default}`,
            borderRadius: 4,
            color: theme.text.secondary,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          data-testid="add-transformer-select"
        >
          <option value="">Add transformer...</option>
          {TRANSFORMER_PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <div style={{ color: theme.text.muted, fontSize: 12, fontStyle: 'italic' }}>
          No transformers configured
        </div>
      ) : (
        list.map((transformer, index) => {
        const enabled = transformer.enabled ?? true
        const step = traceByStackIndex?.get(index)
        const inputLit = Boolean(step && !step.skipped && hasNonZeroSemanticActions(step.inputBefore))
        const outputLit = Boolean(step && !step.skipped && step.outputLedActive)

        const traceSummaryRowStyle = {
          cursor: 'pointer' as const,
          minHeight: 20,
          lineHeight: 1.25,
          display: 'flex' as const,
          alignItems: 'center' as const,
          userSelect: 'none' as const,
        }
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

        return (
          <CopyableArea
            key={index}
            copyPayload={transformer}
            style={{
              padding: 8,
              border: `1px solid ${theme.border.default}`,
              borderRadius: 4,
              background: theme.bg.sectionMuted,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
                gap: 6,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: theme.text.secondary, flexShrink: 0 }}>
                  {transformer.type}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(index)}
                  disabled={disabled}
                  aria-pressed={enabled}
                  title={
                    enabled
                      ? 'Enabled — click to disable'
                      : 'Disabled — click to enable'
                  }
                  aria-label={enabled ? 'Disable transformer' : 'Enable transformer'}
                  data-testid={`transformer-enabled-toggle-${index}`}
                  style={{
                    flexShrink: 0,
                    minWidth: 22,
                    minHeight: 22,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: enabled ? theme.status.enabled : theme.status.disabled,
                      pointerEvents: 'none',
                    }}
                  />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {supportsTemplatePickers(transformer.type) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateDialogTargetIndex(index)
                      setTemplateDialogOpen(true)
                    }}
                    disabled={disabled}
                    style={{
                      ...entityPanelIconButtonStyle,
                      color: theme.text.accentBlue,
                      border: `1px solid ${theme.button.infoBorder}`,
                      background: theme.button.info,
                    }}
                    title="Load template"
                    aria-label="Load template"
                    data-testid="load-transformer-template"
                  >
                    {EntityPanelIcons.loadTemplate}
                  </button>
                ) : null}
                {isPresetTransformerType(transformer.type) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFieldRefPanelOpen((prev) => {
                        const p = padFieldRefPanelOpen(prev, list.length)
                        const next = [...p]
                        next[index] = !next[index]
                        return next
                      })
                    }}
                    disabled={disabled}
                    aria-pressed={fieldRefPanelOpen[index] ?? false}
                    style={{
                      ...entityPanelIconButtonStyle,
                      color: theme.text.accentBlue,
                      border: `1px solid ${
                        fieldRefPanelOpen[index] ?? false
                          ? theme.button.infoActiveBorder
                          : theme.button.infoBorder
                      }`,
                      background:
                        fieldRefPanelOpen[index] ?? false ? theme.button.infoActive : theme.button.info,
                    }}
                    title={
                      fieldRefPanelOpen[index] ?? false ? 'Hide field reference' : 'Show field reference'
                    }
                    aria-label={
                      fieldRefPanelOpen[index] ?? false ? 'Hide field reference' : 'Show field reference'
                    }
                    data-testid="transformer-field-reference-toggle"
                  >
                    {EntityPanelIcons.document}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleMoveTransformer(index, 'up')}
                  disabled={disabled || index === 0}
                  style={{
                    ...entityPanelIconButtonStyle,
                    minWidth: 24,
                    minHeight: 24,
                    padding: 2,
                    color: theme.text.muted,
                    opacity: disabled || index === 0 ? 0.4 : 0.8,
                    cursor: disabled || index === 0 ? 'not-allowed' : 'pointer',
                  }}
                  title="Move up"
                  aria-label="Move up"
                  data-testid="move-transformer-up"
                >
                  {EntityPanelIcons.chevronUp}
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveTransformer(index, 'down')}
                  disabled={disabled || index === list.length - 1}
                  style={{
                    ...entityPanelIconButtonStyle,
                    minWidth: 24,
                    minHeight: 24,
                    padding: 2,
                    color: theme.text.muted,
                    opacity: disabled || index === list.length - 1 ? 0.4 : 0.8,
                    cursor: disabled || index === list.length - 1 ? 'not-allowed' : 'pointer',
                  }}
                  title="Move down"
                  aria-label="Move down"
                  data-testid="move-transformer-down"
                >
                  {EntityPanelIcons.chevronDown}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveTransformer(index)}
                  disabled={disabled}
                  style={{
                    ...removeButtonStyle,
                    ...(disabled && removeButtonStyleDisabled),
                    ...entityPanelIconButtonStyle,
                  }}
                  title="Remove transformer"
                  aria-label="Remove transformer"
                  data-testid="remove-transformer"
                >
                  {EntityPanelIcons.trash}
                </button>
            </div>
            </div>

            <div style={{ marginTop: 6 }}>
              {isPresetTransformerType(transformer.type) ? (
                (fieldRefPanelOpen[index] ?? false) ? (
                  <div style={{ marginBottom: 8 }}>
                    <TransformerFieldReference transformerType={transformer.type} />
                  </div>
                ) : null
              ) : (
                <div style={{ marginBottom: 8 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: theme.text.muted,
                      lineHeight: 1.35,
                    }}
                  >
                    No built-in field reference for this transformer type. Edit JSON carefully or
                    switch to a preset type.
                  </p>
                </div>
              )}
              {transformer.type === 'custom' ? (
                <>
                  <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: theme.text.secondary,
                      }}
                      title="Lower runs earlier in the chain."
                    >
                      Priority
                      <input
                        type="number"
                        value={transformer.priority ?? 10}
                        disabled={disabled}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          if (!Number.isFinite(n)) return
                          onChange?.(list.map((t, i) => (i === index ? { ...t, priority: n } : t)))
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
                    style={{ ...fieldLabelStyle, cursor: 'help' }}
                    title="JavaScript compiled once after Apply. IntelliSense mirrors input/actions/pose/state."
                  >
                    Code
                  </div>
                  <TransformerCustomCodeEditor
                    value={
                      customCodeDrafts[index] !== undefined ? customCodeDrafts[index]! : effectiveCustomTransformerCode(transformer)
                    }
                    onChange={(text) =>
                      setCustomCodeDrafts((prev) => ({ ...prev, [index]: text }))
                    }
                    disabled={disabled}
                  />
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px 10px',
                      width: '100%',
                      minWidth: 0,
                    }}
                  >
                    {liveTraceSteps != null ? (
                      <div
                        style={{
                          flex: '0 1 auto',
                          minWidth: 0,
                          maxWidth: '100%',
                        }}
                        data-testid={`transformer-live-io-${index}`}
                      >
                        <TransformerLiveTraceDetails
                          index={index}
                          step={step}
                          summaryRowStyle={traceSummaryRowStyle}
                          traceInputSummaryColor={traceInputSummaryColor}
                          traceOutputSummaryColor={traceOutputSummaryColor}
                          traceInputBrief={traceInputBrief}
                          traceOutputBrief={traceOutputBrief}
                        />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        disabled ||
                        (customCodeDrafts[index] !== undefined ? customCodeDrafts[index]! : effectiveCustomTransformerCode(transformer)) === effectiveCustomTransformerCode(transformer)
                      }
                      onClick={() => {
                        pushUndo()
                        const nextCode =
                          customCodeDrafts[index] !== undefined ? customCodeDrafts[index]! : effectiveCustomTransformerCode(transformer)
                        onChange?.(
                          list.map((t, i) => (i === index ? { ...t, code: nextCode } : t)),
                        )
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: `1px solid ${theme.feedback.successBorder}`,
                        background: theme.feedback.successBg,
                        color: theme.feedback.successText,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        flexShrink: 0,
                        marginLeft: liveTraceSteps != null ? undefined : 'auto',
                      }}
                      data-testid="transformer-custom-code-apply"
                    >
                      Apply code
                    </button>
                  </div>
                  <div
                    style={{ ...fieldLabelStyle, cursor: 'help', marginTop: 12 }}
                    title='"params" only; merged into this transformer.'
                  >
                    Params (JSON)
                  </div>
                  <ValidatedJsonTextarea
                    value={JSON.stringify(transformer.params ?? {}, null, 2)}
                    onApply={(updated) => {
                      const patch = typeof updated === 'object' && updated !== null && !Array.isArray(updated)
                        ? (updated as Record<string, unknown>)
                        : {}
                      onChange?.(
                        list.map((t, i) => (i === index ? { ...t, params: patch } : t)),
                      )
                    }}
                    disabled={disabled}
                    applyVariant="icon"
                    textareaTestId={`transformer-custom-params-textarea-${index}`}
                    applyTestId={`transformer-custom-params-apply-${index}`}
                  />
                </>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 2,
                  }}
                >
                  <details style={COLLAPSIBLE_TRACE_DETAILS_STYLE} open>
                    <summary
                      title="JSON config for this transformer. Use the field reference panel when available; Apply commits valid JSON."
                      style={{
                        ...traceSummaryRowStyle,
                        color: theme.text.secondary,
                      }}
                      data-testid={`transformer-config-summary-${index}`}
                    >
                      Configuration · {transformer.type}
                    </summary>
                    <ValidatedJsonTextarea
                      value={JSON.stringify(transformer, null, 2)}
                      onApply={(updated) => {
                        const next = list.map((t, i) =>
                          i === index ? (updated as TransformerConfig) : t
                        )
                        onChange?.(next)
                      }}
                      disabled={disabled}
                      applyVariant="icon"
                      textareaTestId="transformer-config-textarea"
                      applyTestId="transformer-config-apply"
                    />
                  </details>
                  {liveTraceSteps != null ? (
                    <div data-testid={`transformer-live-io-${index}`}>
                      <TransformerLiveTraceDetails
                        index={index}
                        step={step}
                        summaryRowStyle={traceSummaryRowStyle}
                        traceInputSummaryColor={traceInputSummaryColor}
                        traceOutputSummaryColor={traceOutputSummaryColor}
                        traceInputBrief={traceInputBrief}
                        traceOutputBrief={traceOutputBrief}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>

          </CopyableArea>
        )
      })
      )}
      {templateDialogTargetIndex !== null &&
        list[templateDialogTargetIndex] &&
        supportsTemplatePickers(list[templateDialogTargetIndex].type) && (
        <TransformerTemplateDialog
          isOpen={templateDialogOpen}
          onClose={() => {
            setTemplateDialogOpen(false)
            setTemplateDialogTargetIndex(null)
          }}
          transformerType={list[templateDialogTargetIndex].type as PresetTransformerType}
          currentConfig={list[templateDialogTargetIndex]}
          onLoadTemplate={(config) => {
            const next = list.map((t, i) =>
              i === templateDialogTargetIndex ? config : t
            )
            onChange?.(next)
            setTemplateDialogOpen(false)
            setTemplateDialogTargetIndex(null)
          }}
        />
      )}
    </div>
  )
}
