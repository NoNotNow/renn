import type { ArenaBox, V2 } from '@/test/fixtures/avEvasionArena'

/**
 * Seeded maze generator (recursive backtracker + extra loops) for the AV maze-escape task. Pure and deterministic:
 * the same `MazeParams` always give the same maze (no Math.random). Browser-safe (no node imports).
 *
 * Layout: `cols x rows` cells of pitch `cell` (corridor width = cell - wall thickness). North = -Z. Cell (c, r) has its
 * centre at (originX + (c + 0.5) * cell, originZ + (r + 0.5) * cell).
 */

export const WALL_H = 1.5
export const WALL_T = 1

/** Axis-aligned wall from `a` to `b` (one coordinate must match), 1 m thick, ends extended by half a thickness so corners close. */
export function seg(a: V2, b: V2): ArenaBox {
  const horizontal = Math.abs(a[1] - b[1]) < 1e-9
  const len = Math.abs(horizontal ? b[0] - a[0] : b[1] - a[1]) + WALL_T
  return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], size: horizontal ? [len, WALL_T] : [WALL_T, len], height: WALL_H }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface MazeParams {
  seed: number
  cols: number
  rows: number
  /** Cell pitch (m): corridor 14 m + 1 m wall. */
  cell: number
  /** Fraction of the remaining interior walls removed after carving (loops / alternative routes). */
  loopFraction: number
  /** Distance (m) of the goal behind the exit gate. */
  goalDist: number
}

export const DEFAULT_MAZE: Omit<MazeParams, 'seed'> = { cols: 8, rows: 8, cell: 15, loopFraction: 0.1, goalDist: 25 }

export interface Maze {
  params: MazeParams
  originX: number
  originZ: number
  /** hWall[r][c]: wall on the NORTH side of cell (c, r), r = 0..rows (rows = south perimeter). */
  hWall: boolean[][]
  /** vWall[r][c]: wall on the WEST side of cell (c, r), c = 0..cols (cols = east perimeter). */
  vWall: boolean[][]
  /** Exit gate on the north perimeter: column of the gap. */
  exitCol: number
  walls: ArenaBox[]
  goal: V2
  /** Interior walls removed for loops. */
  loopsRemoved: number
}

export function cellCentre(m: Pick<Maze, 'originX' | 'originZ' | 'params'>, c: number, r: number): V2 {
  return [m.originX + (c + 0.5) * m.params.cell, m.originZ + (r + 0.5) * m.params.cell]
}

/** Generates the maze centred on the world origin. */
export function generateMaze(p: MazeParams): Maze {
  const rnd = mulberry32(p.seed)
  const { cols, rows, cell } = p
  const hWall = Array.from({ length: rows + 1 }, () => Array<boolean>(cols).fill(true))
  const vWall = Array.from({ length: rows }, () => Array<boolean>(cols + 1).fill(true))
  const seen = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  const stack: [number, number][] = []
  const c0 = Math.floor(rnd() * cols)
  const r0 = Math.floor(rnd() * rows)
  seen[r0]![c0] = true
  stack.push([c0, r0])
  while (stack.length) {
    const [c, r] = stack[stack.length - 1]!
    const nb: [number, number, () => void][] = []
    if (r > 0 && !seen[r - 1]![c]) nb.push([c, r - 1, () => { hWall[r]![c] = false }])
    if (r < rows - 1 && !seen[r + 1]![c]) nb.push([c, r + 1, () => { hWall[r + 1]![c] = false }])
    if (c > 0 && !seen[r]![c - 1]) nb.push([c - 1, r, () => { vWall[r]![c] = false }])
    if (c < cols - 1 && !seen[r]![c + 1]) nb.push([c + 1, r, () => { vWall[r]![c + 1] = false }])
    if (!nb.length) {
      stack.pop()
      continue
    }
    const [nc, nr, open] = nb[Math.floor(rnd() * nb.length)]!
    open()
    seen[nr]![nc] = true
    stack.push([nc, nr])
  }
  // extra loops: remove a fraction of the remaining interior walls
  const interior: [boolean, number, number][] = []
  for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) if (hWall[r]![c]) interior.push([true, r, c])
  for (let r = 0; r < rows; r++) for (let c = 1; c < cols; c++) if (vWall[r]![c]) interior.push([false, r, c])
  const nLoops = Math.round(interior.length * p.loopFraction)
  for (let i = 0; i < nLoops; i++) {
    const j = i + Math.floor(rnd() * (interior.length - i))
    ;[interior[i], interior[j]] = [interior[j]!, interior[i]!]
    const [h, r, c] = interior[i]!
    if (h) hWall[r]![c] = false
    else vWall[r]![c] = false
  }
  const exitCol = Math.floor(rnd() * cols)
  hWall[0]![exitCol] = false
  const originX = -(cols * cell) / 2
  const originZ = -(rows * cell) / 2
  const walls: ArenaBox[] = []
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) if (hWall[r]![c]) walls.push(seg([originX + c * cell, originZ + r * cell], [originX + (c + 1) * cell, originZ + r * cell]))
  for (let r = 0; r < rows; r++) for (let c = 0; c <= cols; c++) if (vWall[r]![c]) walls.push(seg([originX + c * cell, originZ + r * cell], [originX + c * cell, originZ + (r + 1) * cell]))
  const goal: V2 = [originX + (exitCol + 0.5) * cell, originZ - p.goalDist]
  return { params: p, originX, originZ, hWall, vWall, exitCol, walls, goal, loopsRemoved: nLoops }
}
