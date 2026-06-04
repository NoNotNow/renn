import type { CSSProperties, ReactNode } from 'react'

import { theme } from '@/config/theme'
import type { TransformerDocsLocale } from './glossary'
import type { ApiDocParam } from './apiParamDocs'
import { paramLabel } from './apiParamDocs'
import type { ApiDocRow } from './transformerApiReference'
import { attachExamplesToRows } from './transformerApiExamples'
import { DocCodeSample } from './DocCodeSample'

const entryStyle: CSSProperties = {
  borderBottom: `1px solid ${theme.border.default}`,
  padding: '14px 0',
}

const callNameStyle: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 13,
  fontWeight: 600,
  color: theme.text.primary,
  marginBottom: 6,
  wordBreak: 'break-word',
}

const returnsStyle: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
  color: theme.text.muted,
  marginBottom: 8,
}

const descStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  marginBottom: 0,
}

const paramsHeaderStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: theme.text.muted,
  marginTop: 10,
  marginBottom: 6,
}

const paramBlockStyle: CSSProperties = {
  marginBottom: 8,
  paddingLeft: 10,
  borderLeft: `2px solid ${theme.border.default}`,
}

const paramNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 2,
}

const paramTypeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  color: theme.text.muted,
  marginBottom: 2,
}

const paramDescStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: theme.text.primary,
}

function t(locale: TransformerDocsLocale, en: string, de: string): string {
  return locale === 'de' ? de : en
}

function renderParamList(locale: TransformerDocsLocale, params: ApiDocParam[], paramsLabel: string): ReactNode {
  return (
    <>
      <div style={paramsHeaderStyle}>{paramsLabel}</div>
      {params.map(p => (
        <div key={p.name} style={paramBlockStyle}>
          <div style={paramNameStyle}>
            {paramLabel(locale, p)}
            {p.optional ? (locale === 'de' ? ' — optional' : ' — optional') : null}
          </div>
          {p.type && (
            <div style={paramTypeStyle}>
              <code lang="en">{p.type}</code>
            </div>
          )}
          <div style={paramDescStyle}>{t(locale, p.en, p.de)}</div>
        </div>
      ))}
    </>
  )
}

function renderParamLines(params: ApiDocParam[]): ReactNode {
  return (
    <div
      lang="en"
      style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        color: theme.text.muted,
        lineHeight: 1.5,
        marginBottom: 4,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {'(\n'}
      {params.map((p, i) => (
        <span key={p.name}>
          {'  '}
          {p.name}
          {p.optional ? '?' : ''}
          {i < params.length - 1 ? ',\n' : '\n'}
        </span>
      ))}
      {')'}
    </div>
  )
}

export interface ApiDocEntryListProps {
  locale: TransformerDocsLocale
  rows: ApiDocRow[]
  paramsLabelEn?: string
  paramsLabelDe?: string
}

export function ApiDocEntryList({
  locale,
  rows,
  paramsLabelEn = 'Parameters',
  paramsLabelDe = 'Parameter',
}: ApiDocEntryListProps) {
  const paramsLabel = t(locale, paramsLabelEn, paramsLabelDe)
  const returnsLabel = t(locale, 'Returns', 'Rückgabe')
  const typeLabel = t(locale, 'Type', 'Typ')

  return (
    <div style={{ margin: '12px 0' }}>
      {attachExamplesToRows(rows).map(row => {
        const displayName = row.callName ?? row.signature
        const hasParams = row.params && row.params.length > 0
        const fieldLabel =
          locale === 'de' ? row.fieldLabelDe ?? row.name : row.fieldLabelEn ?? row.name

        return (
          <article key={`${row.name}-${row.signature}`} style={entryStyle}>
            <div lang="en" style={callNameStyle}>
              <code>{displayName}</code>
            </div>

            {hasParams ? renderParamLines(row.params!) : null}

            {!hasParams && row.signature !== row.name && row.signature !== displayName && (
              <div lang="en" style={returnsStyle}>
                <code>{row.signature}</code>
              </div>
            )}

            {!hasParams && row.signature === row.name && (
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {fieldLabel}{' '}
                <span lang="en" style={{ fontWeight: 400, color: theme.text.muted }}>
                  (<code>{row.name}</code>)
                </span>
              </div>
            )}

            {row.type && (
              <div style={returnsStyle}>
                {hasParams || row.callName ? returnsLabel : typeLabel}:{' '}
                <code lang="en">{row.type}</code>
              </div>
            )}

            <p style={descStyle}>{t(locale, row.en, row.de)}</p>

            {hasParams ? renderParamList(locale, row.params!, paramsLabel) : null}

            {row.example ? <DocCodeSample locale={locale} code={row.example} /> : null}
          </article>
        )
      })}
    </div>
  )
}
