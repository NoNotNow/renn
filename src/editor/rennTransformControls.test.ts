import { describe, expect, it } from 'vitest'
import {
  activeBuilderTransformSubMode,
  COMBINED_GIZMO_TRANSLATE_SCALE_BOOST,
  restoreCombinedTransformGizmoIfNeeded,
} from './rennTransformControls'

describe('activeBuilderTransformSubMode', () => {
  it('returns builder mode for dedicated tools', () => {
    expect(activeBuilderTransformSubMode('translate', 'translate')).toBe('translate')
    expect(activeBuilderTransformSubMode('rotate', 'rotate')).toBe('rotate')
    expect(activeBuilderTransformSubMode('scale', 'scale')).toBe('scale')
  })

  it('returns controls sub-mode while combined transform is dragging', () => {
    expect(activeBuilderTransformSubMode('transform', 'scale')).toBe('scale')
    expect(activeBuilderTransformSubMode('transform', 'rotate')).toBe('rotate')
  })

  it('returns null when combined mode is idle', () => {
    expect(activeBuilderTransformSubMode('transform', 'transform')).toBeNull()
    expect(activeBuilderTransformSubMode('paint', 'translate')).toBeNull()
  })
})

describe('COMBINED_GIZMO_TRANSLATE_SCALE_BOOST', () => {
  it('is above 1 so translate handles stand out in combined mode', () => {
    expect(COMBINED_GIZMO_TRANSLATE_SCALE_BOOST).toBeGreaterThan(1)
  })
})

describe('restoreCombinedTransformGizmoIfNeeded', () => {
  it('restores transform mode after a sub-mode drag', () => {
    let mode = 'scale'
    const gizmo = { mode, updateMatrixWorld: () => undefined }
    const controls = {
      mode,
      setMode: (next: string) => {
        mode = next
        gizmo.mode = next
      },
      _gizmo: gizmo,
    }
    restoreCombinedTransformGizmoIfNeeded(controls as never, 'transform')
    expect(mode).toBe('transform')
  })

  it('no-ops when builder mode is not transform', () => {
    let mode = 'scale'
    const controls = {
      mode,
      setMode: (next: string) => {
        mode = next
      },
      _gizmo: { mode, updateMatrixWorld: () => undefined },
    }
    restoreCombinedTransformGizmoIfNeeded(controls as never, 'scale')
    expect(mode).toBe('scale')
  })
})
