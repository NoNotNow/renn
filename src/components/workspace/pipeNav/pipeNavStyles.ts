import type { CSSProperties } from 'react'
import { theme } from '@/config/theme'

export function pipeNavLevelBg(depth: number): string {
  const palette = theme.pipeNav.levelBg
  return palette[depth % palette.length]!
}

export function pipeNavCardStyle(depth: number, selected: boolean): CSSProperties {
  return {
    background: pipeNavLevelBg(depth),
    border: `1px solid ${selected ? theme.pipeNav.accent : theme.pipeNav.accentMuted}`,
    borderRadius: 6,
    boxShadow: selected ? `0 0 0 1px ${theme.pipeNav.accentBorder}` : undefined,
  }
}

export function pipeNavButtonStyle(disabled: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 28,
    padding: 0,
    borderRadius: 6,
    border: `1px solid ${theme.pipeNav.accentBorder}`,
    background: theme.pipeNav.sidebarBg,
    color: disabled ? theme.text.disabled : theme.pipeNav.accent,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  }
}
