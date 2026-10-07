import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModelTransformSection from './ModelTransformSection'
import type { Entity } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: { change: vi.fn(), delete: vi.fn(), click: vi.fn(), log: vi.fn(), select: vi.fn(), upload: vi.fn() },
}))

function entityWithModel(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'car',
    shape: { type: 'box', width: 2, height: 1, depth: 4 },
    model: 'car.glb',
    modelPosition: [0.1, 0.2, 0.3],
    modelRotation: [0, 0, 0],
    modelScale: [1, 1, 1],
    ...overrides,
  }
}

describe('ModelTransformSection', () => {
  it('shows model position field and calls onEntityModelTransformChange', async () => {
    const user = userEvent.setup()
    const onEntityModelTransformChange = vi.fn()
    const entity = entityWithModel()
    render(
      <ModelTransformSection
        entities={[entity]}
        ids={[entity.id]}
        editorIdPrefix={entity.id}
        anyLocked={false}
        onEntityModelTransformChange={onEntityModelTransformChange}
        updateAll={vi.fn()}
        updateEach={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/model position x/i)).toBeInTheDocument()
    const xInput = screen.getByLabelText(/model position x/i)
    await user.clear(xInput)
    await user.type(xInput, '0.5')
    await user.tab()
    expect(onEntityModelTransformChange).toHaveBeenCalled()
    const lastCall = onEntityModelTransformChange.mock.calls.at(-1)
    expect(lastCall?.[0]).toEqual(['car'])
    expect(lastCall?.[1]).toEqual(expect.objectContaining({ modelPosition: expect.any(Array) }))
  })

  it('falls back to updateAll when onEntityModelTransformChange is undefined', async () => {
    const user = userEvent.setup()
    const updateAll = vi.fn()
    const entity = entityWithModel()
    render(
      <ModelTransformSection
        entities={[entity]}
        ids={[entity.id]}
        editorIdPrefix={entity.id}
        anyLocked={false}
        updateAll={updateAll}
        updateEach={vi.fn()}
      />,
    )
    const yInput = screen.getByLabelText(/model position y/i)
    await user.clear(yInput)
    await user.type(yInput, '1')
    await user.tab()
    expect(updateAll).toHaveBeenCalled()
    expect(updateAll.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ modelPosition: expect.any(Array) }))
  })
})
