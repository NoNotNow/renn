/* eslint-disable @typescript-eslint/no-explicit-any -- probe over untyped stage state */
/**
 * Maze flee diagnostic (skipped unless AVMZ_WORLD is set): per frame of the focus car, is it inside a labyrinth (bbox of a static wall group),
 * is the maze module confined / engaged, where is the flee goal, does the straight segment car -> flee goal cross a static wall (key metric).
 *   AVMZ_WORLD=self_hunt_flexible AVMZ_FOCUS=<id> AVMZ_SEEDS=2,3,8 AVMZ_FRAMES=1800 [AVMZ_PARAMS='{"mazeModule":false}'] [AVMZ_TRACE=60] npx vitest run src/test/scenarios/av-maze-flee.diagnostic.test.ts
 */
import { it } from 'vitest'
import { loadLabWorld, runLab, liveStageState, watchValues, yawOf, type WorldRef } from '@/test/avLab/lab'

const env = process.env
const enabled = !!env.AVMZ_WORLD

type Wall = { x: number; z: number; hw: number; hd: number; c: number; s: number; grp: string }

/** Does the segment a -> b cross the (rotated) box? Slab test in the wall frame. */
function segHitsBox(ax: number, az: number, bx: number, bz: number, w: Wall): boolean {
  const loc = (x: number, z: number): [number, number] => {
    const dx = x - w.x
    const dz = z - w.z
    return [dx * w.c + dz * w.s, -dx * w.s + dz * w.c]
  }
  const [x0, z0] = loc(ax, az)
  const [x1, z1] = loc(bx, bz)
  let t0 = 0
  let t1 = 1
  for (const [p, d, h] of [[x0, x1 - x0, w.hw], [z0, z1 - z0, w.hd]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p) > h) return false
    } else {
      let ta = (-h - p) / d
      let tb = (h - p) / d
      if (ta > tb) [ta, tb] = [tb, ta]
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      if (t0 > t1) return false
    }
  }
  return true
}

it.skipIf(!enabled)('maze flee probe', async () => {
  const ref: WorldRef = { exampleId: env.AVMZ_WORLD! }
  const focus = env.AVMZ_FOCUS ?? 'entity_1779823253285_brtkx1p'
  for (const seed of (env.AVMZ_SEEDS ?? '2').split(',').map(Number)) {
    const world = loadLabWorld(ref)
    if (env.AVMZ_PARAMS) {
      const b = world.entities.find((e) => e.id === focus)?.transformerPipeStack?.[0]
      if (b) b.params = { ...(b.params ?? {}), ...JSON.parse(env.AVMZ_PARAMS) }
    }
    const walls: Wall[] = []
    const byId = new Map<string, Wall>()
    const bbox: Record<string, [number, number, number, number]> = {}
    for (const e of world.entities as any[]) {
      if (e.bodyType !== 'static' || e.shape?.type !== 'box') continue
      const mm = /^(wall_maze_[A-Z])_/.exec(e.id)
      if (!mm) continue
      const w: Wall = { x: e.position[0], z: e.position[2], hw: e.shape.width / 2, hd: e.shape.depth / 2, c: 1, s: 0, grp: mm[1]! }
      walls.push(w)
      byId.set(e.id, w)
    }
    const mk = () => ({ inMaze: 0, engaged: 0, fleeIn: 0, fleeCross: 0, fleeMaze: 0, fleeMazeCross: 0, fleeOldIn: 0, fleeOldCross: 0, wpCross: 0, noRoute: 0 })
    const m = { frames: 0, confined: 0 }
    const sets = { in: mk(), near: mk() }
    const dens: Record<string, number[][]> = {}
    const exits = new Map<string, number>()
    let ready = false
    const cross = (px: number, pz: number, gx: number, gz: number) => walls.some((w) => Math.abs(w.x - px) < 400 && segHitsBox(px, pz, gx, gz, w))
    const r = await runLab({
      world: ref, preparedWorld: world, focus, seed, frames: Number(env.AVMZ_FRAMES ?? 1800), maxScenes: 0, profile: false,
      onFrame: ({ sim, frame }) => {
        if (!ready) {
          ready = true
          for (const [id, w] of byId) {
            const yaw = yawOf(sim.getRotation(id))
            // the box width axis in the world: rotating +X by the yaw (yaw 0 = -Z forward)
            w.c = Math.cos(yaw)
            w.s = -Math.sin(yaw)
          }
          for (const w of walls) {
            const b = bbox[w.grp] ?? (bbox[w.grp] = [1e9, -1e9, 1e9, -1e9])
            for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
              const lx = sx * w.hw
              const lz = sz * w.hd
              const cx = w.x + lx * w.c - lz * w.s
              const cz = w.z + lx * w.s + lz * w.c
              b[0] = Math.min(b[0], cx); b[1] = Math.max(b[1], cx); b[2] = Math.min(b[2], cz); b[3] = Math.max(b[3], cz)
            }
          }
        }
        const p = sim.getPosition(focus)
        if (env.AVMZ_HD === '1' && frame === 2) {
          // experiment: an HD map prior = every static wall's outline (1 m spacing) burned into the perception map
          const st0 = liveStageState(sim, world, focus, 'perception') as any
          const sm = st0.sm ?? (st0.sm = { cells: {}, list: [], buckets: {} })
          const add = (x: number, z: number) => {
            const key = Math.round(x) + ',' + Math.round(z)
            if (sm.cells[key]) return
            sm.cells[key] = 1
            const pt = [x, z]
            sm.list.push(pt)
            const bk = Math.floor(x / 16) + ',' + Math.floor(z / 16)
            ;(sm.buckets[bk] ??= []).push(pt)
          }
          for (const w of walls) {
            const nx = Math.ceil(w.hw * 2)
            for (let i = 0; i <= nx; i++) for (const sz of [-1, 0, 1]) {
              const lx = -w.hw + (2 * w.hw * i) / nx
              const lz = sz * w.hd
              add(w.x + lx * w.c - lz * w.s, w.z + lx * w.s + lz * w.c)
            }
          }
        }
        m.frames++
        let grp = ''
        let grpN = ''
        for (const [g, b] of Object.entries(bbox)) {
          if (p[0] > b[0] && p[0] < b[1] && p[2] > b[2] && p[2] < b[3]) grp = g
          if (p[0] > b[0] - 15 && p[0] < b[1] + 15 && p[2] > b[2] - 15 && p[2] < b[3] + 15) grpN = g
        }
        const st = liveStageState(sim, world, focus, 'ego') as any
        const mz = st?.mz
        const fl = st?.flee
        if (mz?.on) m.confined++
        const fc = fl ? cross(p[0], p[2], fl.x, fl.z) : false
        const wc = grpN && mz?.on && mz.wp ? cross(p[0], p[2], mz.wp[0], mz.wp[1]) : false
        for (const [k, gg] of [['in', grp], ['near', grpN]] as const) {
          if (!gg) continue
          const q = sets[k]
          q.inMaze++
          if (mz?.on) q.engaged++
          if (fl) {
            q.fleeIn++
            if (fc) q.fleeCross++
            if (fl.maze) { q.fleeMaze++; if (fc) q.fleeMazeCross++ } else { q.fleeOldIn++; if (fc) q.fleeOldCross++ }
          }
          if (wc) q.wpCross++
          if (mz?.on && !mz.route) q.noRoute++
        }
        if (grp && mz?.route) {
          const ex = mz.route[mz.route.length - 1]
          const b = bbox[grp]!
          const k = `${grp} exit ${Math.round(ex[0])},${Math.round(ex[1])} ${ex[0] > b[0] && ex[0] < b[1] && ex[1] > b[2] && ex[1] < b[3] ? 'INSIDE-bbox' : 'outside'}${mz.explore ? ' explore' : ''}`
          exits.set(k, (exits.get(k) ?? 0) + 1)
        }
        if (env.AVMZ_DENS) {
          const sm = (liveStageState(sim, world, focus, 'perception') as any)?.sm
          if (sm?.list?.length) {
            const cells = new Set<number>()
            let n = 0
            for (const q of sm.list as number[][]) {
              if (Math.abs(q[0] - p[0]) > 30 || Math.abs(q[1] - p[2]) > 30) continue
              const k = Math.floor(q[0] / 2) * 100003 + Math.floor(q[1] / 2)
              if (!cells.has(k)) { cells.add(k); if (Math.hypot(q[0] - p[0], q[1] - p[2]) <= 30) n++ }
            }
            let inb = 'far'
            for (const b of Object.values(bbox)) {
              if (p[0] > b[0] && p[0] < b[1] && p[2] > b[2] && p[2] < b[3]) inb = 'in'
              else if (inb === 'far' && p[0] > b[0] - 15 && p[0] < b[1] + 15 && p[2] > b[2] - 15 && p[2] < b[3] + 15) inb = 'near'
            }
            ;(dens[inb] ??= []).push([mz?.share ?? 0, n])
          }
        }
        const tr = Number(env.AVMZ_TRACE ?? 0)
        if (env.AVMZ_WATCH && frame % Number(env.AVMZ_WATCH) === 0) {
          const wv = watchValues(focus)
          let nd = 1e9
          for (const id of sim.getChainEntityIds()) if (id !== focus) { const q = sim.getPosition(id); nd = Math.min(nd, Math.hypot(q[0] - p[0], q[2] - p[2])) }
          const v = sim.getVelocity(focus)
          console.log(`W f${frame} car ${p[0].toFixed(0)},${p[2].toFixed(0)} v ${Math.hypot(v[0], v[2]).toFixed(1)} nearCar ${nd.toFixed(0)} ${Object.entries(wv).filter(([k]) => /^av\.(mode|maze|flee|route|override|man|limit|vLimit)/.test(k)).map(([k, x]) => k + '=' + String(x).slice(0, 60)).join(' | ')}`)
        }
        if (tr && frame % tr === 0) {
          console.log(`T f${frame} ${grp || '-'} car ${p[0].toFixed(0)},${p[2].toFixed(0)} share ${mz?.share?.toFixed?.(2)} on ${!!mz?.on} flee ${fl ? `${fl.maze ? 'M' : 'o'} ${fl.x.toFixed(0)},${fl.z.toFixed(0)} cross ${cross(p[0], p[2], fl.x, fl.z)}` : '-'} why ${mz?.why} dens ${mz?.dens} hull ${mz?.hull ? mz.hull.join(',') : '-'} exit ${mz?.route ? mz.route[mz.route.length - 1].map((x: number) => Math.round(x)).join(',') : '-'} wp ${mz?.wp ? mz.wp.map((x: number) => Math.round(x)).join(',') : '-'}${mz?.explore ? ' EXPLORE' : ''}`)
        }
      },
    })
    console.log(`MZ seed ${seed} ${JSON.stringify(m)} IN ${JSON.stringify(sets.in)} NEAR(15m) ${JSON.stringify(sets.near)} maneuverFrames ${r.limitHist.maneuver ?? 0} catches ${r.catches} path ${r.pathLength.toFixed(0)}`)
    for (const [k, v] of Object.entries(dens)) {
      const q = (i: number, f: number) => { const a = v.map((x) => x[i]!).sort((x, y) => x - y); return a[Math.floor((a.length - 1) * f)]!.toFixed(2) }
      console.log(`DENS seed ${seed} ${k} n=${v.length} share p10/50/90 ${q(0, 0.1)}/${q(0, 0.5)}/${q(0, 0.9)} cells30 p10/50/90 ${q(1, 0.1)}/${q(1, 0.5)}/${q(1, 0.9)}`)
    }
    console.log(`MZ exits ${JSON.stringify([...exits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))}`)
  }
}, 1_800_000)
