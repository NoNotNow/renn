import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddTransformerDialog from '@/components/workspace/AddTransformerDialog'
import type { TransformerConfig } from '@/types/transformer'

const registry: Record<string, TransformerConfig> = {
  car_a_tf0: { type: 'input', priority: 0 },
  car_b_tf1: { type: 'custom', name: 'AutoBrake', code: 'return {}', priority: 1 },
  car_b_tf2: { type: 'wanderer', priority: 2 },
  car_c_tf2: { type: 'wanderer', priority: 3 },
}

describe('AddTransformerDialog', () => {
  it('shows preset and existing tabs with grouped existing transformers', async () => {
    const user = userEvent.setup()
    render(
      <AddTransformerDialog
        isOpen
        onClose={vi.fn()}
        existingRegistry={registry}
        excludedIds={['car_a_tf0']}
        onAddPreset={vi.fn()}
        onAddExisting={vi.fn()}
      />,
    )

    expect(screen.getByTestId('add-transformer-tab-preset')).toBeInTheDocument()
    expect(screen.getByTestId('add-transformer-preset-wanderer')).toBeInTheDocument()

    await user.click(screen.getByTestId('add-transformer-tab-existing'))
    expect(screen.getByTestId('add-transformer-existing-list')).toBeInTheDocument()
    expect(screen.getByText('AutoBrake')).toBeInTheDocument()
    expect(screen.getByText('2 transformers · wanderer')).toBeInTheDocument()
    expect(screen.queryByTestId('add-transformer-existing-car_a_tf0')).not.toBeInTheDocument()
  })

  it('filters existing stacks by search', async () => {
    const user = userEvent.setup()
    render(
      <AddTransformerDialog
        isOpen
        onClose={vi.fn()}
        existingRegistry={registry}
        excludedIds={[]}
        onAddPreset={vi.fn()}
        onAddExisting={vi.fn()}
      />,
    )

    await user.click(screen.getByTestId('add-transformer-tab-existing'))
    await user.type(screen.getByTestId('add-transformer-search'), 'auto')
    expect(screen.getByText('AutoBrake')).toBeInTheDocument()
    expect(screen.queryByText('2 transformers · wanderer')).not.toBeInTheDocument()
  })

  it('adds a preset or links/copies a grouped existing transformer', async () => {
    const user = userEvent.setup()
    const onAddPreset = vi.fn()
    const onAddExisting = vi.fn()
    render(
      <AddTransformerDialog
        isOpen
        onClose={vi.fn()}
        existingRegistry={registry}
        excludedIds={[]}
        onAddPreset={onAddPreset}
        onAddExisting={onAddExisting}
      />,
    )

    await user.click(screen.getByTestId('add-transformer-preset-car2'))
    await user.click(screen.getByTestId('add-transformer-add-preset'))
    expect(onAddPreset).toHaveBeenCalledWith('car2')

    await user.click(screen.getByTestId('add-transformer-tab-existing'))
    await user.click(screen.getByTestId('add-transformer-existing-car_b_tf1'))
    await user.click(screen.getByTestId('add-transformer-link'))
    expect(onAddExisting).toHaveBeenCalledWith('car_b_tf1', 'link')

    onAddExisting.mockClear()
    await user.click(screen.getByTestId('add-transformer-existing-car_b_tf2'))
    await user.click(screen.getByTestId('add-transformer-copy'))
    expect(onAddExisting).toHaveBeenCalledWith('car_b_tf2', 'copy')
  })
})
