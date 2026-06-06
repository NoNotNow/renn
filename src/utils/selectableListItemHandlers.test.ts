import { describe, it, expect, vi } from 'vitest'
import { selectableListItemHandlers } from './selectableListItemHandlers'

describe('selectableListItemHandlers', () => {
  it('selects on single click', () => {
    const onSelect = vi.fn()
    const onConfirm = vi.fn()
    const handlers = selectableListItemHandlers(onSelect, onConfirm)

    handlers.onClick({} as React.MouseEvent)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('selects and confirms on double click', () => {
    const onSelect = vi.fn()
    const onConfirm = vi.fn()
    const handlers = selectableListItemHandlers(onSelect, onConfirm)

    handlers.onDoubleClick({} as React.MouseEvent)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
