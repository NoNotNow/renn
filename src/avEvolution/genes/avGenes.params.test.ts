import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseParamsDecl } from '@/params/parseParamsDecl'
import { AV_GENOME_SPEC } from './avGenes'

const dir = join(process.cwd(), 'public/global/transformers/av-stack')

/** key -> files whose @params header declares it (genes are applied as AV pipe binding params shared by all stages). */
function declaredKeys(): Map<string, { file: string; default: unknown }[]> {
  const out = new Map<string, { file: string; default: unknown }[]>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const { defs, errors } = parseParamsDecl(readFileSync(join(dir, file), 'utf8'))
    expect(errors, file).toEqual([])
    for (const d of defs) out.set(d.key, [...(out.get(d.key) ?? []), { file, default: d.default }])
  }
  return out
}

describe('AV gene spec vs av-stack @params headers', () => {
  const declared = declaredKeys()

  it('every gene key is declared in an @params header of an av-stack transformer', () => {
    const orphans = AV_GENOME_SPEC.genes.map((g) => g.key).filter((k) => !declared.has(k))
    expect(orphans).toEqual([])
  })

  it('gene keys are unique', () => {
    const keys = AV_GENOME_SPEC.genes.map((g) => g.key)
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })

  it('reports header defaults that differ from the gene default (informational, not enforced)', () => {
    const mismatches: string[] = []
    for (const g of AV_GENOME_SPEC.genes) {
      for (const d of declared.get(g.key) ?? []) {
        if (typeof d.default === 'number' && typeof g.default === 'number' && d.default !== g.default) mismatches.push(`${g.key}: gene ${g.default} vs ${d.file} ${d.default}`)
      }
    }
    if (mismatches.length) console.warn(`gene/header default mismatches:\n${mismatches.join('\n')}`)
    expect(Array.isArray(mismatches)).toBe(true)
  })
})
