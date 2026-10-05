import { afterAll, describe, expect, it } from "vitest";
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

const KNOWN_FAILING: Record<string, string> = {};

function criteria(c: MazeCase, m: ScenarioMetrics): string[] {
  const out = surviveCriteria({
    maxStalledSec: c.maxStalledSec ?? 6,
    minEndSpeed: 0,
    minChaserGap: c.minGap,
  })(m);
  if (m.goalReachT === Infinity && !c.noGoal)
    out.push(
      `goal not reached in ${c.seconds} s (closest ${f1(m.minGoalDist)} m > ${GOAL_REACH})`,
    );
  if (m.reversals > c.maxReversals)
    out.push(`${m.reversals} direction reversals > ${c.maxReversals}`);
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
      const run = KNOWN_FAILING[c.name] != null ? it.fails : it;
      run(
        `${c.name}: ${c.about}`,
        async () => {
          const spec = c.spec();
          const m = await runScenario(
            budget === "full"
              ? spec
              : { ...spec, extraParams: { ...spec.extraParams, budget } },
            c.seconds,
          );
          const failed = criteria(c, m);
          rows.push(
            `${failed.length ? "FAIL" : "PASS"} ${c.name.padEnd(22)} goal ${m.goalReachT === Infinity ? "never (min " + f1(m.minGoalDist) + " m)" : f1(m.goalReachT) + " s"} | rev ${m.reversals} (${f1(m.reverseDist)} m @ ${f1(m.reverseMeanSpeed)} m/s) | leave ${f1(m.leaveT)} s | shuttle ${m.shuttleEvents} | static ${m.staticContactFrames}f chaser ${m.chaserContactFrames}f | stalled ${f1(m.stalledSec)} s | peak ${f1(m.peakSpeed)} m/s` +
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
