import { describe, expect, it } from 'vitest'
import { rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { DetourShaping, DETOUR_SHAPING } from './detourShaping'

/**
 * Fitness shaping for the direct-line detour kinds (DESIGN.md, test-results/policy-evolution/fitness-shaping/):
 * lateral progress toward the next wall's opening pays a small, high-water-shaped bonus while the credited
 * arc is stuck at the wall (the measured zero-credit gap: lateral meters convert to zero arc credit).
 * The unit seam is `DetourShaping` — a synthetic two-gate plaza mirroring the real `blockade` geometry:
 * chain (0,0) -> (0,-187), gate 1 at z = -50.7 with opening [-23.8, -11.3], gate 2 at z = -102.5 with
 * opening [11, 23.5] (alternating sides), side walls at |x| in [36, 38].
 */

const LEN = 187
const CHAIN: V2[] = [
  [0, 0],
  [0, -LEN],
]

/** walls exactly the way runPolicyEpisode builds them (rectPoly corner polys + bounding circles) */
function plaza(walls: Array<{ at: [number, number]; size: [number, number] }>): Array<{ cx: number; cz: number; r: number; poly: V2[] }> {
  return walls.map((w) => ({ cx: w.at[0], cz: w.at[1], r: Math.hypot(w.size[0], w.size[1]) / 2, poly: rectPoly(w.at[0], w.at[1], 0, w.size[0], w.size[1]) }))
}

/** the two-gate plaza: gate segments + side walls (all axis-aligned, thickness 2) */
const TWO_GATES = () =>
  plaza([
    // gate 1 (z = -50.7): opening [-23.8, -11.3]
    { at: [-29.9, -50.7], size: [12.2, 2] },
    { at: [12.35, -50.7], size: [47.3, 2] },
    // gate 2 (z = -102.5): opening [11, 23.5]
    { at: [-12.5, -102.5], size: [47, 2] },
    { at: [29.75, -102.5], size: [12.5, 2] },
    // side walls
    { at: [37, -93.5], size: [2, 207] },
    { at: [-37, -93.5], size: [2, 207] },
  ])

/** walk a polyline through the shaper at 1 m steps (the shaper is position-driven) */
function walk(sh: DetourShaping, pts: V2[]): number {
  const dens: V2[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!
    const [bx, bz] = pts[i + 1]!
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)))
    for (let k = 0; k < n; k++) dens.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n])
  }
  dens.push(pts[pts.length - 1]!)
  let bonus = 0
  for (const p of dens) bonus = sh.step(p[0], p[1])
  return bonus
}

describe('DetourShaping: the zero-credit-gap bridge', () => {
  it('a straight approach banking no lateral motion pays nothing', () => {
    expect(walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [[0, 0], [0, -49]])).toBe(0)
  })

  it('a PARTIAL swing toward the opening pays, monotone in depth (the discovery gradient)', () => {
    const half = walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [
      [0, 0],
      [0, -30],
      [-5, -30],
    ])
    expect(half).toBeCloseTo(5 / LEN, 5)
    const full = walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [
      [0, 0],
      [0, -30],
      [-11.3, -30],
    ])
    expect(full).toBeCloseTo(11.3 / LEN, 5)
    expect(full).toBeGreaterThan(half)
  })

  it('a wrong-side swing pays zero (distance to the opening grows)', () => {
    expect(
      walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [
        [0, 0],
        [0, -30],
        [5, -30],
      ]),
    ).toBe(0)
  })
})

describe('DetourShaping: anti-cheese', () => {
  it('oscillation and overshoot cannot exceed the single high-water', () => {
    expect(
      walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [
        [0, 0],
        [0, -30],
        [-11.3, -30], // full pay
        [0, -30], // retreat: d grows, no new pay
        [-11.3, -30], // re-approach: high-water already banked
        [-30, -30], // overshoot past the opening: nothing more
      ]),
    ).toBeCloseTo(11.3 / LEN, 5)
  })

  it('crossing the plane closes the gate permanently (no re-farm after crossing)', () => {
    const sh = new DetourShaping(CHAIN, TWO_GATES(), LEN)
    const b = walk(sh, [
      [0, 0],
      [0, -30],
      [-17.5, -30],
      [-17.5, -60], // through the opening, past the plane (s > s_w + half-depth + hull)
    ])
    expect(b).toBeCloseTo(11.3 / LEN, 5)
    // wandering back before the closed gate pays nothing more
    expect(sh.step(-17.5, -40)).toBeCloseTo(11.3 / LEN, 5)
    expect(sh.step(-17.5, -40)).toBeCloseTo(11.3 / LEN, 5)
  })

  it('lateral wandering with no gate in reach pays nothing (before the first gate)', () => {
    expect(
      walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [
        [0, 0],
        [20, 0],
        [-20, 0],
        [0, -0.5],
      ]),
    ).toBe(0)
  })

  it('a sub-MIN_OPEN slit is not an opening; a boundary free run is not an opening', () => {
    // gate 1's only gap is 3 m (below MIN_OPEN_M = 5): swinging into it pays nothing
    const slit = walk(
      new DetourShaping(
        CHAIN,
        plaza([
          { at: [-25, -50.7], size: [22, 2] }, // x in [-36, -14]
          { at: [12.5, -50.7], size: [47, 2] }, // x in [-11, 36]
          { at: [37, -93.5], size: [2, 207] },
          { at: [-37, -93.5], size: [2, 207] },
        ]),
        LEN,
      ),
      [
        [0, 0],
        [0, -30],
        [-12.5, -30],
      ],
    )
    expect(slit).toBe(0)
    // no wall on the +x side of the plane: the free run there touches the sampling boundary and must not pay
    const boundary = walk(
      new DetourShaping(
        CHAIN,
        plaza([
          { at: [-29.9, -50.7], size: [12.2, 2] }, // x in [-36, -23.8]
          { at: [37, -93.5], size: [2, 207] },
          { at: [-37, -93.5], size: [2, 207] },
        ]),
        LEN,
      ),
      [
        [0, 0],
        [0, -30],
        [30, -30], // lateral motion into the boundary-touching free run
      ],
    )
    expect(boundary).toBe(0)
  })

  it('CAP_M bounds the payable progress of one gate', () => {
    // cross gate 1 through its opening (pays 11.3), then approach gate 2 from the far wrong side
    // (x = -11.3 -> d0 = 22.3 to opening [11, 23.5]) and swing the full way: pay is capped at CAP_M
    const b = walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [
      [0, 0],
      [0, -30],
      [-11.3, -30],
      [-11.3, -60], // past gate 1 (closed, banked 11.3); gate 2's phase opens with d0 = 22.3
      [11, -60], // the full wrong-side swing to gate 2's opening
    ])
    expect(b).toBeCloseTo((11.3 + DETOUR_SHAPING.CAP_M) / LEN, 4)
  })

  it('at most one gate phase is open at a time (the nearest unclosed gate ahead)', () => {
    // 1.8 m past gate 1's plane: NOT yet closed (needs half-depth + hull margin) -> gate 1 is still
    // the active gate; motion toward gate 2's opening (which reduces no distance of gate 1) pays nothing
    expect(
      walk(new DetourShaping(CHAIN, TWO_GATES(), LEN), [
        [0, 0],
        [0, -52.5],
        [11, -52.5],
      ]),
    ).toBe(0)
  })
})
