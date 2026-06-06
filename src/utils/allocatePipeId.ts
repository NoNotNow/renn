/** Slugify a user-provided pipe name into a stable registry id. */
export function slugifyPipeName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return slug.length > 0 ? slug : 'pipe'
}

/** Allocate a unique pipe id from a display name. */
export function allocatePipeId(name: string, taken: Set<string> | Record<string, unknown>): string {
  const used = taken instanceof Set ? taken : new Set(Object.keys(taken))
  const base = slugifyPipeName(name)
  if (!used.has(base)) return base
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}_${i}`
    if (!used.has(candidate)) return candidate
  }
  return `${base}_${Date.now()}`
}
