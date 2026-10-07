import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ParamField from './ParamField'

// Replace the scrub widget with buttons that drive the same callbacks a real drag fires.
vi.mock('@/components/DraggableNumberField', () => ({
  default: (p: {
    value: number | null
    onChange: (n: number) => void
    onScrubStart?: () => void
    onScrubEnd?: (had: boolean) => void
  }) => (
    <div>
      <span data-testid="shown">{String(p.value)}</span>
      <button data-testid="start" onClick={() => p.onScrubStart?.()} />
      <button data-testid="move" onClick={() => p.onChange(1000)} />
      <button data-testid="move-low" onClick={() => p.onChange(-50)} />
      <button data-testid="end" onClick={() => p.onScrubEnd?.(true)} />
      <button data-testid="type" onClick={() => p.onChange(-50)} />
    </div>
  ),
}))

describe('ParamField drag', () => {
  it('writes once on release (one undo step) and shows live feedback meanwhile', () => {
    const onChange = vi.fn()
    render(<ParamField def={{ key: 'a', type: 'number', default: 5 }} value={5} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('start'))
    fireEvent.click(screen.getByTestId('move'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('shown').textContent).toBe('1000')
    fireEvent.click(screen.getByTestId('end'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(1000)
  })

  it('a drag that starts inside min/max stays inside it; typed values never clamp', () => {
    const onChange = vi.fn()
    render(<ParamField def={{ key: 'a', type: 'number', min: 0, max: 10 }} value={5} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('start'))
    fireEvent.click(screen.getByTestId('move-low'))
    fireEvent.click(screen.getByTestId('end'))
    expect(onChange).toHaveBeenLastCalledWith(0)
    fireEvent.click(screen.getByTestId('type'))
    expect(onChange).toHaveBeenLastCalledWith(-50)
  })

  it('a drag that starts outside the hint range is not pulled back', () => {
    const onChange = vi.fn()
    render(<ParamField def={{ key: 'a', type: 'number', min: 0, max: 10 }} value={1000} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('start'))
    fireEvent.click(screen.getByTestId('move'))
    fireEvent.click(screen.getByTestId('end'))
    expect(onChange).toHaveBeenLastCalledWith(1000)
  })
})
