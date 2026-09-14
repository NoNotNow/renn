import { describe, it, expect } from 'vitest'
import type { TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import {
  isStackRootScopePath,
  mergeParamScopeLayers,
  pipeScopeKeyFromPath,
  resolveLocalScopeParams,
} from './paramScopes'

const stackRootPath: PipeNavPathSegment[] = [{ kind: 'stack', index: 0 }]
const nestedScopePath: PipeNavPathSegment[] = [
  { kind: 'stack', index: 0 },
  { kind: 'member', pipeId: 'root', memberIndex: 1 },
]

function binding(overrides: Partial<TransformerPipeBinding> = {}): TransformerPipeBinding {
  return { pipeId: 'root', ...overrides }
}

describe('paramScopes', () => {
  describe('mergeParamScopeLayers', () => {
    it('merges with later layers winning on conflict', () => {
      expect(
        mergeParamScopeLayers([
          { speed: 1, height: 10 },
          { speed: 2 },
          { jump: 5 },
        ]),
      ).toEqual({ speed: 2, height: 10, jump: 5 })
      expect(
        mergeParamScopeLayers([
          { power: 99, height: 10 },
          { power: 50, speed: 2 },
          { grip: 9 },
        ]),
      ).toEqual({ power: 50, height: 10, speed: 2, grip: 9 })
    })

    it('skips undefined values in layers', () => {
      expect(mergeParamScopeLayers([{ a: 1 }, { a: undefined, b: 2 }])).toEqual({ a: 1, b: 2 })
    })

    it('returns empty object for no layers', () => {
      expect(mergeParamScopeLayers([])).toEqual({})
    })
  })

  describe('resolveLocalScopeParams', () => {
    it('returns empty when binding is missing', () => {
      expect(resolveLocalScopeParams(undefined, stackRootPath)).toEqual({})
    })

    it('returns binding.params when scopePath is empty', () => {
      expect(resolveLocalScopeParams(binding({ params: { grip: 1 } }))).toEqual({ grip: 1 })
      expect(resolveLocalScopeParams(binding({ params: { grip: 1 } }), [])).toEqual({ grip: 1 })
    })

    it('merges binding.params with stack scopeParams at stack root', () => {
      const scopeKey = pipeScopeKeyFromPath(stackRootPath)
      expect(
        resolveLocalScopeParams(
          binding({ params: { grip: 1 }, scopeParams: { [scopeKey]: { boost: true } } }),
          stackRootPath,
        ),
      ).toEqual({ grip: 1, boost: true })
      expect(isStackRootScopePath(stackRootPath)).toBe(true)
    })

    it('returns only nested scopeParams for nested scopePath (PipeParamsStrip defect case)', () => {
      const scopeKey = pipeScopeKeyFromPath(nestedScopePath)
      const b = binding({
        params: { grip: 1 },
        scopeParams: { [scopeKey]: { grip: 9 } },
      })
      expect(resolveLocalScopeParams(b, nestedScopePath)).toEqual({ grip: 9 })
      expect(resolveLocalScopeParams(b)).toEqual({ grip: 1 })
    })

    it('returns empty object for nested scope with no scopeParams entry', () => {
      expect(resolveLocalScopeParams(binding({ params: { grip: 1 } }), nestedScopePath)).toEqual({})
    })
  })

  describe('runtime layer resolution uses the editing projection', () => {
    it('merges binding.params with stack scopeParams at stack root', () => {
      const scopeKey = pipeScopeKeyFromPath(stackRootPath)
      const b = binding({ params: { grip: 1 }, scopeParams: { [scopeKey]: { boost: true } } })
      expect(resolveLocalScopeParams(b, stackRootPath)).toEqual({ grip: 1, boost: true })
    })

    it('returns only scopeParams for nested scope keys', () => {
      const scopeKey = pipeScopeKeyFromPath(nestedScopePath)
      const b = binding({
        params: { grip: 1 },
        scopeParams: { [scopeKey]: { grip: 9 } },
      })
      expect(resolveLocalScopeParams(b, nestedScopePath)).toEqual({ grip: 9 })
    })

    it('nested scope no longer re-injects binding.params (predicate divergence fixed)', () => {
      const stackKey = pipeScopeKeyFromPath(stackRootPath)
      const nestedKey = pipeScopeKeyFromPath(nestedScopePath)
      const b = binding({
        params: { grip: 1, speed: 5 },
        scopeParams: {
          [stackKey]: { boost: true },
          [nestedKey]: { grip: 9 },
        },
      })
      // Old runtime used scopeKey.startsWith('stack:') and leaked binding.params (speed: 5) here.
      expect(resolveLocalScopeParams(b, nestedScopePath)).toEqual({ grip: 9 })
    })
  })
})
