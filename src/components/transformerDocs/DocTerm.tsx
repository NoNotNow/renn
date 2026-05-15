import type { CSSProperties, ReactNode } from 'react'

import { TRANSFORMER_DOCS_GLOSSARY } from './glossary'
import type { TransformerDocsGlossaryKey } from './glossary'
import { useTransformerDocsLocale } from './TransformerDocsLocaleContext'

const abbrStyle: CSSProperties = {
  cursor: 'help',
  textUnderlineOffset: 2,
  textDecoration: 'underline dotted',
  textDecorationSkipInk: 'none',
}

interface DocTermProps {
  term: TransformerDocsGlossaryKey
  /** Rendered verbatim (e.g. <code>car2</code>); glossary label is fallback if omitted */
  children?: ReactNode
}

/**
 * English API/code artifact with bilingual explanation tooltip (dictionary text).
 */
export function DocTerm({ term, children }: DocTermProps) {
  const locale = useTransformerDocsLocale()
  const entry = TRANSFORMER_DOCS_GLOSSARY[term]
  const title = locale === 'de' ? entry.de : entry.en
  return (
    <abbr title={title} lang="en" style={abbrStyle}>
      {children ?? entry.label}
    </abbr>
  )
}
