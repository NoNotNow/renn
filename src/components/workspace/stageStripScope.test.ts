import { describe, expect, it } from 'vitest'
import { resolveStageStripChrome } from './stageStripScope'

describe('resolveStageStripChrome', () => {
  it('lets the entity stage stack own its add dialog and skips the pipe depth tint', () => {
    const chrome = resolveStageStripChrome({ kind: 'entityStack' })

    expect(chrome.ownsAddDialog).toBe(true)
    expect(chrome.renderAddButton).toBeUndefined()
    expect(chrome.cardDepth).toBeUndefined()
    expect(chrome.inline).toBe(false)
    expect(chrome.embedStackIndex).toBeUndefined()
    expect(chrome.isStageEnabled(0)).toBe(true)
  })

  it('hands the add affordance to a pipe-navigation host and tints cards by depth', () => {
    const chrome = resolveStageStripChrome({
      kind: 'pipeStrip',
      depth: 2,
      renderAddButton: () => 'host +',
      isStageEnabled: (index) => index !== 1,
    })

    expect(chrome.ownsAddDialog).toBe(false)
    expect(chrome.renderAddButton?.()).toBe('host +')
    expect(chrome.cardDepth).toBe(2)
    expect(chrome.inline).toBe(false)
    expect(chrome.embedStackIndex).toBeUndefined()
    expect(chrome.isStageEnabled(0)).toBe(true)
    expect(chrome.isStageEnabled(1)).toBe(false)
  })

  it('treats a pipe strip without a cascade query as fully enabled', () => {
    const chrome = resolveStageStripChrome({
      kind: 'pipeStrip',
      depth: 0,
      renderAddButton: () => null,
    })

    expect(chrome.isStageEnabled(3)).toBe(true)
  })

  it('embeds a single member card with no add slot and keeps its original stack index', () => {
    const chrome = resolveStageStripChrome({ kind: 'pipeMember', depth: 1, stackIndex: 4 })

    expect(chrome.inline).toBe(true)
    expect(chrome.embedStackIndex).toBe(4)
    expect(chrome.cardDepth).toBe(1)
    expect(chrome.ownsAddDialog).toBe(false)
    expect(chrome.renderAddButton).toBeUndefined()
  })
})
