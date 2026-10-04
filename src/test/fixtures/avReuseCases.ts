import type { ArenaBox, ArenaSpec, V2, VehicleSpec } from '@/test/fixtures/avEvasionArena'
import { f1, surviveCriteria, GOAL_REACH, type ScenarioMetrics } from '@/test/fixtures/avEvasionRunner'
import { seg, WALL_H, WALL_T } from '@/test/fixtures/avMazeCases'

/**
 * Reusability cases: the SAME autopilot (global pipe, `preset` + goal + cruise speed + threat ids, nothing else) must drive very different vehicles.
 * The hand-tuned example car params are NOT used (`ArenaSpec.carParams` replaces them). Geometry that depends on the vehicle (U width, pocket gap) is
 * derived from its footprint, so a larger vehicle gets proportionally wider corridors (a 6 x 14 m truck cannot turn around in a 16 m U).
 * See `av-vehicle-reuse.*.test.ts` and `agent-context/feature-av-stack.md` ("Using the AV autopilot in your game").
 */

export interface ReuseVehicle {
  id: string
  about: string
  vehicle: VehicleSpec
  /** Cruise speed handed to the pipe (the one game-facing speed knob). */
  cruise: number
}

/** Body + car2 actuator variants (the example car is size 4 x 8, mass 2, power 2400 => ~1200 m/s^2 per unit command, steering as in the example). */
export const REUSE_VEHICLES: ReuseVehicle[] = [
  { id: 'heavy-cube', about: '4 x 4 cube, mass 10 (5x), power 1000: ~100 m/s^2 per unit command, 40 m/s^2 peak', vehicle: { size: [4, 4], mass: 10, power: 1000 }, cruise: 20 },
  { id: 'light-ice', about: 'mass 0.5, power 1200 (2400 m/s^2), low lateral grip, icy ground (friction 0.05)', vehicle: { mass: 0.5, power: 1200, lateralGrip: 30, groundFriction: 0.05 }, cruise: 25 },
  { id: 'small-car', about: '2 x 4 car, mass 0.5, power 600', vehicle: { size: [2, 4], mass: 0.5, power: 600 }, cruise: 25 },
  { id: 'truck', about: '6 x 14 box, mass 10, power 3000 (300 m/s^2)', vehicle: { size: [6, 14], mass: 10, power: 3000 }, cruise: 20 },
]

export interface ReuseCase {
  name: string
  about: string
  seconds: number
  spec: (v: ReuseVehicle) => ArenaSpec
  criteria: (m: ScenarioMetrics, v: ReuseVehicle) => string[]
}

const CHASER: V2 = [2.5, 5]
const size = (v: ReuseVehicle): V2 => v.vehicle.size ?? [4, 8]

function cylinder(c: V2, r: number): ArenaBox[] {
  const n = 24
  const out: ArenaBox[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    const side = 2 * r * Math.sin(Math.PI / n) + 0.3
    out.push({ at: [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)], size: [side, WALL_T], yawDeg: -((a + Math.PI / 2) * 180) / Math.PI, height: WALL_H })
  }
  return out
}

/** Standing start, one launch metric common to all cases: no kick, 8 m/s within 1.5 s of the first demand. */
function launchCriteria(m: ScenarioMetrics, v: ReuseVehicle, withT8 = true): string[] {
  const out: string[] = []
  if (m.launchMaxDv > 1.5) out.push(`launch kick ${f1(m.launchMaxDv)} m/s in one frame (> 1.5)`)
  if (withT8 && m.t8 > 1.5 && v.cruise >= 10) out.push(`time to 8 m/s ${f1(m.t8)} s > 1.5`)
  return out
}

export const REUSE_CASES: ReuseCase[] = [
  {
    name: 'open-road',
    about: 'free straight, goal 340 m ahead: reaches the cruise speed, no kick',
    seconds: 14,
    spec: (v) => ({ car: { at: [0, 200], yawDeg: 0 }, goal: [0, -140], boxes: [], puppets: [], vehicle: v.vehicle, carParams: { preset: 'car', cruiseSpeed: v.cruise } }),
    criteria: (m, v) => {
      const out = [...surviveCriteria()(m).filter((c) => !c.startsWith('launch kick')), ...launchCriteria(m, v)]
      if (m.peakSpeed < 0.8 * v.cruise) out.push(`peak speed ${f1(m.peakSpeed)} m/s < ${f1(0.8 * v.cruise)} (80% of cruise)`)
      if (m.peakSpeed > 1.25 * v.cruise) out.push(`peak speed ${f1(m.peakSpeed)} m/s > ${f1(1.25 * v.cruise)} (cruise overshoot)`)
      return out
    },
  },
  {
    name: 'goal-behind-wall',
    about: 'goal 100 m ahead behind a 180 m wall 40 m in front: drive around it (maze preset)',
    seconds: 45,
    spec: (v) => ({ car: { at: [0, 0], yawDeg: 0 }, goal: [0, -100], boxes: [seg([-90, -40], [90, -40])], puppets: [], vehicle: v.vehicle, carParams: { preset: 'maze', cruiseSpeed: v.cruise } }),
    criteria: (m, v) => {
      const out = [...surviveCriteria({ maxStalledSec: 6, minEndSpeed: 0 })(m).filter((c) => !c.startsWith('launch kick')), ...launchCriteria(m, v)]
      if (m.goalReachT === Infinity) out.push(`goal not reached (closest ${f1(m.minGoalDist)} m > ${GOAL_REACH})`)
      if (m.reversals > 2) out.push(`${m.reversals} direction reversals > 2`)
      return out
    },
  },
  {
    name: 'u-trap-inside',
    about: 'deep inside a U (inner width 16 m, scaled up for long vehicles), nose to the closed side, goal through it: back out / turn around, go around the arm',
    seconds: 60,
    spec: (v) => {
      const [w, l] = size(v)
      const inner = Math.max(16, 1.2 * l + 8, 2 * w + 6)
      const h = inner / 2 + 0.5
      const z0 = -30
      return {
        car: { at: [0, z0], yawDeg: 0 },
        goal: [0, -120],
        boxes: [seg([-h, -50], [-h, 10]), seg([h, -50], [h, 10]), seg([-h, -50], [h, -50])],
        puppets: [],
        vehicle: v.vehicle,
        carParams: { preset: 'maze', cruiseSpeed: v.cruise },
      }
    },
    criteria: (m, v) => {
      const out = [...surviveCriteria({ maxStalledSec: 8, minEndSpeed: 0 })(m).filter((c) => !c.startsWith('launch kick')), ...launchCriteria(m, v)]
      if (m.goalReachT === Infinity) out.push(`goal not reached (closest ${f1(m.minGoalDist)} m > ${GOAL_REACH})`)
      if (m.reversals > 10) out.push(`${m.reversals} direction reversals > 10`)
      if (m.shuttleEvents > 2) out.push(`${m.shuttleEvents} shuttle / jitter episodes > 2`)
      return out
    },
  },
  {
    name: 'pocket-escape',
    about: 'wall 1.5 m left of the hull, a 15 m cylinder 1.5 m ahead, a parked car right-front leaving half a car width: reverse out, then go around',
    seconds: 30,
    spec: (v) => {
      const [w, l] = size(v)
      const wallX = -(w / 2 + 2)
      const zFar = l / 2 + 21
      const zNear = -(l / 2 + 16)
      return {
        car: { at: [0, 0], yawDeg: 0 },
        goal: [0, -120],
        boxes: [seg([wallX, zFar], [wallX, zNear]), ...cylinder([0, -(l / 2 + 1.5 + 15)], 15)],
        puppets: [{ id: 'parked_car', size: [4, 8], at: [w + 2, -l / 2 + 1], yawDeg: 0, motion: { kind: 'park' } }],
        vehicle: v.vehicle,
        carParams: { preset: 'maze', cruiseSpeed: v.cruise },
      }
    },
    criteria: (m, v) => {
      const out = [...surviveCriteria({ maxStalledSec: 5, minEndSpeed: 0, minChaserGap: 0.3 })(m).filter((c) => !c.startsWith('launch kick')), ...launchCriteria(m, v, false)]
      if (m.goalReachT === Infinity) out.push(`goal not reached (closest ${f1(m.minGoalDist)} m > ${GOAL_REACH})`)
      if (m.reversals > 6) out.push(`${m.reversals} direction reversals > 6`)
      // a 14 m truck needs a longer K-turn in the pocket (each extra gear change reads as a short shuttle episode): one more episode per 4 m of length above 8 m
      const maxShuttle = 2 + Math.max(0, Math.ceil((size(v)[1] - 8) / 4))
      if (m.shuttleEvents > maxShuttle) out.push(`${m.shuttleEvents} shuttle / jitter episodes > ${maxShuttle}`)
      return out
    },
  },
  {
    name: 'evasion-head-on',
    about: 'a 25 m/s chaser drives straight down the car lane toward the car (chaser-evasion preset + threat id)',
    seconds: 14,
    spec: (v) => ({
      car: { at: [0, 150], yawDeg: 0 },
      goal: [0, -300],
      boxes: [],
      puppets: [{ id: 'chaser_a', size: CHASER, at: [0, -200], yawDeg: 180, motion: { kind: 'line', speed: 25 } }],
      vehicle: v.vehicle,
      carParams: { preset: 'chaser-evasion', cruiseSpeed: v.cruise },
    }),
    criteria: (m, v) => [...surviveCriteria({ minChaserGap: 1 })(m).filter((c) => !c.startsWith('launch kick')), ...launchCriteria(m, v)],
  },
]
