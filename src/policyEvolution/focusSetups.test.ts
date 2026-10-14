import { describe, expect, it } from 'vitest'
import { v3EpisodeKeys } from './chains'
import { focusBatch, focusPassReport, parseFocusSetups } from './focusSetups'
import { warmCruxGate } from './cruxChains'

/**
 * The failure-focus mode's pure pieces (see focusSetups.ts): flag parsing (setup AND chain keys of a diagnose list),
 * the focused batch (all chains of exactly the focus setups, the normal variant rotation) and the per-setup pass
 * report of the focus exit criterion (a setup passes only when EVERY chain finishes).
 */

const kinds = ['crux', 'free'] as const

describe('parseFocusSetups', () => {
  it('takes setup keys and deduplicates, order preserved', () => {
    expect(parseFocusSetups('crux:5, crux:7 ,crux:5', [...kinds])).toEqual(['crux:5', 'crux:7'])
  })

  it('maps chain episode keys (a diagnose --list line) to their setups', () => {
    expect(parseFocusSetups('crux:5#0v3,crux:1003~1#5v3,crux:5#1v3', [...kinds])).toEqual(['crux:5', 'crux:1003~1'])
  })

  it('refuses a kind the run does not train and garbage keys', () => {
    expect(() => parseFocusSetups('crux:5', ['free'])).toThrow(/not a kind of this run/)
    expect(() => parseFocusSetups('nonsense', [...kinds])).toThrow()
    expect(() => parseFocusSetups('crux:x#0v3', [...kinds])).toThrow()
  })

  it('refuses an empty spec', () => {
    expect(() => parseFocusSetups(' , ', [...kinds])).toThrow(/no setup keys/)
  })

  it('kind:<kind>:<n> tokens enumerate the accepted TRAIN setups of that kind (the widen-freeze phase-1 fitness)', () => {
    const a = parseFocusSetups('kind:free:3', ['free', 'crux'])
    expect(a).toHaveLength(3)
    expect(a.every((k) => k.startsWith('free:'))).toBe(true)
    // mixed with plain keys, deduplicated, order preserved (kind tokens expand where they stand)
    const b = parseFocusSetups('crux:5,kind:free:2,crux:5', ['free', 'crux'])
    expect(b).toHaveLength(3)
    expect(b[0]).toBe('crux:5')
    expect(b.slice(1).every((k) => k.startsWith('free:'))).toBe(true)
    // the setups are exactly the accepted band of that size (canonical variant 0, seeds 1..)
    expect(a).toEqual(parseFocusSetups('kind:free:3', ['free']))
    expect(() => parseFocusSetups('kind:free:0', ['free'])).toThrow(/positive integer/)
    expect(() => parseFocusSetups('kind:maze:2', ['free'])).toThrow(/not a kind of this run/)
    expect(() => parseFocusSetups('kind:free', ['free'])).toThrow(/positive integer/)
  })
})

describe('focusBatch', () => {
  it('holds ALL accepted chains of exactly the focus setups, canonical without a variant', () => {
    const batch = focusBatch(['free:1', 'free:2'], null)
    expect(batch.map((g) => g.setupKey)).toEqual(['free:1', 'free:2'])
    expect(batch[0]!.keys).toEqual(v3EpisodeKeys('free:1'))
    expect(batch.every((g) => g.keys.length >= 2)).toBe(true)
  })

  it('applies the standard start-variant rotation like the normal v3 batch', () => {
    const batch = focusBatch(['free:1'], 3)
    expect(batch[0]!.setupKey).toBe('free:1~3')
    expect(batch[0]!.keys).toEqual(v3EpisodeKeys('free:1~3'))
    expect(batch[0]!.keys).not.toEqual(v3EpisodeKeys('free:1'))
  })

  it('refuses a setup the chain gates reject (it would silently train on nothing)', async () => {
    await warmCruxGate()
    // crux seed 4 is rejected by the accepted band (crux.test.ts TRAIN15 skips it)
    expect(() => focusBatch(['crux:4'], null)).toThrow(/no accepted chains/)
  })

  it('falls back to the canonical chains when the variant start loses the chain gates (the v3Setups grp fallback)', async () => {
    await warmCruxGate()
    // crux:12~1 (the seed-12 geometry under the random start jitter) is rejected - the batch keeps the canonical chains
    const batch = focusBatch(['crux:12'], 1)
    expect(batch[0]!.setupKey).toBe('crux:12')
    expect(batch[0]!.keys).toEqual(v3EpisodeKeys('crux:12'))
  })
})

describe('focusPassReport', () => {
  const setups = ['free:1', 'free:2']
  const keys = setups.flatMap((s) => v3EpisodeKeys(s))

  it('passes only when every chain of every setup finishes', () => {
    const all = focusPassReport(keys.map((key) => ({ key, outcome: 'finish' })), setups, 25)
    expect(all.allPass).toBe(true)
    expect(all.perSetup.map((p) => [p.setupKey, p.finished, p.chains])).toEqual(setups.map((s) => [s, v3EpisodeKeys(s).length, v3EpisodeKeys(s).length]))

    const oneFail = focusPassReport(keys.map((key) => ({ key, outcome: key.endsWith('0v3') ? 'crash' : 'finish' })), setups, 25)
    expect(oneFail.allPass).toBe(false)
    expect(oneFail.perSetup.every((p) => p.finished === p.chains)).toBe(false)
  })

  it('counts a missing metric as a failure (the phase keeps training, never false-exits)', () => {
    const partial = focusPassReport(keys.slice(0, keys.length - 1).map((key) => ({ key, outcome: 'finish' })), setups, 25)
    expect(partial.allPass).toBe(false)
    expect(partial.perSetup[1]!.finished).toBe(partial.perSetup[1]!.chains - 1)
  })

  it('carries the generation of the epoch-end measurement', () => {
    expect(focusPassReport([], setups, 4125).gen).toBe(4125)
  })
})
