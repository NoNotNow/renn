import type { CSSProperties, ReactNode } from 'react'

/** VS Code Dark+ style tokens (matches Monaco in transformer editor). */
const JS_COLORS = {
  text: '#d4d4d4',
  keyword: '#569cd6',
  string: '#ce9178',
  number: '#b5cea8',
  comment: '#6a9955',
  fn: '#dcdcaa',
  ident: '#9cdcfe',
  punct: '#d4d4d4',
} as const

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'new',
  'true',
  'false',
  'null',
  'undefined',
  'typeof',
])

const ROOT_IDS = new Set(['input', 'api', 'state', 'params', 'dt'])

type TokenKind = keyof typeof JS_COLORS

function span(text: string, kind: TokenKind, key: number): ReactNode {
  return (
    <span key={key} style={{ color: JS_COLORS[kind] }}>
      {text}
    </span>
  )
}

/**
 * Lightweight JS highlighter for doc snippets (no Monaco dependency).
 */
export function highlightJsCode(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let key = 0
  let afterDot = false
  let lastIndex = 0

  const re =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*\b)|([{}()[\].,;:?=+\-*/<>!&|]|\.{3})/g

  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    if (m.index > lastIndex) {
      out.push(span(code.slice(lastIndex, m.index), 'text', key++))
      afterDot = false
    }

    const [raw] = m
    if (m[1]) {
      out.push(span(raw, 'comment', key++))
      afterDot = false
    } else if (m[2]) {
      out.push(span(raw, 'string', key++))
      afterDot = false
    } else if (m[3]) {
      out.push(span(raw, 'number', key++))
      afterDot = false
    } else if (m[4]) {
      if (afterDot) out.push(span(raw, 'ident', key++))
      else if (KEYWORDS.has(raw)) out.push(span(raw, 'keyword', key++))
      else if (ROOT_IDS.has(raw)) out.push(span(raw, 'ident', key++))
      else if (/^[A-Z]/.test(raw)) out.push(span(raw, 'fn', key++))
      else out.push(span(raw, 'text', key++))
      afterDot = false
    } else {
      out.push(span(raw, 'punct', key++))
      afterDot = raw === '.'
    }

    lastIndex = m.index + raw.length
  }

  if (lastIndex < code.length) {
    out.push(span(code.slice(lastIndex), 'text', key++))
  }

  return out
}

export const docCodeBlockStyle: CSSProperties = {
  background: '#1e1e1e',
  color: JS_COLORS.text,
  padding: '10px 12px',
  borderRadius: '6px',
  overflowX: 'auto',
  fontSize: '12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  lineHeight: 1.5,
  margin: '10px 0 0',
  border: '1px solid #333',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
