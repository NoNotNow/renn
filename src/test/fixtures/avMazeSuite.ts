import { afterAll, describe, expect, it } from "vitest";
import { ARENA_CAR_ID, type ArenaBox } from "@/test/fixtures/avEvasionArena";
import { MAZE_CASES, type MazeCase } from "@/test/fixtures/avMazeCases";
import {
  GOAL_REACH,
  SCENARIO_TIMEOUT,
  SEED,
  f1,
  runScenario,
  surviveCriteria,
  type ScenarioMetrics,
} from "@/test/fixtures/avEvasionRunner";

/**
 * Deterministic maze / labyrinth scenarios (goal behind walls, dead ends, U traps, corridor chase, the maze C gate).
 * Criteria: reaches the goal within the time limit, no static / chaser contact, no shuttle (reversal count, lab shuttle episodes), not stalled.
 * Same machinery and KNOWN_FAILING mechanism as `av-evasion-scenarios.test.ts`.
 */

const KNOWN_FAILING: Record<string, string> = {
  "maze-b-rev-door":
    "revSweep (default on) removed the wall contact (0 static frames, gap 0.9) but the goal is still not reached in 12 s: the plan was made before the wall B_21 was seen (it overlaps from t 0.7 s, 24 m ahead on the plan), the re-plans drive away from the door (min goal 32 m). Early re-plan on a swept overlap regressed maze-u-trap-inside (shuttle). Before: 7 static contact frames (gap 0.0; revGuard off: 8 frames at v -5.1): the 13-segment maze reverse manoeuvre (7 m/s, rear-first) drives at the long wall B_21 (z 314.5) and the rear corner touches it at t 4.3 s. The wall is in av.points / av.smap from t 0.1 s (verified), but the guard only counts blockages inside the current segment and reacts ~1.1 m before (revGuard caps vLimit to 0.5 at t 3.95 s, the cap flickers back to 7.0 at 4.07 s and the car re-accelerates -2.7 -> -5 m/s); revGuard only cuts the contact speed (5.1 -> 2.4 m/s). The free-arc cap counts blockages inside the current segment only and the wall is missing from the costmap until too late.",
};

/** Does the segment (ax,az) -> (bx,bz) cross an axis-aligned arena box (yaw 0 / 90 deg: width / depth swap)? Slab test. */
function segCrossesBox(ax: number, az: number, bx: number, bz: number, b: ArenaBox): boolean {
  const swap = Math.abs(Math.round((b.yawDeg ?? 0) / 90)) % 2 === 1;
  const hw = (swap ? b.size[1] : b.size[0]) / 2;
  const hd = (swap ? b.size[0] : b.size[1]) / 2;
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, h] of [[ax - b.at[0], bx - ax, hw], [az - b.at[1], bz - az, hd]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p) > h) return false;
    } else {
      const ta = (-h - p) / d;
      const tb = (h - p) / d;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
      if (t0 > t1) return false;
    }
  }
  return true;
}

function criteria(c: MazeCase, m: ScenarioMetrics, pocketDepth = 0, crossX: number | null = null, fleeCross = 0): string[] {
  const out = surviveCriteria({
    maxStalledSec: c.maxStalledSec ?? 6,
    minEndSpeed: 0,
    minChaserGap: c.minGap,
  })(m).filter((x) => !(c.ignoreChasers && (x.startsWith('touched a chaser') || x.startsWith('min chaser gap'))));
  if (m.goalReachT === Infinity && !c.noGoal)
    out.push(
      `goal not reached in ${c.seconds} s (closest ${f1(m.minGoalDist)} m > ${GOAL_REACH})`,
    );
  if (m.reversals > c.maxReversals)
    out.push(`${m.reversals} direction reversals > ${c.maxReversals}`);
  if (c.maxLatAcc != null && m.peakLatAcc > c.maxLatAcc)
    out.push(`peak lateral acceleration ${f1(m.peakLatAcc)} m/s^2 > ${c.maxLatAcc}`);
  if (m.shuttleEvents > (c.maxShuttle ?? 0))
    out.push(
      `${m.shuttleEvents} shuttle / jitter episodes > ${c.maxShuttle ?? 0}`,
    );
  if (c.maxReverseDist != null && m.reverseDist > c.maxReverseDist)
    out.push(`reversed ${f1(m.reverseDist)} m > ${c.maxReverseDist}`);
  if (
    c.minReverseMeanSpeed != null &&
    m.reverseDist > 3 &&
    m.reverseMeanSpeed < c.minReverseMeanSpeed
  )
    out.push(
      `mean reverse speed ${f1(m.reverseMeanSpeed)} m/s < ${c.minReverseMeanSpeed}`,
    );
  if (c.maxLeaveSec != null && m.leaveT > c.maxLeaveSec)
    out.push(
      `left the start area (15 m) after ${f1(m.leaveT)} s > ${c.maxLeaveSec}`,
    );
  if (c.minStaticGap != null && m.minStaticGap < c.minStaticGap)
    out.push(`min static gap ${f1(m.minStaticGap)} m < ${c.minStaticGap}`);
  if (c.maxPocketDepth != null && pocketDepth > c.maxPocketDepth)
    out.push(`drove ${f1(pocketDepth)} m into the pocket > ${c.maxPocketDepth}`);
  if (c.crossing && (crossX === null || crossX < c.crossing.lo || crossX > c.crossing.hi))
    out.push(`crossed ${c.crossing.axis} = ${c.crossing.at} at ${c.crossing.axis === 'x' ? 'z' : 'x'} ${crossX === null ? 'never' : f1(crossX)} (wanted ${c.crossing.lo}..${c.crossing.hi})`);
  if (c.maxFleeCross != null && fleeCross > c.maxFleeCross)
    out.push(`${fleeCross} frames with a flee goal behind a wall (the straight line car -> flee goal crosses a wall) > ${c.maxFleeCross}`);
  if (m.shuttleMaxSec > 6)
    out.push(`shuttle episode of ${f1(m.shuttleMaxSec)} s > 6`);
  return out;
}

/** One describe per CPU budget (own test file each). */
export function defineMazeSuite(
  budget: "full" | "normal" | "eco" = "full",
): void {
  const rows: string[] = [];
  describe(`AV maze scenarios (deterministic)${budget === "full" ? "" : `, budget ${budget}`}`, () => {
    afterAll(() => {
      console.log(
        `\nAV MAZE SCENARIOS ${budget} (seed ${SEED}):\n${rows.join("\n")}\n`,
      );
    });
    for (const c of MAZE_CASES) {
      const run = c.fullBudgetOnly && budget !== "full" ? it.skip : KNOWN_FAILING[c.name] != null ? it.fails : it;
      run(
        `${c.name}: ${c.about}`,
        async () => {
          const spec = c.spec();
          let pocketDepth = 0;
          let crossX: number | null = null;
          let fleeCross = 0;
          let fleeFrames = 0;
          const pk = c.pocket;
          const m = await runScenario(
            { ...spec, extraParams: { ...spec.extraParams, budget } }, // the world car defaults to eco: the full suite pins budget "full"
            c.seconds,
            {
                  onFrame: ({ sim }) => {
                    const p = sim.getPosition(ARENA_CAR_ID);
                    // flee goal of the ego stage (state.flee, any source) against the walls of the arena: the key metric of the maze module
                    const stages = (sim.getRegistry().get(ARENA_CAR_ID)?.transformerChain?.getAll() ?? []) as unknown as { state?: { prevSpeed?: number; flee?: { x: number; z: number } | null } }[];
                    const fl = stages.find((q) => q.state && 'prevSpeed' in q.state)?.state?.flee;
                    const fr = c.fleeRegion;
                    if (fl && (!fr || (p[0] > fr[0] && p[0] < fr[1] && p[2] > fr[2] && p[2] < fr[3]))) {
                      fleeFrames++;
                      if (spec.boxes?.some((b) => segCrossesBox(p[0], p[2], fl.x, fl.z, b))) fleeCross++;
                    }
                    if (c.crossing && crossX === null && p[c.crossing.axis === 'x' ? 0 : 2] >= c.crossing.at) crossX = p[c.crossing.axis === 'x' ? 2 : 0];
                    if (!pk || p[0] < pk.x0 || p[0] > pk.x1 || p[2] < pk.z0 || p[2] > pk.z1) return;
                    const d = pk.mouth === "west" ? p[0] - pk.x0 : pk.mouth === "east" ? pk.x1 - p[0] : pk.mouth === "north" ? pk.z1 - p[2] : p[2] - pk.z0;
                    pocketDepth = Math.max(pocketDepth, d);
                  },
                },
          );
          const failed = criteria(c, m, pocketDepth, crossX, fleeCross);
          rows.push(
            `${failed.length ? "FAIL" : "PASS"} ${c.name.padEnd(22)}${pk ? ` pocket ${f1(pocketDepth)} m |` : ""} goal ${m.goalReachT === Infinity ? "never (min " + f1(m.minGoalDist) + " m)" : f1(m.goalReachT) + " s"} | rev ${m.reversals} (${f1(m.reverseDist)} m @ ${f1(m.reverseMeanSpeed)} m/s) | leave ${f1(m.leaveT)} s | shuttle ${m.shuttleEvents}${c.crossing ? ` | cross ${crossX === null ? '-' : f1(crossX)}` : ''} | fleeCross ${fleeCross}/${fleeFrames}f | static ${m.staticContactFrames}f chaser ${m.chaserContactFrames}f | gap ${f1(m.minStaticGap)} | stalled ${f1(m.stalledSec)} s | peak ${f1(m.peakSpeed)} m/s | lat ${f1(m.peakLatAcc)}` +
              (failed.length ? `\n      -> ${failed.join("; ")}` : "") +
              (m.shuttleInfo ? `\n      episodes ${m.shuttleInfo}` : "") +
              (m.firstContact
                ? `\n      first contact ${m.firstContact}`
                : "") +
              (KNOWN_FAILING[c.name]
                ? `\n      known: ${KNOWN_FAILING[c.name]}`
                : ""),
          );
          expect(failed).toEqual([]);
        },
        SCENARIO_TIMEOUT * 2,
      );
    }
  });
}
