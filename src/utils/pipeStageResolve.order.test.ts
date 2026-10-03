import { describe, expect, it } from 'vitest'
import { buildEdgeWorldForDebug } from '@/test/fixtures/avEdgeWorld'
import { resolveMergedTransformerConfigsForEntitySync } from '@/utils/pipeStageResolve'

describe('merged runtime configs when entity.transformers is not in walk order', () => {
  it('a top-level stage listed before the pipe keeps its own params (not the first pipe stage\'s)', () => {
    const base = buildEdgeWorldForDebug({ name: 't', goal: [0, -30], obstacles: [] })
    const wanderId = 'wanderer_tf'
    const world = {
      ...base,
      transformers: {
        ...base.transformers,
        [wanderId]: { type: 'wanderer', priority: 0, enabled: true, params: { jumpDistance: 900, positionEpsilon: 50 } },
      },
      entities: base.entities.map((e) =>
        e.id === 'buggy' ? { ...e, transformers: [wanderId, ...(e.transformers ?? [])] } : e,
      ),
    } as typeof base
    const configs = resolveMergedTransformerConfigsForEntitySync(world, 'buggy')!
    const w = configs.find((c) => c.type === 'wanderer')!
    expect(w.params).toMatchObject({ jumpDistance: 900, positionEpsilon: 50 })
    expect(w.params).not.toHaveProperty('cruiseSpeed')
    const ego = configs.find((c) => c.code?.includes('state estimation'))!
    expect(ego.params).toHaveProperty('cruiseSpeed')
    expect(ego.params).not.toHaveProperty('jumpDistance')
  })
})
