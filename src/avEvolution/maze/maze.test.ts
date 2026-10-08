import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { validateWorldDocument } from '@/schema/validate'
import { listAgentDevExampleWorldIds, resetAgentDevExampleWorldIdCacheForTests } from '@/agent/agentDevExampleWorlds'
import { loadLabWorld, runLab } from '@/test/avLab/lab'
import { AV_CAR_SOURCE_ID, AV_CAR_SOURCE_WORLD } from '@/test/fixtures/avEvasionArena'
import { generateMaze, type Maze } from './mazeGen'
import { buildMazeEpisodeWorld, listMazeEpisodes, mazeOfEpisode, mazeParamsFor, type MazeEpisodeSpec } from './episodes'
import { buildMazeExampleWorld, GOAL_MARKER_ID, MAZE_ESCAPE_DEFAULT_CAR_PARAMS } from './exampleWorld'

const EXAMPLE_ID = 'av_maze_escape'

/** BFS over open passages from a start cell: every cell reachable, and the exit cell's north side is open. */
function reachableCells(m: Maze, c0: number, r0: number): number {
  const { cols, rows } = m.params
  const seen = new Set<string>([`${c0},${r0}`])
  const q: [number, number][] = [[c0, r0]]
  while (q.length) {
    const [c, r] = q.shift()!
    const nbs: [number, number, boolean][] = [
      [c, r - 1, m.hWall[r]![c]!],
      [c, r + 1, m.hWall[r + 1]![c]!],
      [c - 1, r, m.vWall[r]![c]!],
      [c + 1, r, m.vWall[r]![c + 1]!],
    ]
    for (const [nc, nr, wall] of nbs) {
      if (wall || nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen.has(`${nc},${nr}`)) continue
      seen.add(`${nc},${nr}`)
      q.push([nc, nr])
    }
  }
  return seen.size
}

describe('maze generator', () => {
  it('is deterministic, fully connected, has one exit gate and extra loops', () => {
    const a = generateMaze(mazeParamsFor(7))
    const b = generateMaze(mazeParamsFor(7))
    expect(JSON.stringify(a.walls)).toBe(JSON.stringify(b.walls))
    expect(JSON.stringify(generateMaze(mazeParamsFor(8)).walls)).not.toBe(JSON.stringify(a.walls))
    for (const seed of [7, 11, 23, 42]) {
      const m = generateMaze(mazeParamsFor(seed))
      expect(reachableCells(m, 0, 0)).toBe(m.params.cols * m.params.rows)
      expect(m.hWall[0]!.filter((w) => !w)).toHaveLength(1)
      expect(m.hWall[m.params.rows]!.every(Boolean)).toBe(true)
      expect(m.loopsRemoved).toBeGreaterThan(0)
      // spanning tree = cells - 1 passages; loops add more
      let open = 0
      for (let r = 1; r < m.params.rows; r++) for (let c = 0; c < m.params.cols; c++) if (!m.hWall[r]![c]) open++
      for (let r = 0; r < m.params.rows; r++) for (let c = 1; c < m.params.cols; c++) if (!m.vWall[r]![c]) open++
      expect(open).toBeGreaterThan(m.params.cols * m.params.rows - 1)
      expect(m.goal[1]).toBeCloseTo(m.originZ - 25)
    }
  })
})

describe('maze episodes', () => {
  const { train, holdout, holdoutExtra, legacyTrain } = listMazeEpisodes()
  const id = (e: MazeEpisodeSpec) => `${e.mazeSeed}:${e.startCell}:${e.startYaw}`
  it('TRAIN (24, 8 mazes) and HOLDOUT (6 original + 18 extra) share no key, no maze seed and no start', () => {
    expect(train.length).toBe(24)
    expect(holdout.map((e) => e.key)).toEqual(['ho1', 'ho2', 'ho3', 'ho4', 'ho5', 'ho6'])
    expect(holdoutExtra.length).toBeGreaterThanOrEqual(18)
    const allHold = [...holdout, ...holdoutExtra]
    const trainSeeds = new Set(train.map((e) => e.mazeSeed))
    expect(trainSeeds.size).toBe(8)
    for (const e of allHold) expect(trainSeeds.has(e.mazeSeed), e.key).toBe(false)
    const all = [...train, ...allHold, ...legacyTrain]
    expect(new Set(all.map((e) => e.key)).size).toBe(all.length)
    expect(new Set(train.map(id)).size).toBe(train.length)
    // the extra holdout mazes are also new relative to the original holdout set
    const origSeeds = new Set(holdout.map((e) => e.mazeSeed))
    for (const e of holdoutExtra) expect(origSeeds.has(e.mazeSeed), e.key).toBe(false)
    for (const e of [...train, ...allHold, ...legacyTrain]) {
      expect(e.startCell[0]).toBeGreaterThanOrEqual(1)
      expect(e.startCell[0]).toBeLessThanOrEqual(6)
      expect(e.startCell[1]).toBeGreaterThanOrEqual(1)
      expect(e.startCell[1]).toBeLessThanOrEqual(6)
      expect(mazeOfEpisode(e).walls.length).toBeGreaterThan(40)
    }
  })

  it('builds a fresh valid world per episode (AV car, no threatIds, no other cars)', () => {
    const src = loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD })
    const w = buildMazeEpisodeWorld(src, train[0]!)
    validateWorldDocument(w)
    const cars = w.entities.filter((e) => e.transformerPipeStack?.length)
    expect(cars.map((e) => e.id)).toEqual([AV_CAR_SOURCE_ID])
    expect((cars[0]!.transformerPipeStack![0]!.params as { threatIds?: string[] }).threatIds).toEqual([])
    expect(buildMazeEpisodeWorld(src, train[0]!)).toEqual(w)
  })
})

describe(`example world ${EXAMPLE_ID}`, () => {
  const file = path.join(process.cwd(), 'public/exampleWorlds', EXAMPLE_ID, 'world.json')
  it('is discoverable, schema-valid and equal to the exporter output', async () => {
    resetAgentDevExampleWorldIdCacheForTests()
    expect(await listAgentDevExampleWorldIds()).toContain(EXAMPLE_ID)
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'))
    validateWorldDocument(onDisk)
    const fresh = buildMazeExampleWorld(loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD }))
    // regenerate with: npx tsx tools/renn-mcp/export-av-maze-escape-example-world.ts
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(onDisk)
  })

  it('runs headless: the car drives, the goal marker does not change the episode', async () => {
    const onDisk = loadLabWorld({ exampleId: EXAMPLE_ID })
    expect(onDisk.entities.some((e) => e.id === GOAL_MARKER_ID)).toBe(true)
    // the exported car carries the evolved default params (saver off)
    const carParams = (onDisk.entities.find((e) => e.id === AV_CAR_SOURCE_ID)!.transformerPipeStack as Array<{ params: Record<string, unknown> }>)[0]!.params
    for (const [k, v] of Object.entries(MAZE_ESCAPE_DEFAULT_CAR_PARAMS)) expect(carParams[k], k).toEqual(v)
    expect(carParams.saver).toBe(false)
    // reference: the plain episode world + the same default car params => identical run (the goal marker is inert)
    const ref = buildMazeEpisodeWorld(loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD }), listMazeEpisodes().legacyTrain[0]!)
    const refBinding = (ref.entities.find((e) => e.id === AV_CAR_SOURCE_ID)!.transformerPipeStack as Array<{ params: Record<string, unknown> }>)[0]!
    refBinding.params = { ...refBinding.params, ...MAZE_ESCAPE_DEFAULT_CAR_PARAMS, saver: false }
    const end: number[][] = []
    for (const world of [{ exampleId: EXAMPLE_ID }, { inline: ref }]) {
      let last: number[] = []
      await runLab({ world, focus: AV_CAR_SOURCE_ID, seed: 1, frames: 300, maxScenes: 0, onFrame: ({ sim }) => { last = [...sim.getPosition(AV_CAR_SOURCE_ID)] } })
      end.push(last)
    }
    expect(end[0]!.every(Number.isFinite)).toBe(true)
    expect(Math.hypot(end[0]![0]! - 0, end[0]![2]! - 0)).toBeGreaterThan(1)
    expect(end[0]).toEqual(end[1])
  }, 120_000)
})
