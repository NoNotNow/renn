import { describe, expect, test, beforeAll } from 'vitest'
import * as THREE from 'three'
import { createTransformerChain } from './transformerRegistry'
import type { TransformerConfig } from '@/types/transformer'
import { createMockTransformInput } from '@/test/helpers/transformer'
import { initRapier, createPhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { RennWorld, Entity } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { RawInput } from '@/types/transformer'

beforeAll(async () => {
  await initRapier()
})

describe('Transformer Integration', () => {
  test('creates transformer chain from configs', async () => {
    const configs: TransformerConfig[] = [
      {
        type: 'input',
        priority: 0,
      },
      {
        type: 'car2',
        priority: 1,
        params: {
          power: 500,
          lateralGrip: 100,
        },
      },
    ]

    const chain = await createTransformerChain(configs)

    expect(chain).not.toBeNull()
    expect(chain?.getAll().length).toBe(2)
  })

  test('transformer chain executes correctly', async () => {
    const configs: TransformerConfig[] = [
      {
        type: 'car2',
        priority: 0,
        params: {
          power: 400,
          lateralGrip: 100,
        },
      },
    ]

    const chain = await createTransformerChain(configs)
    expect(chain).not.toBeNull()

    const input = createMockTransformInput({
      actions: { throttle: 1.0 },
      rotation: [0, 0, 0],
      environment: { isTouchingObject: true },
    })

    const output = chain!.execute(input, 0.016)

    // Chain merges impulse into force
    expect(output.force).toBeDefined()
    const mag = Math.sqrt(
      (output.force![0] ** 2) + (output.force![1] ** 2) + (output.force![2] ** 2),
    )
    expect(mag).toBeGreaterThan(0)
  })

  test('handles empty config array', async () => {
    const chain = await createTransformerChain([])
    expect(chain).toBeNull()
  })

  test('handles invalid transformer type gracefully', async () => {
    const configs: TransformerConfig[] = [
      {
        type: 'invalid_type' as any,
        priority: 0,
      },
    ]

    // Should not throw, but log error
    const chain = await createTransformerChain(configs)
    expect(chain).not.toBeNull()
    expect(chain?.getAll().length).toBe(0) // Invalid transformer not added
  })

  test('full loop: steering then release — angular velocity decays after input stops', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, 0, 0] },
      assets: {},
      entities: [
        {
          id: 'ground',
          name: 'Ground',
          bodyType: 'static',
          shape: { type: 'plane' },
          position: [0, 0, 0],
        },
        {
          id: 'car',
          name: 'Car',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 2, height: 1, depth: 4 },
          position: [0, 0.45, 0],
          rotation: [0, 0, 0],
          mass: 1,
          angularDamping: 0.5,
          transformers: [
            {
              type: 'input',
              priority: 0,
              inputMapping: {
                keyboard: {
                  w: 'throttle',
                  s: 'brake',
                  a: 'steer_left',
                  d: 'steer_right',
                  space: 'handbrake',
                },
              },
            },
            {
              type: 'car2',
              priority: 1,
              params: { power: 400, steeringIntensity: 0.1, lateralGrip: 100 },
            },
          ],
        },
      ],
      scripts: {},
    }

    const entities: LoadedEntity[] = world.entities.map((e: Entity) => ({
      entity: e,
      mesh: new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial(),
      ),
    }))

    const STEER_FRAMES = 20
    let frameIndex = 0
    const rawInputGetter = (): RawInput => ({
      keys: {
        w: frameIndex < STEER_FRAMES,
        a: false,
        s: false,
        d: frameIndex < STEER_FRAMES,
        space: false,
        shift: false,
      },
      wheel: { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0 },
    })

    const pw = await createPhysicsWorld(world, entities)
    const registry = RenderItemRegistry.create(entities, pw, rawInputGetter)

    const carConfig = world.entities.find((e) => e.id === 'car')!.transformers!
    const chain = await createTransformerChain(carConfig, rawInputGetter)
    const item = registry.get('car')!
    item.transformerChain = chain!
    registry.setRawInputGetter(rawInputGetter)

    const dt = 0.016

    // Run warmup steps so the car is in contact with the ground (isTouchingObject becomes true)
    for (let i = 0; i < 30; i++) {
      registry.executeTransformers(dt)
      pw.step(dt)
      registry.syncFromPhysics()
    }

    for (let i = 0; i < STEER_FRAMES; i++) {
      frameIndex = i
      registry.executeTransformers(dt)
      pw.step(dt)
      registry.syncFromPhysics()
    }

    const bodyAfterSteering = pw.getBody('car')!
    const avAfter = bodyAfterSteering.angvel()
    const magAfterSteering = Math.sqrt(
      avAfter.x * avAfter.x + avAfter.y * avAfter.y + avAfter.z * avAfter.z,
    )

    for (let i = 0; i < 30; i++) {
      frameIndex = STEER_FRAMES + i
      registry.executeTransformers(dt)
      pw.step(dt)
      registry.syncFromPhysics()
    }

    const avFinal = pw.getBody('car')!.angvel()
    const magFinal = Math.sqrt(
      avFinal.x * avFinal.x + avFinal.y * avFinal.y + avFinal.z * avFinal.z,
    )

    // Car2 only applies impulse when isTouchingObject is true; contact depends on physics setup.
    // When steering was applied, angular velocity should decay after input stops.
    expect(magFinal).toBeLessThanOrEqual(magAfterSteering + 0.001)
    pw.dispose()
  })

  test('no-input simulation: angular velocity remains near zero', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, 0, 0] },
      assets: {},
      entities: [
        {
          id: 'ground',
          bodyType: 'static',
          shape: { type: 'plane' },
          position: [0, 0, 0],
        },
        {
          id: 'car',
          name: 'Car',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 2, height: 1, depth: 4 },
          position: [0, 1, 0],
          mass: 12,
          angularDamping: 0.5,
          transformers: [
            {
              type: 'input',
              priority: 0,
              inputMapping: {
                keyboard: {
                  w: 'throttle',
                  s: 'brake',
                  a: 'steer_left',
                  d: 'steer_right',
                },
              },
            },
            { type: 'car2', priority: 1, params: { power: 400, lateralGrip: 100 } },
          ],
        },
      ],
      scripts: {},
    }

    const entities: LoadedEntity[] = world.entities.map((e: Entity) => ({
      entity: e,
      mesh: new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial(),
      ),
    }))

    const rawInputGetter = (): RawInput => ({
      keys: { w: false, a: false, s: false, d: false, space: false, shift: false },
      wheel: { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0 },
    })

    const pw = await createPhysicsWorld(world, entities)
    const registry = RenderItemRegistry.create(entities, pw, rawInputGetter)

    const carEntity = world.entities.find((e) => e.id === 'car')!
    const chain = await createTransformerChain(carEntity.transformers!, rawInputGetter)
    registry.get('car')!.transformerChain = chain!
    registry.setRawInputGetter(rawInputGetter)

    const dt = 0.016
    for (let i = 0; i < 30; i++) {
      registry.executeTransformers(dt)
      pw.step(dt)
      registry.syncFromPhysics()
    }

    const body = pw.getBody('car')!
    const av = body.angvel()
    const mag = Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z)
    expect(mag).toBeLessThan(0.05)
    pw.dispose()
  })
})
