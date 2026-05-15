import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { theme } from '@/config/theme'
import {
  readStoredTransformerDocsLocale,
  TRANSFORMER_DOCS_LOCALE_STORAGE_KEY,
  type TransformerDocsLocale,
} from '@/components/transformerDocs/glossary'
import {
  buildTransformerDocsChapters,
  transformerDocsChrome,
} from '@/components/transformerDocs/transformerDocsChapters'
import { TransformerDocsLocaleProvider } from '@/components/transformerDocs/TransformerDocsLocaleContext'

interface DocChapter {
  id: string
  title: string
  content: React.ReactNode
  keywords: string[]
  plainText?: string
}

export interface TransformerDocsProps {
  isOpen: boolean
  onClose: () => void
}

export interface TransformerDocsContentProps {
  /** If true, the chapters sidebar is collapsed into a simple list or hidden. */
  forceCollapsedChapters?: boolean
  /** Optional extra header element (like search bar). */
  headerExtra?: React.ReactNode
  /** Builder modal wires both for a localized modal title — embedded panel leaves them unset. */
  locale?: TransformerDocsLocale
  onLocaleChange?: (locale: TransformerDocsLocale) => void
}

export function TransformerDocsContent({
  forceCollapsedChapters = false,
  headerExtra,
  locale: controlledLocale,
  onLocaleChange,
}: TransformerDocsContentProps) {
  const [uncontrolledLocale, setUncontrolledLocale] = useState<TransformerDocsLocale>(() =>
    readStoredTransformerDocsLocale(),
  )

  const isControlled = controlledLocale !== undefined && onLocaleChange !== undefined
  const locale = isControlled ? controlledLocale : uncontrolledLocale

  const setLocale = useCallback(
    (next: TransformerDocsLocale) => {
      try {
        localStorage.setItem(TRANSFORMER_DOCS_LOCALE_STORAGE_KEY, next)
      } catch {
        /* noop */
      }
      if (isControlled) onLocaleChange(next)
      else setUncontrolledLocale(next)
    },
    [isControlled, onLocaleChange],
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [activeChapterId, setActiveChapterId] = useState('intro')
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const chapters: DocChapter[] = useMemo(() => buildTransformerDocsChapters(locale), [locale])

  const chrome = useMemo(() => transformerDocsChrome(locale), [locale])

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []

    const words = query.split(/\s+/).filter(w => w.length > 0)
    if (words.length === 0) return []

    return chapters
      .map(chapter => {
        const title = chapter.title.toLowerCase()
        const keywords = chapter.keywords.map(k => k.toLowerCase())
        const plainText = (chapter.plainText || '').toLowerCase()

        const allWordsMatch = words.every(
          word => title.includes(word) || keywords.some(k => k.includes(word)) || plainText.includes(word),
        )

        if (!allWordsMatch) return null

        let score = 0
        words.forEach(word => {
          if (title.includes(word)) score += 10
          if (keywords.some(k => k.includes(word))) score += 5
          if (plainText.includes(word)) score += 1
        })

        let snippet = chapter.title
        const firstWordInText = words.find(word => plainText.includes(word))

        if (firstWordInText && chapter.plainText) {
          const index = plainText.indexOf(firstWordInText)
          const start = Math.max(0, index - 40)
          const end = Math.min(chapter.plainText.length, index + firstWordInText.length + 40)
          snippet = chapter.plainText.substring(start, end)
          if (start > 0) snippet = '...' + snippet
          if (end < chapter.plainText.length) snippet = snippet + '...'
        }

        return { chapter, score, snippet }
      })
      .filter((r): r is { chapter: DocChapter; score: number; snippet: string } => r !== null)
      .sort((a, b) => b.score - a.score)
  }, [chapters, searchQuery])

  const activeChapter = chapters.find(c => c.id === activeChapterId) || chapters[0]

  useEffect(() => {
    if (!chapters.some(c => c.id === activeChapterId)) {
      setActiveChapterId(chapters[0]?.id ?? 'intro')
    }
  }, [chapters, activeChapterId])

  const handleResultClick = (chapterId: string) => {
    setActiveChapterId(chapterId)
    setIsSearching(false)
    setSearchQuery('')
  }

  const langToggle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginRight: 12 }}>
      <span style={{ fontSize: 12, color: theme.text.muted, whiteSpace: 'nowrap' }}>{chrome.languageLabel}</span>
      {(['en', 'de'] as const).map(code => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            borderRadius: 4,
            border: `1px solid ${locale === code ? theme.border.dropZoneActive : theme.border.default}`,
            background: locale === code ? theme.bg.surface : theme.bg.panelAlt,
            color: locale === code ? theme.text.primary : theme.text.muted,
            cursor: 'pointer',
            fontWeight: locale === code ? 600 : 400,
          }}
          aria-pressed={locale === code}
          aria-label={code === 'en' ? 'English' : 'Deutsch'}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )

  const searchBar = (
    <div style={{ position: 'relative', flex: 1, maxWidth: 300, marginLeft: headerExtra ? 20 : 0 }}>
      <input
        ref={searchInputRef}
        type="search"
        placeholder={chrome.searchPlaceholder}
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value)
          setIsSearching(e.target.value.trim().length > 0)
        }}
        onFocus={() => {
          if (searchQuery.trim().length > 0) setIsSearching(true)
        }}
        style={{
          width: '100%',
          padding: '6px 12px',
          background: theme.bg.input,
          border: `1px solid ${theme.border.default}`,
          borderRadius: 4,
          color: theme.text.primary,
          fontSize: 13,
          outline: 'none',
        }}
      />
      {isSearching && searchResults.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: theme.bg.panelAlt,
            border: `1px solid ${theme.border.default}`,
            borderRadius: '0 0 4px 4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 1000,
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {searchResults.map(({ chapter, snippet }) => (
            <div
              key={chapter.id}
              onClick={() => handleResultClick(chapter.id)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: `1px solid ${theme.border.default}`,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg.surface)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: theme.text.primary }}>
                {chapter.title}
              </div>
              <div style={{ fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>{snippet}</div>
            </div>
          ))}
        </div>
      )}
      {isSearching && searchResults.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: theme.bg.panelAlt,
            border: `1px solid ${theme.border.default}`,
            borderRadius: '0 0 4px 4px',
            padding: '12px',
            color: theme.text.muted,
            fontSize: 12,
            zIndex: 1000,
          }}
        >
          {chrome.noResults(searchQuery)}
        </div>
      )}
    </div>
  )

  return (
    <TransformerDocsLocaleProvider locale={locale}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          color: theme.text.primary,
          overflow: 'hidden',
        }}
      >
        {(headerExtra || searchBar) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingBottom: 12,
              borderBottom: `1px solid ${theme.border.default}`,
              marginBottom: 16,
            }}
          >
            {langToggle}
            {headerExtra}
            {searchBar}
          </div>
        )}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {!forceCollapsedChapters && (
            <div
              style={{
                width: 180,
                borderRight: `1px solid ${theme.border.default}`,
                display: 'flex',
                flexDirection: 'column',
                paddingRight: 12,
                flexShrink: 0,
              }}
            >
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {chapters.map(chapter => (
                  <div
                    key={chapter.id}
                    onClick={() => setActiveChapterId(chapter.id)}
                    style={{
                      padding: '8px 10px',
                      cursor: 'pointer',
                      borderRadius: 4,
                      marginBottom: 2,
                      fontSize: 13,
                      background: activeChapterId === chapter.id ? theme.bg.surface : 'transparent',
                      color: activeChapterId === chapter.id ? theme.text.primary : theme.text.muted,
                      transition: 'all 0.15s ease',
                      fontWeight: activeChapterId === chapter.id ? 600 : 400,
                      lineHeight: 1.3,
                    }}
                    onMouseEnter={(e) => {
                      if (activeChapterId !== chapter.id) {
                        e.currentTarget.style.background = theme.bg.panel
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeChapterId !== chapter.id) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    {chapter.title}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, paddingLeft: forceCollapsedChapters ? 0 : 20, overflowY: 'auto' }}>
            {forceCollapsedChapters && (
              <div style={{ marginBottom: 16 }}>
                <select
                  value={activeChapterId}
                  onChange={(e) => setActiveChapterId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    borderRadius: 4,
                    border: `1px solid ${theme.border.default}`,
                    background: theme.bg.panelAlt,
                    color: theme.text.primary,
                  }}
                >
                  {chapters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <h2
              style={{
                marginTop: 0,
                marginBottom: 16,
                borderBottom: `1px solid ${theme.border.default}`,
                paddingBottom: 8,
                fontSize: 18,
              }}
            >
              {activeChapter.title}
            </h2>
            <div style={{ lineHeight: 1.6, fontSize: 14 }}>{activeChapter.content}</div>
          </div>
        </div>
      </div>
    </TransformerDocsLocaleProvider>
  )
}

export default function TransformerDocs({ isOpen, onClose }: TransformerDocsProps) {
  const [locale, setLocale] = useState<TransformerDocsLocale>(() => readStoredTransformerDocsLocale())
  const chrome = useMemo(() => transformerDocsChrome(locale), [locale])

  useEffect(() => {
    if (!isOpen) return
    setLocale(readStoredTransformerDocsLocale())
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={chrome.modalTitle} width={900} height={700}>
      <TransformerDocsContent locale={locale} onLocaleChange={setLocale} />
    </Modal>
  )
}
