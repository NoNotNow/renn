import { describe, it, expect } from 'vitest'
import {
  ENTITY_WORK_HISTORY_CAP,
  pushEntityWorkHistory,
  pruneEntityWorkHistory,
  entityHistoryRank,
} from './entityWorkHistory'

describe('entityWorkHistory', () => {
  it('pushEntityWorkHistory dedupes and caps', () => {
    let h: string[] = []
    for (let i = 0; i < ENTITY_WORK_HISTORY_CAP + 5; i++) {
      h = pushEntityWorkHistory(h, `e${i}`)
    }
    expect(h).toHaveLength(ENTITY_WORK_HISTORY_CAP)
    expect(h[0]).toBe(`e${ENTITY_WORK_HISTORY_CAP + 4}`)
    h = pushEntityWorkHistory(h, 'e3')
    expect(h[0]).toBe('e3')
    expect(h.filter((id) => id === 'e3')).toHaveLength(1)
  })

  it('pruneEntityWorkHistory drops missing ids', () => {
    const pruned = pruneEntityWorkHistory(['a', 'b', 'c'], new Set(['a', 'c']))
    expect(pruned).toEqual(['a', 'c'])
  })

  it('entityHistoryRank orders known before unknown', () => {
    const history = ['recent', 'older']
    expect(entityHistoryRank(history, 'recent')).toBe(0)
    expect(entityHistoryRank(history, 'older')).toBe(1)
    expect(entityHistoryRank(history, 'unknown')).toBe(2)
  })
})
