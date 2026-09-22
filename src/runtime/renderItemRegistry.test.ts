import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { RenderItemRegistry } from './renderItemRegistry'
import type { SimulationFramePort } from './renderItemRegistryPorts'
import type { Entity } from '@/types/world'
import { DEFAULT_DISTANCE_CULLING } from '@/types/world'
import { initVisualBaseFromShape } from '@/utils/visualBaseQuaternion'
import { eulerToQuaternion } from '@/utils/rotationUtils'

describe('renderItemRegistryPorts', () => {
  it('RenderItemRegistry satisfies SimulationFramePort', () => {
    const entity: Entity = { id: 'e', position: [0, 0, 0] }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    const port: SimulationFramePort = RenderItemRegistry.create([{ entity, mesh }], null)
    expect(port.getPosition('e')).toEqual([0, 0, 0])
  })

  it('SimulationFramePort frame-ordering sequence matches runSceneFrame contract', () => {
    const calls: string[] = []
    const stub: SimulationFramePort = {
      setRawInputGetter: () => {
        calls.push('rawInput')
      },
      executeTransformers: () => {
        calls.push('transformers')
      },
      syncFromPhysics: () => {
        calls.push('sync')
      },
      applyInterpolatedVisualPoses: () => {
        calls.push('interpolate')
      },
      applyDistanceCulling: () => {
        calls.push('cull')
      },
      clearDistanceCulling: () => {
        calls.push('clearCull')
      },
      culledSleepingEntityIds: new Set(),
      getPosition: () => null,
      getForwardVectorInto: () => false,
      getCar2WheelAngle: () => null,
    }

    stub.setRawInputGetter(() => null)
    stub.executeTransformers(1 / 60)
    stub.syncFromPhysics()
    stub.applyInterpolatedVisualPoses(0.5)
    stub.applyDistanceCulling(new THREE.Vector3(), DEFAULT_DISTANCE_CULLING)

    expect(calls).toEqual(['rawInput', 'transformers', 'sync', 'interpolate', 'cull'])
  })

  it('getRotationAsQuaternion strips visual base while mesh quaternion includes it (plane)', () => {
    const entity: Entity = {
      id: 'floor',
      shape: { type: 'plane' },
      rotation: [0, 0, 0],
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial())
    initVisualBaseFromShape(mesh, 'plane')
    const registry = RenderItemRegistry.create([{ entity, mesh }], null)
    registry.setRotation('floor', [0, 0.5, 0])

    expect(registry.getRotation('floor')).toEqual([0, 0.5, 0])

    const logical = registry.getRotationAsQuaternion('floor')!
    const expectedLogical = eulerToQuaternion([0, 0.5, 0])
    expect(logical.x).toBeCloseTo(expectedLogical.x)
    expect(logical.y).toBeCloseTo(expectedLogical.y)
    expect(logical.z).toBeCloseTo(expectedLogical.z)
    expect(logical.w).toBeCloseTo(expectedLogical.w)
    expect(mesh.quaternion.equals(logical)).toBe(false)
  })

  it('setPosition and getPosition round-trip without physics body', () => {
    const entity: Entity = { id: 'static', position: [1, 2, 3] }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    const registry = RenderItemRegistry.create([{ entity, mesh }], null)

    registry.setPosition('static', [4, 5, 6])
    expect(registry.getPosition('static')).toEqual([4, 5, 6])
    expect(mesh.position.x).toBe(4)
  })
})
