import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import MazeTrainingDialog from './MazeTrainingDialog'
import { MAZE_TRAINING_WORLDS, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'

function makeMeta(spec: { id: string; seed: number; name: string }, bestScore: number | null): MazeTrainingMeta {
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    candidate: { policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shipped' },
    bestScore,
    chain: { points: 42, lengthM: 336 },
  }
}

describe('MazeTrainingDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders one card per registered maze world', () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-card-${spec.id}`)).toBeInTheDocument()
      expect(screen.getByText(spec.name)).toBeInTheDocument()
      expect(screen.getByText(`seed ${spec.seed}`)).toBeInTheDocument()
    }
  })

  it('shows "not exported yet" and a disabled play button when meta fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await waitFor(() => {
      expect(screen.getAllByText('not exported yet')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    })
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-play-${spec.id}`)).toBeDisabled()
    }
    fireEvent.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('shows candidate, best score and plays the chosen maze via onPlayExampleWorld', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
        const id = decodeURIComponent(match?.[1] ?? '')
        const spec = MAZE_TRAINING_WORLDS.find((s) => s.id === id)
        if (!spec) throw new Error(`unexpected fetch: ${url}`)
        const meta = makeMeta(spec, spec.id === 'maze_train_3' ? null : 123)
        return { ok: true, json: async () => meta }
      }),
    )
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await screen.findAllByText('v3 shipped (gen 1000)')
    expect(screen.getAllByText('Best: 123 pts')).toHaveLength(4)
    expect(screen.getAllByText('Best: —')).toHaveLength(1)
    expect(screen.queryByText('not exported yet')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith('maze_train_3')
  })

  it('highlights the selected card', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
        const id = decodeURIComponent(match?.[1] ?? '')
        const spec = MAZE_TRAINING_WORLDS.find((s) => s.id === id)
        if (!spec) throw new Error(`unexpected fetch: ${url}`)
        return { ok: true, json: async () => makeMeta(spec, 10) }
      }),
    )
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 10 pts')
    const card = screen.getByTestId('maze-training-card-maze_train_2')
    expect(card).toHaveAttribute('aria-pressed', 'false')
    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
  })
})
