import type { TransformerConfig } from '@/types/transformer'
import { fieldLabelStyle } from './sharedStyles'

export interface TransformerEditorProps {
  transformers?: TransformerConfig[]
}

export default function TransformerEditor({ transformers }: TransformerEditorProps) {
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
              <pre
                style={{
                  margin: 0,
                  padding: 8,
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#c4cbd8',
                  overflow: 'auto',
                  maxHeight: '200px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(transformer, null, 2)}
              </pre>
            </div>
          </div>
        )
      })}
    </div>
  )
}
