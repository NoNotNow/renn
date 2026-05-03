/**
 * Car2 on a sleeping dynamic body: without a play avatar, executeTransformers used to skip
 * the chain when cached.isSleeping; keyboard + wantsWakeOnAnyInput must wake and apply drive.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import type { Entity, RennWorld } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { RawInput, EntityWorldPoseGetter } from '@/types/transformer'
import { createTransformerChain } from '@/transformers/transformerRegistry'
import { initRapier, createPhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'

beforeAll(async () => {
  await initRapier()
})

describe('car2 wake from sleep (integration)', () => {
  it('wakes sleeping car without avatar when a drive key is held and grounded', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: {
        gravity: [0, -9.81, 0],
        sleeping: {
          linearThreshold: 1,
          angularThreshold: 1,
          timeUntilSleep: 0,
        },
      },
      assets: {},
      entities: [
        // Thick static slab (not HalfSpace): sleeping dynamics + contact queries are reliable vs trimesh/plane quirks in tests.
        {
          id: 'ground',
          bodyType: 'static',
          shape: { type: 'box', width: 120, height: 1, depth: 120 },
          position: [0, -0.5, 0],
        },
        {
          id: 'carSleep',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 2, height: 1, depth: 4 },
          position: [0, 0.5, 0],
          rotation: [0, 0, 0],
          mass: 1,
        },
      ],
      scripts: {},
    }

    const entities: LoadedEntity[] = world.entities.map((e: Entity) => ({
      entity: e,
      mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
    }))

    /** No play avatar — car is not controlled; input still maps to entities with InputTransformer when gate.current is null. */
    const noAvatarRef = { current: null as string | null }
    let wHeld = false
    const rawInputGetter = (): RawInput => ({
      keys: {
        w: wHeld,
        a: false,
        s: false,
        d: false,
        space: false,
        shift: false,
      },
      wheel: { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0 },
    })

    const pw = await createPhysicsWorld(world, entities)
    const registry = RenderItemRegistry.create(entities, pw, rawInputGetter, noAvatarRef)
    registry.setRawInputGetter(rawInputGetter)

    const carCfg = [
      {
        type: 'input',
        priority: 0,
        inputMapping: {
          keyboard: { w: 'throttle', s: 'brake', a: 'steer_left', d: 'steer_right', space: 'jump' },
        },
      },
      {
        type: 'car2',
        priority: 1,
        params: { power: 800, steeringIntensity: 0.1, lateralGrip: 200 },
      },
    ] as const
    const chain = await createTransformerChain(
      [...carCfg],
      rawInputGetter,
      world.entities.find((e) => e.id === 'carSleep'),
      (eid) =>
        (
          registry as unknown as { getEntityWorldPoseForTransformers: EntityWorldPoseGetter }
        ).getEntityWorldPoseForTransformers(eid),
      noAvatarRef,
    )
    registry.get('carSleep')!.transformerChain = chain!
    registry.markTransformerSetDirty()

    const dt = 1 / 60
    for (let i = 0; i < 180; i++) {
      registry.executeTransformers(dt)
      pw.step(dt)
      registry.syncFromPhysics()
    }

    const body = pw.getBody('carSleep')!
    expect(body.isSleeping()).toBe(true)
    expect(pw.isEntityTouchingAny('carSleep')).toBe(true)

    wHeld = true
    registry.executeTransformers(dt)
    pw.step(dt)
    registry.syncFromPhysics()

    expect(body.isSleeping()).toBe(false)
    const lv = body.linvel()
    const planar = Math.hypot(lv.x, lv.z)
    expect(planar).toBeGreaterThan(0.02)

    pw.dispose()
  })
})
