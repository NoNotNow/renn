import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EntityCameraPanel from './EntityCameraPanel'
import { CopyProvider } from '@/contexts/CopyContext'
import type { Entity, RennWorld } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: {
    change: vi.fn(),
    click: vi.fn(),
    log: vi.fn(),
    select: vi.fn(),
  },
}))

function makeWorld(entities: Entity[] = []): RennWorld {
  return {
    version: '1.0',
    world: {
      camera: { control: 'free', mode: 'follow', target: '' },
      gravity: [0, -9.81, 0],
    },
    entities,
  } as unknown as RennWorld
}

function makeAvatar(id: string, name: string): Entity {
  return {
    id,
    name,
    bodyType: 'dynamic',
    shape: { type: 'capsule', radius: 0.5, height: 1 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    avatar: { enabled: true },
  } as unknown as Entity
}

function renderPanel(props: Partial<React.ComponentProps<typeof EntityCameraPanel>> = {}) {
  const onCameraControlChange = vi.fn()
  const onCameraTargetChange = vi.fn()
  const onCameraModeChange = vi.fn()
  const onCameraTargetVerticalAngleChange = vi.fn()
  const onWorldChange = vi.fn()
  const entities = props.entities ?? []
  const world = props.world ?? makeWorld(entities)
  const utils = render(
    <CopyProvider>
      <EntityCameraPanel
        entities={entities}
        world={world}
        cameraControl={props.cameraControl ?? 'free'}
        cameraTarget={props.cameraTarget ?? ''}
        cameraMode={props.cameraMode ?? 'firstPerson'}
        cameraTargetVerticalAngle={props.cameraTargetVerticalAngle ?? 0}
        onCameraControlChange={onCameraControlChange}
        onCameraTargetChange={onCameraTargetChange}
        onCameraModeChange={onCameraModeChange}
        onCameraTargetVerticalAngleChange={onCameraTargetVerticalAngleChange}
        onWorldChange={onWorldChange}
      />
    </CopyProvider>,
  )
  return {
    onCameraControlChange,
    onCameraTargetChange,
    onCameraModeChange,
    onCameraTargetVerticalAngleChange,
    onWorldChange,
    ...utils,
  }
}

describe('EntityCameraPanel', () => {
  it('renders the control select with the current value', () => {
    renderPanel({ cameraControl: 'free' })
    const select = screen.getByLabelText('Control') as HTMLSelectElement
    expect(select.value).toBe('free')
  })

  it('changing control fires onCameraControlChange with the new value', () => {
    const { onCameraControlChange } = renderPanel({ cameraControl: 'free' })
    const select = screen.getByLabelText('Control') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'follow' } })
    expect(onCameraControlChange).toHaveBeenCalledWith('follow')
  })

  it('hides target/mode rows unless control === "follow"', () => {
    renderPanel({ cameraControl: 'free' })
    expect(screen.queryByLabelText('Target')).toBeNull()
    expect(screen.queryByLabelText('Mode')).toBeNull()
    expect(screen.queryByLabelText('Vertical angle')).toBeNull()
  })

  it('shows target/mode and vertical angle when control === "follow"', () => {
    renderPanel({ cameraControl: 'follow' })
    expect(screen.getByLabelText('Target')).toBeInTheDocument()
    expect(screen.getByLabelText('Mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Vertical angle')).toBeInTheDocument()
  })

  it('renders avatar roster buttons in follow mode and selecting one fires onCameraTargetChange', () => {
    const a = makeAvatar('avatar-a', 'Alpha')
    const b = makeAvatar('avatar-b', 'Beta')
    const { onCameraTargetChange } = renderPanel({
      entities: [a, b],
      cameraControl: 'follow',
      cameraTarget: 'avatar-a',
    })
    const betaButton = screen.getByRole('button', { name: 'Select avatar Beta' })
    fireEvent.click(betaButton)
    expect(onCameraTargetChange).toHaveBeenCalledWith('avatar-b')
  })

  it('Edit button is disabled when there is no avatar focus target', () => {
    renderPanel({ cameraControl: 'follow', entities: [] })
    expect(screen.queryByRole('button', { name: /Edit avatar settings/ })).toBeNull()
  })

  it('vertical angle slider fires onCameraTargetVerticalAngleChange', () => {
    const { onCameraTargetVerticalAngleChange } = renderPanel({
      cameraControl: 'follow',
      cameraTargetVerticalAngle: 0,
    })
    const slider = screen.getByLabelText('Vertical angle') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '-15' } })
    expect(onCameraTargetVerticalAngleChange).toHaveBeenCalledWith(-15)
  })
})
