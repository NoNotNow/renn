import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RennWorld } from '@/types/world'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import PipeLibraryDialog from './PipeLibraryDialog'

const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: [] }],
  transformers: { s1: { type: 'custom', name: 'Local stage', code: '' } },
  transformerPipes: { loc: { id: 'loc', name: 'Local pipe', stageIds: ['s1'], stages: [], members: [{ kind: 'stage', stageId: 's1' }] } },
}
const lib: GlobalBehaviorLibrary = {
  transformers: { g1: { type: 'custom', name: 'Global stage', code: '' } },
  transformerPipes: { glob: { id: 'glob', name: 'Autopilot', stageIds: ['g1'], stages: [], members: [{ kind: 'stage', stageId: 'g1' }] } },
} as unknown as GlobalBehaviorLibrary

describe('PipeLibraryDialog', () => {
  it('lists project and global pipes and assigns a global pipe', () => {
    const onAssign = vi.fn()
    render(<PipeLibraryDialog isOpen onClose={() => {}} world={world} globalLibrary={lib} entityName="Buggy" onAssign={onAssign} />)
    expect(screen.getByTestId('pipe-library-project-loc')).toBeTruthy()
    fireEvent.click(screen.getByTestId('pipe-library-global-glob'))
    expect(screen.getByTestId('pipe-library-preview').textContent).toContain('Global stage')
    fireEvent.click(screen.getByTestId('pipe-library-copy'))
    expect(onAssign).toHaveBeenCalledWith('global', 'glob', 'copy')
  })

  it('filters by search', () => {
    render(<PipeLibraryDialog isOpen onClose={() => {}} world={world} globalLibrary={lib} entityName="Buggy" onAssign={() => {}} />)
    fireEvent.change(screen.getByTestId('pipe-library-search'), { target: { value: 'auto' } })
    expect(screen.queryByTestId('pipe-library-project-loc')).toBeNull()
    expect(screen.getByTestId('pipe-library-global-glob')).toBeTruthy()
  })
})
