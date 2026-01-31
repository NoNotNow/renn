import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Switch from '@/components/Switch'

describe('Switch', () => {
  it('renders with role switch and aria-checked', () => {
    render(<Switch checked={true} onChange={vi.fn()} />)
    const sw = screen.getByRole('switch', { checked: true })
    expect(sw).toBeInTheDocument()
  })

  it('renders unchecked when checked is false', () => {
    render(<Switch checked={false} onChange={vi.fn()} />)
    const sw = screen.getByRole('switch', { checked: false })
    expect(sw).toBeInTheDocument()
  })

  it('calls onChange with toggled value when clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when clicked while checked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={true} onChange={onChange} />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('renders label when provided', () => {
    render(<Switch checked={false} onChange={vi.fn()} label="Gravity" />)
    expect(screen.getByText('Gravity')).toBeInTheDocument()
  })

  it('does not call onChange when disabled and clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} disabled />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
