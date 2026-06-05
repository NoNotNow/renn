import type { CSSProperties } from 'react'
import {
  fieldLabelStyle,
  sidebarLabelStyle,
  sidebarRowStyle,
  secondaryButtonStyle,
} from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import type { EntityListFilters, TriState } from '@/components/entitySidebar/useEntityListFilters'
import { SHAPE_FILTER_OPTIONS, TRI_STATE_FILTER_OPTIONS } from './entitySearchFilterOptions'

export interface EntitySearchFilterPopoverProps {
  filters: EntityListFilters
  onClose?: () => void
  style?: CSSProperties
}

export default function EntitySearchFilterPopover({ filters, onClose, style }: EntitySearchFilterPopoverProps) {
  const {
    filterHasModel,
    setFilterHasModel,
    filterShape,
    setFilterShape,
    filterHasTransformers,
    setFilterHasTransformers,
    filterSizeMin,
    setFilterSizeMin,
    filterSizeMax,
    setFilterSizeMax,
    filterPlayableAvatar,
    setFilterPlayableAvatar,
    sortByHistory,
    setSortByHistory,
    hasActivePickerFilters,
    clearEntityFilters,
  } = filters

  return (
    <div
      data-testid="entity-search-filter-popover"
      style={{
        padding: 10,
        minWidth: 220,
        maxWidth: 300,
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: theme.text.secondary }}>Filters</span>
        {hasActivePickerFilters ?
          <button
            type="button"
            onClick={clearEntityFilters}
            style={{ ...secondaryButtonStyle, fontSize: 10, padding: '2px 8px' }}
          >
            Clear
          </button>
        : null}
      </div>

      <label style={{ ...sidebarRowStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={sortByHistory}
          onChange={(e) => setSortByHistory(e.target.checked)}
          data-testid="entity-search-filter-sort-history"
        />
        <span style={{ ...sidebarLabelStyle, margin: 0 }}>Sort by history</span>
      </label>

      <label style={{ ...sidebarRowStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={filterPlayableAvatar}
          onChange={(e) => setFilterPlayableAvatar(e.target.checked)}
          data-testid="entity-search-filter-playable-avatar"
        />
        <span style={{ ...sidebarLabelStyle, margin: 0 }}>Playable avatar</span>
      </label>

      <div style={sidebarRowStyle}>
        <label htmlFor="entity-search-filter-model" style={sidebarLabelStyle}>
          3D model
        </label>
        <select
          id="entity-search-filter-model"
          value={filterHasModel}
          onChange={(e) => setFilterHasModel(e.target.value as TriState)}
          style={{ display: 'block', width: '100%' }}
        >
          {TRI_STATE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label === 'Yes' ? 'Has model' : o.label === 'No' ? 'No model' : o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={sidebarRowStyle}>
        <label htmlFor="entity-search-filter-shape" style={sidebarLabelStyle}>
          Shape
        </label>
        <select
          id="entity-search-filter-shape"
          value={filterShape}
          onChange={(e) => setFilterShape(e.target.value as typeof filterShape)}
          style={{ display: 'block', width: '100%' }}
        >
          {SHAPE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={sidebarRowStyle}>
        <label htmlFor="entity-search-filter-transformers" style={sidebarLabelStyle}>
          Transformers
        </label>
        <select
          id="entity-search-filter-transformers"
          value={filterHasTransformers}
          onChange={(e) => setFilterHasTransformers(e.target.value as TriState)}
          style={{ display: 'block', width: '100%' }}
        >
          {TRI_STATE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label === 'Yes' ? 'Has transformers' : o.label === 'No' ? 'No transformers' : o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={sidebarRowStyle}>
        <label htmlFor="entity-search-filter-size-min" style={sidebarLabelStyle}>
          Size (min)
        </label>
        <input
          id="entity-search-filter-size-min"
          type="text"
          inputMode="decimal"
          placeholder="—"
          value={filterSizeMin}
          onChange={(e) => setFilterSizeMin(e.target.value)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <div style={sidebarRowStyle}>
        <label htmlFor="entity-search-filter-size-max" style={{ ...fieldLabelStyle, fontSize: 11 }}>
          Size (max)
        </label>
        <input
          id="entity-search-filter-size-max"
          type="text"
          inputMode="decimal"
          placeholder="—"
          value={filterSizeMax}
          onChange={(e) => setFilterSizeMax(e.target.value)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      {onClose ?
        <button
          type="button"
          onClick={onClose}
          style={{ ...secondaryButtonStyle, width: '100%', marginTop: 8, fontSize: 11 }}
        >
          Done
        </button>
      : null}
    </div>
  )
}
