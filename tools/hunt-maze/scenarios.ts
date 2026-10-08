/** Episode specs (solo / flee / flee-real / cim) for every labyrinth, from the computed geometry. Deterministic. */
import type { RennWorld } from '@/types/world'
import { analyseMaze, clearanceAt, collectObstacles, mazeIds, yawDegFacing, type MazeInfo, type Obstacles } from './geometry'
import type { EpSpec, Kind } from './episode'

export const CHASER_RING_M = 70 // chasers start this far (along the gate normal, +-50 deg) beyond the maze edge in 'flee'

function chaserRing(info: MazeInfo, s: MazeInfo['starts'][number], obs: Obstacles) {
  const gx = s.gate[0], gz = s.gate[1]
  let nx = s.goal[0] - gx, nz = s.goal[1] - gz
  const nl = Math.hypot(nx, nz) || 1
  nx /= nl; nz /= nl
  const edge = Math.hypot(s.goal[0] - gx, s.goal[1] - gz) - 30 // distance gate -> bbox edge (goal is 30 m beyond the edge unless adjusted)
  return [0, 50, -50].map((deg) => {
    const a = (deg * Math.PI) / 180
    const dx = nx * Math.cos(a) - nz * Math.sin(a)
    const dz = nx * Math.sin(a) + nz * Math.cos(a)
    let r = Math.max(edge, 0) + CHASER_RING_M
    for (let k = 0; k < 12 && clearanceAt(obs, gx + dx * r, gz + dz * r) < 10; k++) r += 4
    const x = gx + dx * r, z = gz + dz * r
    return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yawDeg: yawDegFacing(gx - x, gz - z) }
  })
}

/** heldOut: a disjoint start set (>= 12 m from every training start, shallower cells, rotated yaw roles); ids are `<kind>-<maze>h<n>`. */
export function buildSpecs(world: RennWorld, kinds: Kind[], mazes?: string[], heldOut = false): { specs: EpSpec[]; infos: MazeInfo[] } {
  const obs = collectObstacles(world)
  const infos = mazeIds(world).filter((m) => !mazes || mazes.includes(m)).map((m) => {
    const train = analyseMaze(world, m, obs)
    if (!heldOut) return train
    return analyseMaze(world, m, obs, 3, { avoid: train.starts.map((t) => [t.x, t.z] as [number, number]), avoidR: 12, floorFrac: 0.3, roleShift: 1 })
  })
  const specs: EpSpec[] = []
  for (const kind of kinds) {
    for (const info of infos) {
      info.starts.forEach((s, i) => {
        specs.push({
          id: `${kind}-${info.id}${heldOut ? 'h' : ''}${i + 1}`, kind, maze: info.id, bbox: info.bbox, start: { x: s.x, z: s.z, yawDeg: s.yawDeg }, goal: s.goal,
          chasers: kind === 'flee' ? chaserRing(info, s, obs) : [],
        })
      })
    }
  }
  return { specs, infos }
}
