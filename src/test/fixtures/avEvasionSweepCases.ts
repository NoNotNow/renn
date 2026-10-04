import { headingDir, type ArenaBox, type ArenaSpec, type PuppetSpec, type V2 } from '@/test/fixtures/avEvasionArena'

/**
 * Parametric case generator for the AV evasion sweep (`av-evasion-sweep.*.test.ts`, `agent-context/feature-av-lab.md`).
 *
 * Every case is a fixed deterministic situation: the car stands at the origin facing -Z (goal 400 m ahead unless the
 * layout says otherwise), chasers are homing puppets that START facing the car at `dist` m on `bearing` degrees off the
 * car's nose (+ = left), with a fixed speed and turn-rate limit. Nothing is random.
 */

export type SweepFamily = 'single' | 'pair' | 'triple' | 'static-chaser' | 'static-only'

export interface SweepCase {
  id: string
  family: SweepFamily
  /** Matrix coordinates (strings so the printer can group by any of them). */
  params: Record<string, string>
  seconds: number
  spec: ArenaSpec
  /** Always-on subset (the rest runs with AV_SWEEP=full). */
  core?: boolean
  /** Empty = winnable; otherwise the geometric reason this case cannot be won by any car (see `classify`). */
  unwinnable: string
}

export const SWEEP_SPEED = [20, 30, 40] as const
export const SWEEP_TURN = { low: 0.6, high: 2.0 } as const
const CHASER_SIZE: V2 = [2.5, 5]
const LEAD = 0.3
const SWEEP_SECONDS = 10

const rad = (d: number) => (d * Math.PI) / 180

function chaserAt(id: string, bearingDeg: number, dist: number, speed: number, turnRate: number): PuppetSpec {
  const d = headingDir(rad(bearingDeg))
  return {
    id,
    size: CHASER_SIZE,
    at: [d[0] * dist, d[1] * dist],
    yawDeg: bearingDeg + 180,
    motion: { kind: 'home', speed, turnRate, lead: LEAD },
  }
}

export interface ChaserGeom {
  bearing: number
  dist: number
  speed: number
  turnRate: number
}

/**
 * Cases no controller can win, from `oracle()` (`avEvasionOracle.ts`: no open-loop manoeuvre of an idealised car - 30 m/s^2 launch, 35 m/s top,
 * curvature 0.115, 10 m/s^2 lateral - clears the exact puppet motion by 0.5 m). Regenerate after changing a case geometry:
 * `AV_ORACLE=1 npx vitest run src/test/scenarios/av-sweep-oracle.diagnostic.test.ts`.
 */
const ORACLE_UNWINNABLE = new Set<string>([
  'single/v30/high/b0/near',
  'single/v40/low/b0/near',
  'single/v40/high/b-30/near',
  'single/v40/high/b-30/far',
  'single/v40/high/b0/near',
  'single/v40/high/b0/far',
  'single/v40/high/b30/near',
  'single/v40/high/b30/far',
  'single/v40/high/b150/near',
  'pair/v25/high/b-30+30/near',
  'pair/v35/low/b-30+30/near',
  'pair/v35/high/b-30+30/near',
  'pair/v35/high/b-30+30/far',
  'pair/v35/high/b0+150/near',
  'triple/v25/low/fan/near',
  'triple/v25/high/fan/near',
  'triple/v35/low/fan/near',
  'triple/v35/high/fan/near',
  'triple/v35/high/fan/far',
  'corner/v35/low/L',
  'corner/v35/high/L',
  'corner/v35/low/R',
  'corner/v35/high/R',
  'alley/v25/ahead',
  'alley/v35/ahead',
])

const OPEN_GOAL: V2 = [0, -400]

function carStart(): ArenaSpec['car'] {
  return { at: [0, 0], yawDeg: 0 }
}

const wall = (at: V2, size: V2, yawDeg = 0): ArenaBox => ({ at, size, yawDeg })

function make(
  id: string,
  family: SweepFamily,
  params: Record<string, string>,
  chasers: (ChaserGeom & { id: string })[],
  boxes: ArenaBox[],
  goal: V2,
  core = false,
  seconds = SWEEP_SECONDS,
): SweepCase {
  return {
    id,
    family,
    params,
    seconds,
    core,
    spec: { car: carStart(), goal, boxes, puppets: chasers.map((c) => chaserAt(c.id, c.bearing, c.dist, c.speed, c.turnRate)) },
    unwinnable: ORACLE_UNWINNABLE.has(id) ? 'oracle: no manoeuvre clears it' : '',
  }
}

const turnKeys = Object.keys(SWEEP_TURN) as (keyof typeof SWEEP_TURN)[]

/** Core (always-on) picks: a spread over the families, mostly winnable, a few hard ones. */
const CORE_IDS = new Set([
  'single/v30/high/b0/far',
  'single/v40/low/b-30/far',
  'single/v20/high/b150/near',
  'single/v30/low/b30/near',
  'pair/v25/high/b-60+60/far',
  'pair/v35/low/b-30+30/near',
  'triple/v25/high/fan/far',
  'triple/v35/low/surround/near',
  'corner/v30/high/L',
  'alley/v30/ahead',
  'slalom',
  'gap12',
])

export function buildSweepCases(): SweepCase[] {
  const out: SweepCase[] = []
  const push = (c: SweepCase) => out.push({ ...c, core: CORE_IDS.has(c.id) })

  // family 1: one chaser
  for (const v of SWEEP_SPEED) {
    for (const tk of turnKeys) {
      for (const b of [-30, 0, 30, 150]) {
        for (const [dk, dist] of [['near', 60], ['far', 120]] as const) {
          const id = `single/v${v}/${tk}/b${b}/${dk}`
          push(make(id, 'single', { speed: `${v}`, turn: tk, bearing: `${b}`, dist: dk }, [{ id: 'c1', bearing: b, dist, speed: v, turnRate: SWEEP_TURN[tk] }], [], OPEN_GOAL))
        }
      }
    }
  }

  // family 2: two chasers
  const pairs: [string, number, number][] = [['-60+60', -60, 60], ['-30+30', -30, 30], ['0+150', 0, 150]]
  for (const v of [25, 35]) {
    for (const tk of turnKeys) {
      for (const [pk, b1, b2] of pairs) {
        for (const [dk, dist] of [['near', 70], ['far', 120]] as const) {
          const id = `pair/v${v}/${tk}/b${pk}/${dk}`
          const g = (id2: string, b: number): ChaserGeom & { id: string } => ({ id: id2, bearing: b, dist, speed: v, turnRate: SWEEP_TURN[tk] })
          push(make(id, 'pair', { speed: `${v}`, turn: tk, bearing: pk, dist: dk }, [g('c1', b1), g('c2', b2)], [], OPEN_GOAL))
        }
      }
    }
  }

  // family 3: three chasers
  const triples: [string, number[]][] = [['fan', [-40, 0, 40]], ['surround', [-90, 90, 180]]]
  for (const v of [25, 35]) {
    for (const tk of turnKeys) {
      for (const [lk, bs] of triples) {
        for (const [dk, dist] of [['near', 80], ['far', 130]] as const) {
          const id = `triple/v${v}/${tk}/${lk}/${dk}`
          const g = bs.map((b, i) => ({ id: `c${i + 1}`, bearing: b, dist: dist + (i % 2) * 8, speed: v, turnRate: SWEEP_TURN[tk] }))
          push(make(id, 'triple', { speed: `${v}`, turn: tk, bearing: lk, dist: dk }, g, [], OPEN_GOAL))
        }
      }
    }
  }

  // family 4: static layouts + a chaser
  // wall corner ahead of the car (L = corner on the left / -X, R = on the right); chaser from the open quadrant behind-right of it, goal across the open side
  for (const side of ['L', 'R'] as const) {
    const m = side === 'L' ? 1 : -1
    for (const v of [25, 35]) {
      for (const tk of turnKeys) {
        const id = `corner/v${v}/${tk}/${side}`
        const boxes = [wall([-24 * m, -10], [2, 100]), wall([26 * m, -32], [100, 2])]
        const bearing = (Math.atan2(-60 * m, -60) * 180) / Math.PI
        push(make(id, 'static-chaser', { layout: `corner-${side}`, speed: `${v}`, turn: tk }, [{ id: 'c1', bearing, dist: 120, speed: v, turnRate: SWEEP_TURN[tk] }], boxes, [100 * m, 100]))
      }
    }
  }
  // the hand-made corner-trap scenario (reference: passes with a 1.5 m gap)
  out.push({
    id: 'corner-trap-ref',
    family: 'static-chaser',
    params: { layout: 'corner-ref', speed: '30', turn: 'high' },
    seconds: 14,
    core: true,
    spec: { car: { at: [-36, -30], yawDeg: 0 }, goal: [120, 120], boxes: [wall([-60, -10], [2, 100]), wall([-10, -60], [100, 2])], puppets: [{ id: 'c1', size: CHASER_SIZE, at: [70, 70], yawDeg: 135, motion: { kind: 'home', speed: 30, turnRate: 1.5, lead: 0.3 } }] },
    unwinnable: '',
  })
  // 20 m wide alley (length 300) with a chaser head-on / from behind
  const alleyBoxes = [wall([-11, -150], [2, 300]), wall([11, -150], [2, 300]), wall([-11, 100], [2, 200]), wall([11, 100], [2, 200])]
  for (const v of [25, 35]) {
    for (const [dirk, b] of [['ahead', 0], ['behind', 180]] as const) {
      const id = `alley/v${v}/${dirk}`
      push(make(id, 'static-chaser', { layout: 'alley', speed: `${v}`, turn: 'low', bearing: dirk }, [{ id: 'c1', bearing: b, dist: 100, speed: v, turnRate: 1.0 }], alleyBoxes, OPEN_GOAL))
    }
  }

  // family 5: static only
  const slalom = [0, 1, 2, 3].map((i) => wall([i % 2 ? 7 : -7, -40 - i * 45], [10, 3]))
  push(make('slalom', 'static-only', { layout: 'slalom' }, [], slalom, OPEN_GOAL))
  push(make('block-wide', 'static-only', { layout: 'block-wide' }, [], [wall([0, -70], [40, 4])], OPEN_GOAL))
  push(make('gap12', 'static-only', { layout: 'gap12' }, [], [wall([-20, -70], [28, 4]), wall([20, -70], [28, 4])], OPEN_GOAL))
  return out
}

/** Which cases a run executes: `AV_SWEEP=full` = all, otherwise only the core subset. */
export function selectedCases(): SweepCase[] {
  const all = buildSweepCases()
  return process.env.AV_SWEEP === 'full' ? all : all.filter((c) => c.core)
}

export const SWEEP_SHARDS = 4
