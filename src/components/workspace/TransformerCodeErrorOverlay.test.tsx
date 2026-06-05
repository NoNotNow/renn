import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TransformerCodeErrorOverlay from './TransformerCodeErrorOverlay'

describe('TransformerCodeErrorOverlay', () => {
  it('renders compile and runtime errors as overlay toasts', () => {
    render(
      <div style={{ position: 'relative', height: 200 }}>
        <TransformerCodeErrorOverlay
          compileError={'Failed to compile custom transformer "custom" (line 3)'}
          runtimeError={{
            message: 'Boom',
            code: 'throw new Error("Boom")',
            lineNumber: 3,
            stack: 'at transform',
          }}
          formatRuntimeClipboard={(snap) => snap.message}
        />
      </div>,
    )

    expect(screen.getByTestId('workspace-transformer-compile-error')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-transformer-runtime-error')).toBeInTheDocument()
    expect(screen.getByText('Boom')).toBeInTheDocument()
  })

  it('shows a green border when the runtime error is no longer active', () => {
    render(
      <TransformerCodeErrorOverlay
        runtimeError={{ message: 'Boom', code: 'throw new Error("Boom")', lineNumber: 3 }}
        runtimeActive={false}
      />,
    )

    const overlay = screen.getByTestId('workspace-transformer-runtime-error')
    expect(overlay).toHaveStyle({ borderColor: 'rgb(74, 106, 74)' })
  })

  it('copies runtime error text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(
      <TransformerCodeErrorOverlay
        runtimeError={{ message: 'Copy me', code: 'x', lineNumber: 1 }}
        formatRuntimeClipboard={() => 'Copy me'}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy runtime error' }))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('Copy me')
  })
})
