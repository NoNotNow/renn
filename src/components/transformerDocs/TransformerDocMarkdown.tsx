import type { CSSProperties } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

import { theme } from '@/config/theme'
import type { TransformerDocsGlossaryKey } from './glossary'
import type { TransformerDocsLocale } from './glossary'
import { DocTerm } from './DocTerm'
import { DocCodeSample } from './DocCodeSample'
import { preprocessDocTerms } from './preprocessDocTerms'

const proseStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: theme.text.primary,
}

const subHeaderStyle: CSSProperties = {
  marginTop: 24,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 600,
  color: theme.text.primary,
}

const h3Style: CSSProperties = {
  ...subHeaderStyle,
  marginTop: 20,
}

const h4Style: CSSProperties = {
  ...subHeaderStyle,
  fontSize: 15,
}

const mutedStyle: CSSProperties = {
  fontSize: 13,
  color: theme.text.muted,
  marginTop: 8,
  marginBottom: 0,
}

const listStyle: CSSProperties = {
  margin: '12px 0',
  paddingLeft: 22,
}

interface DocTermElementProps {
  'data-term'?: string
  'data-label'?: string
  'data-code'?: string
}

function DocTermElement({ 'data-term': term, 'data-label': label, 'data-code': asCode }: DocTermElementProps) {
  if (!term) return null
  const key = term as TransformerDocsGlossaryKey
  if (label) {
    return <DocTerm term={key}>{asCode === 'true' ? <code>{label}</code> : label}</DocTerm>
  }
  return <DocTerm term={key} />
}

interface TransformerDocMarkdownProps {
  locale: TransformerDocsLocale
  source: string
  lang?: string
}

export function TransformerDocMarkdown({ locale, source, lang }: TransformerDocMarkdownProps) {
  const processed = preprocessDocTerms(source)

  const components = {
    'doc-term': DocTermElement,
    p: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      if (className === 'doc-muted') {
        return <p style={mutedStyle}>{children}</p>
      }
      return <p style={{ margin: '0 0 12px' }}>{children}</p>
    },
    h3: ({ children }: { children?: React.ReactNode }) => <h3 style={h3Style}>{children}</h3>,
    h4: ({ children }: { children?: React.ReactNode }) => <h4 style={h4Style}>{children}</h4>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul style={listStyle}>{children}</ul>,
    li: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: 8 }}>{children}</li>,
    strong: ({ children }: { children?: React.ReactNode }) => <strong>{children}</strong>,
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      if (className) return <code className={className}>{children}</code>
      return <code>{children}</code>
    },
    pre: ({ children }: { children?: React.ReactNode }) => {
      const child = Array.isArray(children) ? children[0] : children
      if (
        child &&
        typeof child === 'object' &&
        'props' in child &&
        child.props &&
        typeof child.props === 'object' &&
        'children' in child.props
      ) {
        const codeText = String(child.props.children).replace(/\n$/, '')
        return <DocCodeSample locale={locale} code={codeText} showLabel={false} />
      }
      return <pre>{children}</pre>
    },
  } as Components

  return (
    <div lang={lang ?? (locale === 'de' ? 'de' : 'en')} style={proseStyle}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  )
}
