import { useEffect, useState } from 'react'
import type { TransformerConfig } from '@/types/transformer'
import { fieldLabelStyle } from './sharedStyles'

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
  onChange: (updated: TransformerConfig) => void
  disabled?: boolean
}

function TransformerConfigTextarea({
  value,
  onChange,
  disabled = false,
}: TransformerConfigTextareaProps) {
  const valueStr = JSON.stringify(value, null, 2)
  const [draftText, setDraftText] = useState(valueStr)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    setDraftText(valueStr)
  }, [valueStr])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    setDraftText(next)
    try {
      const parsed = JSON.parse(next) as TransformerConfig
      setIsValid(true)
      onChange(parsed)
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
    <textarea
      value={draftText}
      onChange={handleChange}
      disabled={disabled}
      style={textareaStyle}
      spellCheck={false}
      data-testid="transformer-config-textarea"
    />
  )
}

export interface TransformerEditorProps {
  transformers?: TransformerConfig[]
  onChange?: (transformers: TransformerConfig[]) => void
}

export default function TransformerEditor({
  transformers,
  onChange,
}: TransformerEditorProps) {
  if (!transformers || transformers.length === 0) {
    return (
      <div style={{ color: '#9aa4b2', fontSize: 12, fontStyle: 'italic' }}>
        No transformers configured
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {transformers.map((transformer, index) => {
        const priority = transformer.priority ?? 10
        const enabled = transformer.enabled ?? true

        return (
          <div
            key={index}
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
            </div>

            <div style={{ marginTop: 6 }}>
              <div style={fieldLabelStyle}>Configuration:</div>
              <TransformerConfigTextarea
                value={transformer}
                onChange={(updated) => {
                  const next = transformers.map((t, i) =>
                    i === index ? updated : t
                  )
                  onChange?.(next)
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
