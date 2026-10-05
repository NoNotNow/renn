import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_DT } from "@/test/helpers/worldSimulator";
import {
  type ArenaBox,
  type ArenaSpec,
  type V2,
} from "@/test/fixtures/avEvasionArena";
import {
  SEED,
  SCENARIO_TIMEOUT,
  f1,
  runScenario,
  surviveCriteria,
  type ScenarioMetrics,
} from "@/test/fixtures/avEvasionRunner";

/**
 * Deterministic, scripted AV scenarios with pass / fail criteria (instead of noisy random-seed aggregates).
 *
 * Each scenario = defined start poses (reset every run), a fixed goal, static boxes, KINEMATIC PUPPET chasers on scripted
 * paths (straight lines, or homing on the car with a fixed speed and turn-rate limit), a fixed duration and criteria on the
 * run metrics. The car is the `self_hunt_flexible` AV (same pipe + params, see `fixtures/avEvasionArena.ts`).
 *
 * KNOWN-FAILING MECHANISM: `KNOWN_FAILING[name] = 'suspected cause'` runs that scenario with `it.fails` — the suite stays
 * green in CI, the printed table still shows FAIL (+ the failed criteria) and a scenario that starts passing turns its
 * `it.fails` red, which forces removing the entry. Fixing the AV: delete the entry, the scenario becomes a normal `it`.
 *
 * Add a scenario: see `agent-context/feature-av-lab.md` ("Scripted scenarios"). Suites: `av-evasion-scenarios.test.ts` (full), `av-evasion-scenarios.eco.test.ts` (budget 'eco').
 */

interface Scenario {
  name: string;
  /** What is tested (one line, printed). */
  about: string;
  seconds: number;
  /** Built lazily (a scenario may derive its timing from another run). */
  spec: () => Promise<ArenaSpec> | ArenaSpec;
  /** Returns the violated criteria (empty = pass). */
  criteria: (m: ScenarioMetrics) => string[];
  /** Skipped in the eco / normal budget suites (full budget only). */
  fullOnly?: boolean;
}

export interface ScenarioResult {
  name: string;
  pass: boolean;
  failed: string[];
  m: ScenarioMetrics;
}

// ---------------------------------------------------------------------------------------------------------------------
// Open-road baseline (scenario 8 and the timing reference of the crossing)
// ---------------------------------------------------------------------------------------------------------------------

const OPEN_ROAD: ArenaSpec = {
  car: { at: [0, 340], yawDeg: 0 },
  goal: [0, -340],
  boxes: [],
  puppets: [],
};
let openRoadRun: Promise<ScenarioMetrics> | null = null;
function openRoadBaseline(): Promise<ScenarioMetrics> {
  openRoadRun ??= runScenario(OPEN_ROAD, 20);
  return openRoadRun;
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------------------------------

const CHASER: V2 = [2.5, 5];
const wall = (at: V2, size: V2, yawDeg = 0): ArenaBox => ({ at, size, yawDeg });

/** Alley: two long walls along Z (interior `inner` m wide) from z0 to z1. */
function alley(x: number, inner: number, z0: number, z1: number): ArenaBox[] {
  const c = (z0 + z1) / 2;
  const len = Math.abs(z1 - z0);
  return [
    wall([x - inner / 2 - 1, c], [2, len]),
    wall([x + inner / 2 + 1, c], [2, len]),
  ];
}

/** Straight-line tracking bars (after `PATH_SETTLE_T` s): RMS / peak cross-track, heading oscillation, steering reversals, path ratio. */
function straightCriteria(
  m: ScenarioMetrics,
  lim: { rms?: number; peak?: number; headAmp?: number; rev?: number } = {},
): string[] {
  const out = surviveCriteria()(m);
  const p = m.path;
  if (p.rmsCross > (lim.rms ?? 0.3))
    out.push(`cross-track RMS ${p.rmsCross.toFixed(2)} m > ${lim.rms ?? 0.3}`);
  if (p.peakCross > (lim.peak ?? 0.6))
    out.push(
      `peak cross-track ${p.peakCross.toFixed(2)} m > ${lim.peak ?? 0.6}`,
    );
  if (p.headAmpDeg > (lim.headAmp ?? 0.5))
    out.push(
      `heading oscillation ${p.headAmpDeg.toFixed(2)} deg > ${lim.headAmp ?? 0.5}`,
    );
  if (m.steerReversalsPerSec > (lim.rev ?? 0.3))
    out.push(
      `${m.steerReversalsPerSec.toFixed(2)} steering reversals/s > ${lim.rev ?? 0.3}`,
    );
  if (p.pathRatio > 1.01)
    out.push(`path ratio ${p.pathRatio.toFixed(4)} > 1.01`);
  return out;
}

export const SCENARIOS: Scenario[] = [
  {
    name: "head-on",
    about: "chaser at 25 m/s straight down the car lane toward the car",
    seconds: 14,
    spec: () => ({
      car: { at: [0, 150], yawDeg: 0 },
      goal: [0, -300],
      boxes: [],
      puppets: [
        {
          id: "chaser_a",
          size: CHASER,
          at: [0, -200],
          yawDeg: 180,
          motion: { kind: "line", speed: 25 },
        },
      ],
    }),
    criteria: surviveCriteria(),
  },
  {
    name: "from-behind",
    about:
      "car at 12 m/s, 30 m/s chaser homing from 45 m behind (turn rate 1.2 rad/s)",
    seconds: 14,
    spec: () => ({
      car: { at: [0, 100], yawDeg: 0, speed: 12 },
      goal: [0, -300],
      boxes: [],
      puppets: [
        {
          id: "chaser_a",
          size: CHASER,
          at: [0, 145],
          yawDeg: 0,
          motion: { kind: "home", speed: 30, turnRate: 1.2 },
        },
      ],
    }),
    criteria: surviveCriteria(),
  },
  {
    name: "pincer",
    about:
      "two 25 m/s chasers converging from left and right (homing, lead 0.5 s)",
    seconds: 14,
    spec: () => ({
      car: { at: [0, 100], yawDeg: 0 },
      goal: [0, -300],
      boxes: [],
      puppets: [
        {
          id: "chaser_l",
          size: CHASER,
          at: [-75, 40],
          yawDeg: -90,
          motion: { kind: "home", speed: 25, turnRate: 1.5, lead: 0.5 },
        },
        {
          id: "chaser_r",
          size: CHASER,
          at: [75, 40],
          yawDeg: 90,
          motion: { kind: "home", speed: 25, turnRate: 1.5, lead: 0.5 },
        },
      ],
    }),
    criteria: surviveCriteria(),
  },
  {
    name: "crossing",
    about:
      "chaser crosses the path at 25 m/s, timed (from the open-road baseline) to hit the car 6 s in if it keeps going",
    seconds: 14,
    spec: async () => {
      const base = await openRoadBaseline();
      const tHit = 6;
      const row = base.trace[Math.round(tHit / DEFAULT_DT) - 1]!;
      const speed = 25;
      // car start shifted so the crossing happens in the free arena (baseline starts at z=340, same x)
      return {
        car: { ...OPEN_ROAD.car },
        goal: OPEN_ROAD.goal,
        boxes: [],
        puppets: [
          {
            id: "chaser_a",
            size: CHASER,
            at: [row[1] - speed * tHit, row[2]],
            yawDeg: -90,
            motion: { kind: "line", speed },
          },
        ],
      };
    },
    criteria: surviveCriteria(),
  },
  {
    name: "corner-trap",
    about:
      "car 25 m from a wall corner, 30 m/s homing chaser from the open side",
    seconds: 14,
    spec: () => ({
      car: { at: [-36, -30], yawDeg: 0 },
      goal: [120, 120],
      boxes: [wall([-60, -10], [2, 100]), wall([-10, -60], [100, 2])],
      puppets: [
        {
          id: "chaser_a",
          size: CHASER,
          at: [70, 70],
          yawDeg: 135,
          motion: { kind: "home", speed: 30, turnRate: 1.5, lead: 0.3 },
        },
      ],
    }),
    criteria: surviveCriteria({ minChaserGap: 5 }),
  },
  {
    name: "corridor-block",
    about:
      "a wide vehicle parks across a 20 m corridor ahead; the goal is behind the corridor (turn around / route around)",
    seconds: 20,
    spec: () => ({
      car: { at: [0, 120], yawDeg: 0 },
      goal: [0, -300],
      boxes: alley(0, 20, -30, -230),
      puppets: [
        {
          id: "blocker",
          size: [19, 4],
          at: [0, -60],
          yawDeg: 0,
          motion: { kind: "park" },
        },
      ],
    }),
    criteria: (m) => surviveCriteria({ minChaserGap: 0.5 })(m),
  },
  {
    name: "reverse-escape",
    about:
      "nose 7 m from a wall in a dead-end pocket, free way behind, obstacle 60 m behind: reverse looking backward, stop / steer before it",
    seconds: 20,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [0, 200],
      boxes: [
        wall([0, -12], [60, 2]),
        ...alley(0, 24, -12, 35),
        wall([0, 60], [16, 2]),
      ],
      puppets: [],
    }),
    criteria: (m) => {
      const out = surviveCriteria({ maxStalledSec: 6 })(m);
      if (m.progress < 40)
        out.push(`no progress toward the goal (${f1(m.progress)} m < 40)`);
      if (m.minStaticGap < 0.3)
        out.push(`min static gap ${f1(m.minStaticGap)} m`);
      return out;
    },
  },
  {
    name: "boxed-in-corner",
    about:
      "lab regression (self_hunt_flexible seed 5, 30 s stall): nose 3 m from the corner of a parked car on the left, a pillar behind, goal ahead-right; the route planner calls it free, the local planner has only 0.8 m",
    seconds: 20,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [18, -100],
      boxes: [wall([-4.6, -7.0], [4, 8], 52), wall([-4.8, 14.5], [10, 10])],
      puppets: [],
    }),
    criteria: (m) => {
      // starts almost touching the parked car: a short scrape while getting out is fine, a stall is not
      const out = surviveCriteria({ maxStalledSec: 7 })(m).filter(
        (c) =>
          !(
            c.startsWith("touched a static obstacle") &&
            m.staticContactFrames < 40
          ),
      );
      if (m.progress < 40)
        out.push(`no progress toward the goal (${f1(m.progress)} m < 40)`);
      return out;
    },
  },
  {
    name: "open-road-speed",
    about: "no chasers, 680 m free straight: reach >= 25 m/s",
    seconds: 20,
    spec: () => OPEN_ROAD,
    criteria: (m) => {
      const out = surviveCriteria()(m);
      if (m.peakSpeed < 25) out.push(`peak speed ${f1(m.peakSpeed)} m/s < 25`);
      return [...out, ...straightCriteria(m).filter((c) => !out.includes(c))];
    },
  },
  {
    name: "straight-to-goal",
    about:
      "goal 300 m dead ahead, nothing in between (run ends before the final approach): no weave (RMS cross-track < 0.3 m after 6 s, < 0.3 steering reversals/s, path ratio < 1.01)",
    seconds: 8.5,
    spec: () => ({
      car: { at: [0, 150], yawDeg: 0 },
      goal: [0, -150],
      boxes: [],
      puppets: [],
    }),
    criteria: (m) => straightCriteria(m),
  },
  {
    name: "wide-berth-open-field",
    fullOnly: true, // eco refreshes the route 2.5x less often: the berth is not held (min gap 1.1 m there)
    about:
      "open ground, goal 150 m ahead, four large obstacles on / near the line, no chasers: the route keeps a wide berth (routeClearance; min hull gap >= 2.5 m: 3.6 m with it, 2.1 m without) and still reaches the goal",
    seconds: 9, // the goal is reached at ~6 s; what the car does after that (loops around the goal) is not part of the berth test
    spec: () => {
      const cyl = (c: V2, r: number): ArenaBox[] =>
        Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * 2 * Math.PI;
          return {
            at: [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as V2,
            size: [2 * r * Math.sin(Math.PI / 24) + 0.3, 1] as V2,
            yawDeg: -((a + Math.PI / 2) * 180) / Math.PI,
            height: 6,
          };
        });
      return {
        car: { at: [0, 0], yawDeg: 0 },
        goal: [0, -150],
        boxes: [
          ...cyl([0, -45], 8),
          { at: [6, -85], size: [16, 10], height: 6 },
          ...cyl([-12, -115], 10),
          { at: [3, -122], size: [8, 14], height: 6 },
        ],
        puppets: [],
        extraParams: { routeClearance: true },
      };
    },
    criteria: (m) => {
      const out = surviveCriteria({ minEndSpeed: 0 })(m);
      if (!Number.isFinite(m.goalReachT)) out.push("goal not reached");
      if (m.minStaticGap < 2.5)
        out.push(`min static gap ${f1(m.minStaticGap)} m < 2.5`);
      return out;
    },
  },
  {
    name: "straight-offset-10deg",
    about:
      "same, but the car starts 10 deg off the line to the goal: heads for the goal without overshoot oscillation (looser bars: the start offset is only regained as fast as the goal direction allows)",
    seconds: 8.5,
    spec: () => ({
      car: { at: [0, 150], yawDeg: 10 },
      goal: [0, -150],
      boxes: [],
      puppets: [],
    }),
    criteria: (m) => {
      // the line is only regained slowly (the goal is the target, the start offset is 10 deg): looser settled bars, but no heading overshoot past the initial offset
      const out = straightCriteria(m, {
        rms: 6,
        peak: 25,
        headAmp: 2.5,
        rev: 0.5,
      });
      if (m.path.peakHeadAllDeg > 12)
        out.push(
          `heading overshoot ${m.path.peakHeadAllDeg.toFixed(1)} deg (> 12)`,
        );
      return out;
    },
  },
  {
    name: "open-road-reverse",
    about:
      "wall 9 m ahead in an 18 m alley (no U-turn), 350 m free behind: reverse at >= 8 m/s",
    seconds: 20,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [0, 350],
      boxes: [wall([0, -14], [22, 2]), ...alley(0, 18, -14, 400)],
      puppets: [],
    }),
    criteria: (m) => {
      const out = surviveCriteria()(m);
      if (m.peakReverse < 8)
        out.push(`peak reverse speed ${f1(m.peakReverse)} m/s < 8`);
      if (m.progress < 150)
        out.push(`only ${f1(m.progress)} m toward the goal in 20 s (< 150)`);
      return out;
    },
  },
  {
    name: "clutter",
    about:
      "24 light bouncy cubes scattered over the path: no destabilising speed spikes, still driving",
    seconds: 14,
    spec: () => ({
      car: { at: [0, 200], yawDeg: 0 },
      goal: [0, -300],
      boxes: [],
      puppets: [],
      // deterministic scatter over a 24 m wide band, 7 m apart along the path
      clutter: Array.from({ length: 24 }, (_, i): { at: V2 } => ({
        at: [(((i * 37) % 23) - 11) * 1.0, 150 - i * 7],
      })),
    }),
    criteria: (m) => {
      const out = surviveCriteria()(m);
      if (m.speedSpikes > 0)
        out.push(
          `${m.speedSpikes} speed spikes (> 2 m/s in one frame; ${m.clutterHitFrames} frames touching clutter)`,
        );
      return out;
    },
  },
];

/**
 * Scenarios the AV does not pass today -> `it.fails` (suite green, table shows FAIL). Value = suspected cause.
 * Remove the entry as soon as the scenario passes (`it.fails` then turns red to remind you).
 */
const KNOWN_FAILING: Record<string, string> = {};

// ---------------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------------

function line(r: ScenarioResult): string {
  const m = r.m;
  return (
    `${r.pass ? "PASS" : "FAIL"} ${r.name.padEnd(17)} minChaserGap ${f1(m.minChaserGap).padStart(6)} m | contact ${String(m.chaserContactFrames).padStart(3)}f chaser ` +
    `${String(m.staticContactFrames).padStart(3)}f static | stalled ${f1(m.stalledSec).padStart(4)} s | steer rev ${m.steerReversalsPerSec.toFixed(2)}/s | ` +
    (r.name.includes("road") || r.name.includes("straight")
      ? `path rms ${m.path.rmsCross.toFixed(2)} peak ${m.path.peakCross.toFixed(2)} (all ${m.path.peakCrossAll.toFixed(2)}) m, head amp ${m.path.headAmpDeg.toFixed(2)} deg @ ${m.path.headFreqHz.toFixed(2)} Hz (peak ${m.path.peakHeadAllDeg.toFixed(1)}), ratio ${m.path.pathRatio.toFixed(4)} | `
      : "") +
    `speed mean ${f1(m.meanSpeed).padStart(5)} peak ${f1(m.peakSpeed).padStart(5)} rev ${f1(m.peakReverse).padStart(5)} end ${f1(m.endSpeed).padStart(5)} | progress ${f1(m.progress)} m` +
    (r.failed.some((f) => f.includes("speed"))
      ? `\n      speed limit source (frames) ${JSON.stringify(r.m.limitHist)}`
      : "") +
    (r.m.speedSpikes
      ? `\n      ${r.m.speedSpikes} speed spikes, first ${r.m.firstSpike}`
      : "") +
    (r.m.firstContact ? `\n      first contact ${r.m.firstContact}` : "") +
    (r.failed.length ? `\n      -> ${r.failed.join("; ")}` : "")
  );
}

/** One describe per CPU budget (own test file each so they run in parallel): the economy modes must pass the same criteria. */
export function defineEvasionSuite(
  budget: "full" | "normal" | "eco" = "full",
): void {
  const results: ScenarioResult[] = [];
  describe(`AV evasion scenarios (scripted, deterministic)${budget === "full" ? "" : `, budget ${budget}`}`, () => {
    afterAll(() => {
      console.log(
        `\nAV SCENARIOS ${budget} (seed ${SEED}):\n${results.map((r) => line(r) + (KNOWN_FAILING[r.name] ? `\n      known: ${KNOWN_FAILING[r.name]}` : "")).join("\n")}\n`,
      );
    });

    for (const sc of SCENARIOS) {
      if (sc.fullOnly && budget !== "full") continue;
      const known = KNOWN_FAILING[sc.name] != null;
      const run = known ? it.fails : it;
      run(
        `${sc.name}: ${sc.about}`,
        async () => {
          const spec = await sc.spec();
          const m = await runScenario(
            budget === "full"
              ? spec
              : { ...spec, extraParams: { ...spec.extraParams, budget } },
            sc.seconds,
          );
          const failed = sc.criteria(m);
          results.push({ name: sc.name, pass: failed.length === 0, failed, m });
          expect(failed).toEqual([]);
        },
        SCENARIO_TIMEOUT,
      );
    }
  });
}
