import { describe, expect, it } from 'vitest'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import { POLICY_GROUND, policyCourseParts } from './episode'
import { shippedGenomeV3 } from './exampleWorld'
import type { Course } from './courses'
import type { RennWorld } from '@/types/world'

/**
 * Focused test of the POLICY_ESCAPE stage (policyStages.ts, priority 4.5 between the input stage and the drive stage):
 * the car starts with its nose INSIDE a wall (a guaranteed lateral contact from frame 0). The chain runs straight through
 * the wall, so without the escape the net would keep pressing forward; the escape must override `input.av.cmd` with an
 * aim AWAY from the touch point for its 0.3 s hold, expire after the last touch, and let the chain command resume.
 */

const watch = (label: string): string | undefined => {
  for (const e of getTransformerWatchEntries().values()) if (e.label === label) return e.value
  return undefined
}

interface EscapeState {
  aimX: number
  aimZ: number
  dx: number
  dz: number
  rem: number
}

function parseEscape(v: string | undefined): EscapeState | null {
  const m = typeof v === 'string' ? /^on (-?\d+),(-?\d+) d (-?[\d.]+),(-?[\d.]+) ([\d.]+) s$/.exec(v) : null
  return m ? { aimX: Number(m[1]), aimZ: Number(m[2]), dx: Number(m[3]), dz: Number(m[4]), rem: Number(m[5]) } : null
}

describe('policy touch escape (input p4 -> escape p4.5 -> drive p5)', () => {
  it('a lateral contact flips policy.escape on, aims away from the touch, expires within the 0.3 s hold', async () => {
    const genome = shippedGenomeV3()
    if (!genome) return // no shipped v3 yet: nothing to drive (same convention as the maze training tests)
    // synthetic course: no boxes of its own, straight chain ahead; the wall is added by hand at the car's nose
    const course = { key: 'escape:1', kind: 'field', seed: 1, boxes: [], waypoints: [], length: 40, variant: 0 } as unknown as Course
    const parts = policyCourseParts(course, genome, { chain: [[0, 0], [0, 40]], legEnds: [1], offM: 8, v3: true, escape: true })
    const wallZ = -5.5 // wall spans z -7.5..-3.5: the car's nose (-4) starts INSIDE it -> contact from frame 0
    const world = {
      version: '1.0',
      world: { gravity: [0, -100, 0] },
      transformers: parts.transformers,
      entities: [
        POLICY_GROUND,
        ...parts.entities,
        { id: 'wall', name: 'Wall', bodyType: 'static', shape: { type: 'box', width: 20, height: 6, depth: 4 }, position: [0, 3, wallZ], rotation: [0, 0, 0], friction: 0.5 },
      ],
      scripts: {},
      groups: [],
    } as unknown as RennWorld

    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 0)
    try {
      const frames = Math.round(20 / DEFAULT_DT)
      const values: (string | undefined)[] = []
      const pos: Array<[number, number]> = []
      for (let f = 0; f < frames; f++) {
        sim.runFrames(1)
        values.push(watch('policy.escape'))
        const p = sim.getPosition(parts.carId)
        pos.push([p[0], p[2]])
      }

      // activated at the very first frames (the car starts in contact)
      let firstOn = -1
      for (let f = 0; f < frames; f++)
        if (parseEscape(values[f])) {
          firstOn = f
          break
        }
      expect(firstOn).toBeGreaterThanOrEqual(0)
      expect(firstOn).toBeLessThan(10)

      // aim: away from the touched wall (its centre z = -5.5 is SOUTH of the car) and ESCAPE_AIM_M (30 m) from the car
      const first = parseEscape(values[firstOn])!
      const awayX = pos[firstOn][0] - 0
      const awayZ = pos[firstOn][1] - wallZ
      const away = Math.hypot(awayX, awayZ)
      expect(away).toBeGreaterThan(1)
      expect(first.dx * (awayX / away) + first.dz * (awayZ / away)).toBeGreaterThan(0.7)
      let lastOn = -1
      for (let f = 0; f < frames; f++) {
        const e = parseEscape(values[f])
        if (!e) continue
        lastOn = f
        expect(Math.hypot(e.aimX - pos[f][0], e.aimZ - pos[f][1])).toBeGreaterThan(28)
        expect(Math.hypot(e.aimX - pos[f][0], e.aimZ - pos[f][1])).toBeLessThan(32)
      }

      // expiry: after the LAST 'on' frame the hold runs out within 0.3 s (18 frames) + margin, then the chain command resumes
      expect(lastOn).toBeGreaterThan(firstOn)
      const offBy = lastOn + 18 + 2
      const released = Array.from({ length: Math.min(frames, offBy + 1) }, (_, k) => k)
        .slice(lastOn + 1)
        .some((f) => values[f] === 'off')
      expect(released).toBe(true)

      // the escape really drove the car: over the first on-run the car moved away from the wall (its z grew)
      let runEnd = lastOn
      for (let f = firstOn + 1; f < frames; f++) {
        if (!parseEscape(values[f])) {
          runEnd = f - 1
          break
        }
      }
      expect(pos[runEnd][1] - pos[firstOn][1]).toBeGreaterThan(0.1)
      // and afterwards the chain command owns the car again: it keeps driving (net moves it, no escape active)
      const afterOff = values.findIndex((v, f) => f > runEnd && v === 'off')
      expect(afterOff).toBeGreaterThan(0)
      let moved = false
      for (let f = afterOff; f < frames && !moved; f++) moved = Math.hypot(pos[f][0] - pos[afterOff][0], pos[f][1] - pos[afterOff][1]) > 1
      expect(moved).toBe(true)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 60_000)
})
