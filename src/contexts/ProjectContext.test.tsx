import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { type MutableRefObject } from 'react'
import { ProjectProvider } from './ProjectContext'
import { useProjectContext } from '@/hooks/useProjectContext'
import type { Vec3, Rotation } from '@/types/world'

// ------------------------------------------------------------------
// Mock persistence
// vi.mock factory is hoisted before variable declarations, so we use
// vi.hoisted() to ensure the mock functions are available in the factory.
// ------------------------------------------------------------------

const { mockSaveProject, mockListProjects, mockLoadProject, mockLoadAllAssets } = vi.hoisted(() => ({
  mockSaveProject: vi.fn().mockResolvedValue(undefined),
  mockListProjects: vi.fn().mockResolvedValue([]),
  mockLoadProject: vi.fn(),
  mockLoadAllAssets: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('@/persistence/indexedDb', () => ({
  createIndexedDbPersistence: () => ({
    listProjects: mockListProjects,
    loadProject: mockLoadProject,
    saveProject: mockSaveProject,
    deleteProject: vi.fn().mockResolvedValue(undefined),
    exportProject: vi.fn(),
    importProject: vi.fn(),
    saveAsset: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn(),
    listAllAssets: vi.fn().mockResolvedValue([]),
    loadAllAssets: mockLoadAllAssets,
    loadAssetPreview: vi.fn().mockResolvedValue(null),
  }),
}))

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

type ContextValue = ReturnType<typeof useProjectContext>

function ContextCapture({
  capture,
}: {
  capture: MutableRefObject<ContextValue | null>
}) {
  capture.current = useProjectContext()
  return null
}

function renderContext(): MutableRefObject<ContextValue | null> {
  const captured: MutableRefObject<ContextValue | null> = { current: null }
  render(
    <MemoryRouter>
      <ProjectProvider>
        <ContextCapture capture={captured} />
      </ProjectProvider>
    </MemoryRouter>
  )
  return captured
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
  })
}

// sampleWorld uses 'car' as the primary dynamic entity (id: 'car', position: [0, 2, 0])
const CAR_ID = 'car'
const UPDATED_POSITION: Vec3 = [10, 20, 30]
const UNCHANGED_ROTATION: Rotation = [0, 0, 0]

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('ProjectContext – save includes synced poses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListProjects.mockResolvedValue([])
    mockLoadAllAssets.mockResolvedValue(new Map())
  })

  it('saveProjectAs persists synced poses, not the stale pre-sync world', async () => {
    const captured = renderContext()
    await flushEffects()

    const ctx = captured.current!

    // Simulate the scene reporting an updated car position
    const poses = new Map<string, { position: Vec3; rotation: Rotation }>([
      [CAR_ID, { position: UPDATED_POSITION, rotation: UNCHANGED_ROTATION }],
    ])

    act(() => {
      ctx.syncPosesFromScene(poses)
    })

    await act(async () => {
      await ctx.saveProjectAs('My World')
    })

    expect(mockSaveProject).toHaveBeenCalledOnce()
    const savedWorld = mockSaveProject.mock.calls[0][2].world
    const savedCar = savedWorld.entities.find((e: { id: string }) => e.id === CAR_ID)
    expect(savedCar?.position).toEqual(UPDATED_POSITION)
  })

  it('saveProject persists synced poses when the project already has an id', async () => {
    const projectId = 'existing-proj'
    const savedWorldData = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] as Vec3 },
      entities: [
        { id: CAR_ID, bodyType: 'dynamic' as const, shape: { type: 'box' as const, width: 2, height: 1, depth: 4 }, position: [0, 2, 0] as Vec3 },
      ],
    }

    mockListProjects.mockResolvedValue([{ id: projectId, name: 'Existing', updatedAt: Date.now() }])
    mockLoadProject.mockResolvedValue({ world: savedWorldData, assets: new Map() })

    const captured = renderContext()
    await flushEffects()

    // Load the project so currentProject.id is set
    await act(async () => {
      await captured.current!.loadProject(projectId)
    })

    const ctx = captured.current!
    expect(ctx.currentProject.id).toBe(projectId)

    // Sync updated poses
    const poses = new Map<string, { position: Vec3; rotation: Rotation }>([
      [CAR_ID, { position: UPDATED_POSITION, rotation: UNCHANGED_ROTATION }],
    ])

    act(() => {
      ctx.syncPosesFromScene(poses)
    })

    await act(async () => {
      await ctx.saveProject()
    })

    // Find the last saveProject call (there may be calls from earlier setup)
    const saveCalls = mockSaveProject.mock.calls
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    const lastSavedWorld = saveCalls[saveCalls.length - 1][2].world
    const savedCar = lastSavedWorld.entities.find((e: { id: string }) => e.id === CAR_ID)
    expect(savedCar?.position).toEqual(UPDATED_POSITION)
  })

  it('saveToProject persists synced poses when overwriting an existing project', async () => {
    const targetId = 'target-proj'
    mockListProjects.mockResolvedValue([{ id: targetId, name: 'Target', updatedAt: Date.now() }])

    const captured = renderContext()
    await flushEffects()

    const ctx = captured.current!

    // Sync updated poses into the default world
    const poses = new Map<string, { position: Vec3; rotation: Rotation }>([
      [CAR_ID, { position: UPDATED_POSITION, rotation: UNCHANGED_ROTATION }],
    ])

    act(() => {
      ctx.syncPosesFromScene(poses)
    })

    await act(async () => {
      await ctx.saveToProject(targetId)
    })

    expect(mockSaveProject).toHaveBeenCalledOnce()
    const savedWorld = mockSaveProject.mock.calls[0][2].world
    const savedCar = savedWorld.entities.find((e: { id: string }) => e.id === CAR_ID)
    expect(savedCar?.position).toEqual(UPDATED_POSITION)
  })
})
