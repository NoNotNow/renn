/**
 * Shareable link to an example world: `?example=<id>` (only public/exampleWorlds/<id>/ worlds can be shared this way;
 * IndexedDB projects live in one browser only).
 */

export const EXAMPLE_WORLD_URL_PARAM = 'example'

export function readExampleWorldUrlParam(search: string): string | null {
  const id = new URLSearchParams(search).get(EXAMPLE_WORLD_URL_PARAM)?.trim()
  return id ? id : null
}

/** URL of the current page with `?example=<id>` set (or removed for null); other params are kept. */
export function withExampleWorldUrlParam(href: string, id: string | null): string {
  const url = new URL(href)
  if (id) url.searchParams.set(EXAMPLE_WORLD_URL_PARAM, id)
  else url.searchParams.delete(EXAMPLE_WORLD_URL_PARAM)
  return url.toString()
}

/** Writes the param into the address bar without a navigation. */
export function setExampleWorldUrlParam(id: string | null): void {
  if (typeof window === 'undefined') return
  const next = withExampleWorldUrlParam(window.location.href, id)
  if (next !== window.location.href) window.history.replaceState(window.history.state, '', next)
}
