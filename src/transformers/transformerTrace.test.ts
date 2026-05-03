import { describe, expect, it } from 'vitest'
import {
  actionsMapsDiffer,
  cloneTransformOutputForTrace,
  computeOutputLedActive,
  inputTransformerPublishedActions,
  isStructuralTransformOutputActive,
  serializeTransformInputForTrace,
  hasNonZeroSemanticActions,
  summarizePublishedActionsDelta,
} from '@/transformers/transformerTrace'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('transformerTrace helpers', () => {
  it('serializeTransformInputForTrace copies actions and tuples', () => {
    const input = createMockTransformInput({
      actions: { throttle: 1 },
      position: [1, 2, 3],
    })
    const snap = serializeTransformInputForTrace(input)
    expect(snap.actions).toEqual({ throttle: 1 })
    expect(snap.position).toEqual([1, 2, 3])
    ;(snap.actions as Record<string, number>).throttle = 0
    expect(input.actions.throttle).toBe(1)
  })

  it('isStructuralTransformOutputActive is false for empty output', () => {
    expect(isStructuralTransformOutputActive({})).toBe(false)
  })

  it('isStructuralTransformOutputActive detects force and earlyExit', () => {
    expect(isStructuralTransformOutputActive({ force: [1, 0, 0] })).toBe(true)
    expect(isStructuralTransformOutputActive({ earlyExit: true })).toBe(true)
  })

  it('inputTransformerPublishedActions detects throttle publish', () => {
    expect(inputTransformerPublishedActions('input', {}, { throttle: 1 })).toBe(true)
    expect(inputTransformerPublishedActions('car2', {}, { throttle: 1 })).toBe(false)
    expect(inputTransformerPublishedActions('input', { throttle: 1 }, { throttle: 1 })).toBe(false)
  })

  it('computeOutputLedActive combines structural output and input mapping', () => {
    expect(
      computeOutputLedActive('input', {}, {}, { throttle: 0.5 }),
    ).toBe(true)
    expect(computeOutputLedActive('car2', {}, {}, { throttle: 0.5 })).toBe(false)
    expect(
      computeOutputLedActive('car2', { force: [0, 0, 1] }, {}, {}),
    ).toBe(true)
  })

  it('cloneTransformOutputForTrace clones vectors', () => {
    const o = cloneTransformOutputForTrace({
      force: [1, 2, 3],
      setPose: { position: [0, 1, 0], rotation: [0, 0, 0] },
    })
    expect(o.force).toEqual([1, 2, 3])
    o.force![0] = 99
    expect(o.force![0]).toBe(99)
  })

  it('actionsMapsDiffer compares missing keys as zero', () => {
    expect(actionsMapsDiffer({}, { a: 0 })).toBe(false)
    expect(actionsMapsDiffer({}, { a: 0.1 })).toBe(true)
  })

  it('hasNonZeroSemanticActions detects throttle', () => {
    expect(hasNonZeroSemanticActions(undefined)).toBe(false)
    expect(hasNonZeroSemanticActions({ actions: {} })).toBe(false)
    expect(hasNonZeroSemanticActions({ actions: { throttle: 0 } })).toBe(false)
    expect(hasNonZeroSemanticActions({ actions: { throttle: 1 } })).toBe(true)
  })

  it('summarizePublishedActionsDelta lists changed keys sorted', () => {
    expect(summarizePublishedActionsDelta({}, { throttle: 0.5 })).toBe('throttle=0.5')
    expect(summarizePublishedActionsDelta({ steer: 0 }, { steer: 0.25, throttle: 2 })).toBe(
      'steer=0.25, throttle=2',
    )
    expect(summarizePublishedActionsDelta({ x: 1 }, { x: 1 })).toBe('(idle)')
  })
})
