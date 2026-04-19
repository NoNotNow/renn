import type { CSSProperties, MouseEvent } from 'react'
import { theme } from '@/config/theme'

export const sidebarRowStyle = {
  display: 'grid',
  gridTemplateColumns: '96px 1fr',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}

export const sidebarLabelStyle = {
  fontSize: 12,
  color: theme.text.secondary,
}

export const sidebarInputStyle = {
  display: 'block',
  width: '100%',
}

export const sectionStyle = {
  padding: 6,
  border: `1px solid ${theme.border.default}`,
  borderRadius: 6,
  background: theme.bg.section,
}

export const sectionTitleStyle = {
  margin: '0 0 4px',
  fontSize: '0.70em',
  letterSpacing: '0.08em',
  color: theme.text.muted,
  textTransform: 'uppercase' as const,
}

export const fieldLabelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  color: theme.text.secondary,
}

/** Text input in sidebar (e.g. entity name, ID). */
export const sidebarTextInputStyle = {
  display: 'block' as const,
  width: '100%' as const,
  padding: '6px 8px',
  borderRadius: 6,
}

/** Icon/toolbar button (transparent, hover opacity). */
export const iconButtonStyle = {
  background: 'transparent' as const,
  border: 'none' as const,
  cursor: 'pointer' as const,
  padding: 4,
  lineHeight: 1 as const,
  opacity: 0.8,
  transition: 'opacity 0.15s ease',
}

/** Entity panel icon button: square, fixed size for narrow sidebars. */
export const entityPanelIconButtonStyle = {
  ...iconButtonStyle,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  minWidth: 28,
  minHeight: 28,
  flexShrink: 0,
  borderRadius: 6,
}

/** Destructive remove button (e.g. remove texture/model). */
export const removeButtonStyle = {
  padding: '6px 8px',
  background: theme.bg.destructive,
  border: `1px solid ${theme.border.destructive}`,
  color: theme.text.destructive,
  borderRadius: 6,
  cursor: 'pointer' as const,
  fontSize: 14,
  lineHeight: 1 as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  minWidth: 28,
}

/** Remove button when disabled. */
export const removeButtonStyleDisabled = {
  background: theme.bg.destructiveMuted,
  border: `1px solid ${theme.border.destructiveMuted}`,
  color: theme.text.disabled,
  cursor: 'not-allowed' as const,
}

/** Secondary / "Add X" button (e.g. Add Texture, Select Model). */
export const secondaryButtonStyle = {
  flex: 1,
  padding: '6px 12px',
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  borderRadius: 6,
  cursor: 'pointer' as const,
  fontSize: 12,
  transition: 'background-color 0.15s ease',
}

/** Secondary button when disabled. */
export const secondaryButtonStyleDisabled = {
  background: theme.bg.surface,
  color: theme.text.disabled,
  cursor: 'not-allowed' as const,
}

/** Thumbnail trigger button (click to change asset). */
export const thumbnailButtonStyle = {
  padding: 0,
  background: 'transparent' as const,
  border: 'none' as const,
  cursor: 'pointer' as const,
  display: 'flex' as const,
  transition: 'opacity 0.15s ease',
  opacity: 1,
}

/** Thumbnail button when disabled. */
export const thumbnailButtonStyleDisabled = {
  opacity: 0.5,
  cursor: 'not-allowed' as const,
}

/** "Add texture" / pick-asset icon buttons in entity panels (same idle/hover as legacy hex). */
export function secondaryPickIconButtonStyle(disabled: boolean): CSSProperties {
  return {
    ...entityPanelIconButtonStyle,
    background: theme.bg.panelAlt,
    border: `1px solid ${theme.border.default}`,
    color: theme.text.primary,
    ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' as const } : {}),
  }
}

export function secondaryPickIconButtonHoverHandlers(disabled: boolean): {
  onMouseEnter: (e: MouseEvent<HTMLElement>) => void
  onMouseLeave: (e: MouseEvent<HTMLElement>) => void
} {
  const idle = theme.bg.panelAlt
  const hover = theme.bg.panelAltHover
  return {
    onMouseEnter: (e) => {
      if (!disabled) e.currentTarget.style.background = hover
    },
    onMouseLeave: (e) => {
      if (!disabled) e.currentTarget.style.background = idle
    },
  }
}

/** Dashed upload area: border + background from theme (no drag). */
export function assetDropZoneChrome(dragActive: boolean): { border: string; background: string } {
  return {
    border: `2px dashed ${dragActive ? theme.border.dropZoneActive : theme.border.default}`,
    background: dragActive ? theme.bg.dropZoneActive : theme.bg.panelAlt,
  }
}

export function assetDropZoneHoverHandlers(dragActive: boolean): {
  onMouseEnter: (e: MouseEvent<HTMLElement>) => void
  onMouseLeave: (e: MouseEvent<HTMLElement>) => void
} {
  return {
    onMouseEnter: (e) => {
      if (!dragActive) {
        e.currentTarget.style.borderColor = theme.border.dropZoneHover
        e.currentTarget.style.background = theme.bg.panelAltHover
      }
    },
    onMouseLeave: (e) => {
      if (!dragActive) {
        e.currentTarget.style.borderColor = theme.border.default
        e.currentTarget.style.background = theme.bg.panelAlt
      }
    },
  }
}
