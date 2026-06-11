import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WorldPanel from './WorldPanel'
import { EditorUndoProvider, type EditorUndoApi } from '@/contexts/EditorUndoContext'
import { CopyProvider } from '@/contexts/CopyContext'
import type { RennWorld } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: {
    change: vi.fn(),
    delete: vi.fn(),
    click: vi.fn(),
    log: vi.fn(),
    select: vi.fn(),
    upload: vi.fn(),
  },
}))

vi.mock('@/hooks/useProjectContext', () => ({
  useProjectContext: () => ({
    assets: new Map<string, Blob>(),
    updateAssets: vi.fn(),
  }),
}))

function makeWorld(): RennWorld {
  return {
    version: '1.0',
    world: {
      camera: { control: 'free', mode: 'follow', target: 'ground' },
      gravity: [0, -9.81, 0],
    },
    entities: [
      {
        id: 'ground',
        name: 'Ground',
        bodyType: 'static',
        shape: { type: 'plane' },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        friction: 0.5,
        material: { color: [0.3, 0.5, 0.3], roughness: 0.5, metalness: 0, opacity: 1 },
      },
    ],
  }
}

function makeUndo(): EditorUndoApi {
  return {
    pushBeforeEdit: vi.fn(),
    notifyScrubStart: vi.fn(),
    notifyScrubEnd: vi.fn(),
  }
}

function renderPanel(world: RennWorld, onWorldChange: (w: RennWorld) => void, undo?: EditorUndoApi) {
  const panel = <WorldPanel world={world} onWorldChange={onWorldChange} />
  const wrapped = undo != null ? <EditorUndoProvider value={undo}>{panel}</EditorUndoProvider> : panel
  return render(<CopyProvider>{wrapped}</CopyProvider>)
}

describe('WorldPanel composition', () => {
  it('renders all world sections', () => {
    renderPanel(makeWorld(), vi.fn())
    expect(screen.getByText('Simulation')).toBeInTheDocument()
    expect(screen.getByText('Gravity')).toBeInTheDocument()
    expect(screen.getByText('Sleep')).toBeInTheDocument()
    expect(screen.getByText('Distance Culling')).toBeInTheDocument()
    expect(screen.getByText('Sky')).toBeInTheDocument()
    expect(screen.getByText('Fog')).toBeInTheDocument()
    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Ground')).toBeInTheDocument()
  })

  it('shows the no-ground placeholder when no plane entity exists', () => {
    const world = makeWorld()
    world.entities = []
    renderPanel(world, vi.fn())
    expect(screen.getByText(/No ground entity found/i)).toBeInTheDocument()
  })

  it('toggling the shadows checkbox calls onWorldChange with shadowsEnabled false', () => {
    const onWorldChange = vi.fn()
    renderPanel(makeWorld(), onWorldChange)
    const checkbox = screen.getByLabelText('Shadows') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    expect(onWorldChange).toHaveBeenCalledTimes(1)
    const next = onWorldChange.mock.calls[0][0] as RennWorld
    expect(next.world.shadowsEnabled).toBe(false)
  })

  it('toggling the show-frame-stats checkbox calls onWorldChange with the new flag', () => {
    const onWorldChange = vi.fn()
    renderPanel(makeWorld(), onWorldChange)
    const checkbox = screen.getByLabelText('Show frame stats overlay') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(onWorldChange).toHaveBeenCalledTimes(1)
    const next = onWorldChange.mock.calls[0][0] as RennWorld
    expect(next.world.showFrameStats).toBe(true)
  })

  it('toggling distance culling off serializes to false', () => {
    const onWorldChange = vi.fn()
    const undo = makeUndo()
    renderPanel(makeWorld(), onWorldChange, undo)
    const checkbox = document.getElementById('culling-enabled') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    expect(undo.pushBeforeEdit).toHaveBeenCalledTimes(1)
    const next = onWorldChange.mock.calls[0][0] as RennWorld
    expect(next.world.distanceCulling).toBe(false)
  })

  it('toggling fog on writes default fog settings', () => {
    const onWorldChange = vi.fn()
    const undo = makeUndo()
    renderPanel(makeWorld(), onWorldChange, undo)
    const fogCheckbox = document.getElementById('fog-enabled') as HTMLInputElement
    expect(fogCheckbox.checked).toBe(false)
    fireEvent.click(fogCheckbox)
    expect(undo.pushBeforeEdit).toHaveBeenCalledTimes(1)
    const next = onWorldChange.mock.calls[0][0] as RennWorld
    expect(next.world.fog).toEqual(expect.objectContaining({ near: 10, far: 200 }))
  })

  it('changing the sky color writes a Vec3 into world.world.skyColor', () => {
    const onWorldChange = vi.fn()
    const undo = makeUndo()
    renderPanel(makeWorld(), onWorldChange, undo)
    const colorInput = screen.getByLabelText('Sky color') as HTMLInputElement
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })
    expect(undo.pushBeforeEdit).toHaveBeenCalled()
    const next = onWorldChange.mock.calls.at(-1)![0] as RennWorld
    expect(next.world.skyColor?.[0]).toBeCloseTo(1)
    expect(next.world.skyColor?.[1]).toBeCloseTo(0)
    expect(next.world.skyColor?.[2]).toBeCloseTo(0)
  })

  it('clearing the skybox via Clear button removes world.world.skybox', () => {
    const world = makeWorld()
    world.world.skybox = 'sky-asset-id'
    const onWorldChange = vi.fn()
    const undo = makeUndo()
    renderPanel(world, onWorldChange, undo)
    const clearBtn = screen.getByRole('button', { name: 'Clear' })
    fireEvent.click(clearBtn)
    const next = onWorldChange.mock.calls.at(-1)![0] as RennWorld
    expect(next.world.skybox).toBeUndefined()
    expect(undo.pushBeforeEdit).toHaveBeenCalled()
  })

  it('changing the ground color emits a patched world via patchFirstPlaneEntity', () => {
    const onWorldChange = vi.fn()
    const undo = makeUndo()
    renderPanel(makeWorld(), onWorldChange, undo)
    const colorInput = screen.getByLabelText('Ground color') as HTMLInputElement
    fireEvent.change(colorInput, { target: { value: '#0000ff' } })
    const next = onWorldChange.mock.calls.at(-1)![0] as RennWorld
    const ground = next.entities.find((e) => e.shape?.type === 'plane')
    expect(ground?.material?.color?.[2]).toBeCloseTo(1)
    expect(ground?.material?.color?.[0]).toBeCloseTo(0)
    expect(undo.pushBeforeEdit).toHaveBeenCalled()
  })
})
