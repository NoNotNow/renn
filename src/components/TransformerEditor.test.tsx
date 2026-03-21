import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TransformerEditor from '@/components/TransformerEditor'
import { CopyProvider } from '@/contexts/CopyContext'

function renderTransformerEditor(ui: ReactElement) {
  return render(<CopyProvider>{ui}</CopyProvider>)
}

describe('TransformerEditor', () => {
  it('click toggles enabled from true to false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderTransformerEditor(
      <TransformerEditor
        transformers={[{ type: 'input', priority: 10, enabled: true }]}
        onChange={onChange}
        disabled={false}
      />
    )

    await user.click(screen.getByTestId('transformer-enabled-toggle-0'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      type: 'input',
      enabled: false,
    })
  })

  it('click toggles enabled from false to true', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderTransformerEditor(
      <TransformerEditor
        transformers={[{ type: 'input', priority: 10, enabled: false }]}
        onChange={onChange}
        disabled={false}
      />
    )

    await user.click(screen.getByTestId('transformer-enabled-toggle-0'))
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      type: 'input',
      enabled: true,
    })
  })

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderTransformerEditor(
      <TransformerEditor
        transformers={[{ type: 'input', priority: 10, enabled: true }]}
        onChange={onChange}
        disabled
      />
    )

    await user.click(screen.getByTestId('transformer-enabled-toggle-0'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
