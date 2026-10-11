import { expect, it } from 'vitest'
import { buildEdgeWorldForDebug } from '@/test/fixtures/avEdgeWorld'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * Touch escape (av-ego `escapeTouch`, watch 'av.escape'): a lateral contact (isTouchingSide) overrides the goal for
 * 0.3 s with an aim in the direction OPPOSITE the touch point. The low bar (0.35 m) is below the perception ray
 * plane, so the stack cannot avoid it — the car drives into it, exactly the situation the escape layer is for.
 */

const watch = (label: string): string | undefined => {
  for (const e of getTransformerWatchEntries().values()) if (e.label === label) return e.value
  return undefined
}

interface EscapeState {
  on: boolean
  aimX: number
  aimZ: number
  dx: number
  dz: number
  rem: number
}

function parseEscape(v: string | undefined): EscapeState | null {
  const m = typeof v === 'string' ? /^on (-?\d+),(-?\d+) d (-?[\d.]+),(-?[\d.]+) ([\d.]+) s$/.exec(v) : null
  return m ? { on: true, aimX: Number(m[1]), aimZ: Number(m[2]), dx: Number(m[3]), dz: Number(m[4]), rem: Number(m[5]) } : null
}

it('touch escape: side contact turns av.escape on, aims away from the touched bar, releases within the 0.3 s hold', async () => {
  setAgentObservationWatchActive(true)
  try {
    // bar across the car's way at z = -8 (6 m wide, 0.35 m high: invisible to the lidar, a lateral contact head-on).
    // The escape override lives in av-ego (priority 2) and replaces input.target, so the goal source must run BEFORE it
    // (like the lab worlds, where the wanderer is bound ahead of the stack): move the mission stage in front of ego.
    const world = buildEdgeWorldForDebug({ name: 'escape', goal: [0, -50], obstacles: [{ at: [0, -8], length: 6, thickness: 1, yawDeg: 0, height: 0.35 }] })
    world.transformers!.global_av_mission!.priority = 1.5
    const sim = await WorldSimulator.create(world, 15)
    try {
      const frames = 900
      const values: (string | undefined)[] = []
      const pos: [number, number][] = []
      for (let f = 0; f < frames; f++) {
        sim.runFrames(1)
        values.push(watch('av.escape'))
        const p = sim.getPosition('buggy')
        pos.push([p[0], p[2]])
      }

      // activated: the watch flipped 'on' at some point while pressing the bar
      let firstOn = -1
      for (let f = 0; f < frames; f++)
        if (parseEscape(values[f])) {
          firstOn = f
          break
        }
      expect(firstOn).toBeGreaterThanOrEqual(0)

      // first touch: the escape direction points AWAY from the touched bar (head-on press), the aim is
      // ESCAPE_AIM_M (30 m) from the car on that direction
      const first = parseEscape(values[firstOn])!
      const awayX = pos[firstOn][0] - 0
      const awayZ = pos[firstOn][1] - -8
      const away = Math.hypot(awayX, awayZ)
      expect(away).toBeGreaterThan(1)
      expect(first.dx * (awayX / away) + first.dz * (awayZ / away)).toBeGreaterThan(0.7)

      // per-frame recompute: every active frame the aim is ~30 m from the CURRENT car position along the direction
      let lastOn = -1
      for (let f = 0; f < frames; f++) {
        const e = parseEscape(values[f])
        if (!e) continue
        lastOn = f
        const d = Math.hypot(e.aimX - pos[f][0], e.aimZ - pos[f][1])
        expect(Math.abs(d - 30)).toBeLessThan(1)
      }

      // release: after the LAST 'on' frame the escape expires within the 0.3 s hold (18 frames) + margin
      expect(lastOn).toBeGreaterThan(firstOn)
      const offBy = lastOn + 18 + 2
      const released = Array.from({ length: Math.min(frames, offBy + 1) }, (_, k) => k)
        .slice(lastOn + 1)
        .some((f) => values[f] === 'off')
      expect(released).toBe(true)
    } finally {
      sim.dispose()
    }
  } finally {
    setAgentObservationWatchActive(false)
  }
})
