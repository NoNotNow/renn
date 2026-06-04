import { parse } from 'yaml'

import type { TransformerDocsLocale } from './glossary'
import { parseChapterMarkdown } from './parseChapterMarkdown'
import { markdownToPlainText } from './markdownPlainText'

import chromeEnRaw from './content/chrome.en.yaml?raw'
import chromeDeRaw from './content/chrome.de.yaml?raw'
import introEnRaw from './content/en/intro.md?raw'
import introDeRaw from './content/de/intro.md?raw'
import recipesEnRaw from './content/en/recipes.md?raw'
import recipesDeRaw from './content/de/recipes.md?raw'
import troubleshootingEnRaw from './content/en/troubleshooting.md?raw'
import troubleshootingDeRaw from './content/de/troubleshooting.md?raw'

export interface TransformerDocsChromeConfig {
  modalTitle: string
  searchPlaceholder: string
  noResultsTemplate: string
  languageLabel: string
  glossaryNote: string
  glossaryColTerm: string
  glossaryColExplanation: string
  chapterTitles: Record<string, string>
}

export interface ProseChapterContent {
  body: string
  keywords: string[]
  plainText: string
}

const CHROME_BY_LOCALE: Record<TransformerDocsLocale, TransformerDocsChromeConfig> = {
  en: parse(chromeEnRaw) as TransformerDocsChromeConfig,
  de: parse(chromeDeRaw) as TransformerDocsChromeConfig,
}

const PROSE_RAW: Record<TransformerDocsLocale, Record<'intro' | 'recipes' | 'troubleshooting', string>> = {
  en: { intro: introEnRaw, recipes: recipesEnRaw, troubleshooting: troubleshootingEnRaw },
  de: { intro: introDeRaw, recipes: recipesDeRaw, troubleshooting: troubleshootingDeRaw },
}

export function loadTransformerDocsChrome(locale: TransformerDocsLocale) {
  const config = CHROME_BY_LOCALE[locale]
  return {
    modalTitle: config.modalTitle,
    searchPlaceholder: config.searchPlaceholder,
    noResults: (q: string) => config.noResultsTemplate.replace('{q}', q),
    languageLabel: config.languageLabel,
    glossaryNote: config.glossaryNote,
    glossaryColTerm: config.glossaryColTerm,
    glossaryColExplanation: config.glossaryColExplanation,
    chapterTitles: config.chapterTitles,
  }
}

export function loadProseChapter(
  locale: TransformerDocsLocale,
  chapterId: 'intro' | 'recipes' | 'troubleshooting',
): ProseChapterContent {
  const raw = PROSE_RAW[locale][chapterId]
  const { frontmatter, body } = parseChapterMarkdown(raw)
  const plainFromMd = markdownToPlainText(body, locale)
  const plainText = [frontmatter.searchText, plainFromMd].filter(Boolean).join(' ').trim()

  return {
    body,
    keywords: frontmatter.keywords,
    plainText,
  }
}
