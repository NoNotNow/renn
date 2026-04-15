/**
 * Integration: play-controlled entity still runs drive transformers when distance-culled
 * with sleepCulled (physics frozen). Rapier-sleep + cache refresh for the controlled entity
 * is covered by `wakeDynamicAndRefreshTransformCache` in `rapierPhysics.test.ts`.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import type { Entity, RennWorld } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { RawInput } from '@/types/transformer'
import { createTransformerChain } from '@/transformers/transformerRegistry'
import { initRapier, createPhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'

beforeAll(async () => {
  await initRapier()
})

describe('controlled entity transformers vs culling and sleep (integration)', () => {
  it('applies drive forces when controlled vehicle is distance-culled with sleepCulled', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      assets: {},
      entities: [
        {
          id: 'ground',
          bodyType: 'static',
          shape: { type: 'plane' },
          position: [0, 0, 0],
        },
        {
          id: 'carFar',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 2, height: 1, depth: 4 },
          position: [3500, 0.55, 0],
          rotation: [0, 0, 0],
          mass: 1,
          transformers: [
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
          ],
        },
      ],
      scripts: {},
    }

    const entities: LoadedEntity[] = world.entities.map((e: Entity) => ({
      entity: e,
      mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
    }))

    const controlledRef = { current: 'carFar' as string | null }
    const rawInputGetter = (): RawInput => ({
      keys: { w: true, a: false, s: false, d: false, space: false, shift: false },
      wheel: { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0 },
    })

    const pw = await createPhysicsWorld(world, entities)
    const registry = RenderItemRegistry.create(entities, pw, rawInputGetter, controlledRef)
    registry.setRawInputGetter(rawInputGetter)

    const carCfg = world.entities.find((e) => e.id === 'carFar')!.transformers!
    const chain = await createTransformerChain(
      carCfg,
      rawInputGetter,
      world.entities.find((e) => e.id === 'carFar'),
      (eid) => registry.getEntityWorldPoseForTransformers(eid),
      controlledRef,
    )
    registry.get('carFar')!.transformerChain = chain!

    for (let i = 0; i < 25; i++) {
      registry.executeTransformers(1 / 60)
      pw.step(1 / 60)
      registry.syncFromPhysics()
    }

    const camNearOrigin = new THREE.Vector3(0, 2, 8)
    registry.applyDistanceCulling(camNearOrigin, {
      maxDistance: 500,
      minSizeDistanceRatio: 0.02,
      sleepCulled: true,
    })

    const item = registry.get('carFar')!
    expect(item.distanceCulled).toBe(true)
    expect(item.distanceCullingPhysicsFrozen).toBe(true)

    const dt = 1 / 60
    registry.executeTransformers(dt)
    pw.step(dt)
    registry.syncFromPhysics()

    const lv = pw.getBody('carFar')!.linvel()
    const planar = Math.hypot(lv.x, lv.z)
    expect(planar).toBeGreaterThan(0.02)
    expect(item.distanceCullingPhysicsFrozen).toBe(false)

    pw.dispose()
  })
})
