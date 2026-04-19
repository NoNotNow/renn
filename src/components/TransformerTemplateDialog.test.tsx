import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TransformerTemplateDialog from '@/components/TransformerTemplateDialog'
import type { TransformerConfig } from '@/types/transformer'

const car2Config: TransformerConfig = {
  type: 'car2',
  priority: 10,
  enabled: true,
  params: {
    power: 400,
    steeringIntensity: 0.1,
    steeringSpeed: 0.01,
    lateralGrip: 100,
    tireGripSlipSpeedThreshold: 2,
    lateralGripSlipScale: 0.3,
    jumpImpulse: 200,
  },
}

describe('TransformerTemplateDialog', () => {
  it('shows JSON preview when a template is selected', async () => {
    const user = userEvent.setup()
    render(
      <TransformerTemplateDialog
        isOpen
        onClose={vi.fn()}
        transformerType="car2"
        currentConfig={car2Config}
        onLoadTemplate={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByTestId('transformer-template-select'), 'default')

    const preview = screen.getByTestId('transformer-template-preview')
    await screen.findByText(/"type": "car2"/, {}, { timeout: 5000 })
    expect(preview).toHaveTextContent('"params"')
  })

  it('clears preview when template selection is cleared', async () => {
    const user = userEvent.setup()
    render(
      <TransformerTemplateDialog
        isOpen
        onClose={vi.fn()}
        transformerType="car2"
        currentConfig={car2Config}
        onLoadTemplate={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByTestId('transformer-template-select'), 'default')
    await screen.findByText(/"type": "car2"/)

    await user.selectOptions(screen.getByTestId('transformer-template-select'), '')

    expect(screen.getByTestId('transformer-template-preview')).toHaveTextContent(
      'Select a template to preview JSON'
    )
  })
})
