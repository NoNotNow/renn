import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RennWorld } from '@/types/world'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'
import PipeNavTree from './PipeNavTree'

vi.mock('@/utils/pipeStageResolve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/pipeStageResolve')>()
  return { ...actual, resolveEntityStageRuntime: vi.fn(actual.resolveEntityStageRuntime) }
})

/** Manifold with three nested pipe rows — each row needs the enable cascade to render. */
const world: RennWorld = {
  version: '1',
  world: {},
  entities: [
    {
      id: 'e1',
      name: 'Car',
      transformers: ['s1', 's3'],
      transformerPipeStack: [{ pipeId: 'root' }],
    },
  ],
  transformers: {
    s1: { type: 'input' },
    s2: { type: 'car2' },
    s3: { type: 'input' },
  },
  transformerPipes: {
    root: {
      id: 'root',
      name: 'Root',
      stageIds: [],
      stages: [],
      members: [
        { kind: 'pipe', pipeId: 'a' },
        { kind: 'pipe', pipeId: 'b', enabled: false },
        { kind: 'pipe', pipeId: 'c' },
      ],
    },
    a: { id: 'a', name: 'Child A', stageIds: ['s1'], stages: [], members: [{ kind: 'stage', stageId: 's1' }] },
    b: { id: 'b', name: 'Child B', stageIds: ['s2'], stages: [], members: [{ kind: 'stage', stageId: 's2' }] },
    c: { id: 'c', name: 'Child C', stageIds: ['s3'], stages: [], members: [{ kind: 'stage', stageId: 's3' }] },
  },
}

describe('PipeNavTree stage runtime', () => {
  beforeEach(() => {
    vi.mocked(resolveEntityStageRuntime).mockClear()
  })

  it('resolves the entity stage runtime once per render, not once per tree row', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <PipeNavTree world={world} entity={world.entities[0]!} focusPath={[]} selectedIndex={0} onSelectPath={() => {}} />,
    )

    await user.click(screen.getByText('Root'))
    expect(screen.getByText('Child A')).toBeInTheDocument()
    expect(screen.getByText('Child B')).toBeInTheDocument()
    expect(screen.getByText('Child C')).toBeInTheDocument()

    vi.mocked(resolveEntityStageRuntime).mockClear()
    rerender(
      <PipeNavTree
        world={{ ...world }}
        entity={world.entities[0]!}
        focusPath={[]}
        selectedIndex={0}
        onSelectPath={() => {}}
      />,
    )

    expect(vi.mocked(resolveEntityStageRuntime)).toHaveBeenCalledTimes(1)
  })
})
