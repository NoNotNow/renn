import { preprocessDocTerms } from './preprocessDocTerms'
import { TRANSFORMER_DOCS_GLOSSARY, type TransformerDocsGlossaryKey } from './glossary'

/** Strip markdown/HTML to a searchable plain-text blob. */
export function markdownToPlainText(markdown: string, locale: 'en' | 'de'): string {
  let text = preprocessDocTerms(markdown)

  text = text.replace(/<doc-term[^>]*data-term="([^"]+)"[^>]*(?:data-label="([^"]*)")?[^>]*><\/doc-term>/gi, (_m, term, label) => {
    const key = term as TransformerDocsGlossaryKey
    const entry = TRANSFORMER_DOCS_GLOSSARY[key]
    const display = label ? decodeHtmlEntities(label) : entry?.label ?? term
    const expl = entry ? (locale === 'de' ? entry.de : entry.en) : ''
    return `${display} ${expl}`.trim()
  })

  text = text.replace(/<p class="doc-muted">/gi, ' ')
  text = text.replace(/<\/p>/gi, ' ')
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, '$1')
  text = text.replace(/#{1,6}\s+/g, '')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/`([^`]+)`/g, '$1')
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
}
