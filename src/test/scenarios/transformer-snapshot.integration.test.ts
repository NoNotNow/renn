import { expect, it } from 'vitest'
import { buildEdgeWorldForDebug } from '@/test/fixtures/avEdgeWorld'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import { getLatestTransformerSnapshot, requestTransformerSnapshot } from '@/runtime/transformerSnapshotBridge'

it('snapshot records input/output/watch of every custom stage for one frame', async () => {
  const sim = await WorldSimulator.create(buildEdgeWorldForDebug({ name: 's', goal: [0, -40], obstacles: [] }), 15)
  try {
    sim.runFrames(30)
    requestTransformerSnapshot('buggy')
    sim.runFrames(3)
    await Promise.resolve()
    const snap = getLatestTransformerSnapshot()
    expect(snap?.entityId).toBe('buggy')
    expect(snap!.stages.length).toBeGreaterThan(8)
    expect(new Set(snap!.stages.map((s) => s.stackIndex)).size).toBe(snap!.stages.length)
    const speedStage = snap!.stages.find((s) => 'av.vLimit' in s.watch)
    expect(speedStage).toBeTruthy()
    expect(JSON.stringify(snap).length).toBeLessThan(400_000)
  } finally {
    sim.dispose()
  }
})
