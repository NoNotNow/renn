import { expect, it } from 'vitest'
import { buildEdgeWorldForDebug } from '@/test/fixtures/avEdgeWorld'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

const watch = (label: string) => {
  for (const e of getTransformerWatchEntries().values()) if (e.label === label) return e.value
}

it('isTouchingSide is false on the floor and true against a lateral obstacle; no contact marks from the floor', async () => {
  setAgentObservationWatchActive(true)
  try {
    // free field: standing / driving on the floor is never a lateral contact
    const free = await WorldSimulator.create(buildEdgeWorldForDebug({ name: 'free', goal: [0, -80], obstacles: [] }), 15)
    let sideInFree = false
    for (let f = 0; f < 300; f++) {
      free.runFrames(1)
      if (String(watch('av.contacts')).includes('side 1')) sideInFree = true
    }
    free.dispose()
    expect(sideInFree).toBe(false)

    // low bar: the car pushes against it — a lateral contact
    const bar = await WorldSimulator.create(
      buildEdgeWorldForDebug({ name: 'bar', goal: [0, -50], obstacles: [{ at: [0, -8], length: 6, thickness: 1, yawDeg: 0, height: 0.35 }] }),
      15,
    )
    let sideAtBar = false
    for (let f = 0; f < 300; f++) {
      bar.runFrames(1)
      if (String(watch('av.contacts')).includes('side 1')) sideAtBar = true
    }
    bar.dispose()
    expect(sideAtBar).toBe(true)
  } finally {
    setAgentObservationWatchActive(false)
  }
})
