import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import DraggableNumberField from './DraggableNumberField'

const START_X = 100
const DRAG_X = 130

function renderField(overrides?: Partial<React.ComponentProps<typeof DraggableNumberField>>) {
  const onChange = vi.fn()
  const onScrubStart = vi.fn()
  const onScrubEnd = vi.fn()
  const utils = render(
    <DraggableNumberField
      value={5}
      onChange={onChange}
      onScrubStart={onScrubStart}
      onScrubEnd={onScrubEnd}
      {...overrides}
    />,
  )
  return { ...utils, input: utils.container.querySelector('input') as HTMLInputElement, onChange, onScrubStart, onScrubEnd }
}

describe('DraggableNumberField', () => {
  it('sets touch-action none so touch drags are not pre-empted by page scroll', () => {
    const { input } = renderField()
    expect(input.style.touchAction).toBe('none')
  })

  it('mouse drag scrubs the value', () => {
    const { input, onChange, onScrubEnd } = renderField()
    fireEvent.pointerDown(input, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: START_X, clientY: 10 })
    fireEvent.pointerMove(input, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: DRAG_X, clientY: 10 })
    fireEvent.pointerUp(input, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: DRAG_X, clientY: 10 })

    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)![0] as number
    expect(last).toBeGreaterThan(5)
    expect(last).toBeLessThanOrEqual(5 + (DRAG_X - START_X) * 0.01 * 24)
    expect(onScrubEnd).toHaveBeenCalledWith(true)
  })

  it('touch drag scrubs the value like a mouse drag', () => {
    const { input, onChange, onScrubStart, onScrubEnd } = renderField()
    fireEvent.pointerDown(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: START_X, clientY: 10 })
    fireEvent.pointerMove(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: DRAG_X, clientY: 10 })
    fireEvent.pointerUp(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: DRAG_X, clientY: 10 })

    expect(onScrubStart).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)![0] as number
    expect(last).toBeGreaterThan(5)
    expect(onScrubEnd).toHaveBeenCalledWith(true)
  })

  it('pointercancel ends a touch scrub and ignores later moves', () => {
    const { input, onChange, onScrubEnd } = renderField()
    fireEvent.pointerDown(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: START_X, clientY: 10 })
    fireEvent.pointerMove(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: DRAG_X, clientY: 10 })
    fireEvent.pointerCancel(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: DRAG_X, clientY: 10 })

    expect(onScrubEnd).toHaveBeenCalledWith(true)
    const callsAfterCancel = onChange.mock.calls.length
    fireEvent.pointerMove(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: DRAG_X + 30, clientY: 10 })
    expect(onChange).toHaveBeenCalledTimes(callsAfterCancel)
  })

  it('moves inside the dead zone do not scrub', () => {
    const { input, onChange, onScrubEnd } = renderField()
    fireEvent.pointerDown(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: START_X, clientY: 10 })
    fireEvent.pointerMove(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: START_X + 1, clientY: 10 })
    fireEvent.pointerUp(input, { button: 0, pointerId: 1, pointerType: 'touch', clientX: START_X + 1, clientY: 10 })

    expect(onChange).not.toHaveBeenCalled()
    expect(onScrubEnd).toHaveBeenCalledWith(false)
  })
})
