import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { RennWorld } from '@/types/world'
import PipeNavTree from './PipeNavTree'
import { entityLevelItems } from '@/utils/stripOrder'

/** Tree and strip must list the entity's pipes and top-level stages in the same (run) order. */
const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: ['a', 'early', 'late'], transformerPipeStack: [{ pipeId: 'pa' }] }],
  transformers: {
    a: { type: 'custom', name: 'Stage A', code: '', priority: 5 },
    early: { type: 'custom', name: 'Early stage', code: '', priority: 1 },
    late: { type: 'custom', name: 'Late stage', code: '', priority: 9 },
  },
  transformerPipes: { pa: { id: 'pa', name: 'Pipe A', stageIds: ['a'], stages: [], members: [{ kind: 'stage', stageId: 'a' }] } },
}

describe('tree order = strip order', () => {
  it('lists entity children by run order, not "pipes first"', () => {
    render(<PipeNavTree world={world} entity={world.entities[0]!} focusPath={[]} selectedIndex={0} onSelectPath={() => {}} />)
    const tree = screen.getByTestId('pipe-nav-tree')
    const labels = ['Early stage', 'Pipe A', 'Late stage'].map((t) => within(tree).getByText(t))
    const positions = labels.map((el) => Array.from(tree.querySelectorAll('*')).indexOf(el))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(entityLevelItems(world, world.entities[0]!).map((i) => i.key)).toEqual(['stage:early', 'pipe:0', 'stage:late'])
  })
})
