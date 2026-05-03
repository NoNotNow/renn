import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ValidatedJsonTextarea, { type JsonContentValidation } from '@/components/ValidatedJsonTextarea'

describe('ValidatedJsonTextarea', () => {
  it('seeds textarea from value and calls onApply with parsed JSON', () => {
    const onApply = vi.fn()
    render(
      <ValidatedJsonTextarea
        value={JSON.stringify({ a: 1 }, null, 2)}
        onApply={onApply}
        textareaTestId="ta"
        applyTestId="apply"
      />,
    )

    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    expect(ta.value).toBe('{\n  "a": 1\n}')

    fireEvent.change(ta, { target: { value: '{ "a": 2 }' } })
    fireEvent.click(screen.getByTestId('apply'))

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith({ a: 2 })
  })

  it('disables apply on JSON parse failure and shows the error', () => {
    const onApply = vi.fn()
    render(
      <ValidatedJsonTextarea
        value={'{}'}
        onApply={onApply}
        textareaTestId="ta"
        applyTestId="apply"
      />,
    )

    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '{ not json' } })

    expect(screen.getByText(/Invalid JSON:/i)).toBeInTheDocument()
    expect(screen.getByTestId('apply')).toBeDisabled()

    fireEvent.click(screen.getByTestId('apply'))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('runs validate() on parsed value and disables apply when validation fails', () => {
    const onApply = vi.fn()
    const validate = (parsed: unknown): JsonContentValidation => {
      const obj = parsed as { x?: number }
      if (typeof obj?.x === 'number' && obj.x > 0) return { ok: true }
      return { ok: false, error: 'x must be a positive number' }
    }

    render(
      <ValidatedJsonTextarea
        value={'{"x": 1}'}
        validate={validate}
        onApply={onApply}
        textareaTestId="ta"
        applyTestId="apply"
      />,
    )

    expect(screen.getByTestId('apply')).not.toBeDisabled()

    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '{"x": -1}' } })

    expect(screen.getByText(/x must be a positive number/i)).toBeInTheDocument()
    expect(screen.getByTestId('apply')).toBeDisabled()

    fireEvent.change(ta, { target: { value: '{"x": 5}' } })
    expect(screen.getByTestId('apply')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('apply'))
    expect(onApply).toHaveBeenCalledWith({ x: 5 })
  })

  it('reseeds the editor when value prop changes', () => {
    const onApply = vi.fn()
    const { rerender } = render(
      <ValidatedJsonTextarea
        value={'{"a":1}'}
        onApply={onApply}
        textareaTestId="ta"
        applyTestId="apply"
      />,
    )

    const ta = () => screen.getByTestId('ta') as HTMLTextAreaElement
    expect(ta().value).toBe('{"a":1}')

    rerender(
      <ValidatedJsonTextarea
        value={'{"a":2}'}
        onApply={onApply}
        textareaTestId="ta"
        applyTestId="apply"
      />,
    )
    expect(ta().value).toBe('{"a":2}')
  })

  it('renders icon-variant apply button when applyVariant="icon"', () => {
    render(
      <ValidatedJsonTextarea
        value={'{}'}
        onApply={vi.fn()}
        applyVariant="icon"
        textareaTestId="ta"
        applyTestId="apply"
      />,
    )
    const apply = screen.getByTestId('apply')
    expect(apply).toHaveAttribute('aria-label', 'Apply configuration')
    // icon variant renders an svg child
    expect(apply.querySelector('svg')).toBeTruthy()
  })

  it('renders applyRowAccessory left of icon apply button', () => {
    render(
      <ValidatedJsonTextarea
        value={'{}'}
        onApply={vi.fn()}
        applyVariant="icon"
        applyRowAccessory={<span data-testid="accessory">Live</span>}
        textareaTestId="ta"
        applyTestId="apply"
      />,
    )
    expect(screen.getByTestId('accessory')).toHaveTextContent('Live')
    const row = screen.getByTestId('apply').parentElement
    expect(row).toContainElement(screen.getByTestId('accessory'))
  })
})
