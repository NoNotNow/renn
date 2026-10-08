import { describe, expect, it } from 'vitest'
import { loadLabWorld } from '@/test/avLab/lab'
import { AV_CAR_SOURCE_ID, AV_CAR_SOURCE_WORLD } from '@/test/fixtures/avEvasionArena'
import { MAZE_PINNED_CAR_PARAMS } from './episodes'

/**
 * Guard for the hidden coupling "maze car = copy of the AV car in self_hunt_flexible".
 *
 * Every param of that binding is either pinned for maze runs (MAZE_PINNED_CAR_PARAMS) or listed here as reviewed:
 * "inherited on purpose, maze runs follow whatever self_hunt_flexible says". A NEW key therefore fails this test until
 * someone decides which of the two it is. Pinned keys must stay in the binding too (otherwise the pin is stale).
 * After changing this list, re-check the maze world (`npx vitest run src/avEvolution/maze`, `npm run av:quick`).
 */
const MAZE_INHERITED_CAR_PARAM_KEYS = [
  'budget', 'chasedDecel', 'comfortDecel', 'cruiseSpeed', 'curveDeadband', 'curveSmooth', 'debugDraw', 'fieldHeuristic',
  'fleeArea', 'fleeStoppedSpeed', 'fwdFovDeg', 'gainInit', 'goalTolerance', 'goalViz', 'goalWatchdog', 'handbackMargin',
  'maneuverRunSpeed', 'maxAccel', 'maxCurvature', 'minSpeed', 'obstacleSlowRadius', 'routeClearance', 'safetyMargin',
  'saver', 'staticMap', 'switchMargin', 'tau', 'threatAccel', 'threatBodyRadius', 'threatHitFloor', 'threatHorizon',
  'threatIds', 'threatRadius', 'threatTurnMin', 'threatTurnRate', 'vehicleLength', 'vehicleWidth', 'wRequired', 'wThreat',
]

describe(`maze car params vs ${AV_CAR_SOURCE_WORLD}`, () => {
  const world = loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD })
  const binding = world.entities.find((e) => e.id === AV_CAR_SOURCE_ID)!.transformerPipeStack as Array<{ params?: Record<string, unknown> }>
  const sourceKeys = Object.keys(binding[0]!.params ?? {})
  const pinned = Object.keys(MAZE_PINNED_CAR_PARAMS)

  it('has no AV car param that is neither pinned nor reviewed for maze runs', () => {
    const known = new Set([...pinned, ...MAZE_INHERITED_CAR_PARAM_KEYS])
    const unknown = sourceKeys.filter((k) => !known.has(k)).sort()
    expect(
      unknown,
      `New param(s) on the ${AV_CAR_SOURCE_WORLD} AV car: add each to MAZE_PINNED_CAR_PARAMS (src/avEvolution/maze/episodes.ts) ` +
        `or to MAZE_INHERITED_CAR_PARAM_KEYS here, then re-verify the maze world.`,
    ).toEqual([])
  })

  it('has no stale entries in the reviewed list', () => {
    const present = new Set(sourceKeys)
    expect(MAZE_INHERITED_CAR_PARAM_KEYS.filter((k) => !present.has(k))).toEqual([])
    expect(MAZE_INHERITED_CAR_PARAM_KEYS.filter((k) => pinned.includes(k))).toEqual([])
  })
})
