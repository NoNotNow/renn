import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import type { Entity } from '@/types/world'
import { RenderItem } from './renderItem'
import {
  applyDistanceCullingPass,
  clearDistanceCullingPass,
  type DistanceCullingSleepToggleState,
} from './renderItemRegistryDistanceCulling'

function makeItem(
  id: string,
  position: [number, number, number],
  opts?: { worldSize?: number; withBody?: boolean },
): RenderItem {
  const entity: Entity = {
    id,
    bodyType: opts?.withBody ? 'dynamic' : 'static',
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position,
  }
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  )
  mesh.position.set(...position)
  const body = opts?.withBody ? ({} as never) : null
  const item = new RenderItem(entity, mesh, body)
  if (opts?.worldSize != null) {
    item.worldSize = opts.worldSize
  }
  return item
}

function mockPhysicsWorld() {
  return {
    disableBodyForCulling: vi.fn(),
    enableBodyFromCulling: vi.fn(),
  }
}

describe('renderItemRegistryDistanceCulling', () => {
  let culledSleepingForScripts: Set<string>
  let sleepToggle: DistanceCullingSleepToggleState

  beforeEach(() => {
    culledSleepingForScripts = new Set()
    sleepToggle = { lastSleepCulled: undefined }
  })

  it('hides entities beyond maxDistance and shows them when camera moves closer', () => {
    const far = makeItem('far', [1000, 0, 0], { worldSize: 1 })
    const cam = new THREE.Vector3(0, 0, 0)
    const settings = { maxDistance: 100, minSizeDistanceRatio: 0.02, sleepCulled: false }

    applyDistanceCullingPass([far], cam, settings, null, culledSleepingForScripts, sleepToggle)
    expect(far.distanceCulled).toBe(true)
    expect(far.mesh.visible).toBe(false)

    cam.set(950, 0, 0)
    applyDistanceCullingPass([far], cam, settings, null, culledSleepingForScripts, sleepToggle)
    expect(far.distanceCulled).toBe(false)
    expect(far.mesh.visible).toBe(true)
  })

  it('freezes physics and registers script skip when sleepCulled and culled', () => {
    const pw = mockPhysicsWorld()
    const dynamic = makeItem('dyn', [500, 0, 0], { worldSize: 1, withBody: true })
    applyDistanceCullingPass(
      [dynamic],
      new THREE.Vector3(0, 0, 0),
      { maxDistance: 100, minSizeDistanceRatio: 0.02, sleepCulled: true },
      pw as never,
      culledSleepingForScripts,
      sleepToggle,
    )

    expect(pw.disableBodyForCulling).toHaveBeenCalledWith('dyn')
    expect(dynamic.distanceCullingPhysicsFrozen).toBe(true)
    expect(culledSleepingForScripts.has('dyn')).toBe(true)
    expect(sleepToggle.lastSleepCulled).toBe(true)
  })

  it('does not freeze physics for static entities even when sleepCulled', () => {
    const pw = mockPhysicsWorld()
    const staticFar = makeItem('static', [500, 0, 0], { worldSize: 1, withBody: false })
    applyDistanceCullingPass(
      [staticFar],
      new THREE.Vector3(0, 0, 0),
      { maxDistance: 100, minSizeDistanceRatio: 0.02, sleepCulled: true },
      pw as never,
      culledSleepingForScripts,
      sleepToggle,
    )

    expect(pw.disableBodyForCulling).not.toHaveBeenCalled()
    expect(staticFar.distanceCullingPhysicsFrozen).toBe(false)
    expect(culledSleepingForScripts.has('static')).toBe(true)
  })

  it('unfreezes all bodies when sleepCulled toggles from true to false', () => {
    const pw = mockPhysicsWorld()
    const a = makeItem('a', [500, 0, 0], { worldSize: 1, withBody: true })
    const b = makeItem('b', [600, 0, 0], { worldSize: 1, withBody: true })
    const cam = new THREE.Vector3(0, 0, 0)
    const withSleep = { maxDistance: 100, minSizeDistanceRatio: 0.02, sleepCulled: true }
    const withoutSleep = { ...withSleep, sleepCulled: false }

    applyDistanceCullingPass([a, b], cam, withSleep, pw as never, culledSleepingForScripts, sleepToggle)
    expect(a.distanceCullingPhysicsFrozen).toBe(true)
    expect(b.distanceCullingPhysicsFrozen).toBe(true)

    pw.enableBodyFromCulling.mockClear()
    applyDistanceCullingPass([a, b], cam, withoutSleep, pw as never, culledSleepingForScripts, sleepToggle)

    expect(pw.enableBodyFromCulling).toHaveBeenCalledWith('a')
    expect(pw.enableBodyFromCulling).toHaveBeenCalledWith('b')
    expect(a.distanceCullingPhysicsFrozen).toBe(false)
    expect(b.distanceCullingPhysicsFrozen).toBe(false)
    expect(culledSleepingForScripts.size).toBe(0)
    expect(sleepToggle.lastSleepCulled).toBe(false)
  })

  it('clearDistanceCullingPass restores visibility, physics, script set, and sleep toggle', () => {
    const pw = mockPhysicsWorld()
    const item = makeItem('x', [500, 0, 0], { worldSize: 1, withBody: true })
    applyDistanceCullingPass(
      [item],
      new THREE.Vector3(0, 0, 0),
      { maxDistance: 100, minSizeDistanceRatio: 0.02, sleepCulled: true },
      pw as never,
      culledSleepingForScripts,
      sleepToggle,
    )
    culledSleepingForScripts.add('extra')

    clearDistanceCullingPass([item], pw as never, culledSleepingForScripts, sleepToggle)

    expect(pw.enableBodyFromCulling).toHaveBeenCalledWith('x')
    expect(item.distanceCullingPhysicsFrozen).toBe(false)
    expect(item.distanceCulled).toBe(false)
    expect(item.mesh.visible).toBe(true)
    expect(culledSleepingForScripts.size).toBe(0)
    expect(sleepToggle.lastSleepCulled).toBeUndefined()
  })
})
