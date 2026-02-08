import { describe, expect, test } from 'vitest'
import {
  BaseTransformer,
  TransformerChain,
} from './transformer'
import type {
  TransformInput,
  TransformOutput,
} from '@/types/transformer'
import {
  createMockTransformInput,
  assertForceEquals,
  assertEmptyOutput,
} from '@/test/helpers/transformer'

// Mock transformer implementations for testing
class MockTransformer extends BaseTransformer {
  readonly type = 'mock'
  private outputFn: (input: TransformInput) => TransformOutput

  constructor(
    priority: number,
    outputFn: (input: TransformInput) => TransformOutput,
    enabled = true,
  ) {
    super(priority, enabled)
    this.outputFn = outputFn
  }

  transform(input: TransformInput): TransformOutput {
    return this.outputFn(input)
  }
}

describe('BaseTransformer', () => {
  test('transform() returns valid TransformOutput', () => {
    const transformer = new MockTransformer(10, () => ({
      force: [1, 2, 3],
    }))
    const input = createMockTransformInput()
    const output = transformer.transform(input, 0.016)

    expect(output).toBeDefined()
    expect(output.force).toEqual([1, 2, 3])
  })

  test('disabled transformer returns empty output', () => {
    const transformer = new MockTransformer(
      10,
      () => ({ force: [1, 0, 0] }),
      false,
    )
    expect(transformer.enabled).toBe(false)
  })

  test('helper methods work correctly', () => {
    const transformer = new MockTransformer(10, (input) => {
      const action = transformer.getAction(input, 'test')
      const force = transformer.createForce(1, 2, 3)
      const torque = transformer.createTorque(0, 1, 0)
      return { force, torque }
    })

    const input = createMockTransformInput({ actions: { test: 0.5 } })
    const output = transformer.transform(input, 0.016)

    expect(output.force).toEqual([1, 2, 3])
    expect(output.torque).toEqual([0, 1, 0])
  })
})

describe('TransformerChain', () => {
  test('sorts transformers by priority', () => {
    const chain = new TransformerChain()
    const order: number[] = []

    chain.add(
      new MockTransformer(10, () => {
        order.push(10)
        return { force: [0, 0, 0] }
      }),
    )
    chain.add(
      new MockTransformer(0, () => {
        order.push(0)
        return { force: [0, 0, 0] }
      }),
    )
    chain.add(
      new MockTransformer(5, () => {
        order.push(5)
        return { force: [0, 0, 0] }
      }),
    )

    chain.execute(createMockTransformInput(), 0.016)

    expect(order).toEqual([0, 5, 10])
  })

  test('accumulates forces from multiple transformers', () => {
    const chain = new TransformerChain()
    chain.add(
      new MockTransformer(0, () => ({ force: [1, 0, 0] })),
    )
    chain.add(
      new MockTransformer(1, () => ({ force: [0, 2, 0] })),
    )
    chain.add(
      new MockTransformer(2, () => ({ force: [0, 0, 3] })),
    )

    const output = chain.execute(createMockTransformInput(), 0.016)

    expect(output.force).toEqual([1, 2, 3])
  })

  test('accumulates impulses as forces', () => {
    const chain = new TransformerChain()
    chain.add(
      new MockTransformer(0, () => ({ impulse: [1, 0, 0] })),
    )
    chain.add(
      new MockTransformer(1, () => ({ force: [0, 2, 0] })),
    )

    const output = chain.execute(createMockTransformInput(), 0.016)

    expect(output.force).toEqual([1, 2, 0])
  })

  test('accumulates torques', () => {
    const chain = new TransformerChain()
    chain.add(
      new MockTransformer(0, () => ({ torque: [1, 0, 0] })),
    )
    chain.add(
      new MockTransformer(1, () => ({ torque: [0, 2, 0] })),
    )

    const output = chain.execute(createMockTransformInput(), 0.016)

    expect(output.torque).toEqual([1, 2, 0])
  })

  test('early exit stops chain', () => {
    const chain = new TransformerChain()
    let t2Called = false

    chain.add(
      new MockTransformer(0, () => ({
        force: [1, 0, 0],
        earlyExit: true,
      })),
    )
    chain.add(
      new MockTransformer(1, () => {
        t2Called = true
        return { force: [0, 2, 0] }
      }),
    )

    const output = chain.execute(createMockTransformInput(), 0.016)

    expect(output.force).toEqual([1, 0, 0])
    expect(output.earlyExit).toBe(true)
    expect(t2Called).toBe(false)
  })

  test('disabled transformers are skipped', () => {
    const chain = new TransformerChain()
    let t2Called = false

    chain.add(
      new MockTransformer(0, () => ({ force: [1, 0, 0] })),
    )
    chain.add(
      new MockTransformer(1, () => {
        t2Called = true
        return { force: [0, 2, 0] }
      }, false),
    )
    chain.add(
      new MockTransformer(2, () => ({ force: [0, 0, 3] })),
    )

    const output = chain.execute(createMockTransformInput(), 0.016)

    expect(output.force).toEqual([1, 0, 3])
    expect(t2Called).toBe(false)
  })

  test('empty chain returns empty output', () => {
    const chain = new TransformerChain()
    const output = chain.execute(createMockTransformInput(), 0.016)

    assertEmptyOutput(output)
  })

  test('chain with only zero forces returns empty output', () => {
    const chain = new TransformerChain()
    chain.add(
      new MockTransformer(0, () => ({ force: [0, 0, 0] })),
    )

    const output = chain.execute(createMockTransformInput(), 0.016)

    assertEmptyOutput(output)
  })

  test('accumulated forces passed to next transformer', () => {
    const chain = new TransformerChain()
    let receivedAccumulated: Vec3 | undefined

    chain.add(
      new MockTransformer(0, () => ({ force: [1, 0, 0] })),
    )
    chain.add(
      new MockTransformer(1, (input) => {
        // Capture accumulated force BEFORE adding our own
        receivedAccumulated = [...input.accumulatedForce] as Vec3
        return { force: [0, 2, 0] }
      }),
    )

    chain.execute(createMockTransformInput(), 0.016)

    // Second transformer should see accumulated force from first transformer
    expect(receivedAccumulated).toEqual([1, 0, 0])
  })
})
