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
import { versionReport, formatProfile, loadLabWorld, readScene, replayScene, runLab, type LabResult, type WorldRef } from '@/test/avLab/lab'

const env = process.env
const out = env.AVLAB_OUT ?? 'test-results/avlab'
const enabled = !!(env.AVLAB_WORLD || env.AVLAB_SCENE)

function worldRef(v: string): WorldRef {
  return v.endsWith('.json') || v.includes('/') ? { file: v } : { exampleId: v }
}

function summary(tag: string, r: LabResult): string {
  const ev = r.events.map((e) => `${e.kind}@${e.startFrame}(from ${e.windowStartFrame}${e.endFrame != null ? `..${e.endFrame}` : '..end'}; net ${e.metrics.net.toFixed(2)} path ${e.metrics.path.toFixed(2)} flips ${e.metrics.flips} yaw ${e.metrics.yawPath.toFixed(2)})`)
  const prof = r.profile
    ? r.profile.stages.map((s) => `    ${s.label.padEnd(36)} mean ${s.meanMs.toFixed(3)} ms  p95 ${s.p95Ms.toFixed(3)}  max ${s.maxMs.toFixed(2)}  ${(s.share * 100).toFixed(0)}%`).join('\n')
    : ''
  return [
    `LAB ${tag}: [av ${r.stackVersion}] ${r.frames} frames, path ${r.pathLength.toFixed(1)} m, ${r.realtimeFactor.toFixed(2)}x realtime, roughness ${r.speedRoughness.toFixed(3)} m/s/frame, spikes ${r.speedSpikes}, classes ${JSON.stringify(r.classFrames)}`,
    `  METRICS speed mean ${r.meanSpeed.toFixed(1)} max ${r.maxSpeed.toFixed(1)} m/s | path ${r.pathLength.toFixed(0)} m | catches ${r.catches} | minChaserDist ${r.minChaserDist.toFixed(1)} m (${r.chaserCount} chasers) | chaser<15m ${(r.nearFraction * 100).toFixed(0)}% | events ${r.events.length}`,
    `  STEER |dsteer|/frame ${r.steerRoughness.toFixed(4)} | reversals/s ${r.steerReversalsPerSec.toFixed(2)} | |dyawRate|/frame ${r.yawRateRoughness.toFixed(3)} rad/s | plan changes/s ${r.planChangesPerSec.toFixed(2)} switches/s ${r.planSwitchesPerSec.toFixed(2)} | obstacle flicker ${r.obstacleFlicker.toFixed(4)}`,
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
    })
    console.log(summary(`seed ${seed}`, r))
    for (const sc of r.scenes) console.log(`  DIAG ${sc.trigger.kind}@${sc.trigger.frame}:`, JSON.stringify(sc.diagnostics))
    if (env.AVLAB_PROFILE === '1') console.log(formatProfile(world))
  }
}, 1_800_000)
