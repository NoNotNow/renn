import { describe, expect, it } from 'vitest'
import { applyMazeCandidate, type MazeCandidate } from './mazeCandidates'
import type { RennWorld } from '@/types/world'

const CANDIDATE: MazeCandidate = { id: 'island-0', label: 'I1', gen: 42, genome: [9, 8, 7], detail: 'island 1 center' }

/** Minimal training-world stub: two drive stages (v3 net params), one score stage that must stay untouched. */
function makeWorld(): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    transformers: {
      policy_input_0: { type: 'custom', priority: 4, enabled: true, code: 'input', params: { chain: [[0, 0]] } },
      policy_drive_0: { type: 'custom', priority: 10, enabled: true, code: 'drive', params: { w: [1, 2, 3], gain: 1200 } },
      maze_score_0: { type: 'custom', priority: 6, enabled: true, code: 'score', params: { w: [1, 2, 3], hud: true } },
      policy_drive_1: { type: 'custom', priority: 10, enabled: true, code: 'drive', params: { w: [4, 5, 6], gain: 1200 } },
    },
    entities: [],
    scripts: {},
    assets: {},
  } as unknown as RennWorld
}

describe('applyMazeCandidate', () => {
  it('swaps params.w of every drive stage and leaves everything else (input/score stages) untouched', () => {
    const world = makeWorld()
    const next = applyMazeCandidate(world, CANDIDATE)
    const transformers = (next as unknown as { transformers: Record<string, { params?: Record<string, unknown> }> }).transformers
    expect(transformers.policy_drive_0?.params?.w).toEqual([9, 8, 7])
    expect(transformers.policy_drive_1?.params?.w).toEqual([9, 8, 7])
    expect(transformers.policy_drive_0?.params?.gain).toBe(1200)
    expect(transformers.maze_score_0?.params?.w).toEqual([1, 2, 3])
    expect(transformers.policy_input_0?.params?.chain).toEqual([[0, 0]])
    // pure: the input world is not mutated
    const before = (world as unknown as { transformers: Record<string, { params?: Record<string, unknown> }> }).transformers
    expect(before.policy_drive_0?.params?.w).toEqual([1, 2, 3])
    expect(before.policy_drive_1?.params?.w).toEqual([4, 5, 6])
    // the genome is copied, not shared with the candidate (later stage mutations cannot corrupt the fetch cache)
    expect(transformers.policy_drive_0?.params?.w).not.toBe(CANDIDATE.genome)
  })

  it('throws on a genome length mismatch (a v2-shaped candidate cannot drive a v3 stage)', () => {
    expect(() => applyMazeCandidate(makeWorld(), { ...CANDIDATE, genome: [1, 2] })).toThrow(/island-0 has 2 weights/)
  })

  it('throws when no drive stage with params.w exists', () => {
    const world = { version: '1.0', world: {}, transformers: { policy_input_0: { type: 'custom', params: {} } }, entities: [] } as unknown as RennWorld
    expect(() => applyMazeCandidate(world, CANDIDATE)).toThrow(/no drive stage/)
  })
})
