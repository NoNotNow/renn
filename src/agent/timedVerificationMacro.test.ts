import { describe, it, expect } from 'vitest'
import {
  validateTimedVerificationMacroConfig,
  buildTimedMacroInputScript,
  MAX_TIMED_MACRO_DURATION_SIM_SEC,
} from '@/agent/timedVerificationMacro'

describe('timedVerificationMacro config', () => {
  it('rejects missing duration and excessive total time', () => {
    expect(validateTimedVerificationMacroConfig({ durationSimSec: 0 })).toMatch(/durationSimSec/)
    expect(
      validateTimedVerificationMacroConfig({
        durationSimSec: MAX_TIMED_MACRO_DURATION_SIM_SEC,
        startDelaySimSec: 1,
      }),
    ).toMatch(/exceeds max/)
  })

  it('rejects step times outside macro window', () => {
    expect(
      validateTimedVerificationMacroConfig({
        durationSimSec: 2,
        steps: [{ atSimTime: 3, inputKeys: { w: true } }],
      }),
    ).toMatch(/atSimTime/)
  })

  it('builds input script with delay and step hold', () => {
    const script = buildTimedMacroInputScript(10, {
      durationSimSec: 5,
      startDelaySimSec: 1,
      steps: [
        { atSimTime: 1.5, inputKeys: { w: true } },
        { atSimTime: 3, inputKeys: { w: true, d: true } },
      ],
    })
    expect(script({ stepIndex: 0, simTime: 10.5, dt: 1 / 60 }).keys.w).toBe(false)
    expect(script({ stepIndex: 0, simTime: 11.5, dt: 1 / 60 }).keys.w).toBe(true)
    expect(script({ stepIndex: 0, simTime: 13, dt: 1 / 60 }).keys.d).toBe(true)
  })
})
