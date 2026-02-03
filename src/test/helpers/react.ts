import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider } from '@/contexts/ProjectContext'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import type { createIndexedDbPersistence } from '@/persistence/indexedDb'

/**
 * Render a component with common providers (Router, ProjectProvider)
 */
export function renderWithProviders(component: ReactElement): RenderResult {
  return render(
    <MemoryRouter>
      <ProjectProvider>
        {component}
      </ProjectProvider>
    </MemoryRouter>
  )
}

/**
 * Create a mock persistence API for testing
 */
export function createMockPersistence(): ReturnType<typeof createIndexedDbPersistence> {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    loadProject: vi.fn(),
    saveProject: vi.fn(),
    deleteProject: vi.fn(),
    exportProject: vi.fn(),
    importProject: vi.fn(),
  }
}
