import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RennWorld } from '@/types/world'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import PipeAddDialog from './PipeAddDialog'
import type { PipeNavViewMode } from '@/types/pipeNav'

const world = { version: '1', world: {}, entities: [], transformerPipes: {}, transformers: {} } as unknown as RennWorld
const lib = {
  transformers: {},
  scripts: {},
  transformerPipes: { g: { id: 'g', name: 'Global pipe', stageIds: [], stages: [], members: [] } },
} as unknown as GlobalBehaviorLibrary

const open = (mode: PipeNavViewMode, hasPipeStack: boolean, onAddLibraryPipe = vi.fn()) =>
  render(
    <PipeAddDialog
      isOpen
      onClose={() => {}}
      mode={mode}
      hasPipeStack={hasPipeStack}
      world={world}
      existingRegistry={{}}
      excludedStageIds={[]}
      onAddPreset={() => {}}
      onAddExisting={() => {}}
      onCreatePipe={() => {}}
      onAddChildPipe={() => {}}
      globalLibrary={lib}
      onAddLibraryPipe={onAddLibraryPipe}
    />,
  )

describe('one add dialog for every level', () => {
  it.each([
    ['entity_stages', false],
    ['pipe_siblings', true],
    ['pipe_members', true],
  ] as const)('%s offers a transformer, a new pipe and existing (project + global) pipes', (mode, hasStack) => {
    const onAddLibraryPipe = vi.fn()
    open(mode, hasStack, onAddLibraryPipe)
    expect(screen.getByTestId('pipe-add-tab-stage')).toBeInTheDocument()
    expect(screen.getByTestId('pipe-add-tab-create_pipe')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pipe-add-tab-existing_pipe'))
    fireEvent.click(screen.getByTestId('pipe-library-global-g'))
    fireEvent.click(screen.getByTestId('pipe-library-link'))
    expect(onAddLibraryPipe).toHaveBeenCalledWith('global', 'g', 'linked')
  })
})
