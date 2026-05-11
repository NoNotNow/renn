/**
 * Application-wide configuration constants.
 * Centralizes magic numbers and hard-coded values for easier maintenance.
 */

// Database configuration
export const DB_CONFIG = {
  name: 'renn-worlds',
  /** Must match IndexedDB schema migrations in persistence/indexedDb.ts */
  version: 5,
  stores: {
    projects: 'projects',
    assets: 'assets',
    modelPresets: 'modelPresets',
  },
} as const


/** On SceneView’s WebGL container; brush popover does not dismiss on pointer-down inside this host. */
export const BUILDER_SCENE_CANVAS_HOST_ATTR = 'data-builder-scene-canvas-host' as const

/**
 * On inputs where Escape must not move focus to the scene host (e.g. inline rename with blur-to-save).
 * See SceneView capture-phase Escape handler.
 */
export const SUPPRESS_ESCAPE_SCENE_FOCUS_ATTR = 'data-suppress-escape-scene-focus' as const
