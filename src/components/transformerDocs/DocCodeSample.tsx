import type { TransformerDocsLocale } from './glossary'
import { docCodeBlockStyle, highlightJsCode } from './highlightJsCode'

interface DocCodeSampleProps {
  code: string
  locale: TransformerDocsLocale
  /** When false, omit the "Example / Beispiel" heading (e.g. recipe chapters). */
  showLabel?: boolean
}

export function DocCodeSample({ code, locale, showLabel = true }: DocCodeSampleProps) {
  const label = locale === 'de' ? 'Beispiel' : 'Example'
  return (
    <div style={{ marginTop: showLabel ? 10 : 0 }}>
      {showLabel && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#888',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </div>
      )}
      <pre lang="en" style={docCodeBlockStyle}>
        <code>{highlightJsCode(code.trim())}</code>
      </pre>
    </div>
  )
}
