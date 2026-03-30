import { describe, it, expect, vi } from 'vitest'
import { createGameAPI } from './gameApi'

describe('createGameAPI snackbar', () => {
  const noopPosition = () => null as [number, number, number] | null
  const noopSet = () => {}

  it('invokes onSnackbar with default 10s when duration omitted', () => {
    const onSnackbar = vi.fn()
    const api = createGameAPI(
      noopPosition,
      noopSet,
      noopPosition,
      noopSet,
      noopPosition,
      noopPosition,
      () => null,
      () => null,
      [],
      { current: 0 },
      onSnackbar
    )
    api.snackbar('hello')
    expect(onSnackbar).toHaveBeenCalledWith('hello', 10)
  })

  it('passes through valid duration', () => {
    const onSnackbar = vi.fn()
    const api = createGameAPI(
      noopPosition,
      noopSet,
      noopPosition,
      noopSet,
      noopPosition,
      noopPosition,
      () => null,
      () => null,
      [],
      { current: 0 },
      onSnackbar
    )
    api.snackbar('x', 3)
    expect(onSnackbar).toHaveBeenCalledWith('x', 3)
  })

  it('coerces message to string', () => {
    const onSnackbar = vi.fn()
    const api = createGameAPI(
      noopPosition,
      noopSet,
      noopPosition,
      noopSet,
      noopPosition,
      noopPosition,
      () => null,
      () => null,
      [],
      { current: 0 },
      onSnackbar
    )
    api.snackbar(42 as unknown as string, 1)
    expect(onSnackbar).toHaveBeenCalledWith('42', 1)
  })

  it('falls back to 10 when duration is NaN or negative', () => {
    const onSnackbar = vi.fn()
    const api = createGameAPI(
      noopPosition,
      noopSet,
      noopPosition,
      noopSet,
      noopPosition,
      noopPosition,
      () => null,
      () => null,
      [],
      { current: 0 },
      onSnackbar
    )
    api.snackbar('a', NaN)
    expect(onSnackbar).toHaveBeenLastCalledWith('a', 10)
    api.snackbar('b', -1)
    expect(onSnackbar).toHaveBeenLastCalledWith('b', 10)
  })

  it('allows zero duration', () => {
    const onSnackbar = vi.fn()
    const api = createGameAPI(
      noopPosition,
      noopSet,
      noopPosition,
      noopSet,
      noopPosition,
      noopPosition,
      () => null,
      () => null,
      [],
      { current: 0 },
      onSnackbar
    )
    api.snackbar('z', 0)
    expect(onSnackbar).toHaveBeenCalledWith('z', 0)
  })

  it('no-ops when onSnackbar omitted', () => {
    const api = createGameAPI(noopPosition, noopSet)
    expect(() => api.snackbar('quiet')).not.toThrow()
  })
})

const fullGameApiArgs = [
  () => null as [number, number, number] | null,
  () => {},
  () => null as [number, number, number] | null,
  () => {},
  () => null as [number, number, number] | null,
  () => null as [number, number, number] | null,
  () => null,
  () => null,
  [] as never[],
  { current: 0 },
] as const

describe('createGameAPI HUD', () => {
  it('invokes onHudPatch for setScore with floored non-negative integer', () => {
    const onHudPatch = vi.fn()
    const api = createGameAPI(...fullGameApiArgs, undefined, onHudPatch)
    api.setScore(42.7)
    expect(onHudPatch).toHaveBeenCalledWith({ score: 42 })
  })

  it('invokes onHudPatch for setDamage', () => {
    const onHudPatch = vi.fn()
    const api = createGameAPI(...fullGameApiArgs, undefined, onHudPatch)
    api.setDamage(3)
    expect(onHudPatch).toHaveBeenCalledWith({ damage: 3 })
  })

  it('ignores NaN, Infinity, and negative values', () => {
    const onHudPatch = vi.fn()
    const api = createGameAPI(...fullGameApiArgs, undefined, onHudPatch)
    api.setScore(NaN)
    api.setScore(Infinity)
    api.setScore(-1)
    api.setDamage(-0.001)
    expect(onHudPatch).not.toHaveBeenCalled()
  })

  it('no-ops when onHudPatch omitted', () => {
    const api = createGameAPI(...fullGameApiArgs)
    expect(() => {
      api.setScore(1)
      api.setDamage(2)
    }).not.toThrow()
  })

  it('getScore returns 0 until a successful setScore', () => {
    const api = createGameAPI(...fullGameApiArgs)
    expect(api.getScore()).toBe(0)
    api.setScore(9.2)
    expect(api.getScore()).toBe(9)
  })

  it('getDamage returns 0 until a successful setDamage', () => {
    const api = createGameAPI(...fullGameApiArgs)
    expect(api.getDamage()).toBe(0)
    api.setDamage(4)
    expect(api.getDamage()).toBe(4)
  })

  it('does not change getScore when setScore is ignored', () => {
    const api = createGameAPI(...fullGameApiArgs)
    api.setScore(2)
    expect(api.getScore()).toBe(2)
    api.setScore(-1)
    api.setScore(NaN)
    expect(api.getScore()).toBe(2)
  })

  it('does not change getDamage when setDamage is ignored', () => {
    const api = createGameAPI(...fullGameApiArgs)
    api.setDamage(3)
    expect(api.getDamage()).toBe(3)
    api.setDamage(-0.5)
    expect(api.getDamage()).toBe(3)
  })
})
