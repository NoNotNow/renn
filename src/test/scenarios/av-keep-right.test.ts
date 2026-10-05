import { describe, expect, it } from 'vitest'
import { CORRIDOR_14, fmtPass, runFacingPair, runOncoming, type OncomingSpec, type PassMetrics } from '@/test/fixtures/avKeepRight'

/**
 * Keep-right passing (`passSide`, av-motion-planner + av-perception + av-control-lateral; feature-av-stack.md "Keep right when passing").
 * Scripted oncoming puppet (background traffic, not a threat) or two real AV-pipe cars facing each other.
 * `lat` = lateral offset of the other car in OUR frame when abreast: > 0 = it is on our left = we passed on our RIGHT.
 * Relative checks only (side of passing, no contact, min gap): never absolute per-seed outcomes.
 */
const T = 120_000
const MIN_GAP = 1

/** Oncoming puppet cases: lateral offset of the puppet (+ = our right as we drive north), goal pulling to one side. */
const OPEN: OncomingSpec[] = [
  { name: 'dead ahead', offset: 0 },
  { name: 'puppet offset to our left', offset: -1.5 },
  { name: 'puppet offset to our right', offset: 1.5 },
]
// cruise 14 m/s (the example car's 1000 means ~35 m/s: not a passing speed in a 14 m corridor); the puppet drives in ITS OWN lane
const corridor = (offset: number): OncomingSpec => ({ name: 'corridor', offset, boxes: CORRIDOR_14, cruise: 14, puppetSpeed: 8, carSpeed: 10 })

function expectSide(m: PassMetrics, side: 'right' | 'left', gap = MIN_GAP) {
  const msg = fmtPass(m)
  expect(Number.isFinite(m.lat), `no pass happened: ${msg}`).toBe(true)
  expect(side === 'right' ? m.lat > 0 : m.lat < 0, `passed on the wrong side: ${msg}`).toBe(true)
  expect(m.contact, `contact: ${msg}`).toBe(false)
  expect(m.minGap, msg).toBeGreaterThanOrEqual(gap)
}

describe('AV keep right when passing (oncoming traffic)', () => {
  for (const side of ['right', 'left'] as const) {
    describe(`passSide ${side}`, () => {
      for (const c of OPEN) {
        it(`open ground, ${c.name}: passes on its own ${side}`, async () => {
          expectSide(await runOncoming(c, { passSide: side }), side)
        }, T)
      }
      it(`open ground, goal pulls the old behaviour to the other side: still passes on its own ${side}`, async () => {
        // goalX = -15 (left) made the old planner pass on its left (lat -8.7, off-run below); the rule must win for 'right'; mirrored for 'left'
        expectSide(await runOncoming({ name: 'goal', offset: 0, goalX: side === 'right' ? -15 : 15 }, { passSide: side }), side)
      }, T)
      it(`14 m corridor, oncoming car in its own lane: passes on its own ${side}, no contact`, async () => {
        // the puppet keeps ITS right (x -1.5 for passSide right); only a pass on our own right fits between it and the wall
        expectSide(await runOncoming(corridor(side === 'right' ? -1.5 : 1.5), { passSide: side }), side, 0.5)
      }, T)
      it(`two AV-pipe cars facing each other: both pass on their own ${side}`, async () => {
        const r = await runFacingPair({ passSide: side })
        expectSide(r.a, side)
        expectSide(r.b, side)
      }, T)
    })
  }

  describe("passSide 'off' / unset = the old behaviour", () => {
    it("'off' is bit-identical to no passSide at all", async () => {
      const a = await runOncoming({ name: 'goal', offset: 0, goalX: -15 })
      const b = await runOncoming({ name: 'goal', offset: 0, goalX: -15 }, { passSide: 'off' })
      expect(b).toEqual(a)
      // and the old planner followed its goal: with the goal to the left it passed on its own LEFT (this is what 'right' changes)
      expect(a.lat, fmtPass(a)).toBeLessThan(0)
    }, T)
    it('the old planner hits the oncoming car in the corridor (the passing rule is what lets it through)', async () => {
      const m = await runOncoming(corridor(-1.5))
      expect(m.contact, fmtPass(m)).toBe(true)
    }, T)
  })

  describe('tracked threats keep their priority', () => {
    it('a puppet in threatIds is not passed by the rule: passSide right changes nothing', async () => {
      const a = await runOncoming({ name: 'threat', offset: 0, goalX: -15, threat: true })
      const b = await runOncoming({ name: 'threat', offset: 0, goalX: -15, threat: true }, { passSide: 'right' })
      expect(b).toEqual(a)
    }, T)
  })
})
