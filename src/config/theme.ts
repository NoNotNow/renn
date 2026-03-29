/**
 * UI theme tokens for panels, dialogs, and sidebars.
 * Prefer importing from here over scattering hex values (easier for agents and consistency).
 */

export const theme = {
  bg: {
    panel: '#1b1f2a',
    panelAlt: '#1a1a1a',
    surface: '#2a2a2a',
    section: 'rgba(17, 20, 28, 0.6)',
    input: '#232836',
    overlay: 'rgba(0, 0, 0, 0.55)',
    overlayLight: 'rgba(0, 0, 0, 0.5)',
    modalBackdrop: 'rgba(0, 0, 0, 0.7)',
    destructive: '#3a1b1b',
    destructiveMuted: '#2a2a2a',
  },
  button: {
    primary: '#2b3550',
    primaryHover: '#354060',
    primaryBorder: '#3d4a6a',
    muted: '#3d4a5c',
    pick: '#2a3142',
    pickBorder: '#3d4a62',
    apply: '#2b4a6e',
    applyBorder: '#3d6a9e',
  },
  booster: {
    tileSelectBorder: '#5b8fc7',
    tileSelectBg: '#243044',
    gridBg: '#151820',
  },
  hint: '#6b7280',
  border: {
    default: '#2f3545',
    destructive: '#6b2a2a',
    destructiveMuted: '#2f3545',
  },
  text: {
    primary: '#e6e9f2',
    secondary: '#c4cbd8',
    muted: '#9aa4b2',
    destructive: '#f4d6d6',
    disabled: '#666',
  },
  accent: '#8ab4ff',
  zIndex: {
    modal: 10000,
    overlay: 2100,
    save: 2000,
    editModeDot: 200,
  },
} as const
