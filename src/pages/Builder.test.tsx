import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Builder from '@/pages/Builder'
import { sampleWorld } from '@/data/sampleWorld'

vi.mock('@/components/SceneView', () => ({
  default: () => <div data-testid="scene-view" />,
}))

vi.mock('@/persistence/indexedDb', () => ({
  createIndexedDbPersistence: () => ({
    listProjects: vi.fn().mockResolvedValue([]),
    loadProject: vi.fn(),
    saveProject: vi.fn(),
    deleteProject: vi.fn(),
    exportProject: vi.fn(),
    importProject: vi.fn(),
  }),
}))

function renderBuilder() {
  return render(
    <MemoryRouter>
      <Builder />
    </MemoryRouter>
  )
}

describe('Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders add entity dropdown and entity list', async () => {
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTitle('Add entity')).toBeInTheDocument()
    const entityList = screen.getByRole('list')
    expect(entityList).toBeInTheDocument()
    expect(entityList.children).toHaveLength(sampleWorld.entities.length)
  })

  it('adds entity when selecting "Add box" and selects the new entity', async () => {
    const user = userEvent.setup()
    renderBuilder()
    const entityList = screen.getByRole('list')
    const initialCount = entityList.children.length

    const addSelect = screen.getByTitle('Add entity')
    await user.selectOptions(addSelect, 'box')

    await waitFor(() => {
      expect(entityList.children).toHaveLength(initialCount + 1)
    })
    const newEntityButton = screen.getByRole('button', { name: /^entity_\d+$/ })
    expect(newEntityButton).toBeInTheDocument()
    expect(newEntityButton).toHaveStyle({ background: '#e0e0ff' })
  })
})
