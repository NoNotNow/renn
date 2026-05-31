import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

const ThrowError = () => {
  throw new Error('Test Error')
}

describe('ErrorBoundary', () => {
  const mockWriteText = vi.fn()

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    mockWriteText.mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Child Content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Child Content')).toBeTruthy()
  })

  it('renders error message and buttons when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('Test Error')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy Error' })).toBeTruthy()
  })

  it('copies full error to clipboard when "Copy Error" is clicked', async () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    const copyButton = screen.getByRole('button', { name: 'Copy Error' })
    fireEvent.click(copyButton)

    const callArg = mockWriteText.mock.calls[0][0]
    expect(callArg).toContain('Test Error')
    expect(callArg).toContain('ErrorBoundary.test.tsx')
    expect(callArg).toContain('Component Stack:')

    expect(screen.getByText('Copied!')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByText('Copy Error')).toBeTruthy()
  })
})


