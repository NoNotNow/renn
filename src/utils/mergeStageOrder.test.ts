import { describe, it, expect } from 'vitest'
import type { TransformerPipeMember } from '@/types/transformer'
import { mergeStageOrderIntoMembers } from './pipeNavMutations'

const st = (stageId: string, enabled?: boolean): TransformerPipeMember => ({ kind: 'stage', stageId, ...(enabled === undefined ? {} : { enabled }) })
const pp = (pipeId: string): TransformerPipeMember => ({ kind: 'pipe', pipeId })
const ids = (ms: TransformerPipeMember[]) => ms.map((m) => (m.kind === 'stage' ? m.stageId : `[${m.pipeId}]`))

describe('mergeStageOrderIntoMembers', () => {
  const base = [st('mission'), pp('sense'), pp('plan'), st('car')]

  it('keeps nested pipes in their slots when a stage is appended', () => {
    expect(ids(mergeStageOrderIntoMembers(base, ['mission', 'car', 'new']))).toEqual(['mission', '[sense]', '[plan]', 'car', 'new'])
  })

  it('inserts a new first stage before the stage that follows it', () => {
    expect(ids(mergeStageOrderIntoMembers(base, ['new', 'mission', 'car']))).toEqual(['new', 'mission', '[sense]', '[plan]', 'car'])
  })

  it('reorders stages through their slots and keeps enabled flags', () => {
    const out = mergeStageOrderIntoMembers([st('a', false), pp('p'), st('b')], ['b', 'a'])
    expect(ids(out)).toEqual(['b', '[p]', 'a'])
    expect(out[2]).toMatchObject({ stageId: 'a', enabled: false })
  })

  it('removes a stage without moving pipes', () => {
    expect(ids(mergeStageOrderIntoMembers(base, ['car']))).toEqual(['[sense]', '[plan]', 'car'])
  })
})

import { preserveCompositePriorities } from './pipeNavMutations'
import type { TransformerConfig } from '@/types/transformer'

describe('preserveCompositePriorities', () => {
  const cfg = (priority: number) => ({ type: 'custom', priority }) as TransformerConfig
  const registry = { mission: cfg(2.5), car: cfg(8) }
  const prios = (cs: TransformerConfig[]) => cs.map((c) => c.priority)

  it('does not re-index existing stages of a composite stack when one is appended', () => {
    const out = preserveCompositePriorities(registry, [cfg(0), cfg(1), cfg(2)], ['mission', 'car', 'new'])
    expect(prios(out)).toEqual([2.5, 8, 9])
  })

  it('puts a new first stage just before the next stage', () => {
    const out = preserveCompositePriorities(registry, [cfg(0), cfg(1), cfg(2)], ['new', 'mission', 'car'])
    expect(prios(out)).toEqual([1.5, 2.5, 8])
  })

  it('puts a stage dropped in the middle between its neighbours', () => {
    const out = preserveCompositePriorities(registry, [cfg(0), cfg(1), cfg(2)], ['mission', 'new', 'car'])
    expect(prios(out)).toEqual([2.5, 5.25, 8])
  })

  it('a reorder permutes the existing priority values', () => {
    const out = preserveCompositePriorities(registry, [cfg(0), cfg(1)], ['car', 'mission'])
    expect(prios(out)).toEqual([2.5, 8])
  })

  it('passes deliberate priorities through', () => {
    const configs = [cfg(7), cfg(9)]
    expect(preserveCompositePriorities(registry, configs, ['mission', 'car'])).toBe(configs)
  })
})

import { insertGlobalTransformerStage } from './appendTransformerStage'

describe('insertGlobalTransformerStage', () => {
  const cfg = (priority: number, name = 'x') => ({ type: 'custom', priority, name }) as TransformerConfig
  it('keeps the library priority and lists the stage where it fits', () => {
    const out = insertGlobalTransformerStage(
      [cfg(2), cfg(3), cfg(8)],
      ['ego', 'perc', 'car'],
      'global_av_wander',
      cfg(2.5, 'AV Wander'),
      'e1',
      {},
    )
    expect(out.configs.map((c) => c.priority)).toEqual([2, 2.5, 3, 8])
    expect(out.ids[1]).toBe(out.selectId)
    expect(out.ids[1]).not.toBe('global_av_wander')
  })
})
