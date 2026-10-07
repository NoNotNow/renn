/**
 * Shareable link to an example world: `?example=<id>` (only public/exampleWorlds/<id>/ worlds can be shared this way;
 * IndexedDB projects live in one browser only). Optional `&entity=<id>` (selected entity) and `&tool=<gizmo mode>`
 * (e.g. `visualize` = Visualize custom transformer variables) restore the Builder view; they only exist next to `example`.
 */

export const EXAMPLE_WORLD_URL_PARAM = 'example'
export const EXAMPLE_ENTITY_URL_PARAM = 'entity'
export const EXAMPLE_TOOL_URL_PARAM = 'tool'

export type ExampleWorldUrlState = {
  example: string | null
  entity: string | null
  tool: string | null
}

function readParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim()
  return value ? value : null
}

export function readExampleWorldUrlParam(search: string): string | null {
  return readParam(new URLSearchParams(search), EXAMPLE_WORLD_URL_PARAM)
}

export function readExampleWorldUrlState(search: string): ExampleWorldUrlState {
  const params = new URLSearchParams(search)
  const example = readParam(params, EXAMPLE_WORLD_URL_PARAM)
  if (!example) return { example: null, entity: null, tool: null }
  return {
    example,
    entity: readParam(params, EXAMPLE_ENTITY_URL_PARAM),
    tool: readParam(params, EXAMPLE_TOOL_URL_PARAM),
  }
}

/** URL of the current page with the example-world params set (null removes one); other params are kept. */
export function withExampleWorldUrlState(href: string, state: ExampleWorldUrlState): string {
  const url = new URL(href)
  const entries: [string, string | null][] = [
    [EXAMPLE_WORLD_URL_PARAM, state.example],
    [EXAMPLE_ENTITY_URL_PARAM, state.example ? state.entity : null],
    [EXAMPLE_TOOL_URL_PARAM, state.example ? state.tool : null],
  ]
  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  return url.toString()
}

/** URL of the current page with `?example=<id>` set (or removed for null); entity / tool are dropped, other params kept. */
export function withExampleWorldUrlParam(href: string, id: string | null): string {
  return withExampleWorldUrlState(href, { example: id, entity: null, tool: null })
}

function replaceUrl(next: string): void {
  if (next !== window.location.href) window.history.replaceState(window.history.state, '', next)
}

/** Writes the params into the address bar without a navigation. */
export function setExampleWorldUrlState(state: ExampleWorldUrlState): void {
  if (typeof window === 'undefined') return
  replaceUrl(withExampleWorldUrlState(window.location.href, state))
}

/** Writes `?example=<id>` into the address bar (drops entity / tool of a previous world) without a navigation. */
export function setExampleWorldUrlParam(id: string | null): void {
  if (typeof window === 'undefined') return
  replaceUrl(withExampleWorldUrlParam(window.location.href, id))
}
