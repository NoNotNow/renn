import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  installAgentBuilderAuthoring,
  uninstallAgentBuilderAuthoring,
} from '@/agent/installAgentBuilderAuthoring'
import { requireAgentBuilderAuthoring } from '@/agent/agentBuilderAuthoringRegistry'
import type { PersistenceAPI } from '@/persistence/types'

describe('installAgentBuilderAuthoring', () => {
  beforeEach(() => {
    uninstallAgentBuilderAuthoring()
  })

  it('loadSavedProjectByName loads by display name', async () => {
    const loadProject = vi.fn(async () => true)
    const persistence = {
      listProjects: vi.fn(async () => [{ id: 'id-1', name: 'My Game', updatedAt: 0 }]),
      loadProject: vi.fn(),
    } as unknown as PersistenceAPI

    installAgentBuilderAuthoring({
      persistence,
      loadExampleWorld: vi.fn(),
      loadProject,
      saveProject: vi.fn(async () => true),
      saveProjectAs: vi.fn(async () => true),
      updateWorld: vi.fn(),
      getCurrentProjectName: () => 'Untitled',
    })

    const result = await requireAgentBuilderAuthoring().loadSavedProjectByName('My Game')
    expect(result).toEqual({ loaded: true, projectId: 'id-1', projectName: 'My Game' })
    expect(loadProject).toHaveBeenCalledWith('id-1')
  })
})
