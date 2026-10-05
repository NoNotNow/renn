/**
 * Per-frame wall time split for a many-car world (skipped unless AVPERF_WORLD is set).
 *
 *   AVPERF_WORLD=self_hunt_flexible AVPERF_SEEDS=1,2 AVPERF_FRAMES=600 [AVPERF_PARAMS='{"budget":"eco"}'] npx vitest run src/test/scenarios/av-perf.diagnostic.test.ts
 *
 * Prints mean / p95 / max per frame of: whole frame, all AV chains summed, "physics + rest" (frame minus chains) and every
 * stage by flat stage INDEX (summed over cars), plus the per-car chain mean. AVPERF_PARAMS is merged into every AV binding.
 */
import { it } from 'vitest'
import { loadLabWorld, stageLabels } from '@/test/avLab/lab'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator, DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { getTransformerProfile, resetTransformerProfile, setTransformerProfilerEnabled } from '@/runtime/transformerProfilerBridge'

const env = process.env
const enabled = !!env.AVPERF_WORLD
const pct = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const row = (a: number[]) => `mean ${mean(a).toFixed(3)}  p95 ${pct(a, 0.95).toFixed(3)}  max ${Math.max(0, ...a).toFixed(2)}`

it.skipIf(!enabled)('av perf split', async () => {
  const warn = console.warn
  console.warn = () => {}
  const frames = Number(env.AVPERF_FRAMES ?? 600)
  const warm = Number(env.AVPERF_WARM ?? 30)
  for (const seed of (env.AVPERF_SEEDS ?? '1,2').split(',').map(Number)) {
    const world = loadLabWorld({ exampleId: env.AVPERF_WORLD! })
    if (env.AVPERF_PARAMS) {
      for (const e of world.entities as any[]) {
        const b = e.transformerPipeStack?.[0]
        if (b?.pipeId?.startsWith('global_av_')) b.params = { ...(b.params ?? {}), ...JSON.parse(env.AVPERF_PARAMS) }
      }
    }
    const det = installDeterminism(seed, 0)
    const sim = await WorldSimulator.create(world, 0)
    resetTransformerProfile()
    setTransformerProfilerEnabled(true)
    const frameMs: number[] = []
    const chainMs: number[] = []
    const stageMs = new Map<string, number[]>()
    const labelOf = new Map<string, string>()
    const carMs = new Map<string, number[]>()
    let prevChain = new Map<string, number>()
    let prevStage = new Map<string, number>()
    for (let f = 0; f < warm + frames; f++) {
      const t0 = performance.now()
      sim.runFrames(1)
      const dt = performance.now() - t0
      det.advance(DEFAULT_DT)
      let chain = 0
      const stageNow = new Map<string, number>()
      const nextChain = new Map<string, number>()
      const nextStage = new Map<string, number>()
      for (const [id, p] of getTransformerProfile()) {
        const d = p.totalMs - (prevChain.get(id) ?? 0)
        nextChain.set(id, p.totalMs)
        chain += d
        if (f >= warm) {
          if (!carMs.has(id)) carMs.set(id, [])
          carMs.get(id)!.push(d)
        }
        if (!labelOf.has(id)) {
          const ls = stageLabels(world, id)
          for (const idx of p.stages.keys()) labelOf.set(`${id}#${idx}`, ls[idx] ?? `#${idx}`)
          labelOf.set(id, '1')
        }
        for (const [idx, s] of p.stages) {
          const key = `${id}#${idx}`
          const lab = (labelOf.get(key) ?? "").replace(/#\d+$/, "")
          nextStage.set(key, s.totalMs)
          stageNow.set(lab, (stageNow.get(lab) ?? 0) + s.totalMs - (prevStage.get(key) ?? 0))
        }
      }
      prevChain = nextChain
      prevStage = nextStage
      if (f < warm) continue
      frameMs.push(dt)
      chainMs.push(chain)
      for (const [idx, v] of stageNow) {
        if (!stageMs.has(idx)) stageMs.set(idx, [])
        stageMs.get(idx)!.push(v)
      }
    }
    setTransformerProfilerEnabled(false)
    const lines = [
      `AVPERF seed ${seed}: ${frames} frames, ${carMs.size} chains (profiler on; its clock reads add a little)`,
      `  frame total          ${row(frameMs)}`,
      `  AV chains (all cars) ${row(chainMs)}`,
      `  physics + rest       ${row(frameMs.map((x, i) => x - chainMs[i]!))}`,
    ]
    for (const k of [...stageMs.keys()].sort()) lines.push(`  stage ${k.padEnd(34)} ${row(stageMs.get(k)!)}`)
    const perCar = [...carMs.values()].map((a) => mean(a))
    lines.push(`  per car chain mean   mean ${mean(perCar).toFixed(3)}  min ${Math.min(...perCar).toFixed(3)}  max ${Math.max(...perCar).toFixed(3)}  (cars ${perCar.length})`)
    console.log(lines.join('\n'))
  }
  console.warn = warn
}, 600000)
