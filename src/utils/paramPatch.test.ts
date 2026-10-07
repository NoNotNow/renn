import { describe, expect, it } from 'vitest'
import type { RennWorld } from '@/types/world'
import { resolveInheritedScopeParams } from './paramScopes'
import { mergeParamPatch, updateBindingParams, updateBindingScopeParams } from './pipeNavMutations'
import { resolvePipeNavEdit } from '@/editor/pipeNavEdit'

const world = {
  version: '1',
  world: {},
  entities: [
    {
      id: 'e1',
      name: 'E',
      transformers: [],
      transformerPipeStack: [
        { pipeId: 'p', params: { a: 1, b: 2 }, scopeParams: { 'stack:0': { c: 3 }, 'stack:0/member:p:0': { d: 4, e: 5 } } },
      ],
    },
  ],
  transformers: {},
  transformerPipes: { p: { id: 'p', name: 'P', stageIds: [], stages: [], members: [] } },
} as unknown as RennWorld

const stack = (w: RennWorld) => w.entities[0]!.transformerPipeStack![0]!
const scopePath = [{ kind: 'stack' as const, index: 0 }, { kind: 'member' as const, pipeId: 'p', memberIndex: 0 }]

describe('param reset (undefined removes the key)', () => {
  it('mergeParamPatch deletes undefined keys and keeps explicit equal values', () => {
    expect(mergeParamPatch({ a: 1, b: 2 }, { a: undefined, b: 2, c: 0 })).toEqual({ b: 2, c: 0 })
  })
  it('updateBindingParams removes a stack param', () => {
    expect(stack(updateBindingParams(world, 'e1', 0, { a: undefined })).params).toEqual({ b: 2 })
  })
  it('updateBindingScopeParams removes a nested scope param only', () => {
    const next = updateBindingScopeParams(world, 'e1', 0, scopePath, { d: undefined })
    expect(stack(next).scopeParams!['stack:0/member:p:0']).toEqual({ e: 5 })
    expect(stack(next).params).toEqual({ a: 1, b: 2 })
  })
  it('editPipeParams intent with undefined removes the key, at stack root and nested scope', () => {
    const ctx = {
      world,
      entityId: 'e1',
      focus: { path: [], selectedSiblingIndex: 0 },
      prompts: { confirm: () => true, prompt: () => null },
    } as unknown as Parameters<typeof resolvePipeNavEdit>[1]
    const root = resolvePipeNavEdit(
      { kind: 'editPipeParams', mode: 'merge', stackIndex: 0, scopePath: [{ kind: 'stack', index: 0 }], key: 'a', value: undefined },
      ctx,
    )
    expect(stack(root!.world).params).toEqual({ b: 2 })
    const nested = resolvePipeNavEdit(
      { kind: 'editPipeParams', mode: 'merge', stackIndex: 0, scopePath, key: 'e', value: undefined },
      ctx,
    )
    expect(stack(nested!.world).scopeParams!['stack:0/member:p:0']).toEqual({ d: 4 })
  })
})

describe('resolveInheritedScopeParams', () => {
  const binding = stack(world)
  it('is empty at the binding and at the stack root', () => {
    expect(resolveInheritedScopeParams(binding, [])).toEqual({})
    expect(resolveInheritedScopeParams(binding, [{ kind: 'stack', index: 0 }])).toEqual({})
  })
  it('nested scope inherits binding.params + stack-root scope params', () => {
    expect(resolveInheritedScopeParams(binding, scopePath)).toEqual({ a: 1, b: 2, c: 3 })
  })
})
