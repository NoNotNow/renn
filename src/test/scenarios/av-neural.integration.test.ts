import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAvStackGlobalBehaviorLibrary } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { readNeuralStageWeights, AV_STACK_STAGE_FILES } from '@/globalPipeline/avStackStagePaths'
import { createRng, gaussian } from '@/avEvolution/core/rng'
import { GENOME_LENGTH, GENOME_LENGTH_V2, N_IN_V2, N_RAYS, padV1Genome, POLICY_STAGE_CODE_V2, policyForwardV2, widenHidden } from '@/policyEvolution/policy'
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
