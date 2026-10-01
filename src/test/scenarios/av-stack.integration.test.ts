import { describe, expect, it } from 'vitest'
import {
  AV_STACK_PIPE_ID,
  applyAvStack,
  buildAvShowcaseWorld,
  AV_SHOWCASE_OBSTACLES,
  type AvStackOptions,
} from '@/test/fixtures/avStackWorld'
import {
  buildSelfDrivingCarWorld,
  buildSelfDrivingParkourBesideWorld,
  buildSelfDrivingParkourWorld,
  perturbSelfDriveCylinderTight,
  SELF_DRIVE_PARKOUR_SEGMENTS,
  SELF_DRIVE_PARKOUR_SPAWN_IDS,
  SELF_DRIVE_SPAWN,
  selfDriveGoAroundPass,
  selfDriveLongRunPass,
  selfDriveParkourBesideGatePass,
  selfDriveParkourPass,
  selfDriveParkourSegmentPass,
  selfDrivingParkourSegmentWorldOptions,
  type SelfDriveParkourSegmentId,
} from '@/test/fixtures/selfDrivingCarWorld'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'
import type { RennWorld } from '@/types/world'

type Pos = [number, number, number]

/** Fresh sim per run (defined start), sim-time-only stages → no wall-clock dependence. */
async function drive(world: RennWorld, frames: number) {
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(world, 15)
  try {
    const startPos = sim.getPosition('car') as Pos
    let maxAbsX = 0
    for (let frame = 0; frame < frames; frame++) {
      sim.runFrames(1)
      maxAbsX = Math.max(maxAbsX, Math.abs(sim.getPosition('car')[0]))
    }
    return { startPos, endPos: sim.getPosition('car') as Pos, maxAbsX }
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

function segmentWorld(
  segmentId: SelfDriveParkourSegmentId,
  start?: 'approach' | 'tight' | 'hug',
  extra: Parameters<typeof buildSelfDrivingParkourWorld>[0] = {},
  av: AvStackOptions = {},
) {
  return applyAvStack(
    buildSelfDrivingParkourWorld({ ...selfDrivingParkourSegmentWorldOptions(segmentId, start), ...extra }),
    av,
  )
}

describe('AV stack: nested pipe structure and configuration', () => {
  const world = applyAvStack(buildSelfDrivingParkourWorld(), {
    params: { cruiseSpeed: 6 },
    layerParams: { planLocal: { cruiseSpeed: 3 }, planTight: { maneuverSpeed: 2 } },
  })
  const car = world.entities!.find((e) => e.id === 'car')!

  it('nests pipes: root → sense/plan/control/safety, plan → local + tight', () => {
    const pipes = world.transformerPipes!
    const kids = (id: string) =>
      pipes[id]!.members!.filter((m) => m.kind === 'pipe').map((m) => (m as { pipeId: string }).pipeId)
    expect(kids(AV_STACK_PIPE_ID)).toEqual(['av_sense', 'av_plan', 'av_control', 'av_safety'])
    expect(kids('av_plan')).toEqual(['av_plan_local', 'av_plan_tight'])
  })

  it('flattens to the sense → plan → control → safety → actuator order', () => {
    const runtime = resolveEntityStageRuntime(world, car)
    expect(runtime.syncedStageIds()).toEqual([
      'tf_mission',
      'av_ego',
      'av_perception',
      'av_waypoint_viz',
      'av_motion_planner',
      'av_speed_planner',
      'av_supervisor',
      'av_maneuver_planner',
      'av_control_lateral',
      'av_control_longitudinal',
      'av_aeb',
      'tf_car',
    ])
  })

  it('stack params reach every stage; a nested-pipe scope overrides only its own stages', () => {
    const runtime = resolveEntityStageRuntime(world, car)
    const ids = runtime.syncedStageIds()
    const at = (stageId: string) => runtime.mergedParamsAt(ids.indexOf(stageId))!
    expect(at('av_control_lateral').cruiseSpeed).toBe(6)
    expect(at('av_aeb').cruiseSpeed).toBe(6)
    expect(at('av_motion_planner').cruiseSpeed).toBe(3)
    expect(at('av_speed_planner').cruiseSpeed).toBe(3)
    expect(at('av_maneuver_planner').cruiseSpeed).toBe(6)
    expect(at('av_maneuver_planner').maneuverSpeed).toBe(2)
    expect(at('av_supervisor').maneuverSpeed).toBeUndefined()
  })

  it('disabling a layer drops its stages from the flattened chain', () => {
    const ablated = applyAvStack(buildSelfDrivingParkourWorld(), { disable: ['aeb', 'maneuverPlanner'] })
    const ids = ablated.entities!.find((e) => e.id === 'car')!.transformers!
    expect(ids).not.toContain('av_aeb')
    expect(ids).not.toContain('av_maneuver_planner')
    expect(ids).toContain('av_motion_planner')
  })

  it('stages use simulated time only (no wall clock)', async () => {
    const { readAvStackStageCode, AV_STACK_STAGE_FILES } = await import('@/globalPipeline/avStackStagePaths')
    for (const logical of Object.keys(AV_STACK_STAGE_FILES) as (keyof typeof AV_STACK_STAGE_FILES)[]) {
      expect(readAvStackStageCode(logical)).not.toMatch(/Date\.now|performance\.now|setTimeout/)
    }
  })
})

describe('AV stack: parkour cylinder (the tight cold start the legacy stack stalls on)', () => {
  const seg = 'seg4_cylinder' as const
  const frames = SELF_DRIVE_PARKOUR_SEGMENTS[seg].frames

  it.each(['tight', 'approach'] as const)('seg4_cylinder %s start passes', async (start) => {
    const r = await drive(segmentWorld(seg, start), frames)
    expect(selfDriveParkourSegmentPass({ segmentId: seg, ...r })).toBe(true)
  })

  it('tight start: perturbation grid (24 seeds) has no stall', async () => {
    const failed: number[] = []
    for (let seed = 0; seed < 24; seed++) {
      const r = await drive(segmentWorld(seg, 'tight', perturbSelfDriveCylinderTight(seed)), frames)
      if (!selfDriveParkourSegmentPass({ segmentId: seg, ...r })) failed.push(seed)
    }
    expect(failed).toEqual([])
  }, 120_000)

  it('is deterministic: same defined start → identical end pose', async () => {
    const a = await drive(segmentWorld(seg, 'tight', perturbSelfDriveCylinderTight(2)), frames)
    const b = await drive(segmentWorld(seg, 'tight', perturbSelfDriveCylinderTight(2)), frames)
    expect(b.endPos).toEqual(a.endPos)
  })

  it('red-check: without the manoeuvre planner layer the tight start still stalls', async () => {
    const r = await drive(segmentWorld(seg, 'tight', {}, { disable: ['maneuverPlanner'] }), frames)
    expect(selfDriveParkourSegmentPass({ segmentId: seg, ...r })).toBe(false)
  })
})

describe('AV stack: parkour course and spawn matrix', () => {
  it.each(SELF_DRIVE_PARKOUR_SPAWN_IDS)('seg1_box: spawn=%s', async (spawnId) => {
    const r = await drive(applyAvStack(buildSelfDrivingParkourWorld({ spawnId })), SELF_DRIVE_PARKOUR_SEGMENTS.seg1_box.frames)
    expect(selfDriveParkourSegmentPass({ segmentId: 'seg1_box', ...r })).toBe(true)
  })

  it('seg3_sphere passes', async () => {
    const r = await drive(segmentWorld('seg3_sphere'), SELF_DRIVE_PARKOUR_SEGMENTS.seg3_sphere.frames)
    expect(selfDriveParkourSegmentPass({ segmentId: 'seg3_sphere', ...r })).toBe(true)
  })

  it.each(SELF_DRIVE_PARKOUR_SPAWN_IDS)('beside gate: spawn=%s', async (spawnId) => {
    const r = await drive(
      applyAvStack(buildSelfDrivingParkourBesideWorld({ spawnId })),
      SELF_DRIVE_PARKOUR_SEGMENTS.seg2_beside_cone.frames,
    )
    expect(selfDriveParkourBesideGatePass(r)).toBe(true)
  })

  // The legacy stack only holds the full course for `center`; offset spawns stall at the sphere leg.
  it.each(SELF_DRIVE_PARKOUR_SPAWN_IDS)('full course 1400f: spawn=%s', async (spawnId) => {
    const r = await drive(applyAvStack(buildSelfDrivingParkourWorld({ spawnId })), SELF_DRIVE_PARKOUR_SEGMENTS.full.frames)
    expect(selfDriveParkourPass(r)).toBe(true)
  }, 60_000)
})

describe('AV stack: goal behind obstacle (wanderer mission)', () => {
  it.each(['box', 'sphere', 'pyramid', 'cylinder'] as const)('goes around %s', async (obstacleShape) => {
    const r = await drive(applyAvStack(buildSelfDrivingCarWorld({ variant: 'cubeGoalBehind', obstacleShape })), 1200)
    const cubeZ = SELF_DRIVE_SPAWN.cubeCenter[2]
    expect(
      selfDriveGoAroundPass({ startPos: r.startPos, endPos: r.endPos, obstacleCenterZ: cubeZ }) ||
        selfDriveLongRunPass({
          startPos: r.startPos,
          endPos: r.endPos,
          obstacleCenterZ: cubeZ,
          goalZ: SELF_DRIVE_SPAWN.goalZ,
          maxAbsX: r.maxAbsX,
        }),
    ).toBe(true)
  })
})

describe('AV stack: colourful showcase run (example world self_drive_av)', () => {
  it('has the extra coloured obstacles and a longer mission', () => {
    const world = buildAvShowcaseWorld(buildSelfDrivingParkourWorld())
    const ids = world.entities!.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const o of AV_SHOWCASE_OBSTACLES) {
      const e = world.entities!.find((x) => x.id === o.id)!
      expect(e.material?.color).toEqual(o.color)
    }
    expect((world.transformers!.tf_mission!.params!.poses as unknown[]).length).toBe(9)
    expect(world.entities!.find((e) => e.id === 'car')!.transformerPipeStack![0]!.params!.waypoints).toHaveLength(9)
  })

  it('drives the whole course out and back without hitting anything', async () => {
    const r = await drive(buildAvShowcaseWorld(buildSelfDrivingParkourWorld()), 3600)
    // finishes the return lane near the start pose (mission ends at [0, 6])
    expect(Math.hypot(r.endPos[0], r.endPos[2] - 6)).toBeLessThan(8)
    expect(r.endPos[1]).toBeGreaterThan(-0.55)
  }, 120_000)
})
