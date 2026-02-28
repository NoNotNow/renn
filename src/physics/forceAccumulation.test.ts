import { describe, expect, test, beforeAll, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  PhysicsWorld,
  initRapier,
} from './rapierPhysics'
import type { Entity } from '@/types/world'

beforeAll(async () => {
  await initRapier()
})

function createDynamicBox(pw: PhysicsWorld, id: string, overrides?: Partial<Entity>): void {
  const entity: Entity = {
    id,
    bodyType: 'dynamic',
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position: [0, 0, 0],
    mass: 1,
    ...overrides,
  }
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  )
  pw.addEntity(entity, mesh)
}

describe('Rapier force accumulation', () => {
  afterEach(() => {
    // No shared state; each test creates its own PhysicsWorld
  })

  test('addTorque without reset causes super-linear angular velocity growth', () => {
    const pw = new PhysicsWorld([0, 0, 0])
    createDynamicBox(pw, 'body')
    const body = pw.getBody('body')!
    const dt = 0.016
    const torqueY = 50

    const angVelMagnitudes: number[] = []
    for (let i = 0; i < 10; i++) {
      body.addTorque({ x: 0, y: torqueY, z: 0 }, true)
      pw.step(dt)
      const av = body.angvel()
      angVelMagnitudes.push(Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z))
    }

    // With persistence, torque accumulates: effective torque = (i+1)*torqueY each step
    // So angular velocity grows super-linearly. After 2 steps vs after 9 steps:
    // Early magnitude should be much smaller than later.
    expect(angVelMagnitudes[2]).toBeGreaterThan(0)
    expect(angVelMagnitudes[9]).toBeGreaterThan(angVelMagnitudes[2] * 2)
    pw.dispose()
  })

  test('resetAllForces before each applyTorque produces bounded linear growth', () => {
    const pw = new PhysicsWorld([0, 0, 0])
    createDynamicBox(pw, 'body')
    const body = pw.getBody('body')!
    const dt = 0.016
    const torqueY = 50

    const angVelMagnitudes: number[] = []
    for (let i = 0; i < 10; i++) {
      pw.resetAllForces()
      pw.applyTorqueFromTransformer('body', [0, torqueY, 0])
      pw.step(dt)
      const av = body.angvel()
      angVelMagnitudes.push(Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z))
    }

    // One torque per step: angular velocity should increase but not explode.
    expect(angVelMagnitudes[9]).toBeGreaterThan(angVelMagnitudes[0])
    const firstNonZero = angVelMagnitudes.find((v) => v > 0.01) ?? 0
    expect(angVelMagnitudes[9]).toBeLessThan(firstNonZero * 15)
    pw.dispose()
  })

  test('resetAllForces clears forces so step does not apply them', () => {
    const pw = new PhysicsWorld([0, 0, 0])
    createDynamicBox(pw, 'body')
    const body = pw.getBody('body')!

    pw.applyForce('body', 1000, 0, 0)
    pw.resetAllForces()
    pw.step(0.016)

    const linvel = body.linvel()
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z)
    expect(speed).toBeLessThan(0.1)
    pw.dispose()
  })

  test('resetAllForces clears torques on all dynamic bodies', () => {
    const pw = new PhysicsWorld([0, 0, 0])
    createDynamicBox(pw, 'a')
    createDynamicBox(pw, 'b')
    const bodyA = pw.getBody('a')!
    const bodyB = pw.getBody('b')!

    bodyA.addTorque({ x: 0, y: 100, z: 0 }, true)
    pw.applyTorque('b', 0, 100, 0)
    pw.resetAllForces()
    pw.step(0.016)

    const avA = bodyA.angvel()
    const avB = bodyB.angvel()
    const magA = Math.sqrt(avA.x * avA.x + avA.y * avA.y + avA.z * avA.z)
    const magB = Math.sqrt(avB.x * avB.x + avB.y * avB.y + avB.z * avB.z)
    expect(magA).toBeLessThan(0.1)
    expect(magB).toBeLessThan(0.1)
    pw.dispose()
  })

  test('angular velocity decays after torque application stops when using reset', () => {
    const pw = new PhysicsWorld([0, 0, 0])
    createDynamicBox(pw, 'body', { angularDamping: 0.5 })
    const body = pw.getBody('body')!
    const dt = 0.016

    for (let i = 0; i < 5; i++) {
      pw.resetAllForces()
      pw.applyTorqueFromTransformer('body', [0, 80, 0])
      pw.step(dt)
    }
    const avAfterSteering = body.angvel()
    const magAfterSteering = Math.sqrt(
      avAfterSteering.x * avAfterSteering.x +
        avAfterSteering.y * avAfterSteering.y +
        avAfterSteering.z * avAfterSteering.z,
    )

    for (let i = 0; i < 20; i++) {
      pw.resetAllForces()
      pw.step(dt)
    }
    const avFinal = body.angvel()
    const magFinal = Math.sqrt(
      avFinal.x * avFinal.x + avFinal.y * avFinal.y + avFinal.z * avFinal.z,
    )

    expect(magAfterSteering).toBeGreaterThan(0.01)
    expect(magFinal).toBeLessThan(magAfterSteering)
    pw.dispose()
  })
})
