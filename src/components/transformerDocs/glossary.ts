/**
 * Bilingual explanations for API/code tokens used in transformer authoring docs.
 * Data: content/glossary.yaml (edit there; keys typed in glossaryKeys.ts).
 */

import { parse } from 'yaml'

import glossaryYaml from './content/glossary.yaml?raw'
import type { TransformerDocsGlossaryKey } from './glossaryKeys'

export type { TransformerDocsGlossaryKey } from './glossaryKeys'

export type TransformerDocsLocale = 'en' | 'de'

export const TRANSFORMER_DOCS_LOCALE_STORAGE_KEY = 'rennTransformerDocsLocale'

export function readStoredTransformerDocsLocale(): TransformerDocsLocale {
  try {
    const v = localStorage.getItem(TRANSFORMER_DOCS_LOCALE_STORAGE_KEY)
    if (v === 'de' || v === 'en') return v
  } catch {
    /* private mode etc. */
  }
  return 'en'
}

export interface TransformerGlossaryEntry {
  /** Exact token as authors type it in code (or short API name). */
  label: string
  en: string
  de: string
}

export const TRANSFORMER_DOCS_GLOSSARY = parse(glossaryYaml) as Record<
  TransformerDocsGlossaryKey,
  TransformerGlossaryEntry
>

/** Rows for glossary chapter: stable sort by English label */
export function getGlossaryEntriesSorted(): { key: TransformerDocsGlossaryKey; entry: TransformerGlossaryEntry }[] {
  const keys = Object.keys(TRANSFORMER_DOCS_GLOSSARY) as TransformerDocsGlossaryKey[]
  return keys
    .map(key => ({ key, entry: TRANSFORMER_DOCS_GLOSSARY[key] }))
    .sort((a, b) => a.entry.label.localeCompare(b.entry.label, 'en', { sensitivity: 'base' }))
}
