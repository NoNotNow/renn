/**
 * Intermediate goal (route carrot) audit on the lab world. Skipped unless AVCARROT=1.
 *   AVCARROT=1 AVCARROT_SEEDS=1,2,3,4,5,6 AVCARROT_FRAMES=1800 npx vitest run src/test/scenarios/av-carrot.diagnostic.test.ts
 * Per frame of the focus car it classifies the orange carrot (av.carrot) against the lime goal (av.goalRaw) and the active target
 * (input.target after the flee layer) and attributes every "away" frame (angle car->carrot vs car->goal > 90 deg) to a cause.
 * It also counts goal jumps (goalRaw) with their cause. See agent-context/feature-av-stack.md "Intermediate goals (carrot)".
 */
import { it } from 'vitest'
import { loadLabWorld, runLab, liveStageState, stageLabels, type WorldRef } from '@/test/avLab/lab'
import type { WorldSimulator } from '@/runtime/worldSimulator'

const env = process.env
const enabled = env.AVCARROT === '1'

type Stage = { transform: (input: any, dt: number) => unknown; __wrapped?: boolean }

function stages(sim: WorldSimulator, id: string): Stage[] {
  const chain = (sim as any).getRegistry().get(id)?.transformerChain
  return chain ? (chain.getAll() as Stage[]) : []
}

const deg = (a: number) => (a * 180) / Math.PI
function angle(ax: number, az: number, bx: number, bz: number): number {
  const la = Math.hypot(ax, az)
  const lb = Math.hypot(bx, bz)
  if (la < 1e-6 || lb < 1e-6) return 0
  return deg(Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)))))
}

type Hist = Record<string, number>
const bump = (h: Hist, k: string, n = 1) => {
  h[k] = (h[k] ?? 0) + n
}

it.skipIf(!enabled)('carrot audit', async () => {
  const ref: WorldRef = { exampleId: env.AVCARROT_WORLD ?? 'self_hunt_flexible' }
  const focus = env.AVCARROT_FOCUS ?? 'entity_1779823253285_brtkx1p'
  const seeds = (env.AVCARROT_SEEDS ?? '1,2,3,4,5,6').split(',').map(Number)
  const frames = Number(env.AVCARROT_FRAMES ?? 1800)
  const total: Hist = {}
  const causes: Hist = {}
  const goalJ: Hist = {}
  const extra: Record<string, number[]> = { goalLife: [], fleeLen: [], newGoalDist: [], carrotJump: [] }
  for (const seed of seeds) {
    const prepared = loadLabWorld(ref)
    if (env.AVCARROT_PARAMS) {
      const b = prepared.entities.find((e) => e.id === focus)?.transformerPipeStack?.[0]
      if (b) b.params = { ...(b.params ?? {}), ...JSON.parse(env.AVCARROT_PARAMS) }
    }
    const labels = stageLabels(prepared, focus)
    if (seed === seeds[0]) console.log('LABELS', JSON.stringify(labels))
    let capAv: any = null
    let capVizCarrot: any = undefined
    let capTarget: number[] | null = null
    let wrapped = false
    let prevCarrot: number[] | null = null
    let prevGoal: number[] | null = null
    let goalSince = 0
    let prevRouteT = -1
    let planTarget: number[] | null = null
    let prevFlee: number[] | null = null
    let lastSwitch = 0
    let fleeStart = 0
    let prevPos: number[] | null = null
    const T: Hist = {}
    const C: Hist = {}
    const G: Hist = {}
    await runLab({
      world: ref,
      preparedWorld: prepared,
      focus,
      seed,
      frames,
      maxScenes: 0,
      onFrame: ({ sim, frame }) => {
        if (!wrapped) {
          wrapped = true
          const st = stages(sim, focus)
          st.forEach((s, i) => {
            const label = (labels[(s as any).configStackIndex ?? i] ?? '').toLowerCase()
            const orig = s.transform.bind(s)
            if (label.includes('aeb')) {
              s.transform = (input: any, dt: number) => {
                const r = orig(input, dt)
                capAv = input.av
                const tp = input.target?.pose?.position
                capTarget = tp ? [tp[0], tp[2]] : null
                return r
              }
            } else if (label.includes('overlay')) {
              s.transform = (input: any, dt: number) => {
                capVizCarrot = input.av?.carrot ? [input.av.carrot[0], input.av.carrot[1]] : null
                return orig(input, dt)
              }
            }
          })
          return
        }
        const av = capAv
        if (!av || !av.ego) return
        const pos = sim.getPosition(focus)
        const px = pos[0]
        const pz = pos[2]
        const fwd = av.ego.fwd
        const spd = av.ego.speedF
        const rt = liveStageState(sim, prepared, focus, 'route planner') as any
        const ego = liveStageState(sim, prepared, focus, 'ego state') as any
        const goal: number[] | null = av.goalRaw ? [av.goalRaw[0], av.goalRaw[1]] : null
        // ---- goal jumps (the source's own goal)
        if (goal && prevGoal && Math.hypot(goal[0] - prevGoal[0], goal[1] - prevGoal[1]) > 8) {
          bump(G, 'goalJumps')
          const dOld = prevPos ? Math.hypot(prevGoal[0] - px, prevGoal[1] - pz) : 0
          if (dOld <= 31 + 12) bump(G, 'reached')
          else bump(G, 'notReached')
          extra.goalLife!.push((frame - goalSince) / 60)
          extra.newGoalDist!.push(Math.hypot(goal[0] - px, goal[1] - pz))
          goalSince = frame
          // quality of the new goal one frame later: field distance >= 600 = behind known walls
          const fd = av.fieldGoal
          if (fd && Math.hypot(fd.x - goal[0], fd.z - goal[1]) < 1.5) bump(G, fd.d >= 600 ? 'newGoalUnreachableByField' : 'newGoalReachable')
          const dd = Math.hypot(goal[0] - px, goal[1] - pz)
          if (dd < 25) bump(G, 'newGoalWithin25m')
          if (dd > 300) bump(G, 'newGoalOver300m')
        }
        if (goal) {
          if (!prevGoal) goalSince = frame
          prevGoal = goal
        }
        if (av.goalBad) bump(G, 'goalBadFrames')
        // flee goal switches (target differs from goal)
        const tg = capTarget
        if (av.fleeing && tg) {
          bump(G, 'fleeFrames')
          const ft = ego?.flee?.gap ? 'gap' : av.goalBad ? 'bad' : 'geo'
          bump(G, 'fleeFrames:' + ft)
          const fa = angle(tg[0] - px, tg[1] - pz, goal ? goal[0] - px : 0, goal ? goal[1] - pz : 0)
          if (fa > 90) bump(G, 'fleeGoalAwayFromLime>90:' + ft)
          if (prevFlee === null) {
            bump(G, 'fleeEpisodes')
            fleeStart = frame
          }
          {
            const th: { x: number; z: number }[] = av.threatsFar ?? av.threats ?? []
            let nd = Infinity
            let nb = 0
            for (const t of th) {
              const d = Math.hypot(t.x - px, t.z - pz)
              if (d < nd) {
                nd = d
                nb = angle(tg[0] - px, tg[1] - pz, t.x - px, t.z - pz)
              }
            }
            bump(G, 'F.nearestThreat:' + (nd < 20 ? '<20' : nd < 40 ? '20-40' : nd < 80 ? '40-80' : nd < 160 ? '80-160' : '>160'))
            if (nd >= 40) bump(G, 'F.calm(nearest>=40m)' + (av.goalBad ? ':bad' : ':notbad'))
            if (nd < 160 && nb < 60) bump(G, 'F.goalTowardNearestThreat<60deg')
            const fd = av.fieldGoal
            if (fd && Math.hypot(fd.x - tg[0], fd.z - tg[1]) < 1.5) bump(G, 'F.fleeGoalField:' + (fd.d >= 600 ? 'behindWall' : fd.d - Math.hypot(tg[0] - px, tg[1] - pz) > 15 ? 'detour>15m' : 'direct'))
            else bump(G, 'F.fleeGoalField:none')
            const gd = Math.hypot(tg[0] - px, tg[1] - pz)
            bump(G, 'F.dist:' + (gd < 30 ? '<30' : gd < 100 ? '30-100' : '>=100'))
          }
          if (prevFlee && Math.hypot(tg[0] - prevFlee[0], tg[1] - prevFlee[1]) > 8) {
            const dtS = (frame - lastSwitch) / 60
            lastSwitch = frame
            const a = angle(tg[0] - px, tg[1] - pz, prevFlee[0] - px, prevFlee[1] - pz)
            bump(G, 'S.switch')
            if (a > 90) bump(G, 'S.flip>90deg')
            if (dtS < 3) bump(G, 'S.within3s')
            if (a > 90 && dtS < 3) bump(G, 'S.flipWithin3s')
          }
          if (prevFlee && Math.hypot(tg[0] - prevFlee[0], tg[1] - prevFlee[1]) > 8) bump(G, ego?.flee?.gap ? 'fleeJumpGap' : av.goalBad ? 'fleeJumpBad' : 'fleeJumpGeo')
          prevFlee = tg
        } else {
          if (prevFlee) extra.fleeLen!.push((frame - fleeStart) / 60)
          prevFlee = null
        }
        prevPos = [px, pz]
        // plan-time target (route planner replans: routeT changes)
        if (rt && rt.routeT !== prevRouteT) {
          prevRouteT = rt.routeT
          planTarget = tg
        }
        // ---- carrot classification
        const cr: number[] | null = av.carrot ? [av.carrot[0], av.carrot[1]] : null
        bump(T, 'frames')
        if (!cr || !goal) {
          bump(T, cr ? 'noGoal' : 'noCarrot')
          prevCarrot = null
          return
        }
        bump(T, 'withCarrot')
        if (capVizCarrot === null || capVizCarrot === undefined) bump(T, 'vizSeesNoCarrot')
        else if (Math.hypot(capVizCarrot[0] - cr[0], capVizCarrot[1] - cr[1]) > 0.5) bump(T, 'vizCarrotDiffers')
        const cx = cr[0] - px
        const cz = cr[1] - pz
        const aLime = angle(cx, cz, goal[0] - px, goal[1] - pz)
        const aAct = tg ? angle(cx, cz, tg[0] - px, tg[1] - pz) : aLime
        if (aLime > 60) bump(T, 'lime>60')
        if (aLime > 90) bump(T, 'lime>90')
        if (aLime > 120) bump(T, 'lime>120')
        if (aAct > 60) bump(T, 'active>60')
        if (aAct > 90) bump(T, 'active>90')
        const behind = cx * fwd[0] + cz * fwd[2] < 0 && spd > 2
        if (behind) bump(T, 'behindOnForward')
        if (prevCarrot) {
          const j = Math.hypot(cr[0] - prevCarrot[0], cr[1] - prevCarrot[1])
          if (j > 10) {
            bump(T, 'jump>10m')
            extra.carrotJump!.push(j)
          }
        }
        prevCarrot = cr
        const age = rt ? av.ego.t - rt.routeT : 0
        const staleWorld = age > 0.5
        // route end vs goal (does the route head to the goal overall)
        const rp = av.routePath as number[][] | undefined
        const rEnd = rp && rp.length ? rp[rp.length - 1] : null
        const target = tg ?? goal
        const routeTowards = rEnd ? Math.hypot(rEnd[0] - target[0], rEnd[1] - target[1]) < Math.hypot(px - target[0], pz - target[1]) - 1 : false
        const goalDist = Math.hypot(goal[0] - px, goal[1] - pz)
        const maze = !!(av.fieldGoal && av.fieldGoal.d - goalDist > 15)
        const changed = !!(planTarget && tg && Math.hypot(planTarget[0] - tg[0], planTarget[1] - tg[1]) > 1)
        // primary: the carrot leads away from the ACTIVE target (flee goal while fleeing, else the lime goal); the lime-goal view is counted separately
        const away = aAct > 90
        const fl = av.fleeing ? 'flee:' : 'goal:'
        let cause = 'ok'
        if (away) {
          if (changed) cause = 'e-target-changed-old-route'
          else if (rt?.active || av.route?.firstGear === -1) cause = 'd-maneuver/reverse'
          else if (av.route && av.route.reached === false) cause = 'd-partial-route'
          else if (maze) cause = 'b-maze-detour'
          else if (behind) cause = 'c-stale-behind'
          else if (staleWorld) cause = 'c-stale-plan'
          else if (routeTowards) cause = 'h-route-bend/avoid(route ends nearer target)'
          else cause = 'z-unexplained'
          cause = fl + cause
        } else if (aLime > 90) cause = 'lime-only-away(flee layer active)'
        if (behind) bump(C, 'behindOnForward:' + (changed ? 'targetChanged' : staleWorld ? 'stale' : 'fresh'))
        bump(C, cause)
      },
    })
    for (const [k, v] of Object.entries(T)) bump(total, k, v)
    for (const [k, v] of Object.entries(C)) bump(causes, k, v)
    for (const [k, v] of Object.entries(G)) bump(goalJ, k, v)
    console.log(`SEED ${seed} T ${JSON.stringify(T)}\n  causes ${JSON.stringify(C)}\n  goals ${JSON.stringify(G)}`)
  }
  const med = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]!.toFixed(1) : '-')
  console.log(`HISTOGRAM (${seeds.length} seeds x ${frames})\n  totals ${JSON.stringify(total)}\n  causes ${JSON.stringify(causes)}\n  goals ${JSON.stringify(goalJ)}`)
  console.log(`  flee episode length median ${med(extra.fleeLen!)} s (n ${extra.fleeLen!.length})`)
  console.log(`  goal life median ${med(extra.goalLife!)} s (n ${extra.goalLife!.length}), new-goal dist median ${med(extra.newGoalDist!)} m, carrot jump median ${med(extra.carrotJump!)} m (n ${extra.carrotJump!.length})`)
}, 3_600_000)
