/**
 * AV lab CLI (skipped unless AVLAB_WORLD or AVLAB_SCENE is set). See src/test/avLab/lab.ts and agent-context/feature-av-lab.md.
 *
 *   AVLAB_WORLD=self_hunt_flexible AVLAB_FOCUS=<entityId> AVLAB_SEEDS=1,2,3 AVLAB_FRAMES=3600 npx vitest run src/test/scenarios/av-lab.diagnostic.test.ts
 *   AVLAB_SCENE=test-results/avlab/<file>.scene.json AVLAB_REWIND=3 AVLAB_RESTORE=1 npx vitest run src/test/scenarios/av-lab.diagnostic.test.ts
 *
 * AVLAB_WORLD: example world id (public/exampleWorlds/<id>) or a path to a world.json. Scenes go to AVLAB_OUT
 * (default test-results/avlab). AVLAB_PROFILE=1 prints the per-stage timing table of every entity.
 */
import { expect, it } from 'vitest'
import fs from 'node:fs'
import { rectPoly, polyGap, pointPolyGap } from '@/test/fixtures/avEvasionArena'
import { versionReport, formatProfile, loadLabWorld, readScene, yawOf, replayScene, runLab, type LabResult, type WorldRef } from '@/test/avLab/lab'

const env = process.env
const out = env.AVLAB_OUT ?? 'test-results/avlab'
const enabled = !!(env.AVLAB_WORLD || env.AVLAB_SCENE)

function worldRef(v: string): WorldRef {
  return v.endsWith('.json') || v.includes('/') ? { file: v } : { exampleId: v }
}

// Static-clearance metrics (physics truth, not the AV's perception). Hull = focus box (width x depth) via the lab's yawOf; statics = static box / cylinder entities.
const CLOSE_GAP = 2.0
const CLOSE_SPEED = 10
const HEADON = { dist: 25, angDeg: 10, closing: 6, minSpeed: 4, minExtent: 2 }
type StaticOb = { id: string; x: number; z: number; r: number; box?: { w: number; d: number }; poly?: [number, number][] }
function makeClearanceTracker(world: ReturnType<typeof loadLabWorld>, focusId: string) {
  const fe = world.entities.find((e) => e.id === focusId)!
  const fs_ = fe.shape as { width?: number; depth?: number }
  const carW = fs_.width ?? 4
  const carL = fs_.depth ?? 8
  const obs: StaticOb[] = []
  for (const e of world.entities as any[]) {
    if (e.id === focusId || e.bodyType !== 'static') continue
    const s = e.shape
    if (s.type === 'box') obs.push({ id: e.id, x: e.position[0], z: e.position[2], r: Math.hypot(s.width, s.depth) / 2, box: { w: s.width, d: s.depth } })
    else if (s.type === 'cylinder') obs.push({ id: e.id, x: e.position[0], z: e.position[2], r: s.radius ?? 0.5 })
  }
  const m = { minStaticGap: Infinity, closePassFrames: 0, headOnFrames: 0 }
  return {
    m,
    onFrame(sim: { getPosition(id: string): number[]; getVelocity(id: string): number[]; getRotation(id: string): { x: number; y: number; z: number; w: number } }) {
      const p = sim.getPosition(focusId)
      const v = sim.getVelocity(focusId)
      const sp = Math.hypot(v[0], v[2])
      const hull = rectPoly(p[0], p[2], yawOf(sim.getRotation(focusId)), carW, carL)
      let best = Infinity
      let headOn = false
      const hx = sp > 1e-6 ? v[0] / sp : 0
      const hz = sp > 1e-6 ? v[2] / sp : 0
      for (const o of obs) {
        const dx = o.x - p[0]
        const dz = o.z - p[2]
        if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue
        if (o.box && !o.poly) o.poly = rectPoly(o.x, o.z, yawOf(sim.getRotation(o.id)), o.box.w, o.box.d) as [number, number][]
        const g = o.poly ? polyGap(hull, o.poly) : Math.max(0, pointPolyGap(o.x, o.z, hull) - o.r)
        if (g < best) best = g
        if (!headOn && sp >= HEADON.minSpeed && o.r * 2 >= HEADON.minExtent) {
          const d = o.poly ? pointPolyGap(p[0], p[2], o.poly) : Math.hypot(dx, dz) - o.r
          if (d > HEADON.dist) continue
          const dist = Math.max(1e-6, Math.hypot(dx, dz))
          const bear = Math.abs(Math.atan2(hx * dz - hz * dx, hx * dx + hz * dz)) * (180 / Math.PI)
          const closing = (v[0] * dx + v[2] * dz) / dist
          if (bear <= HEADON.angDeg && closing > HEADON.closing) headOn = true
        }
      }
      if (best < m.minStaticGap) m.minStaticGap = best
      if (best < CLOSE_GAP && sp > CLOSE_SPEED) m.closePassFrames++
      if (headOn) m.headOnFrames++
    },
  }
}

function summary(tag: string, r: LabResult): string {
  const ev = r.events.map((e) => `${e.kind}@${e.startFrame}(from ${e.windowStartFrame}${e.endFrame != null ? `..${e.endFrame}` : '..end'}; net ${e.metrics.net.toFixed(2)} path ${e.metrics.path.toFixed(2)} flips ${e.metrics.flips} yaw ${e.metrics.yawPath.toFixed(2)})`)
  const prof = r.profile
    ? r.profile.stages.map((s) => `    ${s.label.padEnd(36)} mean ${s.meanMs.toFixed(3)} ms  p95 ${s.p95Ms.toFixed(3)}  max ${s.maxMs.toFixed(2)}  ${(s.share * 100).toFixed(0)}%`).join('\n')
    : ''
  return [
    `LAB ${tag}: [av ${r.stackVersion}] ${r.frames} frames, path ${r.pathLength.toFixed(1)} m, ${r.realtimeFactor.toFixed(2)}x realtime, roughness ${r.speedRoughness.toFixed(3)} m/s/frame, spikes ${r.speedSpikes}, classes ${JSON.stringify(r.classFrames)}`,
    `  SPEED mean/p50/p90/p99 focus ${r.speedPct.focus.map((x) => x.toFixed(1)).join('/')} | chasers ${r.speedPct.chasers.map((x) => x.toFixed(1)).join('/')} | free-road limit sources ${JSON.stringify(r.limitHistFree)}`,
    `  METRICS speed mean ${r.meanSpeed.toFixed(1)} max ${r.maxSpeed.toFixed(1)} m/s | path ${r.pathLength.toFixed(0)} m | catches ${r.catches} | minChaserDist ${r.minChaserDist.toFixed(1)} m (${r.chaserCount} chasers) | chaser<15m ${(r.nearFraction * 100).toFixed(0)}% | events ${r.events.length}`,
    `  STEER |dsteer|/frame ${r.steerRoughness.toFixed(4)} | reversals/s ${r.steerReversalsPerSec.toFixed(2)} | |dyawRate|/frame ${r.yawRateRoughness.toFixed(3)} rad/s | plan changes/s ${r.planChangesPerSec.toFixed(2)} switches/s ${r.planSwitchesPerSec.toFixed(2)} | obstacle flicker ${r.obstacleFlicker.toFixed(4)}`,
    `  LIMITS all ${JSON.stringify(r.limitHist)} | below10 ${JSON.stringify(r.limitHistSlow)} | means ${JSON.stringify(r.limitMeans)}`,
    `  events: ${ev.length ? ev.join('\n          ') : 'none'}`,
    `  scenes: ${r.sceneFiles.join(', ') || '-'}`,
    `  final: ${JSON.stringify({ pos: r.final.pos, sleeping: r.final.sleeping, v: r.final.velocity, watch: r.final.watch })}`,
    r.profile ? `  focus chain: mean ${r.profile.meanMs.toFixed(3)} ms p95 ${r.profile.p95Ms.toFixed(3)} max ${r.profile.maxMs.toFixed(2)}\n${prof}` : '',
    `  all chains (mean ms): ${JSON.stringify(r.chainMeans)}`,
    `  slow stage calls (>50 ms): ${r.slowCalls.length ? r.slowCalls.slice(0, 20).map((c) => `f${c.frame} ${c.entityId.slice(-7)} ${c.label} ${c.ms.toFixed(0)} ms`).join(' | ') : 'none'}`,
  ].join('\n')
}

it.skipIf(!enabled)('av lab run', async () => {
  if (env.AVLAB_SCENE) {
    const scene = readScene(env.AVLAB_SCENE)
    const r = await replayScene(scene, {
      rewindSec: Number(env.AVLAB_REWIND ?? 0),
      restoreState: env.AVLAB_RESTORE === '1',
      frames: env.AVLAB_FRAMES ? Number(env.AVLAB_FRAMES) : undefined,
      outDir: out,
      name: 'replay',
      stopAfterScenes: env.AVLAB_STOP ? Number(env.AVLAB_STOP) : undefined,
    })
    console.log(`REPLAY of ${scene.trigger.kind}@${scene.trigger.frame} from frame ${r.startFrame} (restored ${r.restoredStages} stage states)`)
    console.log(summary('replay', r))
    console.log('FIDELITY (frame: focus err / max body err):', r.fidelity.map((x) => `${x.frame}: ${x.focus.toFixed(3)} / ${x.maxBody.toFixed(3)} ${x.maxBodyId}`).join(' | '))
    console.log('DIAG at trigger (original):', JSON.stringify(scene.diagnostics, null, 1).slice(0, 4000))
    return
  }
  const ref = worldRef(env.AVLAB_WORLD!)
  const world = loadLabWorld(ref)
  const focus = env.AVLAB_FOCUS ?? world.entities.find((e) => e.transformerPipeStack?.length)?.id
  expect(focus).toBeTruthy()
  fs.mkdirSync(out, { recursive: true })
  const vr = versionReport(ref)
  console.log(`CODE VERSION ${vr.line}`)
  if (vr.stale.length || vr.diverged.length) console.log('!!! world.json embeds stage code that differs from the shipped library (Builder upgrades stale copies on open; diverged copies stay old)')
  for (const seed of (env.AVLAB_SEEDS ?? '1').split(',').map(Number)) {
    const prepared = loadLabWorld(ref)
    // AVLAB_PARAMS='{"comfortDecel":6}' overrides params of the focus entity's first pipe binding (quick tuning without editing the world).
    if (env.AVLAB_PARAMS) {
      const fe = prepared.entities.find((e) => e.id === focus)
      const b = fe?.transformerPipeStack?.[0]
      if (b) b.params = { ...(b.params ?? {}), ...JSON.parse(env.AVLAB_PARAMS) }
    }
    const clr = makeClearanceTracker(prepared, focus!)
    // AVLAB_POCKET='x0,x1,z0,z1,west|east|north|south': max depth of the focus centre inside a pocket (and when).
    const pk = env.AVLAB_POCKET ? env.AVLAB_POCKET.split(',') : null
    let pkDepth = 0
    let pkFrame = -1
    const r = await runLab({
      world: ref,
      preparedWorld: prepared,
      focus: focus!,
      chaserPipe: env.AVLAB_CHASER_PIPE,
      seed,
      frames: Number(env.AVLAB_FRAMES ?? 3600),
      outDir: out,
      name: env.AVLAB_NAME ?? 'lab',
      maxScenes: Number(env.AVLAB_MAX_SCENES ?? 2),
      stopAfterScenes: env.AVLAB_STOP ? Number(env.AVLAB_STOP) : undefined,
      captureAt: env.AVLAB_CAPTURE_AT ? env.AVLAB_CAPTURE_AT.split(',').map(Number) : undefined,
      slowTriggerMs: env.AVLAB_SLOW_MS ? Number(env.AVLAB_SLOW_MS) : 0,
      onFrame: ({ sim, frame }) => {
        clr.onFrame(sim)
        if (env.AVLAB_TRACE && frame != null && frame % Number(env.AVLAB_TRACE) === 0) {
          const p = sim.getPosition(focus!)
          const v = sim.getVelocity(focus!)
          console.log(`TRACE f${frame} ${(frame / 60).toFixed(1)}s x ${p[0].toFixed(1)} z ${p[2].toFixed(1)} v ${Math.hypot(v[0], v[2]).toFixed(1)}`)
        }
        if (pk) {
          const [x0, x1, z0, z1] = pk.slice(0, 4).map(Number)
          const p = sim.getPosition(focus!)
          if (p[0] >= x0 && p[0] <= x1 && p[2] >= z0 && p[2] <= z1) {
            const d = pk[4] === 'west' ? p[0] - x0 : pk[4] === 'east' ? x1 - p[0] : pk[4] === 'north' ? z1 - p[2] : p[2] - z0
            if (d > pkDepth) { pkDepth = d; pkFrame = frame ?? -1 }
          }
        }
        // AVLAB_HASH=1: FNV hash of every entity pose every 50 frames (bit-identity proof for perf work).
        if (env.AVLAB_HASH === '1' && frame != null && frame % 50 === 0) {
          let h = 2166136261
          for (const e of prepared.entities as any[]) {
            const q = sim.getPosition(e.id)
            const rq = sim.getRotation(e.id)
            for (const n of [q[0], q[1], q[2], rq.x, rq.y, rq.z, rq.w]) {
              h = Math.imul(h ^ Math.round(n * 1e9), 16777619) >>> 0
            }
          }
          console.log(`POSEHASH seed ${seed} f${frame} ${h.toString(16)}`)
        }
      },
    })
    if (pk) console.log(`  POCKET seed ${seed} max depth ${pkDepth.toFixed(1)} m at frame ${pkFrame}`)
    console.log(`  CLEARANCE min static hull gap ${clr.m.minStaticGap.toFixed(2)} m | close-pass frames (<${CLOSE_GAP} m & >${CLOSE_SPEED} m/s) ${clr.m.closePassFrames} | head-on frames ${clr.m.headOnFrames}`)
    console.log(summary(`seed ${seed}`, r))
    // Machine-readable per-seed summary (read by tools/av-health.mjs).
    fs.writeFileSync(`${out}/${env.AVLAB_NAME ?? 'lab'}-s${seed}.summary.json`, JSON.stringify({
      seed, frames: r.frames, stackVersion: r.stackVersion, pathLength: r.pathLength, meanSpeed: r.meanSpeed, maxSpeed: r.maxSpeed,
      catches: r.catches, minChaserDist: r.minChaserDist, chaserCount: r.chaserCount, classFrames: r.classFrames,
      events: r.events.map((e) => ({ kind: e.kind, startFrame: e.startFrame, endFrame: e.endFrame ?? null })),
      maneuverFrames: r.limitHist.maneuver ?? 0, wallMs: r.wallMs,
      minStaticGap: clr.m.minStaticGap, closePassFrames: clr.m.closePassFrames, headOnFrames: clr.m.headOnFrames,
    }, null, 1))
    for (const sc of r.scenes) console.log(`  DIAG ${sc.trigger.kind}@${sc.trigger.frame}:`, JSON.stringify(sc.diagnostics))
    if (env.AVLAB_PROFILE === '1') console.log(formatProfile(world))
  }
}, 1_800_000)
