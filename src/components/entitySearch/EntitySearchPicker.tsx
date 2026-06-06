import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { Entity } from '@/types/world'
import { theme } from '@/config/theme'
import EntitySearchFilterPopover from './EntitySearchFilterPopover'
import {
  entitySearchCompactLabelStyle,
  entitySearchFilterButtonStyle,
  entitySearchInputFocusedStyle,
  entitySearchInputCompactStyle,
  entitySearchInputStyle,
  entitySearchFilterPanelStyle,
  entitySearchResultsPanelStyle,
} from './entitySearchPickerStyles'
import { useEntitySearchPicker, type EntitySearchPickerState } from './useEntitySearchPicker'

export interface EntitySearchPickerProps {
  entities: Entity[]
  entityWorkHistory: readonly string[]
  selectedEntityId?: string | null
  onSelectEntity: (id: string) => void
  variant?: 'compact' | 'panel'
  placeholder?: string
  autoFocus?: boolean
  /** When set, reuses external filter/results state (sidebar integration). */
  pickerState?: EntitySearchPickerState
  testId?: string
  /**
   * Workspace shell compact: show `selectedLabel` until hover/click; search input only when
   * nothing is selected or the user is interacting with the label.
   */
  selectedLabel?: string | null
  hoverReveal?: boolean
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

export default function EntitySearchPicker({
  entities,
  entityWorkHistory,
  selectedEntityId = null,
  onSelectEntity,
  variant = 'panel',
  placeholder = 'Search entities…',
  autoFocus = false,
  pickerState: externalPickerState,
  testId = 'entity-search-picker',
  selectedLabel = null,
  hoverReveal = false,
}: EntitySearchPickerProps) {
  const internalPickerState = useEntitySearchPicker(entities, entityWorkHistory)
  const picker = externalPickerState ?? internalPickerState

  const {
    searchQuery,
    setSearchQuery,
    filteredEntities,
    recentEntityIds,
    entityListEmptyMessage,
    hasActivePickerFilters,
    filterPopoverOpen,
    setFilterPopoverOpen,
    resultsOpen,
    setResultsOpen,
  } = picker

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchRevealed, setSearchRevealed] = useState(false)
  const [labelHovered, setLabelHovered] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const showHoverLabel = hoverReveal && Boolean(selectedLabel?.trim())
  const showSearchField = !showHoverLabel || searchRevealed || searchQuery.trim() !== '' || filterPopoverOpen || resultsOpen

  useEffect(() => {
    if (!showHoverLabel) {
      setSearchRevealed(false)
      setLabelHovered(false)
    }
  }, [showHoverLabel, selectedLabel])

  const revealSearch = useCallback(() => {
    setSearchRevealed(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const collapseSearchIfIdle = useCallback(() => {
    if (!showHoverLabel) return
    if (searchQuery.trim() !== '' || filterPopoverOpen || resultsOpen) return
    setSearchRevealed(false)
  }, [showHoverLabel, searchQuery, filterPopoverOpen, resultsOpen])

  const entityById = useMemo(() => {
    const map = new Map<string, Entity>()
    for (const e of entities) map.set(e.id, e)
    return map
  }, [entities])

  const displayRows = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) {
      const recent = recentEntityIds
        .map((id) => entityById.get(id))
        .filter((e): e is Entity => e != null)
      if (recent.length > 0) return { section: 'recent' as const, entities: recent }
      return { section: 'all' as const, entities: filteredEntities.slice(0, 12) }
    }
    return { section: 'search' as const, entities: filteredEntities }
  }, [searchQuery, recentEntityIds, entityById, filteredEntities])

  const closePanels = useCallback(() => {
    setResultsOpen(false)
    setFilterPopoverOpen(false)
    if (showHoverLabel && searchQuery.trim() === '') setSearchRevealed(false)
  }, [setResultsOpen, setFilterPopoverOpen, showHoverLabel, searchQuery])

  const pickEntity = useCallback(
    (id: string) => {
      onSelectEntity(id)
      setSearchQuery('')
      closePanels()
      if (showHoverLabel) setSearchRevealed(false)
    },
    [onSelectEntity, setSearchQuery, closePanels, showHoverLabel],
  )

  useEffect(() => {
    if (!autoFocus) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [autoFocus])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closePanels()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [closePanels])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchQuery, displayRows.entities.length])

  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      closePanels()
      return
    }
    const rows = displayRows.entities
    if (rows.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i + 1) % rows.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i - 1 + rows.length) % rows.length)
      return
    }
    if (e.key === 'Enter') {
      const pick = rows[highlightedIndex] ?? rows[0]
      if (pick) pickEntity(pick.id)
    }
  }

  const inputStyle = {
    ...(variant === 'compact' ? entitySearchInputCompactStyle : entitySearchInputStyle),
    ...(inputFocused ? entitySearchInputFocusedStyle : {}),
  }
  const showResults = showSearchField && resultsOpen && (searchQuery.trim() !== '' || displayRows.entities.length > 0 || entityListEmptyMessage !== '')
  const isCompact = variant === 'compact'
  const rootWidthStyle = isCompact ? { width: '10em', maxWidth: '10em', flexShrink: 0 } : { width: '100%', minWidth: 0 }

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        ...rootWidthStyle,
      }}
    >
      <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
        {showHoverLabel && !showSearchField ?
          <button
            type="button"
            data-testid={`${testId}-label`}
            title={selectedLabel ?? undefined}
            onMouseEnter={() => setLabelHovered(true)}
            onMouseLeave={() => setLabelHovered(false)}
            onClick={revealSearch}
            style={{
              ...entitySearchCompactLabelStyle,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              paddingRight: labelHovered ? 2 : 0,
            }}
          >
            <span
              style={{
                flex: '1 1 auto',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedLabel}
            </span>
            {labelHovered ?
              <span
                data-testid={`${testId}-hover-search-hint`}
                style={{ flexShrink: 0, color: theme.text.muted, display: 'flex', lineHeight: 0 }}
                aria-hidden
              >
                <SearchIcon />
              </span>
            : null}
          </button>
        : (
          <>
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setResultsOpen(true)
              }}
              onFocus={() => {
                setInputFocused(true)
                setResultsOpen(true)
                setFilterPopoverOpen(false)
              }}
              onClick={() => setFilterPopoverOpen(false)}
              onBlur={() => {
                setInputFocused(false)
                window.setTimeout(collapseSearchIfIdle, 0)
              }}
              onKeyDown={handleInputKeyDown}
              aria-label="Search entities"
              aria-expanded={showResults}
              aria-haspopup="listbox"
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
          </>
        )}

        {filterPopoverOpen ?
          <div style={entitySearchFilterPanelStyle}>
            <EntitySearchFilterPopover filters={picker} onClose={() => setFilterPopoverOpen(false)} />
          </div>
        : null}

        {showResults && !filterPopoverOpen ?
          <div
            role="listbox"
            data-testid={`${testId}-results`}
            style={entitySearchResultsPanelStyle}
          >
            {displayRows.section === 'recent' && displayRows.entities.length > 0 ?
              <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Recent
              </div>
            : null}
            {displayRows.entities.length === 0 ?
              <div style={{ padding: '10px 12px', fontSize: 12, color: theme.text.muted }}>
                {entityListEmptyMessage || 'No entities'}
              </div>
            : (
              displayRows.entities.map((entity, rowIndex) => {
                const active = entity.id === selectedEntityId
                const highlighted = inputFocused && rowIndex === highlightedIndex
                return (
                  <button
                    key={entity.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-testid={`${testId}-result-${entity.id}`}
                    onClick={() => pickEntity(entity.id)}
                    onMouseEnter={() => setHighlightedIndex(rowIndex)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: highlighted ? theme.pipeNav.treeSelected : active ? theme.bg.panelAlt : 'none',
                      border: 'none',
                      borderLeft: highlighted ? `2px solid ${theme.pipeNav.accent}` : '2px solid transparent',
                      borderRadius: 0,
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: theme.text.primary,
                    }}
                  >
                    <span style={{ fontWeight: active ? 600 : 500 }}>{entity.name ?? entity.id}</span>
                    {entity.name && entity.name !== entity.id ?
                      <span style={{ marginLeft: 6, opacity: 0.45, fontSize: 10 }}>{entity.id}</span>
                    : null}
                  </button>
                )
              })
            )}
          </div>
        : null}
      </div>

      {showSearchField ?
        <button
          type="button"
          data-testid={`${testId}-filter-toggle`}
          title="Filter entities"
          aria-label="Filter entities"
          aria-expanded={filterPopoverOpen}
          onClick={() => {
            setSearchRevealed(true)
            setFilterPopoverOpen(!filterPopoverOpen)
            setResultsOpen(false)
          }}
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
      : null}
    </div>
  )
}
