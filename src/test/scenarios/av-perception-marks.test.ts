import { describe, expect, it } from 'vitest'
import { liveStageState } from '@/test/avLab/lab'
import { ARENA_CAR_ID, type ArenaSpec } from '@/test/fixtures/avEvasionArena'
import { SCENARIO_TIMEOUT, runScenario } from '@/test/fixtures/avEvasionRunner'

/**
 * Costmap marks (the magenta ticks) of a MOVING body follow it and expire quickly; they must not stay behind as a ghost trail.
 * Empty arena (no static bodies): every remembered point has to lie on / next to the one moving body, background traffic crossing ahead
 * of the car (not a threat). Red check: `memFollow: false` (the old fixed-position memory) leaves a trail.
 */
const TRAFFIC = 'traffic'

function spec(extra: Record<string, unknown> = {}): ArenaSpec {
  return {
    car: { at: [0, 150], yawDeg: 0 },
    goal: [0, -150],
    boxes: [],
    // crosses the car's road 60 m ahead at 15 m/s, heading +X (yaw -90)
    puppets: [{ id: TRAFFIC, size: [2.5, 5], at: [-70, 40], yawDeg: -90, motion: { kind: 'line', speed: 15 }, threat: false }],
    extraParams: extra,
  }
}

async function ghostMarks(extra: Record<string, unknown>): Promise<{ ghosts: number; marks: number; worst: number }> {
  let ghosts = 0
  let marks = 0
  let worst = 0
  await runScenario(spec(extra), 9, {
    onFrame: ({ sim, world }) => {
      const st = liveStageState(sim, world, ARENA_CAR_ID, 'perception') as { mem?: Record<string, { x: number; z: number }> } | undefined
      const p = sim.getPosition(TRAFFIC)
      for (const m of Object.values(st?.mem ?? {})) {
        marks++
        // distance to the body's centre; its hull reaches 2.8 m (half diagonal), +1.2 m tolerance (cell size, rotation)
        const d = Math.hypot(m.x - p[0], m.z - p[2])
        worst = Math.max(worst, d)
        if (d > 4) ghosts++
      }
    },
  })
  return { ghosts, marks, worst }
}

describe('AV perception: marks of moving bodies follow them (no ghost trail)', () => {
  it(
    'background traffic crossing ahead leaves no marks behind',
    async () => {
      const on = await ghostMarks({})
      const off = await ghostMarks({ memFollow: false })
      console.log(`AV MARKS follow: ${on.ghosts}/${on.marks} ghost mark-frames (worst ${on.worst.toFixed(1)} m); fixed (red check): ${off.ghosts}/${off.marks} (worst ${off.worst.toFixed(1)} m)`)
      expect(on.marks).toBeGreaterThan(50)
      expect(on.ghosts).toBe(0)
      // red check: the old memory leaves a trail
      expect(off.ghosts).toBeGreaterThan(100)
    },
    SCENARIO_TIMEOUT * 2,
  )
})
