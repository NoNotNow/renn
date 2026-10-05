import { runLab, forwardSpeed } from '@/test/avLab/lab'
import { DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { AV_CAR_SOURCE_ID, rectPoly, polyGap, type ArenaBox, type ArenaSpec, type V2 } from '@/test/fixtures/avEvasionArena'
import { runScenario } from '@/test/fixtures/avEvasionRunner'
import { buildFleetWorld, fleetCarId } from '@/test/fixtures/avFleet'
import { seg } from '@/test/fixtures/avMazeCases'

/**
 * Oncoming-traffic scenarios for the passing side (`passSide`, see feature-av-stack.md "Keep right when passing").
 * Heading convention: yaw 0 = facing -Z, positive = left (counter-clockwise from above), x right, z toward the viewer: the LEFT vector of a car with forward (fx, fz) is (fz, -fx).
 * `lat` = signed lateral offset of the OTHER body in OUR frame at the moment we are abreast (longitudinal offset crosses 0): > 0 = the other car is on our LEFT = we passed it on OUR RIGHT.
 */
export interface PassMetrics {
  /** Lateral offset (m, + = other on our left) at the abreast moment; NaN when never abreast (no pass happened). */
  lat: number
  /** Smallest hull-to-hull gap between the two cars (m). */
  minGap: number
  contact: boolean
  /** Lowest forward speed (m/s) from the start until abreast. */
  minSpeed: number
  /** Simulated time (s) of the abreast moment (Infinity = never). */
  passT: number
}

type Q = { x: number; y: number; z: number; w: number }
const CAR: V2 = [4, 8]
export const fwdOfQuat = (q: Q): V2 => [-2 * (q.x * q.z + q.w * q.y), -(1 - 2 * (q.x * q.x + q.y * q.y))]

class PassProbe {
  lat = NaN
  minGap = Infinity
  contact = false
  minSpeed = Infinity
  passT = Infinity
  private prevLong: number | null = null
  update(t: number, a: { p: number[]; q: Q; v: [number, number, number] }, b: { p: number[]; q: Q }) {
    const f = fwdOfQuat(a.q)
    const dx = b.p[0]! - a.p[0]!
    const dz = b.p[2]! - a.p[2]!
    const long = dx * f[0] + dz * f[1]
    const lat = dx * f[1] + dz * -f[0]
    const fb = fwdOfQuat(b.q)
    const g = polyGap(rectPoly(a.p[0]!, a.p[2]!, Math.atan2(-f[0], -f[1]), CAR[0], CAR[1]), rectPoly(b.p[0]!, b.p[2]!, Math.atan2(-fb[0], -fb[1]), CAR[0], CAR[1]))
    this.minGap = Math.min(this.minGap, g)
    if (g < 0.1) this.contact = true
    if (this.passT === Infinity) {
      this.minSpeed = Math.min(this.minSpeed, forwardSpeed(a.q, a.v))
      if (this.prevLong !== null && this.prevLong > 0 && long <= 0 && Math.abs(lat) < 40) {
        this.lat = lat
        this.passT = t
      }
    }
    this.prevLong = long
  }
  result(): PassMetrics {
    return { lat: this.lat, minGap: this.minGap, contact: this.contact, minSpeed: this.minSpeed, passT: this.passT }
  }
}

export interface OncomingSpec {
  name: string
  /** Walls (corridor) of the arena. */
  boxes?: ArenaBox[]
  /** Lateral offset (m) of the oncoming puppet; + = to the car's RIGHT as seen along its path (the car drives north: +x). */
  offset?: number
  puppetSpeed?: number
  carSpeed?: number
  /** x of the far goal (default 0: straight ahead); a goal to the left / right makes the old behaviour choose that side. */
  goalX?: number
  /** The puppet is a tracked threat (threatIds: pursuit prediction, evasion) instead of background traffic. */
  threat?: boolean
  /** cruiseSpeed override (the example car has 1000 = as fast as the plant goes, ~35 m/s: a 14 m corridor at 47 m/s closing speed is not a passing scenario). */
  cruise?: number
  seconds?: number
}

export const CORRIDOR_14: ArenaBox[] = [seg([-7.5, 300], [-7.5, -600]), seg([7.5, 300], [7.5, -600])]

/** The AV car drives north (-Z) towards a far goal, a puppet (not a threat: background traffic) comes the other way. */
export async function runOncoming(s: OncomingSpec, params: Record<string, unknown> = {}): Promise<PassMetrics> {
  const spec: ArenaSpec = {
    car: { at: [0, 0], yawDeg: 0, speed: s.carSpeed ?? 15 },
    goal: [s.goalX ?? 0, -700],
    boxes: s.boxes ?? [],
    extraParams: { ...(s.cruise != null ? { cruiseSpeed: s.cruise, sensorRange: 150 } : {}), ...params },
    puppets: [{ id: 'oncoming', size: CAR, at: [s.offset ?? 0, -260], yawDeg: 180, motion: { kind: 'line', speed: s.puppetSpeed ?? 12 }, threat: s.threat === true }],
  }
  const probe = new PassProbe()
  await runScenario(spec, s.seconds ?? 20, {
    onFrame: ({ t, sim }) => {
      probe.update(t, { p: sim.getPosition(AV_CAR_SOURCE_ID), q: sim.getRotation(AV_CAR_SOURCE_ID), v: sim.getVelocity(AV_CAR_SOURCE_ID) }, { p: sim.getPosition('oncoming'), q: sim.getRotation('oncoming') })
    },
  })
  return probe.result()
}

/** Two real AV-pipe cars heading for each other's start (fleet ring, no fleet walls unless given). */
export async function runFacingPair(params: Record<string, unknown> = {}, boxes: ArenaBox[] = [], seconds = 20): Promise<{ a: PassMetrics; b: PassMetrics }> {
  const world = buildFleetWorld({ n: 2, ring: 110, params, walls: boxes })
  const pa = new PassProbe()
  const pb = new PassProbe()
  const id0 = fleetCarId(0)
  const id1 = fleetCarId(1)
  await runLab({
    world: { inline: world },
    preparedWorld: world,
    applyLibrary: false,
    focus: id0,
    seed: 1,
    frames: Math.round(seconds / DEFAULT_DT),
    profile: false,
    maxScenes: 0,
    onFrame: ({ frame, sim }) => {
      const t = (frame + 1) * DEFAULT_DT
      const s0 = { p: sim.getPosition(id0), q: sim.getRotation(id0), v: sim.getVelocity(id0) }
      const s1 = { p: sim.getPosition(id1), q: sim.getRotation(id1), v: sim.getVelocity(id1) }
      pa.update(t, s0, s1)
      pb.update(t, s1, s0)
    },
  })
  return { a: pa.result(), b: pb.result() }
}

export const fmtPass = (m: PassMetrics) =>
  `lat ${m.lat.toFixed(2)} (${m.lat > 0 ? 'own RIGHT' : m.lat < 0 ? 'own LEFT' : 'n/a'}) minGap ${m.minGap.toFixed(2)} contact ${m.contact} minSpeed ${m.minSpeed.toFixed(1)} passT ${m.passT.toFixed(1)}`
