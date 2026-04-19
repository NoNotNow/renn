/**
 * UI theme tokens for panels, dialogs, and sidebars.
 * Prefer importing from here over scattering hex values (easier for agents and consistency).
 */

export const theme = {
  bg: {
    panel: '#1b1f2a',
    panelAlt: '#1a1a1a',
    /** Slightly lighter than `panelAlt`; used for hover on compact pick controls. */
    panelAltHover: '#222222',
    /** Drag-over highlight for upload drop zones. */
    dropZoneActive: '#1e2a3a',
    surface: '#2a2a2a',
    section: 'rgba(17, 20, 28, 0.6)',
    /** Muted variant of `section` (e.g. transformer card background). */
    sectionMuted: 'rgba(17, 20, 28, 0.4)',
    input: '#232836',
    overlay: 'rgba(0, 0, 0, 0.55)',
    overlayLight: 'rgba(0, 0, 0, 0.5)',
    /** Subtle dark overlay used for monospaced/code surfaces (JSON textarea, transformer add select). */
    codeOverlay: 'rgba(0, 0, 0, 0.3)',
    /** Solid dark code/preview pane background (e.g. transformer template preview). */
    codeBlock: '#111418',
    /** Outer frame background for grouped thumbnail / version family cards. */
    thumbnailFrame: '#14161c',
    /** Header strip background for thumbnail family cards. */
    thumbnailHeader: '#1a1d26',
    /** Per-version tile background inside a thumbnail family card. */
    thumbnailTile: '#161922',
    /** Hover background for items in entity / asset list rows. */
    listHover: '#20263a',
    /** Slightly darker variant of `button.primary` (active avatar tile chip). */
    primarySubtle: '#2a2d45',
    /** Translucent backdrop for inactive avatar tile chips over arbitrary bg. */
    inactiveTile: 'rgba(0,0,0,0.2)',
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
    /** Slate "pick / select asset" tile (script panels, attach buttons). */
    selectable: '#2a3a4a',
    selectableBorder: '#3f4f5f',
    apply: '#2b4a6e',
    applyBorder: '#3d6a9e',
    /** Info-blue background (JSON apply, template / field-reference toggles). */
    info: '#1e3a5f',
    /** Active state of `info` buttons (e.g. field-reference toggle when open). */
    infoActive: '#1e40af',
    infoBorder: '#3b6ea8',
    /** Brighter border for active `info` toggle (e.g. field-reference panel open). */
    infoActiveBorder: '#60a5fa',
    /** Neutral disabled border for muted controls (matches legacy `#3a3a3a`). */
    disabledBorder: '#3a3a3a',
  },
  booster: {
    tileSelectBorder: '#5b8fc7',
    tileSelectBg: '#243044',
    gridBg: '#151820',
  },
  hint: '#6b7280',
  status: {
    /** Enabled / success indicator dot. */
    enabled: '#4ade80',
    /** Disabled / error indicator dot. */
    disabled: '#ef4444',
  },
  /**
   * Filled feedback chrome (status chips, "dirty" / "attached" / selected destructive buttons).
   * Each triplet is a coordinated bg/border/text palette to avoid one-off hex per call site.
   */
  feedback: {
    successBg: '#2d4a2d',
    successBorder: '#4a6a4a',
    successText: '#a4d4a4',
    /** Subtle inline success text (e.g. "Attached" chip). */
    successTextSubtle: '#6a9e6a',
    destructiveSelectedBg: '#3a2a2a',
    destructiveSelectedText: '#e6c0c0',
  },
  border: {
    default: '#2f3545',
    /** Dashed drop zone border while dragging a file over. */
    dropZoneActive: '#4a9eff',
    /** Hover border on idle drop zone (between default and accent). */
    dropZoneHover: '#3f4f5f',
    destructive: '#6b2a2a',
    destructiveMuted: '#2f3545',
    /** Border for invalid input (JSON parse error). */
    error: '#dc2626',
  },
  text: {
    primary: '#e6e9f2',
    secondary: '#c4cbd8',
    muted: '#9aa4b2',
    /** Slightly cooler / softer variant of `muted` (e.g. asset-kind label, thumbnail meta). */
    subtle: '#8b95a8',
    /** Dimmer than `muted`, brighter than `hint` (small helper text). */
    dim: '#7a8494',
    destructive: '#f4d6d6',
    disabled: '#666',
    /** Light blue accent text used on info-blue buttons / inline code. */
    accentBlue: '#93c5fd',
    /** Subtle info-blue paragraph text (e.g. paragraph hints in script panels). */
    infoSubtle: '#a8c8f0',
    /** Error / invalid (JSON parse, schema). */
    error: '#f87171',
  },
  accent: '#8ab4ff',
  zIndex: {
    modal: 10000,
    overlay: 2100,
    save: 2000,
    editModeDot: 200,
  },
} as const
