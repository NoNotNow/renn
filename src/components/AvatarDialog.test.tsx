import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyProvider } from '@/contexts/CopyContext'
import AvatarDialog from '@/components/AvatarDialog'
import type { RennWorld } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: { change: vi.fn(), delete: vi.fn(), click: vi.fn(), log: vi.fn(), select: vi.fn(), upload: vi.fn() },
}))

function makeWorld(): RennWorld {
  return {
    version: '1.0',
    world: {
      camera: { control: 'free', mode: 'follow', target: 'e1', distance: 10, height: 2 },
    },
    entities: [
      {
        id: 'e1',
        name: 'Hero',
        position: [0, 0, 0],
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        avatar: { enabled: true, preferredCamera: { mode: 'follow', distance: 7 } },
        transformers: [{ type: 'input', priority: 0, enabled: true }],
      },
    ],
  }
}

describe('AvatarDialog', () => {
  it('renders and allows toggling playable avatar', async () => {
    const user = userEvent.setup()
    const onWorldChange = vi.fn()
    const world = makeWorld()

    render(
      <CopyProvider>
        <AvatarDialog
          isOpen
          onClose={() => {}}
          world={world}
          entityId="e1"
          onWorldChange={onWorldChange}
        />
      </CopyProvider>,
    )

    const toggle = screen.getByRole('switch', { name: /playable avatar/i })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(toggle)
    expect(onWorldChange).toHaveBeenCalledTimes(1)
    const nextWorld = onWorldChange.mock.calls[0]![0] as RennWorld
    const nextEntity = nextWorld.entities.find((e) => e.id === 'e1')
    expect(nextEntity?.avatar).toBeUndefined()
  })

  it('shows JSON parse error and disables apply for invalid avatar JSON', async () => {
    const user = userEvent.setup()
    const onWorldChange = vi.fn()
    const world = makeWorld()

    render(
      <CopyProvider>
        <AvatarDialog isOpen onClose={() => {}} world={world} entityId="e1" onWorldChange={onWorldChange} />
      </CopyProvider>,
    )

    // Avatar JSON (advanced) is collapsed by default; open it.
    await user.click(screen.getByText(/avatar json/i))

    const textarea = screen.getByTestId('avatar-json-textarea') as HTMLTextAreaElement
    const applyBtn = screen.getByTestId('avatar-json-apply') as HTMLButtonElement

    fireEvent.change(textarea, { target: { value: '{ invalid json }' } })

    expect(screen.getByText(/Invalid JSON:/i)).toBeInTheDocument()
    expect(applyBtn).toBeDisabled()
  })

  it('shows avatar roster chips and updates camera and edited entity when selecting a chip', async () => {
    const user = userEvent.setup()
    const onCameraTargetChange = vi.fn()
    const onEditingEntityIdChange = vi.fn()
    const world: RennWorld = {
      version: '1.0',
      world: {
        camera: { control: 'free', mode: 'follow', target: 'e1', distance: 10, height: 2 },
      },
      entities: [
        {
          id: 'e1',
          name: 'Hero',
          position: [0, 0, 0],
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          avatar: { enabled: true },
          transformers: [],
        },
        {
          id: 'e2',
          name: 'Sidekick',
          position: [1, 0, 0],
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          avatar: { enabled: true },
          transformers: [],
        },
      ],
    }

    render(
      <CopyProvider>
        <AvatarDialog
          isOpen
          onClose={() => {}}
          world={world}
          entityId="e1"
          onWorldChange={vi.fn()}
          cameraTarget="e1"
          onCameraTargetChange={onCameraTargetChange}
          onEditingEntityIdChange={onEditingEntityIdChange}
        />
      </CopyProvider>,
    )

    await user.click(screen.getByRole('button', { name: /select avatar sidekick/i }))
    expect(onCameraTargetChange).toHaveBeenCalledWith('e2')
    expect(onEditingEntityIdChange).toHaveBeenCalledWith('e2')
  })
})

