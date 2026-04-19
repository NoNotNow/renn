import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneFullscreenButton } from '@/components/SceneFullscreenButton'

describe('SceneFullscreenButton', () => {
  it('shows "Enter fullscreen" label when inactive', () => {
    render(<SceneFullscreenButton active={false} visible={true} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy()
  })

  it('shows "Exit fullscreen" label when active', () => {
    render(<SceneFullscreenButton active={true} visible={true} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy()
  })

  it('hides the button container when not visible', () => {
    const { container } = render(
      <SceneFullscreenButton active={false} visible={false} onToggle={() => {}} />,
    )
    const wrapper = container.firstElementChild as HTMLElement | null
    expect(wrapper?.style.display).toBe('none')
  })

  it('invokes onToggle when clicked and stops propagation', async () => {
    const onToggle = vi.fn()
    const onParentClick = vi.fn()
    const { container } = render(
      <div onClick={onParentClick}>
        <SceneFullscreenButton active={false} visible={true} onToggle={onToggle} />
      </div>,
    )
    void container
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onParentClick).not.toHaveBeenCalled()
  })
})
