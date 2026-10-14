import { describe, expect, it } from 'vitest'
import { applyMazeCandidate, type MazeCandidate } from './mazeCandidates'
import { genomeLengthV2, genomeLengthV3 } from './policy'
import type { RennWorld } from '@/types/world'

/** A v3-shaped genome of `hidden` units (29 H + 2 numbers). */
const v3Genome = (hidden: number): number[] => Array.from({ length: genomeLengthV3(hidden) }, (_, i) => (i % 7) + 1)

const CANDIDATE: MazeCandidate = { id: 'wf32_final', label: 'WF32', gen: 1500, genome: v3Genome(32), detail: 'widen-freeze final' }

/** Minimal training-world stub: two drive stages (v3 net params), one score stage that must stay untouched. */
function makeWorld(): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    transformers: {
      policy_input_0: { type: 'custom', priority: 4, enabled: true, code: 'input', params: { chain: [[0, 0]] } },
      policy_drive_0: { type: 'custom', priority: 10, enabled: true, code: 'drive', params: { w: v3Genome(24), gain: 1200 } },
      maze_score_0: { type: 'custom', priority: 6, enabled: true, code: 'score', params: { w: [1, 2, 3], hud: true } },
      policy_drive_1: { type: 'custom', priority: 10, enabled: true, code: 'drive', params: { w: v3Genome(24), gain: 1200 } },
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
    expect(transformers.policy_drive_0?.params?.w).toEqual(CANDIDATE.genome)
    expect(transformers.policy_drive_1?.params?.w).toEqual(CANDIDATE.genome)
    expect(transformers.policy_drive_0?.params?.gain).toBe(1200)
    expect(transformers.maze_score_0?.params?.w).toEqual([1, 2, 3])
    expect(transformers.policy_input_0?.params?.chain).toEqual([[0, 0]])
    // pure: the input world is not mutated
    const before = (world as unknown as { transformers: Record<string, { params?: Record<string, unknown> }> }).transformers
    expect(before.policy_drive_0?.params?.w).toEqual(v3Genome(24))
    expect(before.policy_drive_1?.params?.w).toEqual(v3Genome(24))
    // the genome is copied, not shared with the candidate (later stage mutations cannot corrupt the fetch cache)
    expect(transformers.policy_drive_0?.params?.w).not.toBe(CANDIDATE.genome)
  })

  it('accepts a hidden size DIFFERENT from the baked-in one (the v3 stage infers H from w.length)', () => {
    // an H=32 widen-freeze candidate into H=24-baked training worlds
    const next = applyMazeCandidate(makeWorld(), CANDIDATE)
    const transformers = (next as unknown as { transformers: Record<string, { params?: Record<string, unknown> }> }).transformers
    expect(transformers.policy_drive_0?.params?.w).toHaveLength(genomeLengthV3(32))
  })

  it('throws on a non-v3 genome (a v2-shaped candidate cannot drive a v3 stage)', () => {
    const v2: MazeCandidate = { ...CANDIDATE, id: 'island-0', genome: Array.from({ length: genomeLengthV2(24) }, (_, i) => i) }
    expect(() => applyMazeCandidate(makeWorld(), v2)).toThrow(/island-0 has \d+ weights/)
  })

  it('throws when no drive stage with params.w exists', () => {
    const world = { version: '1.0', world: {}, transformers: { policy_input_0: { type: 'custom', params: {} } }, entities: [] } as unknown as RennWorld
    expect(() => applyMazeCandidate(world, CANDIDATE)).toThrow(/no drive stage/)
  })
})
