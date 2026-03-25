/**
 * Gizmo mode toolbar icons (Lucide-inspired paths, stroke style matches EntityPanelIcons).
 */

const size = 16
const style = { width: size, height: size, flexShrink: 0 as const }

/** Translate / move — four-way arrows from center. */
export const GizmoMoveIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    aria-hidden
  >
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
)

/** Rotate — circular arrow. */
export const GizmoRotateIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    aria-hidden
  >
    <path d="M21 12a9 9 0 1 1-3-7.3L21 5" />
    <path d="M21 3v5h-5" />
  </svg>
)

/** Scale — corner brackets + diagonals (Lucide maximize-2). */
export const GizmoScaleIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    aria-hidden
  >
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </svg>
)
