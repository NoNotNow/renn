import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearTransformerWatchEntries,
  clearTransformerWatchEntriesForTarget,
  getTransformerWatchEntries,
  getTransformerWatchEntriesForTarget,
  getTransformerWatchRunId,
  incrementTransformerWatchRunId,
  publishTransformerWatchEntry,
  resetTransformerWatchBridgeForTests,
  setTransformerWatchEnabled,
  setTransformerWatchRunId,
  watchEntryKey,
} from './transformerWatchBridge'

describe('transformerWatchBridge', () => {
  beforeEach(() => {
    resetTransformerWatchBridgeForTests()
  })

  it('does not publish when bridge is disabled', () => {
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 0,
      label: 'speed',
      value: '3',
    })
    expect(getTransformerWatchEntries().size).toBe(0)
  })

  it('publishes and updates entries for the same label', () => {
    setTransformerWatchEnabled(true)
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 1,
      label: 'x after add',
      value: '10',
    })
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 1,
      label: 'x after add',
      value: '234',
    })

    const entries = getTransformerWatchEntriesForTarget('e1', 1)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      label: 'x after add',
      value: '234',
      runId: 0,
    })
  })

  it('keeps stale labels from another run until clear', () => {
    setTransformerWatchEnabled(true)
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 0,
      label: 'old',
      value: '1',
      runId: 0,
    })
    incrementTransformerWatchRunId()
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 0,
      label: 'new',
      value: '2',
    })

    const entries = getTransformerWatchEntriesForTarget('e1', 0)
    expect(entries.map((e) => e.label)).toEqual(['new', 'old'])
    expect(entries.find((e) => e.label === 'old')?.runId).toBe(0)
    expect(entries.find((e) => e.label === 'new')?.runId).toBe(1)
  })

  it('clearTransformerWatchEntries wipes all rows', () => {
    setTransformerWatchEnabled(true)
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 0,
      label: 'a',
      value: '1',
    })
    clearTransformerWatchEntries()
    expect(getTransformerWatchEntries().size).toBe(0)
  })

  it('clearTransformerWatchEntriesForTarget removes only matching target', () => {
    setTransformerWatchEnabled(true)
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 0,
      label: 'a',
      value: '1',
    })
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 1,
      label: 'b',
      value: '2',
    })
    clearTransformerWatchEntriesForTarget('e1', 0)
    expect(getTransformerWatchEntriesForTarget('e1', 0)).toEqual([])
    expect(getTransformerWatchEntriesForTarget('e1', 1)).toHaveLength(1)
  })

  it('watchEntryKey is stable', () => {
    expect(watchEntryKey('e1', 2, 'label')).toBe('e1:2:label')
  })

  it('setTransformerWatchRunId updates current run id', () => {
    setTransformerWatchRunId(5)
    expect(getTransformerWatchRunId()).toBe(5)
  })
})
