import { useEffect, useState } from 'react'
import type { TransformerConfig } from '@/types/transformer'
import CopyableArea from './CopyableArea'
import { fieldLabelStyle, iconButtonStyle, removeButtonStyle, removeButtonStyleDisabled } from './sharedStyles'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
} from '@/transformers/transformerPresets'

const baseTextareaStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  background: 'rgba(0, 0, 0, 0.3)',
  borderRadius: 4,
  fontSize: 11,
  overflow: 'auto',
  maxHeight: '200px',
  minHeight: 80,
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

  useEffect(() => {
    setDraftText(valueStr)
    setIsValid(true)
    setParsed(value)
  }, [valueStr, value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    setDraftText(next)
    try {
      const p = JSON.parse(next) as TransformerConfig
      setIsValid(true)
      setParsed(p)
    } catch {
      setIsValid(false)
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
        style={textareaStyle}
        spellCheck={false}
        data-testid="transformer-config-textarea"
      />
      {!isValid && (
        <span style={{ fontSize: 10, color: '#f87171' }}>Invalid JSON</span>
      )}
      <button
        type="button"
        onClick={() => onApply(parsed)}
        disabled={disabled || !isValid}
        style={{
          alignSelf: 'flex-end',
          padding: '4px 10px',
          fontSize: 11,
          background: isValid ? '#1e3a5f' : '#2a2a2a',
          border: isValid ? '1px solid #3b6ea8' : '1px solid #3a3a3a',
          color: isValid ? '#93c5fd' : '#666',
          borderRadius: 4,
          cursor: isValid && !disabled ? 'pointer' : 'not-allowed',
        }}
        data-testid="transformer-config-apply"
      >
        Apply
      </button>
    </div>
  )
}

export interface TransformerEditorProps {
  transformers?: TransformerConfig[]
  onChange?: (transformers: TransformerConfig[]) => void
  disabled?: boolean
}

export default function TransformerEditor({
  transformers,
  onChange,
  disabled = false,
}: TransformerEditorProps) {
  const [addSelectValue, setAddSelectValue] = useState('')
  const list = transformers ?? []

  const handleAddTransformer = (type: string) => {
    if (!type) return
    const config = getDefaultTransformerConfig(type)
    onChange?.([...list, config])
    setAddSelectValue('')
  }

  const handleRemoveTransformer = (index: number) => {
    const next = list.filter((_, i) => i !== index)
    onChange?.(next)
  }

  const handleMoveTransformer = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= list.length) return
    const next = [...list]
    ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
    onChange?.(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={fieldLabelStyle}>Add transformer</div>
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
        const priority = transformer.priority ?? 10
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
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, color: '#c4cbd8' }}>
                  {transformer.type}
                </span>
                <span style={{ fontSize: 11, color: '#9aa4b2' }}>
                  Priority: {priority}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: enabled ? '#4ade80' : '#9aa4b2',
                    fontWeight: enabled ? 600 : 400,
                  }}
                >
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  type="button"
                  onClick={() => handleMoveTransformer(index, 'up')}
                  disabled={disabled || index === 0}
                  style={{
                    ...iconButtonStyle,
                    color: '#9aa4b2',
                    opacity: disabled || index === 0 ? 0.4 : 0.8,
                    cursor: disabled || index === 0 ? 'not-allowed' : 'pointer',
                    padding: 2,
                    fontSize: 12,
                  }}
                  title="Move up"
                  data-testid="move-transformer-up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveTransformer(index, 'down')}
                  disabled={disabled || index === list.length - 1}
                  style={{
                    ...iconButtonStyle,
                    color: '#9aa4b2',
                    opacity: disabled || index === list.length - 1 ? 0.4 : 0.8,
                    cursor: disabled || index === list.length - 1 ? 'not-allowed' : 'pointer',
                    padding: 2,
                    fontSize: 12,
                  }}
                  title="Move down"
                  data-testid="move-transformer-down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveTransformer(index)}
                  disabled={disabled}
                style={{
                  ...removeButtonStyle,
                  ...(disabled && removeButtonStyleDisabled),
                  padding: '4px 8px',
                  fontSize: 11,
                }}
                title="Remove transformer"
                data-testid="remove-transformer"
              >
                Remove
              </button>
            </div>
            </div>

            <div style={{ marginTop: 6 }}>
              <div style={fieldLabelStyle}>Configuration:</div>
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
    </div>
  )
}
