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

  it('shows live trace summaries with active-state header color when liveTraceSteps provided', () => {
    const steps = [
      {
        configStackIndex: 0,
        type: 'input',
        priority: 0,
        skipped: false,
        inputBefore: { actions: {} },
        transformOutput: { earlyExit: false },
        actionsAfter: { throttle: 1 },
        outputLedActive: true,
      },
    ]
    renderTransformerEditor(
      <TransformerEditor
        transformers={[{ type: 'input', priority: 0, enabled: true }]}
        onChange={vi.fn()}
        disabled={false}
        liveTraceSteps={steps}
      />
    )

    expect(screen.getByTestId('transformer-live-io-0')).toBeInTheDocument()
    const outSummary = screen.getByTestId('transformer-trace-summary-output-0')
    expect(outSummary).toBeInTheDocument()
    expect(outSummary.textContent).toContain('actions ·')
    expect(outSummary).toHaveStyle({ color: 'rgb(74, 222, 128)' })
  })

  it('field reference is hidden by default and toggles with the document button', async () => {
    const user = userEvent.setup()
    renderTransformerEditor(
      <TransformerEditor
        transformers={[{ type: 'input', priority: 10, enabled: true }]}
        onChange={vi.fn()}
        disabled={false}
      />
    )

    expect(screen.queryByText('Field reference')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('transformer-field-reference-toggle'))
    expect(screen.getByText('Field reference')).toBeInTheDocument()

    await user.click(screen.getByTestId('transformer-field-reference-toggle'))
    expect(screen.queryByText('Field reference')).not.toBeInTheDocument()
  })

  it('syncs priorities to match the order when moving transformers', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const transformers = [
      { type: 'input', priority: 10, enabled: true },
      { type: 'car2', priority: 20, enabled: true },
    ]
    renderTransformerEditor(
      <TransformerEditor
        transformers={transformers}
        onChange={onChange}
        disabled={false}
      />
    )

    await user.click(screen.getAllByTestId('move-transformer-down')[0])
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall[0].type).toBe('car2')
    expect(lastCall[0].priority).toBe(0)
    expect(lastCall[1].type).toBe('input')
    expect(lastCall[1].priority).toBe(1)
  })

  it('syncs priorities when adding a transformer', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderTransformerEditor(
      <TransformerEditor
        transformers={[{ type: 'input', priority: 0, enabled: true }]}
        onChange={onChange}
        disabled={false}
      />
    )

    await user.selectOptions(screen.getByTestId('add-transformer-select'), 'car2')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall).toHaveLength(2)
    expect(lastCall[0].priority).toBe(0)
    expect(lastCall[1].priority).toBe(1)
  })
})
