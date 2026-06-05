import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EntitySearchPicker from './EntitySearchPicker'
import type { Entity } from '@/types/world'

function makeEntity(id: string, name?: string): Entity {
  return {
    id,
    name,
    bodyType: 'dynamic',
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position: [0, 0, 0],
  } as Entity
}

describe('EntitySearchPicker', () => {
  it('shows recent entities when search is empty', () => {
    const onSelect = vi.fn()
    render(
      <EntitySearchPicker
        entities={[makeEntity('car', 'Car'), makeEntity('box')]}
        entityWorkHistory={['car']}
        onSelectEntity={onSelect}
      />,
    )
    fireEvent.focus(screen.getByTestId('entity-search-picker-input'))
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByTestId('entity-search-picker-result-car')).toBeInTheDocument()
  })

  it('calls onSelectEntity when a result is clicked', () => {
    const onSelect = vi.fn()
    render(
      <EntitySearchPicker
        entities={[makeEntity('car', 'Car')]}
        entityWorkHistory={[]}
        onSelectEntity={onSelect}
      />,
    )
    fireEvent.change(screen.getByTestId('entity-search-picker-input'), { target: { value: 'car' } })
    fireEvent.click(screen.getByTestId('entity-search-picker-result-car'))
    expect(onSelect).toHaveBeenCalledWith('car')
  })

  it('shows search hint on hover and activates search on click when hoverReveal is set', () => {
    render(
      <EntitySearchPicker
        entities={[makeEntity('car', 'Car')]}
        entityWorkHistory={[]}
        selectedEntityId="car"
        onSelectEntity={vi.fn()}
        variant="compact"
        selectedLabel="Car · my_script"
        hoverReveal
        testId="compact-picker"
      />,
    )
    expect(screen.getByTestId('compact-picker-label')).toHaveTextContent('Car · my_script')
    expect(screen.queryByTestId('compact-picker-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('compact-picker-hover-search-hint')).not.toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByTestId('compact-picker-label'))
    expect(screen.getByTestId('compact-picker-hover-search-hint')).toBeInTheDocument()
    expect(screen.queryByTestId('compact-picker-input')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('compact-picker-label'))
    expect(screen.getByTestId('compact-picker-input')).toBeInTheDocument()
  })

  it('opens filter popover from filter button', () => {
    render(
      <EntitySearchPicker
        entities={[makeEntity('a')]}
        entityWorkHistory={[]}
        onSelectEntity={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('entity-search-picker-filter-toggle'))
    expect(screen.getByTestId('entity-search-filter-popover')).toBeInTheDocument()
  })

  it('closes filter popover when the search input is clicked', () => {
    render(
      <EntitySearchPicker
        entities={[makeEntity('a')]}
        entityWorkHistory={[]}
        onSelectEntity={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('entity-search-picker-filter-toggle'))
    expect(screen.getByTestId('entity-search-filter-popover')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('entity-search-picker-input'))
    expect(screen.queryByTestId('entity-search-filter-popover')).not.toBeInTheDocument()
  })

  it('closes filter popover from the header close button', () => {
    render(
      <EntitySearchPicker
        entities={[makeEntity('a')]}
        entityWorkHistory={[]}
        onSelectEntity={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('entity-search-picker-filter-toggle'))
    expect(screen.getByTestId('entity-search-filter-popover')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('entity-search-filter-close'))
    expect(screen.queryByTestId('entity-search-filter-popover')).not.toBeInTheDocument()
  })
})
