import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyProvider } from '@/contexts/CopyContext'
import ScriptPanel from '@/components/ScriptPanel'
import type { RennWorld } from '@/types/world'

vi.mock('@monaco-editor/react', () => ({
  default: function MockEditor({ value }: { value: string }) {
    return <textarea data-testid="monaco-editor" value={value} readOnly />
  },
}))

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: { change: vi.fn(), delete: vi.fn(), click: vi.fn(), log: vi.fn(), select: vi.fn() },
}))

function worldWithEntityAndScript(): RennWorld {
  return {
    version: '1.0',
    world: { camera: { control: 'free', mode: 'follow', target: 'e1' } },
    entities: [
      { id: 'e1', name: 'Box', scripts: ['script_a'], position: [0, 0, 0] },
      { id: 'e2', name: 'Ball', scripts: ['script_a'], position: [1, 0, 0] },
    ],
    scripts: {
      script_a: { event: 'onUpdate', source: '// hello' },
      script_b: { event: 'onSpawn', source: '// world' },
    },
  }
}

describe('ScriptPanel', () => {
  it('shows "Select an entity to edit its scripts" when no entity selected', () => {
    const world = worldWithEntityAndScript()
    render(
      <CopyProvider>
        <ScriptPanel world={world} selectedEntityId={null} onWorldChange={vi.fn()} />
      </CopyProvider>
    )
    expect(screen.getByText(/select an entity to edit its scripts/i)).toBeInTheDocument()
  })

  it('shows "Scripts for [Entity name]" and "Manage scripts" when entity selected', () => {
    const world = worldWithEntityAndScript()
    render(
      <CopyProvider>
        <ScriptPanel world={world} selectedEntityId="e1" onWorldChange={vi.fn()} />
      </CopyProvider>
    )
    expect(screen.getByText(/scripts for box/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manage scripts/i })).toBeInTheDocument()
  })

  it('Detach from entity removes script only from entity, not from world.scripts', async () => {
    const world = worldWithEntityAndScript()
    const onWorldChange = vi.fn()
    render(
      <CopyProvider>
        <ScriptPanel world={world} selectedEntityId="e1" onWorldChange={onWorldChange} />
      </CopyProvider>
    )

    const detachButton = screen.getByRole('button', { name: /detach from entity/i })
    expect(detachButton).toBeInTheDocument()
    await userEvent.click(detachButton)

    expect(onWorldChange).toHaveBeenCalledTimes(1)
    const nextWorld = onWorldChange.mock.calls[0][0] as RennWorld
    expect(nextWorld.scripts).toEqual(world.scripts)
    expect(nextWorld.scripts?.script_a).toEqual({ event: 'onUpdate', source: '// hello' })
    const e1 = nextWorld.entities.find((e) => e.id === 'e1')
    expect(e1?.scripts).toEqual([])
    const e2 = nextWorld.entities.find((e) => e.id === 'e2')
    expect(e2?.scripts).toEqual(['script_a'])
  })

  it('Detach from entity is disabled when script is not attached to selected entity', async () => {
    const world = worldWithEntityAndScript()
    render(
      <CopyProvider>
        <ScriptPanel world={world} selectedEntityId="e1" onWorldChange={vi.fn()} />
      </CopyProvider>
    )
    const comboboxes = screen.getAllByRole('combobox')
    const scriptSelect = comboboxes[0]
    fireEvent.change(scriptSelect, { target: { value: 'script_b' } })

    await waitFor(() => {
      const detachButton = screen.getByRole('button', { name: /detach from entity/i })
      expect(detachButton).toBeDisabled()
    })
  })

  it('shows shared-script banner when selected script is used by more than one entity', () => {
    const world = worldWithEntityAndScript()
    render(
      <CopyProvider>
        <ScriptPanel world={world} selectedEntityId="e1" onWorldChange={vi.fn()} />
      </CopyProvider>
    )
    expect(screen.getByText(/this script is shared/i)).toBeInTheDocument()
    expect(screen.getByText(/used by:.*box.*ball/i)).toBeInTheDocument()
  })

  it('ScriptDialog rename updates world.scripts and all entity.scripts', async () => {
    const world = worldWithEntityAndScript()
    const onWorldChange = vi.fn()
    const promptStub = vi.fn(() => 'script_renamed')
    vi.stubGlobal('prompt', promptStub)

    render(
      <CopyProvider>
        <ScriptPanel world={world} selectedEntityId="e1" onWorldChange={onWorldChange} />
      </CopyProvider>
    )

    await userEvent.click(screen.getByRole('button', { name: /manage scripts/i }))

    const dialog = screen.getByRole('dialog', { name: /scripts for box/i })
    const scriptALabel = within(dialog).getAllByText('script_a')[0]
    await userEvent.click(scriptALabel)

    const renameButton = within(dialog).getByRole('button', { name: /rename/i })
    await userEvent.click(renameButton)

    expect(promptStub).toHaveBeenCalledWith('New script ID:', 'script_a')
    expect(onWorldChange).toHaveBeenCalledTimes(1)
    const nextWorld = onWorldChange.mock.calls[0][0] as RennWorld
    expect(nextWorld.scripts?.script_a).toBeUndefined()
    expect(nextWorld.scripts?.script_renamed).toEqual({ event: 'onUpdate', source: '// hello' })
    expect(nextWorld.scripts?.script_b).toEqual({ event: 'onSpawn', source: '// world' })
    const e1 = nextWorld.entities.find((e) => e.id === 'e1')
    const e2 = nextWorld.entities.find((e) => e.id === 'e2')
    expect(e1?.scripts).toEqual(['script_renamed'])
    expect(e2?.scripts).toEqual(['script_renamed'])

    vi.unstubAllGlobals()
  })
})
