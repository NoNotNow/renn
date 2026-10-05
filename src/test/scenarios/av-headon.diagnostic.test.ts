/* Scratch diagnostic (not committed): count "head-on approaches" of the focus car in a lab run.
 * AV_HEADON=1 AV_HEADON_SEEDS=1,2,3 AV_HEADON_FRAMES=1200 AV_PARAMS='{"gapCommit":false}' npx vitest run src/test/scenarios/av-headon.diagnostic.test.ts
 * head-on frame: obstacle (static or prop, size >= 2 m, any non-threat body) surface within 25 m of the car centre, bearing within +-10 deg of the velocity heading, closing speed > 8 m/s. */
import { it } from 'vitest'
import fs from 'node:fs'
import { loadLabWorld, runLab, watchValues, yawOf } from '@/test/avLab/lab'
import { rectPoly, pointPolyGap } from '@/test/fixtures/avEvasionArena'
import { DEFAULT_DT } from '@/test/helpers/worldSimulator'

const DMAX = Number(process.env.AV_HEADON_D ?? 25)
const ANG = Number(process.env.AV_HEADON_ANG ?? 10)
const CL = Number(process.env.AV_HEADON_CL ?? 8)
const FOCUS = 'entity_1779823253285_brtkx1p'
const OUT = '/tmp/claude-0/-home-user-renn/e99fabb8-a95c-51a9-8b85-505677b0032a/scratchpad/diag/headon.txt'

it.skipIf(!process.env.AV_HEADON)('headon', async () => {
  const ref = { exampleId: 'self_hunt_flexible' }
  const out: string[] = [`PARAMS ${process.env.AV_PARAMS ?? '{}'}`]
  for (const seed of (process.env.AV_HEADON_SEEDS ?? '1,2,3').split(',').map(Number)) {
    const world = loadLabWorld(ref)
    const fe = world.entities.find((e) => e.id === FOCUS)!
    const b = fe.transformerPipeStack![0]!
    if (process.env.AV_PARAMS) b.params = { ...(b.params ?? {}), ...JSON.parse(process.env.AV_PARAMS) }
    const threat = new Set<string>((b.params as { threatIds?: string[] }).threatIds ?? [])
    type Ob = { id: string; kind: string; stat: boolean; r: number; poly?: [number, number][]; pos: number[] }
    const obs: Ob[] = []
    for (const e of world.entities as any[]) {
      if (e.id === FOCUS || e.shape.type === 'plane') continue
      const s = e.shape
      const ext = s.type === 'box' ? Math.max(s.width, s.depth) : s.type === 'cylinder' || s.type === 'cone' || s.type === 'sphere' || s.type === 'capsule' ? 2 * (s.radius ?? 0.5) : Math.max(s.width ?? 1, s.depth ?? 1)
      if (ext < 2 && !threat.has(e.id)) continue
      const isCar = threat.has(e.id)
      const stat = e.bodyType === 'static'
      const o: Ob = { id: e.id, kind: isCar ? 'CAR' : `${stat ? 'S' : 'D'}-${s.type}`, stat, r: ext / 2, pos: e.position }
      if (stat && s.type === 'box') o.poly = rectPoly(e.position[0], e.position[2], e.rotation[1] ?? 0, s.width, s.depth)
      obs.push(o)
    }
    let total = 0
    let episodes = 0
    let lastFrame = -999
    const frames: string[] = []
    const aimCount: Record<string, number> = {}
    const kindCount: Record<string, number> = {}
    const hist: number[] = []
    let minD = Infinity
    let nChaser60 = 0
    const r = await runLab({
      world: ref,
      preparedWorld: world,
      focus: FOCUS,
      seed,
      frames: Number(process.env.AV_HEADON_FRAMES ?? 1200),
      profile: false,
      maxScenes: 0,
      onFrame: ({ frame, sim }) => {
        const p = sim.getPosition(FOCUS)
        const v = sim.getVelocity(FOCUS)
        const sp = Math.hypot(v[0], v[2])
        if (sp < 4) return
        const hx = v[0] / sp
        const hz = v[2] / sp
        let best: { d: number; bear: number; o: Ob } | null = null
        for (const o of obs) {
          const op = o.stat ? o.pos : sim.getPosition(o.id)
          const dx = op[0] - p[0]
          const dz = op[2] - p[2]
          if (Math.abs(dx) > 70 || Math.abs(dz) > 70) continue
          let d = Math.hypot(dx, dz) - o.r
          if (o.poly) d = pointPolyGap(p[0], p[2], o.poly as any)
          if (d > DMAX) continue
          const bear = Math.abs(Math.atan2(hx * dz - hz * dx, hx * dx + hz * dz)) * (180 / Math.PI)
          // closing speed along the line to the obstacle centre
          const cl = (v[0] * dx + v[2] * dz) / Math.max(1e-6, Math.hypot(dx, dz))
          if (bear <= ANG && cl > CL && (!best || d < best.d)) best = { d, bear, o }
        }
        if (!best) return
        total++
        if (frame - lastFrame > 30) episodes++
        lastFrame = frame
        minD = Math.min(minD, best.d)
        kindCount[best.o.kind] = (kindCount[best.o.kind] ?? 0) + 1
        const w = watchValues(FOCUS)
        const chaserNear = (() => {
          let m = Infinity
          for (const id of threat) {
            const q = sim.getPosition(id)
            if (q) m = Math.min(m, Math.hypot(q[0] - p[0], q[2] - p[2]))
          }
          return m
        })()
        if (chaserNear < 60) nChaser60++
        const aim = w['av.flee'] != null ? 'flee-goal' : w['av.carrotw'] && w['av.carrotw'] !== '-' ? 'route-carrot' : 'goal/none'
        const man = String(w['av.mode'] ?? '')
        const tag = `${aim}${man ? '/' + man : ''}`
        aimCount[tag] = (aimCount[tag] ?? 0) + 1
        hist.push(best.d)
        
          const brg = (s: unknown) => { if (typeof s !== 'string' || !s.includes(',')) return '-'; const [gx, gz] = s.split(',').map(Number); return (Math.atan2(hx * (gz! - p[2]) - hz * (gx! - p[0]), hx * (gx! - p[0]) + hz * (gz! - p[2])) * 180 / Math.PI).toFixed(0) }
        if (frames.length < 40 && frame % 6 === 0) frames.push(`brgFlee${brg(w['av.flee'])} brgCarrot${brg(w['av.carrotw'])} pos${p[0].toFixed(0)},${p[2].toFixed(0)} f${frame} v${sp.toFixed(1)} d${best.d.toFixed(1)} bear${best.bear.toFixed(0)} ${best.o.kind} chaser${chaserNear.toFixed(0)} aim=${tag} flee=${w['av.flee']} carrot=${w['av.carrotw']} vLim=${w['av.vLimit']} free=${w['av.plan.free']} route=${w['av.route']}`)
      },
    })
    void yawOf
    void DEFAULT_DT
    out.push(`SEED ${seed} nObs ${obs.length}: headOnFrames ${total} (${((total / Number(process.env.AV_HEADON_FRAMES ?? 1200)) * 100).toFixed(1)}%) episodes ${episodes} minSurfaceGap ${minD.toFixed(1)} chaser<60m in ${nChaser60} | aim ${JSON.stringify(aimCount)} | obstacle kinds ${JSON.stringify(kindCount)} | catches ${r.catches} meanSpeed ${r.meanSpeed.toFixed(1)} path ${r.pathLength.toFixed(0)} limits ${JSON.stringify(r.limitHist)}`)
    out.push(...frames.map((f) => '   ' + f))
  }
  fs.writeFileSync(process.env.AV_HEADON_OUT ?? OUT, out.join('\n'))
  console.log(out.join('\n'))
}, 1_800_000)
