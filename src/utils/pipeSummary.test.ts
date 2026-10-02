import { describe, expect, test } from 'vitest'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import { collectNestedPipeIds, describePipeSummary, summarizePipe } from './pipeSummary'

const transformers: Record<string, TransformerConfig> = {
  a: { type: 'custom', name: 'Alpha', code: '' } as TransformerConfig,
  b: { type: 'car2' } as TransformerConfig,
  c: { type: 'custom', name: 'Gamma', code: '', enabled: false } as TransformerConfig,
}
const pipes: Record<string, TransformerPipe> = {
  root: {
    id: 'root',
    name: 'Root',
    stageIds: [],
    stages: [],
    paramDefs: [{ key: 'speed', type: 'number', default: 5 }],
    members: [{ kind: 'stage', stageId: 'a' }, { kind: 'pipe', pipeId: 'mid' }, { kind: 'stage', stageId: 'b' }],
  },
  mid: { id: 'mid', name: 'Mid', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'leaf' }, { kind: 'stage', stageId: 'c' }] },
  leaf: { id: 'leaf', name: 'Leaf', stageIds: [], stages: [], members: [{ kind: 'stage', stageId: 'a' }] },
}

describe('summarizePipe', () => {
  test('counts leaf stages and nested pipes across levels', () => {
    const s = summarizePipe({ pipes, transformers }, 'root')!
    expect(s.stageCount).toBe(4) // a, (a, c), b
    expect(s.nestedPipeCount).toBe(2)
    expect(s.depth).toBe(2)
    expect(describePipeSummary(s)).toBe('4 stages · 2 nested pipes')
    expect(s.paramDefs.map((p) => p.key)).toEqual(['speed'])
  })

  test('labels stages by name (custom) or type and keeps order', () => {
    const s = summarizePipe({ pipes, transformers }, 'root')!
    expect(s.children.map((n) => (n.kind === 'stage' ? n.label : `pipe:${n.label}`))).toEqual(['Alpha', 'pipe:Mid', 'car2'])
    const mid = s.children[1]!
    expect(mid.kind === 'pipe' && mid.stageCount).toBe(2)
  })

  test('disabled stages are flagged', () => {
    const s = summarizePipe({ pipes, transformers }, 'mid')!
    const gamma = s.children.find((n) => n.kind === 'stage')!
    expect(gamma.enabled).toBe(false)
  })

  test('missing child pipes and cycles do not hang or throw', () => {
    const broken: Record<string, TransformerPipe> = {
      p: { id: 'p', name: 'P', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'gone' }, { kind: 'pipe', pipeId: 'q' }] },
      q: { id: 'q', name: 'Q', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'p' }] },
    }
    const s = summarizePipe({ pipes: broken, transformers }, 'p')!
    expect(s.children[0]).toMatchObject({ kind: 'pipe', missing: true })
    const q = s.children[1]!
    expect(q.kind === 'pipe' && q.children[0]).toMatchObject({ kind: 'pipe', cycle: true })
  })

  test('unknown pipe → undefined; singular wording', () => {
    expect(summarizePipe({ pipes, transformers }, 'nope')).toBeUndefined()
    expect(describePipeSummary({ stageCount: 1, nestedPipeCount: 0 })).toBe('1 stage')
    expect(describePipeSummary({ stageCount: 2, nestedPipeCount: 1 })).toBe('2 stages · 1 nested pipe')
  })
})

describe('collectNestedPipeIds', () => {
  test('returns roots and every descendant once', () => {
    expect(collectNestedPipeIds(pipes, ['root']).sort()).toEqual(['leaf', 'mid', 'root'])
  })
  test('is cycle-safe', () => {
    const cyc: Record<string, TransformerPipe> = {
      p: { id: 'p', name: 'P', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'q' }] },
      q: { id: 'q', name: 'Q', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'p' }] },
    }
    expect(collectNestedPipeIds(cyc, ['p']).sort()).toEqual(['p', 'q'])
  })
})
