/**
 * Benchmark utilities for hardware-independent performance measurement.
 *
 * Metrics produced here are deterministic or dimensionless so they remain
 * meaningful across machines: heap bytes, object identity, scaling ratios,
 * and coefficient of variation.
 */

import type { RennWorld, Entity } from '@/types/world'

// ---------------------------------------------------------------------------
// Heap measurement
// ---------------------------------------------------------------------------

const gc: (() => void) | undefined =
  typeof globalThis.gc === 'function' ? globalThis.gc : undefined

/**
 * Run `fn`, measuring the V8 heap delta in bytes.
 * When `--expose-gc` is available, forces collection before and after for
 * accurate results. Otherwise falls back to raw `heapUsed` difference (noisier).
 */
export function measureHeapDelta(fn: () => void): number {
  gc?.()
  const before = process.memoryUsage().heapUsed
  fn()
  gc?.()
  const after = process.memoryUsage().heapUsed
  return after - before
}

/** True when `global.gc()` is available (node started with `--expose-gc`). */
export const hasExposedGC = gc !== undefined

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

export interface SampleStats {
  count: number
  mean: number
  median: number
  p95: number
  p99: number
  min: number
  max: number
  stddev: number
  /** Coefficient of variation: stddev / mean. Dimensionless. */
  cov: number
}

export function computeStats(samples: number[]): SampleStats {
  const n = samples.length
  if (n === 0) {
    return { count: 0, mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0, stddev: 0, cov: 0 }
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const sum = sorted.reduce((s, v) => s + v, 0)
  const mean = sum / n
  const median = sorted[Math.floor(n / 2)]!
  const p95 = sorted[Math.floor(n * 0.95)]!
  const p99 = sorted[Math.floor(n * 0.99)]!
  const min = sorted[0]!
  const max = sorted[n - 1]!
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const stddev = Math.sqrt(variance)
  const cov = mean > 0 ? stddev / mean : 0

  return { count: n, mean, median, p95, p99, min, max, stddev, cov }
}

// ---------------------------------------------------------------------------
// Result recording
// ---------------------------------------------------------------------------

export interface BenchmarkResult {
  name: string
  metrics: Record<string, number | string | boolean>
}

const collectedResults: BenchmarkResult[] = []

export function recordBenchmarkResult(name: string, metrics: Record<string, number | string | boolean>): void {
  collectedResults.push({ name, metrics })
}

/** Print all collected results as a table at the end of a suite. */
export function printBenchmarkResults(): void {
  if (collectedResults.length === 0) return
  console.log('\n=== Performance benchmark results ===\n')
  for (const { name, metrics } of collectedResults) {
    console.log(`  ${name}`)
    for (const [k, v] of Object.entries(metrics)) {
      const display = typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : v
      console.log(`    ${k}: ${display}`)
    }
    console.log()
  }
  console.log('=====================================\n')
}

export function clearBenchmarkResults(): void {
  collectedResults.length = 0
}

// ---------------------------------------------------------------------------
// World factory
// ---------------------------------------------------------------------------

/**
 * Create a benchmark world with `dynamicCount` dynamic bodies and
 * `staticCount` static bodies arranged in a grid on a ground plane.
 *
 * A fraction of dynamic bodies get a simple input+car2 transformer chain
 * to exercise the transformer pipeline under load.
 */
export function createBenchmarkWorld(
  dynamicCount: number,
  staticCount: number = 0,
): RennWorld {
  const entities: Entity[] = []

  entities.push({
    id: 'ground',
    name: 'Ground',
    bodyType: 'static',
    shape: { type: 'box', width: 500, height: 1, depth: 500 },
    position: [0, -0.5, 0],
    rotation: [0, 0, 0],
  })

  for (let i = 0; i < dynamicCount; i++) {
    const col = i % 10
    const row = Math.floor(i / 10)
    const entity: Entity = {
      id: `dyn_${i}`,
      name: `Dynamic ${i}`,
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [col * 3, 2 + row * 3, row * 3],
      rotation: [0, 0, 0],
      mass: 5,
      restitution: 0.3,
      friction: 0.5,
      linearDamping: 0.1,
      angularDamping: 0.5,
    }

    if (i % 5 === 0) {
      entity.transformers = [
        {
          type: 'input',
          priority: 0,
          enabled: true,
          inputMapping: {
            keyboard: { w: 'throttle', s: 'brake', a: 'steer_left', d: 'steer_right' },
          },
        } as any,
        {
          type: 'car2',
          priority: 10,
          enabled: true,
          params: { power: 200, steeringIntensity: 0.1, steeringSpeed: 0.01, lateralGrip: 80, jumpImpulse: 150 },
        } as any,
      ]
    }

    entities.push(entity)
  }

  for (let i = 0; i < staticCount; i++) {
    const col = i % 10
    const row = Math.floor(i / 10)
    entities.push({
      id: `static_${i}`,
      name: `Static ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [col * 3 + 1.5, 0.5, row * 3 + 1.5],
      rotation: [0, 0, 0],
    })
  }

  return {
    version: '1.0',
    world: { gravity: [0, -9.81, 0] },
    entities,
    assets: {},
    scripts: {},
  }
}
