/* eslint-disable @typescript-eslint/no-explicit-any -- raw world JSON surgery */
import type { ArenaSpec } from '@/test/fixtures/avEvasionArena'
import type { RennWorld } from '@/types/world'

/**
 * Browser-safe core of the scripted-scenario arena world (shared by `src/test/fixtures/avEvasionArena.ts` and the maze
 * episodes in `src/avEvolution/maze/`): takes the SOURCE world (`self_hunt_flexible`, with the current global library
 * code) as a parameter instead of reading it from disk.
 */

export const AV_CAR_SOURCE_ID = 'entity_1779823253285_brtkx1p'
export const CAR_START_Y = 0.494

export function buildArenaWorldFrom(source: RennWorld, spec: ArenaSpec, envParams?: Record<string, unknown>): RennWorld {
  const src = JSON.parse(JSON.stringify(source)) as RennWorld & Record<string, any>
  const car = (src.entities as any[]).find((e) => e.id === AV_CAR_SOURCE_ID)
  if (!car) throw new Error(`${AV_CAR_SOURCE_ID} missing in the source world`)
  const rad = (d: number) => (d * Math.PI) / 180
  // keep body / shape / stage list / pipe binding; drop render-only and scripting leftovers
  for (const k of ['model', 'modelScale', 'modelRotation', 'avatar', 'scripts']) delete car[k]
  car.position = [spec.car.at[0], CAR_START_Y, spec.car.at[1]]
  car.rotation = [0, rad(spec.car.yawDeg), 0]
  const binding = car.transformerPipeStack[0]
  const threatIds = spec.puppets.filter((p) => p.threat !== false).map((p) => p.id)
  const extra = envParams ?? {}
  binding.params = spec.carParams ? { ...spec.carParams, ...extra, ...(threatIds.length ? { threatIds } : {}) } : { ...binding.params, saver: false, ...spec.extraParams, ...extra, threatIds }
  // the example car runs the 'saver' budget (saver flag + tickEvery stage scopes): scenarios keep their own budget unless they ask for `saver: true` (AV_PARAMS='{"saver":true}')
  if (binding.params.saver !== true) delete binding.scopeParams
  const veh = spec.vehicle
  if (veh) {
    if (veh.size) car.shape = { ...car.shape, width: veh.size[0], depth: veh.size[1] }
    if (veh.mass != null) car.mass = veh.mass
    if (veh.friction != null) car.friction = veh.friction
    const act = src.transformers![`${AV_CAR_SOURCE_ID}_tf1`] as any
    if (!act || act.type !== 'car2') throw new Error('car2 stage of the AV car not found')
    act.params = { ...act.params, ...(veh.power != null ? { power: veh.power } : {}), ...(veh.lateralGrip != null ? { lateralGrip: veh.lateralGrip } : {}) }
  }
  // goal: collapse the wanderer perimeter onto the goal point
  const wander = src.transformers![`${AV_CAR_SOURCE_ID}_tf10`] as any
  if (!wander || wander.type !== 'wanderer') throw new Error('wanderer stage of the AV car not found')
  wander.params = { ...wander.params, perimeter: { center: [spec.goal[0], 0, spec.goal[1]], halfExtents: [0, 0, 0] } }

  const entities: any[] = [{ id: 'ground', name: 'Ground', bodyType: 'static', shape: { type: 'plane' }, position: [0, 0, 0], rotation: [0, 0, 0], friction: spec.vehicle?.groundFriction ?? 1 }, car]
  spec.boxes.forEach((b, i) => {
    const h = b.height ?? 6
    entities.push({
      id: `arena_box_${i}`,
      name: `Box ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: b.size[0], height: h, depth: b.size[1] },
      position: [b.at[0], h / 2, b.at[1]],
      rotation: [0, rad(b.yawDeg ?? 0), 0],
      friction: 0.5,
    })
  })
  for (const p of spec.puppets) {
    entities.push({
      id: p.id,
      name: p.id,
      bodyType: 'kinematic',
      shape: { type: 'box', width: p.size[0], height: 1.5, depth: p.size[1] },
      position: [p.at[0], 0.75, p.at[1]],
      rotation: [0, rad(p.yawDeg), 0],
    })
  }
  ;(spec.clutter ?? []).forEach((c, i) => {
    const s = c.size ?? 1.2
    entities.push({
      id: `clutter_${i}`,
      name: `Clutter ${i}`,
      bodyType: 'dynamic',
      shape: { type: 'box', width: s, height: s, depth: s },
      position: [c.at[0], s / 2 + 0.02, c.at[1]],
      rotation: [0, 0, 0],
      mass: c.mass ?? 0.3,
      restitution: c.restitution ?? 0.8,
      friction: 0.4,
    })
  })
  src.entities = entities as RennWorld['entities']
  src.scripts = {}
  src.groups = []
  return src
}
