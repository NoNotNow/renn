/** Pixel width of `IN: …` / `OUT: …` trace rows on transformer pipeline cards. */
export type TransformerTraceBriefKind = 'IN' | 'OUT'

const TRACE_BRIEF_ROW_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  left: '-9999px',
  top: '0',
  visibility: 'hidden',
  whiteSpace: 'nowrap',
  fontSize: '10px',
  padding: '0 6px',
  pointerEvents: 'none',
}

let measureEl: HTMLSpanElement | null = null

function getMeasureEl(): HTMLSpanElement | null {
  if (typeof document === 'undefined') return null
  if (!measureEl) {
    measureEl = document.createElement('span')
    measureEl.setAttribute('aria-hidden', 'true')
    Object.assign(measureEl.style, TRACE_BRIEF_ROW_STYLE)
    document.body.appendChild(measureEl)
  }
  return measureEl
}

export function formatTransformerTraceBriefLine(kind: TransformerTraceBriefKind, brief: string): string {
  return `${kind}: ${brief}`
}

/** Matches the hidden sizer rows on pipeline cards (font comes from the card). */
export function measureTransformerTraceBriefLineWidth(
  kind: TransformerTraceBriefKind,
  brief: string,
  font: string,
): number {
  const el = getMeasureEl()
  if (!el) return brief.length
  el.style.font = font
  el.textContent = formatTransformerTraceBriefLine(kind, brief)
  return el.getBoundingClientRect().width
}

export function isTransformerTraceBriefLineWider(
  kind: TransformerTraceBriefKind,
  nextBrief: string,
  prevBrief: string,
  font: string,
): boolean {
  if (nextBrief === prevBrief) return false
  return (
    measureTransformerTraceBriefLineWidth(kind, nextBrief, font) >
    measureTransformerTraceBriefLineWidth(kind, prevBrief, font)
  )
}

/** Test hook — reset singleton between Vitest cases. */
export function resetTransformerTraceBriefMeasureForTests(): void {
  measureEl?.remove()
  measureEl = null
}
