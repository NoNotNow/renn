import type { CSSProperties } from 'react'
import { theme } from '@/config/theme'

export const entitySearchInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 28px 8px 32px',
  borderRadius: 6,
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  fontSize: 14,
  outline: 'none',
}

export const entitySearchInputCompactStyle: CSSProperties = {
  ...entitySearchInputStyle,
  width: '100%',
  fontSize: 12,
  padding: '6px 24px 6px 28px',
}

export const entitySearchInputFocusedStyle: CSSProperties = {
  borderColor: theme.border.dropZoneHover,
  boxShadow: 'none',
}

export const entitySearchCompactLabelStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  fontSize: 11,
  color: theme.text.muted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  padding: '6px 0',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  boxSizing: 'border-box',
}

export const entitySearchFilterButtonStyle: CSSProperties = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: `1px solid transparent`,
  borderRadius: 4,
  color: theme.text.muted,
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
}

export const ENTITY_SEARCH_FILTER_PANEL_WIDTH_PX = 280

export const entitySearchResultsPanelStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  marginTop: 4,
  maxHeight: 280,
  overflowY: 'auto',
  backgroundColor: theme.bg.panel,
  border: `1px solid ${theme.border.default}`,
  borderRadius: 6,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  zIndex: 20,
}

/** Fixed-width filter toolbox; does not stretch with the search input. */
export const entitySearchFilterPanelStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  width: ENTITY_SEARCH_FILTER_PANEL_WIDTH_PX,
  minWidth: ENTITY_SEARCH_FILTER_PANEL_WIDTH_PX,
  maxWidth: ENTITY_SEARCH_FILTER_PANEL_WIDTH_PX,
  overflow: 'visible',
  backgroundColor: theme.bg.panel,
  border: `1px solid ${theme.border.default}`,
  borderRadius: 6,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  zIndex: 20,
}
