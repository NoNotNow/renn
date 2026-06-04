import { parse } from 'yaml'

export interface ChapterFrontmatter {
  keywords: string[]
  /** Optional extra plain text for in-app search indexing. */
  searchText?: string
}

export interface ParsedChapterMarkdown {
  frontmatter: ChapterFrontmatter
  body: string
}

export function parseChapterMarkdown(raw: string): ParsedChapterMarkdown {
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith('---')) {
    return { frontmatter: { keywords: [] }, body: raw }
  }

  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) {
    return { frontmatter: { keywords: [] }, body: raw }
  }

  const yamlBlock = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).replace(/^\n/, '')
  const parsed = parse(yamlBlock) as Partial<ChapterFrontmatter>

  return {
    frontmatter: {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
      searchText: typeof parsed.searchText === 'string' ? parsed.searchText : undefined,
    },
    body,
  }
}
