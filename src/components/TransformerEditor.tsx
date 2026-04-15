import { useEffect, useState } from 'react'
import type { PresetTransformerType, TransformerConfig } from '@/types/transformer'
import CopyableArea from './CopyableArea'
import TransformerFieldReference from './TransformerFieldReference'
import TransformerTemplateDialog from './TransformerTemplateDialog'
import { fieldLabelStyle, entityPanelIconButtonStyle, removeButtonStyle, removeButtonStyleDisabled } from './sharedStyles'
import { EntityPanelIcons } from './EntityPanelIcons'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
  isPresetTransformerType,
} from '@/transformers/transformerPresets'
import { jsonTextareaRows } from '@/utils/jsonTextareaRows'

function padFieldRefPanelOpen(open: boolean[], length: number): boolean[] {
  return Array.from({ length }, (_, i) => open[i] ?? false)
}

const baseTextareaStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  background: 'rgba(0, 0, 0, 0.3)',
  borderRadius: 4,
  fontSize: 11,
  overflow: 'auto',
  fontFamily: 'monospace',
  whiteSpace: 'pre',
  resize: 'vertical',
  width: '100%',
  boxSizing: 'border-box',
}

export interface TransformerConfigTextareaProps {
  value: TransformerConfig
  onApply: (updated: TransformerConfig) => void
  disabled?: boolean
}

function TransformerConfigTextarea({
  value,
  onApply,
  disabled = false,
}: TransformerConfigTextareaProps) {
  const valueStr = JSON.stringify(value, null, 2)
  const [draftText, setDraftText] = useState(valueStr)
  const [isValid, setIsValid] = useState(true)
  const [parsed, setParsed] = useState<TransformerConfig>(value)
  const [parseError, setParseError] = useState<string | null>(null)

  const extractJsonErrorPosition = (message: string): number | null => {
    const m = /position (\d+)/i.exec(message)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) ? n : null
  }

  const lineColFromPosition = (text: string, pos: number): { line: number; col: number; lineText: string } => {
    const before = text.slice(0, pos)
    const parts = before.split('\n')
    const line = parts.length
    const col = parts[parts.length - 1]!.length + 1
    const lineStart = before.lastIndexOf('\n') + 1
    const lineEnd = text.indexOf('\n', pos)
    const end = lineEnd >= 0 ? lineEnd : text.length
    const lineText = text.slice(lineStart, end)
    return { line, col, lineText }
  }

  useEffect(() => {
    setDraftText(valueStr)
    setIsValid(true)
    setParsed(value)
    setParseError(null)
  }, [valueStr, value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    setDraftText(next)
    try {
      const p = JSON.parse(next) as TransformerConfig
      setIsValid(true)
      setParsed(p)
      setParseError(null)
    } catch (err) {
      setIsValid(false)
      const msg = err instanceof Error ? err.message : String(err)
      setParseError(msg || 'Invalid JSON')
    }
  }

  const textareaStyle: React.CSSProperties = {
    ...baseTextareaStyle,
    color: isValid ? '#c4cbd8' : '#f87171',
    border: isValid ? '1px solid #2f3545' : '1px solid #dc2626',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        value={draftText}
        onChange={handleChange}
        disabled={disabled}
        rows={jsonTextareaRows(draftText)}
        style={textareaStyle}
        spellCheck={false}
        data-testid="transformer-config-textarea"
      />
      {!isValid && (
        <span style={{ fontSize: 10, color: '#f87171' }}>
          Invalid JSON{parseError ? `: ${parseError}` : ''}
        </span>
      )}
      {!isValid && parseError ? (
        (() => {
          const pos = extractJsonErrorPosition(parseError)
          if (pos == null) return null
          const { line, col, lineText } = lineColFromPosition(draftText, pos)
          return (
            <pre style={{ margin: 0, fontSize: 10, color: '#f87171', fontFamily: 'monospace' }}>
              {`Line ${line}, Col ${col}\n${lineText}\n${' '.repeat(Math.max(0, col - 1))}^`}
            </pre>
          )
        })()
      ) : null}
      <button
        type="button"
        onClick={() => onApply(parsed)}
        disabled={disabled || !isValid}
        title="Apply"
        aria-label="Apply configuration"
        style={{
          ...entityPanelIconButtonStyle,
          alignSelf: 'flex-end',
          background: isValid ? '#1e3a5f' : '#2a2a2a',
          border: isValid ? '1px solid #3b6ea8' : '1px solid #3a3a3a',
          color: isValid ? '#93c5fd' : '#666',
          cursor: isValid && !disabled ? 'pointer' : 'not-allowed',
        }}
        data-testid="transformer-config-apply"
      >
        {EntityPanelIcons.check}
      </button>
    </div>
  )
}

export interface TransformerEditorProps {
  transformers?: TransformerConfig[]
  /** Multi-select: stacks differ; edits replace all selected entities' stacks. */
  transformersMixed?: boolean
  onChange?: (transformers: TransformerConfig[]) => void
  disabled?: boolean
}

export default function TransformerEditor({
  transformers,
  transformersMixed = false,
  onChange,
  disabled = false,
}: TransformerEditorProps) {
  const [addSelectValue, setAddSelectValue] = useState('')
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateDialogTargetIndex, setTemplateDialogTargetIndex] = useState<number | null>(null)
  const [fieldRefPanelOpen, setFieldRefPanelOpen] = useState<boolean[]>([])
  const list = transformers ?? []

  useEffect(() => {
    setFieldRefPanelOpen((prev) => padFieldRefPanelOpen(prev, list.length))
  }, [list.length])

  const handleAddTransformer = (type: string) => {
    if (!type) return
    const config = getDefaultTransformerConfig(type)
    onChange?.([...list, config])
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
        <p style={{ margin: 0, fontSize: 12, color: '#9aa4b2' }}>
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
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid #2f3545',
            borderRadius: 4,
            color: '#c4cbd8',
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
        <div style={{ color: '#9aa4b2', fontSize: 12, fontStyle: 'italic' }}>
          No transformers configured
        </div>
      ) : (
        list.map((transformer, index) => {
        const enabled = transformer.enabled ?? true

        return (
          <CopyableArea
            key={index}
            copyPayload={transformer}
            style={{
              padding: 8,
              border: '1px solid #2f3545',
              borderRadius: 4,
              background: 'rgba(17, 20, 28, 0.4)',
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
                <span style={{ fontWeight: 600, color: '#c4cbd8', flexShrink: 0 }}>
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
                      background: enabled ? '#4ade80' : '#ef4444',
                      pointerEvents: 'none',
                    }}
                  />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {isPresetTransformerType(transformer.type) && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateDialogTargetIndex(index)
                        setTemplateDialogOpen(true)
                      }}
                      disabled={disabled}
                      style={{
                        ...entityPanelIconButtonStyle,
                        color: '#93c5fd',
                        border: '1px solid #3b6ea8',
                        background: '#1e3a5f',
                      }}
                      title="Load template"
                      aria-label="Load template"
                      data-testid="load-transformer-template"
                    >
                      {EntityPanelIcons.loadTemplate}
                    </button>
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
                        color: '#93c5fd',
                        border:
                          fieldRefPanelOpen[index] ?? false
                            ? '1px solid #60a5fa'
                            : '1px solid #3b6ea8',
                        background:
                          fieldRefPanelOpen[index] ?? false ? '#1e40af' : '#1e3a5f',
                      }}
                      title={
                        fieldRefPanelOpen[index] ?? false
                          ? 'Hide field reference'
                          : 'Show field reference'
                      }
                      aria-label={
                        fieldRefPanelOpen[index] ?? false
                          ? 'Hide field reference'
                          : 'Show field reference'
                      }
                      data-testid="transformer-field-reference-toggle"
                    >
                      {EntityPanelIcons.document}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleMoveTransformer(index, 'up')}
                  disabled={disabled || index === 0}
                  style={{
                    ...entityPanelIconButtonStyle,
                    minWidth: 24,
                    minHeight: 24,
                    padding: 2,
                    color: '#9aa4b2',
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
                    color: '#9aa4b2',
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
                      color: '#9aa4b2',
                      lineHeight: 1.35,
                    }}
                  >
                    No built-in field reference for this transformer type. Edit JSON carefully or
                    switch to a preset type.
                  </p>
                </div>
              )}
              <div
                style={{ ...fieldLabelStyle, cursor: 'help' }}
                title="JSON config for this transformer. Use the field reference panel when available; Apply commits valid JSON."
              >
                Configuration:
              </div>
              <TransformerConfigTextarea
                value={transformer}
                onApply={(updated) => {
                  const next = list.map((t, i) =>
                    i === index ? updated : t
                  )
                  onChange?.(next)
                }}
                disabled={disabled}
              />
            </div>
          </CopyableArea>
        )
      })
      )}
      {templateDialogTargetIndex !== null && list[templateDialogTargetIndex] && (
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
