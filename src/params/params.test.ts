import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TransformerConfig } from '@/types/transformer'
import { getDefaultTransformerConfig, TRANSFORMER_PRESET_TYPES } from '@/transformers/transformerPresets'
import { TRANSFORMER_PARAMS_DOCS } from '@/transformers/transformerParamDocs'
import { inferParamDef, mergeDeclaredAndInferred } from './inferParamDefs'
import { parseParamsDecl } from './parseParamsDecl'
import { getParamValue, isOverridden, labelFromKey, numberStepFor, outsideHint, setParamValue } from './paramValue'
import { presetParamDefs } from './presetParamSchemas'
import { resolvePipeParamSchema, resolveStageParamSchema } from './resolveParamSchema'

const decl = (json: string, rest = 'function transform() {}') => `/* @params\n${json}\n*/\n${rest}`

describe('parseParamsDecl', () => {
  it('parses a valid block and keeps optional fields', () => {
    const { defs, errors } = parseParamsDecl(
      decl('[{"key":"a","type":"number","default":2,"min":0,"unit":"m"},{"key":"m","type":"enum","options":["x",{"value":"y","label":"Why"}]}]'),
    )
    expect(errors).toEqual([])
    expect(defs[0]).toEqual({ key: 'a', type: 'number', default: 2, min: 0, unit: 'm' })
    expect(defs[1]!.options).toEqual([{ value: 'x' }, { value: 'y', label: 'Why' }])
  })
  it('accepts leading line comments before the block', () => {
    expect(parseParamsDecl(`// header\n${decl('[{"key":"a","type":"boolean"}]')}`).defs).toHaveLength(1)
  })
  it('ignores a block that is not first or does not start with @params', () => {
    expect(parseParamsDecl(`var x = 1\n${decl('[{"key":"a","type":"boolean"}]')}`)).toEqual({ defs: [], errors: [] })
    expect(parseParamsDecl('/* hello */ function f(){}')).toEqual({ defs: [], errors: [] })
    expect(parseParamsDecl(undefined)).toEqual({ defs: [], errors: [] })
  })
  it('reports malformed JSON, non-arrays, unknown types, duplicates and bad enums but keeps valid defs', () => {
    expect(parseParamsDecl(decl('[{')).errors[0]).toMatch(/not valid JSON/)
    expect(parseParamsDecl(decl('{"a":1}')).errors[0]).toMatch(/array/)
    const r = parseParamsDecl(
      decl('[{"key":"a","type":"nope"},{"key":"b","type":"number"},{"key":"b","type":"number"},{"key":"e","type":"enum"},{"type":"number"},3]'),
    )
    expect(r.defs.map((d) => d.key)).toEqual(['b'])
    expect(r.errors).toHaveLength(5)
  })
})

describe('inferParamDef / mergeDeclaredAndInferred', () => {
  it.each([
    ['tickEvery', 3, 'number'],
    ['debugDraw', false, 'boolean'],
    ['mode', 'loop', 'string'],
    ['targetEntityId', 'e1', 'entityId'],
    ['tint', '#ff0000', 'string'],
    ['tintColor', '#ff0000', 'color'],
    ['fleeArea', [1, 2], 'vec2'],
    ['pos', [1, 2, 3], 'vec3'],
    ['threatIds', ['a'], 'json'],
    ['xs', [1, 2, 3, 4], 'numberList'],
    ['perimeter', { a: 1 }, 'json'],
    ['nothing', null, 'json'],
  ])('%s -> %s', (key, value, type) => {
    expect(inferParamDef(key, value as unknown).type).toBe(type)
  })
  it('labels camelCase keys', () => {
    expect(labelFromKey('tickEvery')).toBe('Tick every')
    expect(labelFromKey('perimeter.halfExtents')).toBe('Half extents')
  })
  it('keeps declared defs first and infers only uncovered keys into group Other', () => {
    const declared = [{ key: 'a', type: 'number' as const }]
    const defs = mergeDeclaredAndInferred(declared, { a: 1, b: true, c: undefined })
    expect(defs.map((d) => d.key)).toEqual(['a', 'b'])
    expect(defs[1]).toMatchObject({ type: 'boolean', group: 'Other', default: true })
  })
  it('does not group inferred defs when nothing is declared', () => {
    expect(mergeDeclaredAndInferred([], { b: 1 })[0]!.group).toBeUndefined()
  })
})

describe('param values', () => {
  it('reads and writes dotted paths without touching siblings, and undefined removes', () => {
    const p = { perimeter: { center: [0, 0, 0], halfExtents: [1, 1, 1] }, speed: 2 }
    expect(getParamValue(p, 'perimeter.center')).toEqual([0, 0, 0])
    const n = setParamValue(p, 'perimeter.center', [1, 2, 3])
    expect(n).toEqual({ perimeter: { center: [1, 2, 3], halfExtents: [1, 1, 1] }, speed: 2 })
    expect(p.perimeter.center).toEqual([0, 0, 0])
    expect(setParamValue(n, 'speed', undefined)).not.toHaveProperty('speed')
    expect(setParamValue({}, 'a.b', undefined)).toEqual({})
  })
  it('isOverridden compares with the default; explicit equal values are still stored by callers', () => {
    expect(isOverridden(undefined, { key: 'a', type: 'number', default: 1 })).toBe(false)
    expect(isOverridden(1, { key: 'a', type: 'number', default: 1 })).toBe(false)
    expect(isOverridden([1], { key: 'a', type: 'numberList', default: [2] })).toBe(true)
  })
  it('min / max are hints: values outside are reported, never changed', () => {
    const def = { key: 'a', type: 'number' as const, min: 0, max: 10 }
    expect(outsideHint(def, 1000)).toBe(true)
    expect(outsideHint(def, 5)).toBe(false)
    expect(outsideHint({ key: 'cruiseSpeed', type: 'number', min: 0 }, 1000)).toBe(false)
  })
  it('step follows the def, integer type or magnitude', () => {
    expect(numberStepFor({ key: 'a', type: 'number', step: 5 }, 1).step).toBe(5)
    expect(numberStepFor({ key: 'a', type: 'integer' }, 1).step).toBe(1)
    expect(numberStepFor({ key: 'a', type: 'number' }, 50).step).toBe(1)
    expect(numberStepFor({ key: 'a', type: 'number' }, 0.02).step).toBe(0.01)
  })
})

describe('resolveStageParamSchema', () => {
  it('uses the preset registry (docs + defaults) for preset types and tops up unknown keys', () => {
    const stage: TransformerConfig = { type: 'car2', params: { power: 500, mystery: 1 } }
    const r = resolveStageParamSchema(stage)
    expect(r.source).toBe('preset')
    const power = r.defs.find((d) => d.key === 'power')!
    expect(power.default).toBe(400)
    expect(power.description).toMatch(/Throttle/)
    expect(r.defs.find((d) => d.key === 'mystery')).toMatchObject({ type: 'number', group: 'Other' })
  })
  it('reads @params from custom code', () => {
    const r = resolveStageParamSchema({
      type: 'custom',
      code: decl('[{"key":"aebDecel","type":"number","default":7}]'),
      params: { aebDecel: 9, extra: 'x' },
    })
    expect(r.source).toBe('declared')
    expect(r.defs.map((d) => d.key)).toEqual(['aebDecel', 'extra'])
  })
  it('infers a usable schema for custom stages without a declaration', () => {
    const r = resolveStageParamSchema({ type: 'custom', code: 'function transform(){return {}}', params: { a: 1, b: [1, 2, 3], c: 'x' } })
    expect(r.source).toBe('inferred')
    expect(r.defs.map((d) => d.type)).toEqual(['number', 'vec3', 'string'])
  })
  it('surfaces @params errors but still infers', () => {
    const r = resolveStageParamSchema({ type: 'custom', code: decl('[{'), params: { a: 1 } })
    expect(r.errors).toHaveLength(1)
    expect(r.defs).toHaveLength(1)
  })
})

describe('preset schemas stay in step with presets and docs', () => {
  it.each(TRANSFORMER_PRESET_TYPES.filter((t) => t !== 'custom'))('%s: every default param and doc key is declared', (type) => {
    const defs = presetParamDefs(type)
    const keys = new Set(defs.map((d) => d.key))
    const params = getDefaultTransformerConfig(type).params ?? {}
    for (const k of Object.keys(params)) {
      expect(keys.has(k) || [...keys].some((x) => x.startsWith(`${k}.`)), `${type}.${k} has no schema`).toBe(true)
    }
    for (const k of Object.keys(TRANSFORMER_PARAMS_DOCS[type])) {
      expect(keys.has(k) || [...keys].some((x) => x.startsWith(`${k}.`)) || k.includes('.'), `${type}.${k} doc has no schema`).toBe(true)
    }
  })
  it('resolvePipeParamSchema merges declared defs with set keys', () => {
    const r = resolvePipeParamSchema({ paramDefs: [{ key: 'a', type: 'number' }] }, { a: 1, tickEvery: 2 })
    expect(r.defs.map((d) => d.key)).toEqual(['a', 'tickEvery'])
    expect(r.source).toBe('declared')
  })
})

describe('shipped stage sources', () => {
  const root = join(process.cwd(), 'public/global/transformers')
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.js'))
  it('finds shipped stages', () => expect(files.length).toBeGreaterThan(10))
  it.each(files)('%s: a declared @params block parses without errors', (f) => {
    const code = readFileSync(join(root, f), 'utf8')
    const r = parseParamsDecl(code)
    expect(r.errors).toEqual([])
  })
})
