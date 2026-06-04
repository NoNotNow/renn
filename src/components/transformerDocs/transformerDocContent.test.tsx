import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { TRANSFORMER_DOCS_GLOSSARY } from './glossary'
import glossaryYaml from './content/glossary.yaml?raw'
import { parse } from 'yaml'
import { parseChapterMarkdown } from './parseChapterMarkdown'
import { preprocessDocTerms } from './preprocessDocTerms'
import { markdownToPlainText } from './markdownPlainText'
import { loadProseChapter, loadTransformerDocsChrome } from './loadTransformerDocContent'
import { buildTransformerDocsChapters } from './transformerDocsChapters'
import { TransformerDocsLocaleProvider } from './TransformerDocsLocaleContext'
import { TransformerDocMarkdown } from './TransformerDocMarkdown'

import introEnRaw from './content/en/intro.md?raw'
import introDeRaw from './content/de/intro.md?raw'
import recipesEnRaw from './content/en/recipes.md?raw'
import recipesDeRaw from './content/de/recipes.md?raw'
import troubleshootingEnRaw from './content/en/troubleshooting.md?raw'
import troubleshootingDeRaw from './content/de/troubleshooting.md?raw'

const PROSE_TERM_RE = /\{\{([a-zA-Z0-9_]+)(?:\|[^}]*)?\}\}/g

function collectDocTerms(markdown: string): string[] {
  return [...markdown.matchAll(PROSE_TERM_RE)].map(m => m[1])
}

describe('transformer doc content', () => {
  it('loads glossary.yaml with the same keys as TRANSFORMER_DOCS_GLOSSARY', () => {
    const fromYaml = Object.keys(parse(glossaryYaml)).sort()
    const fromModule = Object.keys(TRANSFORMER_DOCS_GLOSSARY).sort()
    expect(fromModule).toEqual(fromYaml)
    expect(fromModule.length).toBe(58)
  })

  it('EN and DE prose chapters use only valid glossary term keys', () => {
    const glossaryKeys = new Set(Object.keys(TRANSFORMER_DOCS_GLOSSARY))
    const files = [introEnRaw, introDeRaw, recipesEnRaw, recipesDeRaw, troubleshootingEnRaw, troubleshootingDeRaw]

    for (const raw of files) {
      const { body } = parseChapterMarkdown(raw)
      for (const term of collectDocTerms(body)) {
        expect(glossaryKeys.has(term), `unknown term "${term}"`).toBe(true)
      }
    }
  })

  it('preprocessDocTerms emits doc-term elements with optional code flag', () => {
    const out = preprocessDocTerms('Hello {{custom_transformer|:custom}} world')
    expect(out).toContain('data-term="custom_transformer"')
    expect(out).toContain('data-code="true"')
    expect(out).toContain('data-label="custom"')
  })

  it('markdownToPlainText includes glossary explanations', () => {
    const text = markdownToPlainText('Use {{api|api}} here.', 'en')
    expect(text).toContain('api')
    expect(text).toContain('TransformerRuntimeApi')
  })

  it('loadTransformerDocsChrome returns chapter titles for both locales', () => {
    expect(loadTransformerDocsChrome('en').chapterTitles.intro).toBe('Overview')
    expect(loadTransformerDocsChrome('de').chapterTitles.intro).toBe('Überblick')
  })

  it('buildTransformerDocsChapters renders intro with custom transformer term', () => {
    const intro = buildTransformerDocsChapters('en').find(c => c.id === 'intro')
    expect(intro?.title).toBe('Overview')
    expect(intro?.plainText).toMatch(/custom/i)

    render(
      <TransformerDocsLocaleProvider locale="en">
        {intro?.content}
      </TransformerDocsLocaleProvider>,
    )
    expect(screen.getByText('custom', { selector: 'code' })).toBeTruthy()
  })

  it('TransformerDocMarkdown renders a fenced code block', () => {
    const { container } = render(
      <TransformerDocsLocaleProvider locale="en">
        <TransformerDocMarkdown
          locale="en"
          source={`\`\`\`javascript\nconst x = 1;\n\`\`\``}
        />
      </TransformerDocsLocaleProvider>,
    )
    expect(container.textContent).toContain('const x = 1;')
  })

  it('loadProseChapter includes code in plainText for recipes', () => {
    const recipes = loadProseChapter('en', 'recipes')
    expect(recipes.plainText).toContain('raycastSpread')
    expect(recipes.plainText).toContain('function transform')
  })
})
