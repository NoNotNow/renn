/** Escape text for use in an HTML attribute value. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

/**
 * Replace glossary link markers with `<doc-term>` elements for rehype-raw.
 *
 * - `{{termKey}}` — default glossary label
 * - `{{termKey|display}}` — plain display text
 * - `{{termKey|:display}}` — display wrapped in `<code>` (leading `:` on display)
 *
 * Keys must match glossary entries (see glossary.yaml).
 */
export function preprocessDocTerms(markdown: string): string {
  return markdown.replace(/\{\{([a-zA-Z0-9_]+)(?:\|(:?)([^}]+))?\}\}/g, (_match, termKey: string, codeFlag: string, label?: string) => {
    if (label !== undefined) {
      const asCode = codeFlag === ':'
      return `<doc-term data-term="${termKey}" data-label="${escapeAttr(label)}"${asCode ? ' data-code="true"' : ''}></doc-term>`
    }
    return `<doc-term data-term="${termKey}"></doc-term>`
  })
}
