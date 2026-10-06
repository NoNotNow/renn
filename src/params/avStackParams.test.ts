import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseParamsDecl } from './parseParamsDecl'

const dir = join(process.cwd(), 'public/global/transformers/av-stack')
const files = readdirSync(dir).filter((f) => f.endsWith('.js'))

/** Engine-level params handled outside the stage body (CustomCodeTransformer). */
const ENGINE_KEYS = new Set(['tickEvery'])
/** Booleans whose default is not visible as a literal comparison in the code (truthy test / mode dependent). */
const BOOLEAN_DEFAULT_EXEMPT = new Set(['saver', 'manTrack', 'routeLimitPose'])

function stripLineComments(code: string): string {
  return code
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
}
function stripBlockHeader(code: string): string {
  return code.replace(/^\/\* @params[\s\S]*?\*\/\n/, '')
}
function keysRead(code: string): Set<string> {
  const body = stripLineComments(stripBlockHeader(code))
  return new Set([...body.matchAll(/params\.([A-Za-z0-9_]+)/g)].map((m) => m[1]!))
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('av-stack stages declare every param they read', () => {
  it.each(files)('%s', (f) => {
    const code = readFileSync(join(dir, f), 'utf8')
    const { defs, errors } = parseParamsDecl(code)
    expect(errors).toEqual([])
    const declared = new Set(defs.map((d) => d.key))
    const read = keysRead(code)
    const missing = [...read].filter((k) => !declared.has(k))
    const extra = [...declared].filter((k) => !read.has(k) && !ENGINE_KEYS.has(k))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    expect(new Set(defs.map((d) => d.key)).size).toBe(defs.length)
  })

  it.each(files)('%s: declared defaults match the code fallbacks', (f) => {
    const code = readFileSync(join(dir, f), 'utf8')
    const body = stripLineComments(stripBlockHeader(code))
    const { defs } = parseParamsDecl(code)
    const bad: string[] = []
    for (const d of defs) {
      if (ENGINE_KEYS.has(d.key) || d.default === undefined) continue
      if (d.type === 'number' || d.type === 'integer') {
        const lit = escape(String(d.default))
        const re = new RegExp(`(?<![\\w.])${lit}(\\.0)?(?![\\w.])`)
        if (!re.test(body)) bad.push(`${d.key}: literal ${d.default} not in code`)
      } else if (d.type === 'boolean' && !BOOLEAN_DEFAULT_EXEMPT.has(d.key)) {
        const k = escape(d.key)
        const trueDefault = new RegExp(`params\\.${k}\\s*(!==\\s*false|===\\s*false)`).test(body)
        const falseDefault = new RegExp(`params\\.${k}\\s*(===|!==)\\s*true`).test(body)
        if (d.default === true && !trueDefault) bad.push(`${d.key}: default true but code has no "!== false"`)
        if (d.default === false && !falseDefault) bad.push(`${d.key}: default false but code has no "=== true"`)
      } else if (d.type === 'enum') {
        const values = (d.options ?? []).map((o) => o.value)
        if (!values.includes(d.default as string)) bad.push(`${d.key}: enum default not among options`)
      }
    }
    expect(bad).toEqual([])
  })
})
