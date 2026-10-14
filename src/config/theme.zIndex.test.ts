import { describe, expect, it } from 'vitest'
import { theme } from './theme'

/**
 * App-wide stacking contract: dialogs open IN FRONT of the top menu, and portaled menus
 * (header dropdowns, context menus) stay ABOVE every dialog so menus remain usable
 * even when they are opened after a dialog is already on screen.
 */
describe('zIndex stacking contract', () => {
  it('dialogs layer above the top menu bar', () => {
    expect(theme.zIndex.floatingDialog).toBeGreaterThan(theme.zIndex.header)
    expect(theme.zIndex.modal).toBeGreaterThan(theme.zIndex.header)
  })

  it('blocking modals layer above non-blocking floating dialogs', () => {
    expect(theme.zIndex.modal).toBeGreaterThan(theme.zIndex.floatingDialog)
  })

  it('portaled menus layer above every dialog', () => {
    expect(theme.zIndex.menu).toBeGreaterThan(theme.zIndex.floatingDialog)
    expect(theme.zIndex.menu).toBeGreaterThan(theme.zIndex.modal)
  })
})
