import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAvStackGlobalBehaviorLibrary } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { readNeuralStageWeights, readNeuralStageWeightsV3, AV_STACK_STAGE_FILES } from '@/globalPipeline/avStackStagePaths'
import { createRng, gaussian } from '@/avEvolution/core/rng'
import shippedV3 from '@/policyEvolution/shippedPolicyV3.json'
import { GENOME_LENGTH, GENOME_LENGTH_V2, N_IN_V2, N_RAYS, padV1Genome, POLICY_STAGE_CODE_V2, POLICY_STAGE_CODE_V3, policyForwardV2, widenHidden } from '@/policyEvolution/policy'
import { AV_NEURAL_STAGE_FILE, neuralStageFile } from '@/policyEvolution/policyStage'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { loadLabWorld, watchValues } from '@/test/avLab/lab'
import { ARENA_CAR_ID, AV_CAR_SOURCE_WORLD, buildArenaWorld, type ArenaSpec } from '@/test/fixtures/avEvasionArena'
import { AV_CROWD_CASES, buildNeuralCrowdExampleWorld, NEURAL_CROWD_TRIGGER, withNeuralMode, type CrowdCase } from '@/test/fixtures/avCrowdCases'
import { runScenario, SCENARIO_TIMEOUT } from '@/test/fixtures/avEvasionRunner'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * Neural drive mode of the AV car (Phase 1 of agent-context/plan-policy-in-av-car.md): the shipped v2 policy follows the command the AV stack
 * builds (aim point along av.routePath), takes over in crowded surroundings (`auto`) and is watched by a watchdog.
 * Tests (a)-(f) of plan section 4 + registration / vehicle guard.
 */
const diskStage = () => readFileSync(join(process.cwd(), 'public/global/transformers/av-stack', AV_NEURAL_STAGE_FILE), 'utf8')
const crowd = (name: string): CrowdCase => AV_CROWD_CASES.find((c) => c.name === name)!
const dt = 1 / 60

/** open road: 4 x 8 car, nothing around, goal straight ahead */
const openRoad = (goalZ = -110): ArenaSpec => ({ car: { at: [0, 0], yawDeg: 0 }, goal: [0, goalZ], boxes: [], puppets: [] })

interface Probe {
  watch: string[]
  counters: string
}

async function run(spec: ArenaSpec, seconds: number): Promise<{ m: Awaited<ReturnType<typeof runScenario>>; probe: Probe; second: string[] }> {
  setAgentObservationWatchActive(true)
  const probe: Probe = { watch: [], counters: '' }
  const second: string[] = []
  const m = await runScenario(spec, seconds, {
    onFrame: ({ frame }) => {
      const w = watchValues(ARENA_CAR_ID)
      // the watch store is global: ignore what a previous run left until the stage had its first frames
      probe.watch.push(frame < 3 ? '' : String(w['av.neural'] ?? ''))
      probe.counters = String(w['av.neural.n'] ?? '')
      if (frame % 60 === 59) second.push(probe.watch[probe.watch.length - 1]!)
    },
  })
  return { m, probe, second }
}

/** car poses every 10th frame of a plain WorldSimulator run (optionally with the neural stage disabled = "no stage") */
async function poses(spec: ArenaSpec, seconds: number, dropStage = false): Promise<number[][]> {
  setAgentObservationWatchActive(true)
  const world = buildArenaWorld(spec)
  if (dropStage) world.transformers!.global_av_neural!.enabled = false
  const sim = await WorldSimulator.create(world, 15)
  const out: number[][] = []
  try {
    for (let f = 0; f < Math.round(seconds / dt); f += 10) {
      sim.runFrames(10)
      out.push([...sim.getPosition(ARENA_CAR_ID), ...Object.values(sim.getRotation(ARENA_CAR_ID))])
    }
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
  return out
}

describe('AV neural drive: library registration', () => {
  it('the stage is appended LAST to global_av_control, runs between speed planner and supervisor, mode defaults to off', () => {
    const lib = buildAvStackGlobalBehaviorLibrary()
    const control = lib.transformerPipes!.global_av_control!
    expect(control.members!.map((m) => (m.kind === 'stage' ? m.stageId : m.pipeId))).toEqual(['global_av_control_lateral', 'global_av_control_longitudinal', 'global_av_neural'])
    const st = lib.transformers!
    expect(st.global_av_neural!.priority!).toBeGreaterThan(st.global_av_speed_planner!.priority!)
    expect(st.global_av_neural!.priority!).toBeLessThan(st.global_av_supervisor!.priority!)
    expect(Object.keys(AV_STACK_STAGE_FILES)).toContain('neural')
    const defs = lib.transformerPipes!.global_av_autopilot!.paramDefs!
    expect(defs.find((d) => d.key === 'neuralMode')!.default).toBe('off')
    expect(defs.find((d) => d.key === 'neuralVMax')!.default).toBe(30)
    const w = (st.global_av_neural!.params as { w: number[] }).w
    expect(w.length).toBe(GENOME_LENGTH_V2)
    expect(readNeuralStageWeights().length).toBe(GENOME_LENGTH_V2)
  })

  it('without a promoted avNeuralWeights.json the weights are the padded v1 genome (identical function)', () => {
    const v1 = (JSON.parse(readFileSync(join(process.cwd(), 'src/policyEvolution/shippedPolicy.json'), 'utf8')) as { genome: number[] }).genome
    expect(v1.length).toBe(GENOME_LENGTH)
    let hasV2 = true
    try {
      readFileSync(join(process.cwd(), 'src/policyEvolution/avNeuralWeights.json'))
    } catch {
      hasV2 = false
    }
    if (!hasV2) expect(readNeuralStageWeights()).toEqual(padV1Genome(v1))
  })
})

describe('AV neural drive (a) off = bit-identical', () => {
  it('neuralMode off (default and explicit) gives the same poses as no stage, with a wall and a gate in the way', async () => {
    const spec = crowd('narrow-gap').spec()
    const none = await poses(spec, 8, true)
    const dflt = await poses(spec, 8)
    const off = await poses(withNeuralMode(spec, 'off'), 8)
    expect(dflt).toEqual(none)
    expect(off).toEqual(none)
    // the v3 keys absent == explicit v2 / no reversing: same poses with the net driving
    const always = await poses(withNeuralMode(spec, 'always'), 8)
    const alwaysV2 = await poses(withNeuralMode(spec, 'always', { neuralPolicy: 'v2', neuralReverse: false, neuralRevMaxM: 12 }), 8)
    expect(alwaysV2).toEqual(always)
    expect(always).not.toEqual(none)
  }, SCENARIO_TIMEOUT)

  it('a vehicle that is not ~4 x 8 never drives neural: always == off, watch says vehicle', async () => {
    const spec: ArenaSpec = { ...openRoad(-60), vehicle: { size: [2, 4], power: 340 } }
    const off = await poses(withNeuralMode(spec, 'off'), 5)
    const always = await poses(withNeuralMode(spec, 'always'), 5)
    expect(always).toEqual(off)
    const { second } = await run(withNeuralMode(spec, 'always'), 2)
    expect(second[1]).toContain('vehicle')
  }, SCENARIO_TIMEOUT)
})

describe('AV neural drive with a wider net (H = 24)', () => {
  it('a widened genome (same function) drives bit-identically to the H = 10 weights', async () => {
    const base = readNeuralStageWeights()
    const wide = widenHidden(base, 24, createRng(5))
    expect(wide.length).toBe(24 * 27 + 2)
    const a = await poses(withNeuralMode(openRoad(), 'always', { neuralWeights: base }), 6)
    const b = await poses(withNeuralMode(openRoad(), 'always', { neuralWeights: wide }), 6)
    const off = await poses(withNeuralMode(openRoad(), 'off'), 6)
    expect(b).toEqual(a)
    expect(a).not.toEqual(off)
    const { second } = await run(withNeuralMode(openRoad(), 'always', { neuralWeights: wide }), 3)
    expect(second[2]).toMatch(/^on/)
  }, SCENARIO_TIMEOUT)
})

describe('AV neural drive (b) always: the net follows the AV command', () => {
  it('reaches an open-road goal 110 m ahead, mostly under net control, below the speed cap', async () => {
    const { m, probe } = await run(withNeuralMode(openRoad(), 'always', { neuralVMax: 12 }), 30)
    expect(m.goalReachT).toBeLessThan(25)
    expect(probe.watch.filter((w) => w.startsWith('on')).length / probe.watch.length).toBeGreaterThan(0.5)
    // speed while the net drives: capped at neuralVMax 12 (+ overshoot of the pedal law); the classic car after the goal is not capped
    const onSpeeds = m.trace.filter((_, i) => probe.watch[i]?.startsWith('on')).map((r) => r[3])
    expect(Math.max(...onSpeeds)).toBeLessThan(13.5)
    expect(Math.max(...onSpeeds)).toBeGreaterThan(8)
    expect(m.staticContactFrames).toBe(0)
  }, SCENARIO_TIMEOUT)
})

describe('AV neural drive (c) auto switches on in a crowd and off after it', () => {
  it('parked-car gauntlet: on inside, off on the open road behind it; no contact', async () => {
    const spec = crowd('parked-gauntlet').spec()
    const { m, probe, second } = await run(withNeuralMode(spec, 'auto', NEURAL_CROWD_TRIGGER), 20)
    const idxOn = probe.watch.findIndex((w) => w.startsWith('on'))
    expect(idxOn).toBeGreaterThan(30) // the car starts on an open road: off first
    // z of the car at the first / last frame of net control
    const lastOn = probe.watch.map((w, i) => (w.startsWith('on') ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
    expect(m.trace[idxOn]![2]).toBeLessThan(-20)
    expect(lastOn).toBeGreaterThan(idxOn)
    expect(second[second.length - 1]).toMatch(/^(off|cooldown|locked)/) // handed back at the end of the run
    expect(m.staticContactFrames).toBe(0)
    expect(m.goalReachT).toBeLessThan(20)
  }, SCENARIO_TIMEOUT)

  it('auto with the default thresholds on an open road never switches on', async () => {
    const { probe } = await run(withNeuralMode(openRoad(-80), 'auto'), 12)
    expect(probe.watch.some((w) => w.startsWith('on'))).toBe(false)
  }, SCENARIO_TIMEOUT)
})

describe('AV neural drive (d) watchdog', () => {
  it('zero weights: the stall watchdog hands back within ~3 s, cooldown / lockout engage, the classic car still arrives', async () => {
    const zero = new Array(GENOME_LENGTH_V2).fill(0)
    const { m, probe } = await run(withNeuralMode(openRoad(-90), 'always', { neuralWeights: zero }), 90)
    const firstOn = probe.watch.findIndex((w) => w.startsWith('on'))
    const firstCool = probe.watch.findIndex((w) => w.startsWith('cooldown') || w.startsWith('off (maneuver)'))
    expect(firstOn).toBeGreaterThanOrEqual(0)
    expect(firstCool).toBeGreaterThan(firstOn)
    expect((firstCool - firstOn) * dt).toBeLessThan(3.6)
    expect(probe.watch[firstCool]).toMatch(/stall|maneuver/) // the route planner's own stuck detection may start its manoeuvre in the same second
    expect(probe.counters).toMatch(/fails [1-9]/)
    expect(m.goalReachT).toBeLessThan(90)
    expect(m.staticContactFrames).toBe(0)
  }, SCENARIO_TIMEOUT)
})

describe('AV neural drive (e) the stage computes the policy', () => {
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
  /** flat ground, identity heading (forward = +z, left = +x); rays hit at a distance that depends on the bearing */
  const api = {
    getUpVector: () => [0, 1, 0],
    getForwardVector: () => [0, 0, 1],
    vec: {
      normalize: (v: number[]) => {
        const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
        return [v[0]! / l, v[1]! / l, v[2]! / l]
      },
      projectOntoPlane: (v: number[], n: number[]) => {
        const d = dot(v, n)
        return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
      },
      cross: (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!],
      dot,
    },
    getEntity: () => ({ shape: { type: 'box', width: 4, height: 1, depth: 8 } }),
    raycast: (_o: number[], d: number[]) => (d[0]! > 0.9 ? { hit: false, distance: 0 } : { hit: true, distance: 6 + 30 * Math.abs(d[0]!) + 4 * Math.abs(d[2]!) }),
    watch: () => {},
    visualizeLine: () => {},
  }
  const compile = (code: string) => new Function(`"use strict";\n${code}\nreturn transform;`)() as (i: unknown, dt: number, p: unknown, s: unknown, a: unknown) => unknown
  const rng = createRng(11)
  const w = Array.from({ length: GENOME_LENGTH_V2 }, () => gaussian(rng) * 0.5)
  const baseInput = () => ({
    position: [0, 0.5, 0],
    rotation: [0, 0, 0, 1],
    velocity: [0.4, 0, 5],
    angularVelocity: [0, 0.2, 0],
    actions: {} as Record<string, number>,
  })

  it('actions = policyForwardV2 of the stashed inputs through the shared pedal law; aim / next follow the route rule', () => {
    const transform = compile(diskStage())
    const state: Record<string, unknown> = {}
    const route = [[0, 0], [0, 40], [30, 70]]
    const inp = { ...baseInput(), av: { ego: { speed: 5, kappa: 0, speedF: 5 }, plan: { vDesired: 8 }, vehicle: { width: 4, length: 8, height: 1 }, routePath: route, goal: { dist: 99 }, mission: { isFinal: false } } }
    transform(inp, dt, { neuralMode: 'always', w, neuralVMax: 1000 }, state, api)
    const p = state.p as { x: number[]; aim: number[]; nxt: number[] }
    expect(state.on).toBe(true)
    expect(p.x.length).toBe(N_IN_V2)
    // aim: L = clamp(8 + 0.6 * 5, 8, 40) = 11 m along the route (straight ahead), next = direction of the route 12 m beyond (still the first leg)
    expect(p.aim[0]).toBeCloseTo(0, 6)
    expect(p.aim[1]).toBeCloseTo(11, 6)
    expect(p.x[N_RAYS + 3]).toBeCloseTo(1, 6)
    expect(p.x[N_RAYS + 5]).toBeCloseTo(11 / 60, 6)
    // the memory inputs start from the classic car (steer = kappa / 0.12, gas = v / 30)
    expect(p.x[N_RAYS + 8]).toBeCloseTo(0, 9)
    expect(p.x[N_RAYS + 9]).toBeCloseTo(5 / 30, 9)
    const out = policyForwardV2(w, p.x)
    const a = inp.actions
    expect(a.steering_angle).toBeCloseTo(Math.abs(out[0]) < 1e-4 ? 1e-4 : out[0], 12)
    const vT = out[1] > 0 ? out[1] * 30 : out[1] * 8
    const u = Math.max(-1, Math.min(1, (vT - 5) / 0.05 / 1200))
    expect(a.throttle).toBeCloseTo(u > 0 ? u : 0, 12)
    expect(a.brake).toBeCloseTo(u < 0 ? -u : 0, 12)
  })

  it('the training stage (POLICY_STAGE_CODE_V2, same chain / command config) writes the same actions', () => {
    const route = [[0, 0], [0, 40], [30, 70]]
    const av = { ego: { speed: 5, kappa: 0, speedF: 5 }, plan: {}, vehicle: { width: 4, length: 8, height: 1 }, routePath: route, goal: { dist: 99 }, mission: { isFinal: false } }
    const neural = { ...baseInput(), av }
    compile(diskStage())(neural, dt, { neuralMode: 'always', w, neuralVMax: 1000 }, {}, api)
    const train = baseInput()
    // (the AV stage starts the memory inputs from the classic car: steer = kappa / 0.12 = 0, gas = v / 30)
    compile(POLICY_STAGE_CODE_V2)(train, dt, { w, chain: route, cmd: { lmin: 8, tau: 0.6, period: 0.5, noiseDeg: 0, seed: 1 }, gain: 1200 }, { steer: 0, gas: 5 / 30 }, api)
    expect(neural.actions).toEqual(train.actions)
  })

  it('the speed cap neuralVMax limits the target speed', () => {
    const route = [[0, 0], [0, 100]]
    const mk = () => ({ ...baseInput(), av: { ego: { speed: 5, kappa: 0, speedF: 5 }, plan: {}, vehicle: { width: 4, length: 8, height: 1 }, routePath: route, goal: { dist: 99 } } })
    const hot = new Array(GENOME_LENGTH_V2).fill(0)
    hot[N_IN_V2 * 10 + 10 + 10] = 0 // keep the net simple: only the output bias drives the target speed
    hot[N_IN_V2 * 10 + 10 + 2 * 10 + 1] = 5 // gas bias -> tanh(5) ~ 1 -> vT ~ 30
    const free = mk()
    compile(diskStage())(free, dt, { neuralMode: 'always', w: hot, neuralVMax: 1000 }, {}, api)
    const capped = mk()
    compile(diskStage())(capped, dt, { neuralMode: 'always', w: hot, neuralVMax: 6 }, {}, api)
    const vFree = 30 * Math.tanh(5)
    expect(free.actions.throttle).toBeCloseTo((vFree - 5) / 0.05 / 1200, 9)
    // vT = 6 vs v = 5: pedal (6 - 5) / 0.05 / 1200 = 1/60
    expect(capped.actions.throttle).toBeCloseTo(1 / 60, 9)
  })

  it('off writes nothing and publishes nothing', () => {
    const inp = { ...baseInput(), av: { ego: { speed: 5, kappa: 0 }, plan: {}, vehicle: { width: 4, length: 8 }, routePath: [[0, 0], [0, 100]] } }
    const state: Record<string, unknown> = {}
    compile(diskStage())(inp, dt, { w }, state, api)
    expect(inp.actions).toEqual({})
    expect((inp.av as Record<string, unknown>).neural).toBeUndefined()
    expect(Object.keys(state)).toEqual([])
  })
})

describe('AV neural drive (f) generated file', () => {
  it('public/global/transformers/av-stack/av-neural.js equals the generator output (npx tsx tools/policy-evolution/export-av-neural-stage.ts)', () => {
    expect(diskStage()).toBe(neuralStageFile())
  })

  it('shares the sensing / command / forward code with the training stage (verbatim) and uses simulated time only', () => {
    const disk = diskStage()
    const train = POLICY_STAGE_CODE_V2
    // head (angles, constants, rnd, deriveCmd) and the ray sensing block are the training strings
    const head = train.slice(0, train.indexOf('function transform('))
    expect(disk).toContain(head)
    const sense = train.slice(train.indexOf('  var w = params.w'), train.indexOf('  var cmd = input.av'))
    expect(disk).toContain(sense)
    expect(disk).not.toMatch(/Date\.now|performance\.now|setTimeout|Math\.random/)
  })
})

describe('av_neural_crowd example world', () => {
  const disk = () => JSON.parse(readFileSync(join(process.cwd(), 'public/exampleWorlds/av_neural_crowd/world.json'), 'utf8'))

  it('on disk equals the exporter output (regenerate: npx tsx tools/renn-mcp/export-av-neural-example-world.ts); auto mode, third-person camera', () => {
    const built = JSON.parse(JSON.stringify(buildNeuralCrowdExampleWorld(loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD }))))
    expect(disk()).toEqual(built)
    const car = disk().entities.find((e: { id: string }) => e.id === ARENA_CAR_ID)
    expect(car.transformerPipeStack[0].params.neuralMode).toBe('auto')
    expect(disk().world.camera.mode).toBe('thirdPerson')
    const t = disk().transformers
    expect(t.global_av_neural.priority).toBeGreaterThan(t.global_av_speed_planner.priority)
    expect(t.global_av_neural.priority).toBeLessThan(t.global_av_supervisor.priority)
  })

  it('the shipped world drives to its goal and the net takes over in the gauntlet', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(disk(), 15)
    let on = 0
    let reached = Infinity
    try {
      for (let f = 0; f < 22 * 60; f++) {
        sim.runFrames(1)
        const p = sim.getPosition(ARENA_CAR_ID)
        if (String(watchValues(ARENA_CAR_ID)['av.neural'] ?? '').startsWith('on')) on++
        if (reached === Infinity && Math.hypot(p[0], p[2] + 250) < 10) reached = f / 60
      }
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
    expect(on).toBeGreaterThan(60)
    expect(reached).toBeLessThan(22)
  }, SCENARIO_TIMEOUT)
})

describe('AV neural drive v3 policy (neuralPolicy v3, reversing)', () => {
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
  type Ray = (o: number[], d: number[]) => { hit: boolean; distance: number }
  const watched: Record<string, string> = {}
  /** flat ground, identity heading (forward = +z, left = +x) */
  const mkApi = (raycast: Ray) => ({
    getUpVector: () => [0, 1, 0],
    getForwardVector: () => [0, 0, 1],
    vec: {
      normalize: (v: number[]) => {
        const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
        return [v[0]! / l, v[1]! / l, v[2]! / l]
      },
      projectOntoPlane: (v: number[], n: number[]) => {
        const d = dot(v, n)
        return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
      },
      cross: (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!],
      dot,
    },
    getEntity: () => ({ shape: { type: 'box', width: 4, height: 1, depth: 8 } }),
    raycast,
    watch: (k: string, v: string) => {
      watched[k] = v
    },
    visualizeLine: () => {},
  })
  const compile = (code: string) => new Function(`"use strict";\n${code}\nreturn transform;`)() as (i: unknown, dt: number, p: unknown, s: unknown, a: unknown) => unknown
  const openApi = mkApi((_o, d) => (d[0]! > 0.9 ? { hit: false, distance: 0 } : { hit: true, distance: 6 + 30 * Math.abs(d[0]!) + 4 * Math.abs(d[2]!) }))
  /** a wall 2 m in front of the nose; behind: free (or a wall at `rearHit` m) */
  const blockedApi = (rearHit = 0) => mkApi((_o, d) => (d[2]! > 0.8 ? { hit: true, distance: 2 } : rearHit > 0 && d[2]! < -0.3 ? { hit: true, distance: rearHit } : { hit: false, distance: 0 }))
  const genome = shippedV3.genome as number[]
  const mkIn = (z: number, vz: number) => ({ position: [0, 0.5, z], rotation: [0, 0, 0, 1], velocity: [0, 0, vz], angularVelocity: [0, 0, 0], actions: {} as Record<string, number> })
  const mkAv = (z: number, speed: number) => ({
    ego: { speed, kappa: 0, speedF: speed, fwd: [0, 0, 1] },
    plan: {},
    vehicle: { width: 4, length: 8, height: 1 },
    routePath: [[0, z], [0, z + 120]],
    goal: { dist: 99 },
    mission: { isFinal: false },
  })
  /** H = 1 net: gas = tanh(3 * tanh(3 * aimCos)), steering 0: forward with the aim ahead, target speed < 0 (reverse) with the aim behind */
  const aimNet = (() => {
    const w = new Array(29).fill(0)
    w[N_RAYS + 3] = 3
    w[25 + 1] = 3
    return w
  })()

  it('the default v3 weights are the 650-number shippedPolicyV3 genome (generated json == shipped json)', () => {
    expect(genome.length).toBe(650)
    expect(readNeuralStageWeightsV3()).toEqual(genome)
    const gen = readFileSync(join(process.cwd(), 'src/policyEvolution/avNeuralWeightsV3.json'), 'utf8')
    expect(gen).toBe(readFileSync(join(process.cwd(), 'src/policyEvolution/shippedPolicyV3.json'), 'utf8'))
  })

  it('(b) stage net output == policyForward of the 650 genome through the shared pedal law', () => {
    const route = [[0, 0], [0, 40], [30, 70]]
    const inp = { ...mkIn(0, 5), av: { ...mkAv(0, 5), routePath: route } }
    const state: Record<string, unknown> = {}
    compile(diskStage())(inp, dt, { neuralMode: 'always', neuralPolicy: 'v3', wV3: genome, neuralVMax: 1000 }, state, openApi)
    const p = state.p as { x: number[]; aim: number[] }
    expect(state.on).toBe(true)
    expect(p.x.length).toBe(N_IN_V2)
    // leg-wise command: aim = clamp(8 + 0.6 * 5, 8, 40) = 11 m along the route (one leg)
    expect(p.aim[0]).toBeCloseTo(0, 6)
    expect(p.aim[1]).toBeCloseTo(11, 6)
    const out = policyForwardV2(genome, p.x)
    const a = inp.actions
    expect(a.steering_angle).toBeCloseTo(Math.abs(out[0]) < 1e-4 ? 1e-4 : out[0], 12)
    const vT = out[1] > 0 ? out[1] * 30 : out[1] * 8
    const u = Math.max(-1, Math.min(1, (vT - 5) / 0.05 / 1200))
    expect(a.throttle).toBeCloseTo(u > 0 ? u : 0, 12)
    expect(a.brake).toBeCloseTo(u < 0 ? -u : 0, 12)
  })

  it('(b2) neuralWeights override wins over wV3; v3 without any v3 weights does nothing', () => {
    const a = { ...mkIn(0, 5), av: mkAv(0, 5) }
    compile(diskStage())(a, dt, { neuralMode: 'always', neuralPolicy: 'v3', wV3: genome, neuralWeights: aimNet, neuralVMax: 1000 }, {}, openApi)
    const b = { ...mkIn(0, 5), av: mkAv(0, 5) }
    compile(diskStage())(b, dt, { neuralMode: 'always', neuralPolicy: 'v3', neuralWeights: aimNet, neuralVMax: 1000 }, {}, openApi)
    expect(a.actions).toEqual(b.actions)
    const c = { ...mkIn(0, 5), av: mkAv(0, 5) }
    compile(diskStage())(c, dt, { neuralMode: 'always', neuralPolicy: 'v3', w: genome.slice(0, 272) }, {}, openApi)
    expect(c.actions).toEqual({})
  })

  /** run the blocked-ahead situation: the car stands still at z = 0 with a wall 2 m ahead */
  const blockedRun = (params: Record<string, unknown>, rear = 0, secs = 1.6) => {
    const stage = compile(diskStage())
    const state: Record<string, unknown> = {}
    const api = blockedApi(rear)
    const dirs: string[] = []
    let triggeredAt = -1
    for (let i = 0; i < Math.round(secs * 60); i++) {
      const inp = { ...mkIn(0, 0), av: mkAv(0, 0) }
      stage(inp, dt, { neuralMode: 'always', neuralPolicy: 'v3', wV3: aimNet, neuralVMax: 1000, ...params }, state, api)
      dirs.push((inp.av as unknown as { neural: { dir: string } }).neural.dir)
      if (triggeredAt < 0 && (state.p as { revLeg?: boolean }).revLeg) triggeredAt = i
    }
    return { state, dirs, triggeredAt }
  }

  it('(d) blocked ahead + neuralReverse: a back leg 5-10 m along the heading (aim behind), dir rev, distance capped by neuralRevMaxM', () => {
    const r = blockedRun({ neuralReverse: true, neuralRevMaxM: 6 })
    const P = r.state.p as { revLeg: boolean; revChain: number[][]; revEnds: number[]; aim: number[] }
    expect(r.triggeredAt).toBeGreaterThanOrEqual(55) // after ~1 s blocked
    expect(P.revLeg).toBe(true)
    // back leg: from the car 6 m (= neuralRevMaxM < 10, rear free) straight back along its own heading, then the route again
    expect(P.revChain[0]).toEqual([0, 0])
    expect(P.revChain[1]![0]).toBeCloseTo(0, 9)
    expect(P.revChain[1]![1]).toBeCloseTo(-6, 9)
    expect(P.revEnds).toEqual([1, P.revChain.length - 1])
    expect(P.aim[1]).toBeLessThan(0) // aim point behind the car
    expect(r.dirs.slice(0, r.triggeredAt)).not.toContain('rev')
    expect(r.dirs[r.dirs.length - 1]).toBe('rev')
    const av = (r.state as { revM: number }).revM
    expect(av).toBeLessThanOrEqual(6)
    // default cap 12 m: the leg is limited to 10 m
    const r12 = blockedRun({ neuralReverse: true })
    expect((r12.state.p as { revChain: number[][] }).revChain[1]![1]).toBeCloseTo(-10, 9)
  })

  it('(d) the leg metres are counted and the route comes back after the leg', () => {
    const stage = compile(diskStage())
    const state: Record<string, unknown> = {}
    const api = blockedApi()
    let z = 0
    let maxRevM = 0
    let legSeen = false
    let legEnded = false
    for (let i = 0; i < 60 * 12; i++) {
      const blocked = i < 70
      const speed = blocked ? 0 : (state.p as { revLeg?: boolean }).revLeg ? -3 : 3
      const inp = { ...mkIn(z, speed), av: mkAv(z, speed) }
      stage(inp, dt, { neuralMode: 'always', neuralPolicy: 'v3', wV3: aimNet, neuralVMax: 1000, neuralReverse: true, neuralRevMaxM: 7 }, state, blocked ? api : openApi)
      if (!blocked) z += speed * dt
      maxRevM = Math.max(maxRevM, state.revM as number)
      const P = state.p as { revLeg: boolean; srcRp?: unknown }
      if (P.revLeg) legSeen = true
      else if (legSeen) legEnded = true
      if (z > 3) break
    }
    expect(maxRevM).toBeGreaterThan(2)
    expect(maxRevM).toBeLessThanOrEqual(7 + 1e-9)
    expect(legSeen && legEnded).toBe(true)
  })

  it('(d) neuralReverse off: never reverses, never builds a back leg', () => {
    const r = blockedRun({ neuralReverse: false }, 0, 3.5)
    expect(r.dirs).not.toContain('rev')
    expect((r.state.p as { revLeg?: boolean }).revLeg).toBeFalsy()
    // an aim-behind net would reverse; without neuralReverse the target speed is floored at 0
    const inp = { ...mkIn(0, 0), av: { ...mkAv(0, 0), routePath: [[0, 0], [0, -30]] } }
    compile(diskStage())(inp, dt, { neuralMode: 'always', neuralPolicy: 'v3', wV3: aimNet, neuralVMax: 1000, neuralReverse: false }, {}, openApi)
    expect((inp.av as unknown as { neural: { dir: string } }).neural.dir).toBe('fwd')
    expect(inp.actions.throttle).toBe(0)
    const rev = { ...mkIn(0, 0), av: { ...mkAv(0, 0), routePath: [[0, 0], [0, -30]] } }
    compile(diskStage())(rev, dt, { neuralMode: 'always', neuralPolicy: 'v3', wV3: aimNet, neuralVMax: 1000, neuralReverse: true }, {}, openApi)
    expect((rev.av as unknown as { neural: { dir: string } }).neural.dir).toBe('rev')
  })

  it('(d) rear not clear (wall 6 m behind) or neuralRevMaxM 0: no back leg', () => {
    expect(blockedRun({ neuralReverse: true }, 6).triggeredAt).toBe(-1)
    expect(blockedRun({ neuralReverse: true, neuralRevMaxM: 0 }).triggeredAt).toBe(-1)
  })

  it('(c) leg tracking + command helper in the stage == the v3 training stage (back leg chain, car walked along it)', () => {
    const stage = compile(diskStage())
    const train = compile(POLICY_STAGE_CODE_V3)
    const state: Record<string, unknown> = {}
    const api = blockedApi()
    let trainState: Record<string, unknown> | null = null
    let chain: number[][] = []
    let ends: number[] = []
    let n = 0
    let z = 0
    for (let i = 0; i < 60 * 6 && n < 25; i++) {
      const spd = trainState ? -3 : 0
      const inp = { ...mkIn(z, spd), av: mkAv(z, spd) }
      stage(inp, dt, { neuralMode: 'always', neuralPolicy: 'v3', wV3: genome, neuralVMax: 1000, neuralReverse: true, neuralRevMaxM: 8 }, state, api)
      const P = state.p as { revLeg?: boolean; revChain: number[][]; revEnds: number[]; steer: number; gas: number }
      if (trainState) {
        // identical inputs into the training stage: same chain + legEnds, memory inputs carried over
        const tin = { ...mkIn(z, spd), actions: {} as Record<string, number> }
        train(tin, dt, { w: genome, chain, legEnds: ends, cmd: { lmin: 8, tau: 0.6, period: 0.5, noiseDeg: 0, seed: 1 }, gain: 1200 }, trainState, api)
        expect(inp.actions).toEqual(tin.actions)
        n++
        z += spd * dt * 4 // walk the car back (a few mm per frame is enough to move the projection; 4x for a longer path)
        if (!P.revLeg) break
      } else if (P.revLeg) {
        chain = P.revChain
        ends = P.revEnds
        trainState = { steer: P.steer, gas: P.gas }
      }
    }
    expect(trainState).not.toBeNull()
    expect(n).toBeGreaterThan(10)
  })

  it('(e) handback (neural off) while reversing only at |v| < 1 m/s', () => {
    const stage = compile(diskStage())
    const state: Record<string, unknown> = {}
    // 'auto' with thresholds that switch on at once and off as soon as allowed (clear is always true), so only the reversing guard can hold it on
    const params = { neuralMode: 'auto', neuralPolicy: 'v3', wV3: aimNet, neuralVMax: 1000, neuralReverse: true, neuralOnOcc: 0, neuralOnT: 0.05, neuralDwell: 0, neuralOffOcc: 2, neuralOffMov: 99, neuralOffConf: 2, neuralOffT: 0.05 }
    const api = blockedApi()
    let wasOn = false
    for (let i = 0; i < 90; i++) {
      // reversing at 5 m/s: stays on
      const inp = { ...mkIn(0, -5), av: mkAv(0, -5) }
      stage(inp, dt, params, state, api)
      if (i > 12) {
        wasOn = true
        expect(state.on).toBe(true)
      }
    }
    expect(wasOn).toBe(true)
    // a stop request while reversing fast: pedal law to target speed 0 (throttle), still on
    const slow = { ...mkIn(0, -0.5), av: mkAv(0, -0.5) }
    stage(slow, dt, params, state, api)
    expect(state.on).toBe(false)
    expect((slow.av as unknown as { neural: { justOff: boolean } }).neural.justOff).toBe(true)
    // forward at the same time: no such guard (v3 forward handback is immediate once clear)
    const state2: Record<string, unknown> = {}
    let off = false
    for (let i = 0; i < 30 && !off; i++) {
      const inp = { ...mkIn(0, 5), av: mkAv(0, 5) }
      stage(inp, dt, params, state2, api)
      off = i > 5 && state2.on === false
    }
    expect(off).toBe(true)
  })

  it('(e2) a watchdog fail while reversing fast brakes to a stop first, then hands back', () => {
    const stage = compile(diskStage())
    const state: Record<string, unknown> = {}
    const params = { neuralMode: 'always', neuralPolicy: 'v3', wV3: aimNet, neuralVMax: 1000, neuralReverse: true, neuralAebT: 0.1 }
    const api = blockedApi()
    let pendSeen = false
    for (let i = 0; i < 40; i++) {
      // the AEB brakes continuously (fail 'aeb') while the car reverses at 4 m/s
      const inp = { ...mkIn(0, -4), av: { ...mkAv(0, -4), prevAeb: true } }
      stage(inp, dt, params, state, api)
      if (state.pend) {
        pendSeen = true
        expect(state.on).toBe(true)
        expect(inp.actions.throttle).toBeGreaterThan(0)
        expect(inp.actions.brake).toBe(0)
      }
    }
    expect(pendSeen).toBe(true)
    const stopped = { ...mkIn(0, -0.4), av: { ...mkAv(0, -0.4), prevAeb: true } }
    stage(stopped, dt, params, state, api)
    expect(state.on).toBe(false)
    expect((stopped.av as unknown as { neural: { why: string } }).neural.why).toBe('aeb')
  })

  it('(f) the generated file carries both heads (v2 monotone projection + v3 leg tracker) verbatim from the shared strings', () => {
    const disk = diskStage()
    expect(disk).toBe(neuralStageFile())
    expect(disk).toContain('function deriveCmd(')
    expect(disk).toContain('function deriveCmdV3(')
    expect(disk).toContain('function legInit(')
    const v3Head = POLICY_STAGE_CODE_V3.slice(POLICY_STAGE_CODE_V3.indexOf('function legInit('), POLICY_STAGE_CODE_V3.indexOf('function hiddenOf('))
    expect(disk).toContain(v3Head.replace('function deriveCmd(', 'function deriveCmdV3('))
  })
})
