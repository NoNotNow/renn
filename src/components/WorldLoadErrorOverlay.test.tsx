import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorldLoadErrorOverlay } from '@/components/WorldLoadErrorOverlay'

describe('WorldLoadErrorOverlay', () => {
  it('renders the message verbatim inside a <pre>', () => {
    render(<WorldLoadErrorOverlay message="oops\nbad json" onDismiss={() => {}} />)
    expect(screen.getByText(/oops\\nbad json/)).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('invokes onDismiss when the button is clicked', async () => {
    const onDismiss = vi.fn()
    render(<WorldLoadErrorOverlay message="boom" onDismiss={onDismiss} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('exposes a heading for assistive tech', () => {
    render(<WorldLoadErrorOverlay message="x" onDismiss={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Failed to load world' })).toBeTruthy()
  })
})
