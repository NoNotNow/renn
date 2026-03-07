import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CopyProvider, useCopyMenu } from './CopyContext'

const mockWriteText = vi.fn()

function TestTrigger({ openOnMount = false }: { openOnMount?: boolean }) {
  const { openMenu } = useCopyMenu()
  useEffect(() => {
    if (openOnMount) {
      const mockEvent = {
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 200,
      } as unknown as React.MouseEvent
      openMenu(mockEvent, () => ({ foo: 1, bar: 'baz' }))
    }
  }, [openOnMount, openMenu])
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const mockEvent = {
            preventDefault: vi.fn(),
            clientX: 100,
            clientY: 200,
          } as unknown as React.MouseEvent
          openMenu(mockEvent, () => ({ foo: 1, bar: 'baz' }))
        }}
      >
        Open menu
      </button>
    </div>
  )
}

describe('CopyContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteText.mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    })
  })

  it('clipboard mock is used', () => {
    navigator.clipboard.writeText('hello')
    expect(mockWriteText).toHaveBeenCalledWith('hello')
  })

  it('opens menu on openMenu and copy button calls getPayload and writes JSON to clipboard then closes', () => {
    render(
      <CopyProvider>
        <TestTrigger openOnMount />
      </CopyProvider>
    )

    const copyItem = screen.getByRole('menuitem', { name: /copy to clipboard/i })
    expect(copyItem).toBeInTheDocument()

    fireEvent.click(copyItem)

    expect(mockWriteText).toHaveBeenCalledTimes(1)
    expect(mockWriteText).toHaveBeenCalledWith(
      JSON.stringify({ foo: 1, bar: 'baz' }, null, 2)
    )

    expect(screen.queryByRole('menuitem', { name: /copy to clipboard/i })).not.toBeInTheDocument()
  })

  it('useCopyMenu throws when used outside CopyProvider', () => {
    expect(() => render(<TestTrigger />)).toThrow('useCopyMenu must be used within CopyProvider')
  })
})
