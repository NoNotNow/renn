import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { theme } from '@/config/theme'
import EntitySearchFilterPopover from './EntitySearchFilterPopover'
import {
  entitySearchFilterButtonStyle,
  entitySearchInputFocusedStyle,
  entitySearchInputCompactStyle,
  entitySearchInputStyle,
  entitySearchFilterPanelStyle,
} from './entitySearchPickerStyles'
import type { EntitySearchPickerState } from './useEntitySearchPicker'

export interface EntitySearchFieldProps {
  pickerState: EntitySearchPickerState
  placeholder?: string
  autoFocus?: boolean
  testId?: string
  variant?: 'compact' | 'panel'
  onInputKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
}

function SearchIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      {active ?
        <circle cx="18" cy="6" r="3" fill={theme.accent} stroke={theme.accent} />
      : null}
    </svg>
  )
}

/** Search input + filter button shared by EntitySearchPicker and entity-selection dialogs. */
export default function EntitySearchField({
  pickerState: picker,
  placeholder = 'Search entities…',
  autoFocus = false,
  testId = 'entity-search-field',
  variant = 'panel',
  onInputKeyDown,
}: EntitySearchFieldProps) {
  const {
    searchQuery,
    setSearchQuery,
    hasActivePickerFilters,
    filterPopoverOpen,
    setFilterPopoverOpen,
  } = picker

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputFocused, setInputFocused] = useState(false)

  useEffect(() => {
    if (!autoFocus) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [autoFocus])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setFilterPopoverOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [setFilterPopoverOpen])

  const inputStyle = {
    ...(variant === 'compact' ? entitySearchInputCompactStyle : entitySearchInputStyle),
    ...(inputFocused ? entitySearchInputFocusedStyle : {}),
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setFilterPopoverOpen(false)
      return
    }
    onInputKeyDown?.(e)
  }

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => {
            setInputFocused(true)
            setFilterPopoverOpen(false)
          }}
          onClick={() => setFilterPopoverOpen(false)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={handleKeyDown}
          aria-label="Search entities"
          aria-expanded={filterPopoverOpen}
          aria-haspopup="dialog"
          data-testid={`${testId}-input`}
          style={inputStyle}
        />
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.text.muted,
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <SearchIcon />
        </span>
        {searchQuery ?
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            title="Clear search"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: theme.text.muted,
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        : null}

        {filterPopoverOpen ?
          <div style={entitySearchFilterPanelStyle}>
            <EntitySearchFilterPopover filters={picker} onClose={() => setFilterPopoverOpen(false)} />
          </div>
        : null}
      </div>

      <button
        type="button"
        data-testid={`${testId}-filter-toggle`}
        title="Filter entities"
        aria-label="Filter entities"
        aria-expanded={filterPopoverOpen}
        onClick={() => setFilterPopoverOpen(!filterPopoverOpen)}
        style={{
          ...entitySearchFilterButtonStyle,
          position: 'static',
          transform: 'none',
          flexShrink: 0,
          borderColor: filterPopoverOpen ? theme.border.dropZoneHover : 'transparent',
          color: hasActivePickerFilters ? theme.accent : theme.text.muted,
        }}
      >
        <FilterIcon active={hasActivePickerFilters} />
      </button>
    </div>
  )
}
