import type { CSSProperties, ReactNode } from 'react'

import { theme } from '@/config/theme'
import type { TransformerDocsLocale } from './glossary'
import { getGlossaryEntriesSorted } from './glossary'
import { ApiDocEntryList } from './ApiDocEntryList'
import {
  API_REFERENCE_SECTIONS,
  API_VEC_SECTION,
  ENVIRONMENT_STATE_ROWS,
  TRANSFORM_FUNCTION_INTRO,
  TRANSFORM_FUNCTION_SIGNATURE,
  TRANSFORM_TARGET_ROWS,
  apiReferencePlainText,
  type ApiDocSection,
} from './transformerApiReference'
import { TRANSFORM_FUNCTION_PARAMS } from './apiParamDocs'
import { attachApiExample } from './transformerApiExamples'
import { loadProseChapter, loadTransformerDocsChrome } from './loadTransformerDocContent'
import { TransformerDocMarkdown } from './TransformerDocMarkdown'

const subHeaderStyle: CSSProperties = {
  marginTop: 24,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 600,
  color: theme.text.primary,
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  margin: '16px 0',
  fontSize: '13px',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px',
  borderBottom: `2px solid ${theme.border.default}`,
  color: theme.text.muted,
  fontWeight: 600,
}

const tdStyle: CSSProperties = {
  padding: '10px',
  borderBottom: `1px solid ${theme.border.default}`,
  verticalAlign: 'top',
}

const monoTd: CSSProperties = {
  ...tdStyle,
  fontFamily: 'ui-monospace, monospace',
  whiteSpace: 'nowrap',
}

export interface TransformerDocChapter {
  id: string
  title: string
  content: ReactNode
  keywords: string[]
  plainText?: string
}

function t(locale: TransformerDocsLocale, en: string, de: string): string {
  return locale === 'de' ? de : en
}

export function transformerDocsChrome(locale: TransformerDocsLocale) {
  return loadTransformerDocsChrome(locale)
}

function renderApiSection(locale: TransformerDocsLocale, section: ApiDocSection) {
  const isMethodSection = section.id === 'api-vec' || section.id === 'api-runtime'
  return (
    <div key={section.id}>
      <h4 style={subHeaderStyle}>{t(locale, section.titleEn, section.titleDe)}</h4>
      {section.introEn && (
        <p style={{ marginBottom: 12 }}>{t(locale, section.introEn, section.introDe ?? section.introEn)}</p>
      )}
      <ApiDocEntryList
        locale={locale}
        rows={section.rows}
        paramsLabelEn={isMethodSection ? 'Parameters' : 'Details'}
        paramsLabelDe={isMethodSection ? 'Parameter' : 'Felder'}
      />
    </div>
  )
}

function glossaryChapter(locale: TransformerDocsLocale) {
  const chrome = transformerDocsChrome(locale)
  const rows = getGlossaryEntriesSorted()
  const expl = locale === 'de' ? 'de' : 'en'

  let plainPieces = chrome.glossaryNote
  for (const { entry } of rows) plainPieces += ` ${entry.label} ${expl === 'de' ? entry.de : entry.en}`

  return {
    plainText: plainPieces,
    keywords: ['glossary', 'glossar', 'dictionary', 'begriffe', 'tooltip', ...rows.map(({ entry }) => entry.label)],
    content: (
      <div lang={locale === 'de' ? 'de' : 'en'}>
        <p style={{ marginBottom: 16 }}>{chrome.glossaryNote}</p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{chrome.glossaryColTerm}</th>
              <th style={thStyle}>{chrome.glossaryColExplanation}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, entry }) => (
              <tr key={key}>
                <td style={monoTd}>
                  <abbr title={expl === 'de' ? entry.de : entry.en} style={{ cursor: 'help' }}>
                    {entry.label}
                  </abbr>
                </td>
                <td style={tdStyle}>{expl === 'de' ? entry.de : entry.en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  }
}

function apiReferenceChapter(locale: TransformerDocsLocale) {
  const de = locale === 'de'

  return {
    plainText: apiReferencePlainText(locale),
    keywords: [
      'api',
      'vec',
      'TransformInput',
      'TransformOutput',
      'raycast',
      'raycastSpread',
      'getAction',
      'offsetAlong',
      'angleBetween',
      'signedAngleAroundAxis',
      'projectOntoPlane',
      'getWorldPosition',
      'getStartPosition',
      'environment',
      'target',
      'signature',
      'referenz',
      'reference',
      'parameter',
    ],
    content: (
      <div lang={de ? 'de' : 'en'}>
        <p>{t(locale, TRANSFORM_FUNCTION_INTRO.en, TRANSFORM_FUNCTION_INTRO.de)}</p>

        <ApiDocEntryList
          locale={locale}
          rows={[
            attachApiExample({
              name: 'transform',
              signature: TRANSFORM_FUNCTION_SIGNATURE,
              callName: 'transform',
              type: 'TransformOutput | undefined',
              params: TRANSFORM_FUNCTION_PARAMS,
              en: 'Entry point called every physics step.',
              de: 'Wird in jedem Simulationsschritt einmal aufgerufen.',
            }),
          ]}
        />

        {API_REFERENCE_SECTIONS.map(section => renderApiSection(locale, section))}

        <h4 style={subHeaderStyle}>EnvironmentState (`input.environment`)</h4>
        <ApiDocEntryList locale={locale} rows={ENVIRONMENT_STATE_ROWS} />

        <h4 style={subHeaderStyle}>TransformTarget (`input.target`)</h4>
        <p style={{ marginBottom: 12 }}>
          {t(
            locale,
            'Set by targetPoseInput, follow, wanderer, or similar transformers earlier in the chain.',
            'Wird von targetPoseInput, follow, wanderer oder ähnlichen Transformern gesetzt. Der zuletzt schreibende Transformer bestimmt den Wert.',
          )}
        </p>
        <ApiDocEntryList locale={locale} rows={TRANSFORM_TARGET_ROWS} />

        <p style={{ fontSize: 12, color: theme.text.muted, marginTop: 16 }}>
          {t(
            locale,
            `Top-level ${API_VEC_SECTION.titleEn.toLowerCase()} and aliases are listed above. Prefer api.vec in new code.`,
            `Oben findest du Hilfsfunktionen für Vektoren (${API_VEC_SECTION.titleDe}) und Kurzformen. In neuem Code am besten api.vec verwenden.`,
          )}
        </p>
      </div>
    ),
  }
}

function proseChapter(locale: TransformerDocsLocale, chapterId: 'intro' | 'recipes' | 'troubleshooting') {
  const loaded = loadProseChapter(locale, chapterId)
  return {
    plainText: loaded.plainText,
    keywords: loaded.keywords,
    content: <TransformerDocMarkdown locale={locale} source={loaded.body} />,
  }
}

export function buildTransformerDocsChapters(locale: TransformerDocsLocale): TransformerDocChapter[] {
  const ct = loadTransformerDocsChrome(locale).chapterTitles

  return [
    { id: 'intro', title: ct.intro, ...proseChapter(locale, 'intro') },
    { id: 'api-reference', title: ct['api-reference'], ...apiReferenceChapter(locale) },
    { id: 'glossary', title: ct.glossary, ...glossaryChapter(locale) },
    { id: 'recipes', title: ct.recipes, ...proseChapter(locale, 'recipes') },
    { id: 'troubleshooting', title: ct.troubleshooting, ...proseChapter(locale, 'troubleshooting') },
  ]
}
