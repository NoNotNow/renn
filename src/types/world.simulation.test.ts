import { describe, it, expect } from 'vitest'
import {
  resolveSimulationSettings,
  SIMULATION_FIXED_DT_MIN,
  SIMULATION_FIXED_DT_MAX,
  SIMULATION_TIME_SCALE_MIN,
  SIMULATION_TIME_SCALE_MAX,
} from '@/types/world'

describe('resolveSimulationSettings', () => {
  it('uses defaults when omitted', () => {
    expect(resolveSimulationSettings(undefined)).toEqual({
      fixedDt: 1 / 60,
      maxStepsPerFrame: 4,
      timeScale: 1,
    })
  })

  it('clamps fixedDt into 15–240 Hz range', () => {
    expect(resolveSimulationSettings({ fixedDt: 1 / 500 })).toMatchObject({
      fixedDt: SIMULATION_FIXED_DT_MIN,
    })
    expect(resolveSimulationSettings({ fixedDt: 1 })).toMatchObject({
      fixedDt: SIMULATION_FIXED_DT_MAX,
    })
  })

  it('floors maxStepsPerFrame to integer 1–10', () => {
    expect(resolveSimulationSettings({ maxStepsPerFrame: 2.7 })).toMatchObject({
      maxStepsPerFrame: 2,
    })
    expect(resolveSimulationSettings({ maxStepsPerFrame: 0 })).toMatchObject({
      maxStepsPerFrame: 1,
    })
    expect(resolveSimulationSettings({ maxStepsPerFrame: 99 })).toMatchObject({
      maxStepsPerFrame: 10,
    })
  })

  it('defaults timeScale to 1', () => {
    expect(resolveSimulationSettings({})).toMatchObject({ timeScale: 1 })
  })

  it('clamps timeScale to 0.1–5 range', () => {
    expect(resolveSimulationSettings({ timeScale: 0.01 })).toMatchObject({
      timeScale: SIMULATION_TIME_SCALE_MIN,
    })
    expect(resolveSimulationSettings({ timeScale: 20 })).toMatchObject({
      timeScale: SIMULATION_TIME_SCALE_MAX,
    })
  })

  it('passes through valid timeScale', () => {
    expect(resolveSimulationSettings({ timeScale: 2 })).toMatchObject({ timeScale: 2 })
    expect(resolveSimulationSettings({ timeScale: 0.5 })).toMatchObject({ timeScale: 0.5 })
  })
})
