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

const DEFAULT_PIPE_NAME_RE = /^pipe\s*(\d+)$/i

/** Next display name in the auto-wrap sequence: Pipe1, Pipe2, … */
export function nextFreeDefaultPipeName(
  pipes: Record<string, { name?: string }> | undefined,
): string {
  let max = 0
  for (const pipe of Object.values(pipes ?? {})) {
    const match = DEFAULT_PIPE_NAME_RE.exec(pipe.name?.trim() ?? '')
    if (match) max = Math.max(max, Number.parseInt(match[1]!, 10))
  }
  return `Pipe${max + 1}`
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
