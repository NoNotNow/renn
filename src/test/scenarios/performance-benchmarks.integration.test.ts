/**
 * Performance benchmark integration tests.
 *
 * All metrics are hardware-independent (bytes, object identity, dimensionless
 * ratios) so results are meaningful across machines.  Run with:
 *
 *   npm run test:run -- src/test/scenarios/performance-benchmarks.integration.test.ts
 *
 * The `--expose-gc` flag (configured in vite.config.ts) enables accurate heap
 * measurement via `global.gc()`.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { initRapier } from '@/physics/rapierPhysics'
import type { CachedTransform } from '@/physics/rapierPhysics'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import {
  measureHeapDelta,
  hasExposedGC,
  computeStats,
  recordBenchmarkResult,
  printBenchmarkResults,
  clearBenchmarkResults,
  createBenchmarkWorld,
} from '@/test/helpers/benchmarkUtils'

afterAll(() => {
  printBenchmarkResults()
  clearBenchmarkResults()
})

// ---------------------------------------------------------------------------
// A. Object reuse — deterministic pass/fail
// ---------------------------------------------------------------------------

describe('Object reuse (allocation-free hot path)', () => {
  it('CachedTransform objects maintain identity across frames', async () => {
    await initRapier()
    const world = createBenchmarkWorld(10)
    const sim = await WorldSimulator.create(world)
    const pw = sim.getPhysicsWorld()

    sim.runFrames(5)

    const refsBefore = new Map<string, CachedTransform>()
    const linvelRefsBefore = new Map<string, CachedTransform['linvel']>()
    const angvelRefsBefore = new Map<string, CachedTransform['angvel']>()
    for (let i = 0; i < 10; i++) {
      const id = `dyn_${i}`
      const ct = pw.getCachedTransform(id)
      expect(ct).toBeDefined()
      refsBefore.set(id, ct!)
      linvelRefsBefore.set(id, ct!.linvel)
      angvelRefsBefore.set(id, ct!.angvel)
    }

    sim.runFrames(60)

    let allReused = true
    let allVelReused = true
    for (const [id, before] of refsBefore) {
      const after = pw.getCachedTransform(id)
      if (after !== before) allReused = false
      expect(after).toBe(before)
      if (after!.linvel !== linvelRefsBefore.get(id)) allVelReused = false
      if (after!.angvel !== angvelRefsBefore.get(id)) allVelReused = false
      expect(after!.linvel).toBe(linvelRefsBefore.get(id))
      expect(after!.angvel).toBe(angvelRefsBefore.get(id))
    }

    recordBenchmarkResult('CachedTransform identity', {
      entityCount: 10,
      framesRun: 60,
      allReused,
      allVelReused,
    })

    sim.dispose()
  })

  it('contactForceByPair Map instance is reused across steps', async () => {
    await initRapier()
    const world = createBenchmarkWorld(5)
    const sim = await WorldSimulator.create(world)
    const pw = sim.getPhysicsWorld()

    sim.runFrames(5)
    const mapRef = (pw as any).contactForceByPair as Map<string, unknown>
    expect(mapRef).toBeInstanceOf(Map)

    sim.runFrames(30)
    const mapAfter = (pw as any).contactForceByPair as Map<string, unknown>
    expect(mapAfter).toBe(mapRef)

    recordBenchmarkResult('contactForceByPair identity', {
      framesRun: 30,
      sameInstance: mapAfter === mapRef,
    })

    sim.dispose()
  })
})

// ---------------------------------------------------------------------------
// B. Heap growth — bytes per frame (hardware-independent)
// ---------------------------------------------------------------------------

describe('Heap growth per frame', () => {
  const ENTITY_COUNT = 20
  const FRAME_COUNT = 300

  it('heap growth is bounded during steady-state simulation', async () => {
    await initRapier()
    const world = createBenchmarkWorld(ENTITY_COUNT)
    const sim = await WorldSimulator.create(world)

    // Warm up: let JIT stabilize and initial allocations settle.
    sim.runFrames(120)

    const delta = measureHeapDelta(() => {
      sim.runFrames(FRAME_COUNT)
    })

    const bytesPerFrame = delta / FRAME_COUNT
    const bytesPerFramePerEntity = delta / FRAME_COUNT / ENTITY_COUNT

    recordBenchmarkResult('Heap growth (steady state)', {
      entityCount: ENTITY_COUNT,
      frameCount: FRAME_COUNT,
      totalDeltaBytes: delta,
      bytesPerFrame: Math.round(bytesPerFrame),
      bytesPerFramePerEntity: Math.round(bytesPerFramePerEntity),
      gcAvailable: hasExposedGC,
    })

    if (hasExposedGC) {
      // With forced GC, expect near-zero retained growth per frame.
      // 2 KB/frame is a generous budget; ideal is ~0.
      expect(bytesPerFrame).toBeLessThan(2048)
    }

    sim.dispose()
  })
})

// ---------------------------------------------------------------------------
// C. Scaling linearity — dimensionless ratio
// ---------------------------------------------------------------------------

describe('Scaling linearity', () => {
  const FRAMES = 200

  it('frame time scales sub-quadratically with entity count', async () => {
    await initRapier()

    const worldSmall = createBenchmarkWorld(10)
    const simSmall = await WorldSimulator.create(worldSmall, 30)
    const timingsSmall = simSmall.runFramesTimed(FRAMES)
    const totalSmall = timingsSmall.reduce((s, t) => s + t.totalMs, 0)
    simSmall.dispose()

    const worldLarge = createBenchmarkWorld(40)
    const simLarge = await WorldSimulator.create(worldLarge, 30)
    const timingsLarge = simLarge.runFramesTimed(FRAMES)
    const totalLarge = timingsLarge.reduce((s, t) => s + t.totalMs, 0)
    simLarge.dispose()

    const ratio = totalLarge / totalSmall

    recordBenchmarkResult('Scaling linearity', {
      smallEntities: 10,
      largeEntities: 40,
      frames: FRAMES,
      totalMsSmall: Math.round(totalSmall),
      totalMsLarge: Math.round(totalLarge),
      ratio: ratio,
      verdict: ratio < 6.0 ? 'sub-quadratic' : 'WARNING: super-linear',
    })

    // Linear scaling (4x entities) would give ratio ~4.0.
    // Allow up to 6.0 for constant overhead and Rapier broadphase effects.
    expect(ratio).toBeLessThan(6.0)
  })
})

// ---------------------------------------------------------------------------
// D. Frame time consistency — dimensionless CoV
// ---------------------------------------------------------------------------

describe('Frame time consistency', () => {
  const ENTITY_COUNT = 20
  const FRAME_COUNT = 600

  it('records frame time distribution for analysis', async () => {
    await initRapier()
    const world = createBenchmarkWorld(ENTITY_COUNT)
    const sim = await WorldSimulator.create(world, 60)

    const timings = sim.runFramesTimed(FRAME_COUNT)
    const frameTimes = timings.map((t) => t.totalMs)
    const stats = computeStats(frameTimes)

    const p99MedianRatio = stats.median > 0 ? stats.p99 / stats.median : 0

    recordBenchmarkResult('Frame time consistency', {
      entityCount: ENTITY_COUNT,
      frameCount: FRAME_COUNT,
      meanMs: stats.mean,
      medianMs: stats.median,
      p95Ms: stats.p95,
      p99Ms: stats.p99,
      stddevMs: stats.stddev,
      cov: stats.cov,
      p99MedianRatio,
      minMs: stats.min,
      maxMs: stats.max,
    })

    // Time-variance metrics (CoV, p99/median) are recorded for analysis but
    // not asserted — at sub-millisecond frame times, OS scheduling noise from
    // parallel test execution makes them unreliable as pass/fail criteria.
    // Review the printed results for GC-spike detection on isolated runs.
    expect(stats.count).toBe(FRAME_COUNT)

    sim.dispose()
  })
})

// ---------------------------------------------------------------------------
// E. Per-phase cost breakdown — percentages
// ---------------------------------------------------------------------------

describe('Per-phase cost breakdown', () => {
  const ENTITY_COUNT = 20
  const FRAME_COUNT = 300

  it('records transformer / physics / sync phase distribution', async () => {
    await initRapier()
    const world = createBenchmarkWorld(ENTITY_COUNT)
    const sim = await WorldSimulator.create(world, 60)

    const timings = sim.runFramesTimed(FRAME_COUNT)

    const sumTransformers = timings.reduce((s, t) => s + t.transformersMs, 0)
    const sumPhysics = timings.reduce((s, t) => s + t.physicsStepMs, 0)
    const sumSync = timings.reduce((s, t) => s + t.syncMs, 0)
    const sumTotal = timings.reduce((s, t) => s + t.totalMs, 0)

    const pctTransformers = (sumTransformers / sumTotal) * 100
    const pctPhysics = (sumPhysics / sumTotal) * 100
    const pctSync = (sumSync / sumTotal) * 100

    recordBenchmarkResult('Phase breakdown', {
      entityCount: ENTITY_COUNT,
      frameCount: FRAME_COUNT,
      totalMs: Math.round(sumTotal),
      transformersPct: pctTransformers,
      physicsPct: pctPhysics,
      syncPct: pctSync,
      meanFrameMs: sumTotal / FRAME_COUNT,
    })

    // Sanity: phases should account for ~100% of frame time.
    const accounted = pctTransformers + pctPhysics + pctSync
    expect(accounted).toBeGreaterThan(95)
    expect(accounted).toBeLessThanOrEqual(100.1)

    sim.dispose()
  })
})
