import { describe, expect, it } from "vitest";
import { ARENA_CAR_ID } from "@/test/fixtures/avEvasionArena";
import { MAZE_CASES } from "@/test/fixtures/avMazeCases";
import { SCENARIO_TIMEOUT, runScenario } from "@/test/fixtures/avEvasionRunner";

/**
 * Opt-in maze-region param profile (av-ego `mazeProfile` / `mazeProfileHold`): the profile is published as `av.profile`
 * only while the car is confined (av.maze) and for the hold afterwards; default (no profile) and an empty profile are inert.
 */
type St = { prevSpeed?: number; t?: number; profT?: number; prevProfile?: unknown; pm?: Record<string, unknown> };
const MARK = 99;
const HOLD = 1.5;

async function run(extra: Record<string, unknown>) {
  const c = MAZE_CASES.find((x) => x.name === "mazemod-two-exits")!;
  const spec = c.spec();
  const frames: { t: number; active: boolean; profT?: number; applied: boolean }[] = [];
  const m = await runScenario({ ...spec, extraParams: { ...spec.extraParams, budget: "full", ...extra } }, c.seconds, {
    onFrame: ({ sim }) => {
      const stages = (sim.getRegistry().get(ARENA_CAR_ID)?.transformerChain?.getAll() ?? []) as unknown as { state?: St }[];
      const ego = stages.find((q) => q.state && "prevSpeed" in q.state)?.state;
      if (!ego) return;
      const applied = stages.some((q) => q.state?.pm?.maneuverRunSpeed === MARK);
      frames.push({ t: ego.t ?? 0, active: !!ego.prevProfile, profT: ego.profT, applied });
    },
  });
  return { m, frames };
}

describe("AV maze profile", () => {
  it(
    "active only while confined (+hold); default and empty profile are identical",
    async () => {
      // The arena car copies the self_hunt_flexible AV binding; clear mazeProfile explicitly so `base` is
      // "no profile configured" even if the world ships one later.
      const base = await run({ mazeProfile: undefined });
      expect(base.frames.some((f) => f.active || f.applied)).toBe(false);

      const empty = await run({ mazeProfile: {} });
      expect(JSON.stringify(empty.m)).toEqual(JSON.stringify(base.m));

      const prof = await run({ mazeProfile: { maneuverRunSpeed: MARK }, mazeProfileHold: HOLD });
      const act = prof.frames.filter((f) => f.active);
      expect(act.length).toBeGreaterThan(0);
      // never active before the car first got confined (profT is only set by av.maze)
      const firstProfT = prof.frames.find((f) => f.profT !== undefined)!;
      expect(prof.frames.filter((f) => f.t < firstProfT.t).every((f) => !f.active && !f.applied)).toBe(true);
      // active frames stay within the hold window of the last confined frame
      expect(act.every((f) => f.profT !== undefined && f.t <= f.profT + 1e-6)).toBe(true);
      // the stages merged it
      expect(prof.frames.some((f) => f.applied)).toBe(true);
      // and it drops after the hold: the first contiguous active run ends, 
      const fa = prof.frames.findIndex((f) => f.active);
      let end = fa;
      while (end + 1 < prof.frames.length && prof.frames[end + 1].active) end++;
      expect(end + 1).toBeLessThan(prof.frames.length);
      const endF = prof.frames[end];
      expect(endF.profT! - endF.t).toBeLessThan(HOLD + 0.05); // the run ended when the hold elapsed (profT = last confined frame + hold)
      expect(prof.frames[end + 1].t).toBeGreaterThan(endF.profT!);
      // (a stage's cached merge object stays in its state after the profile ends but is no longer used: without a preset the merge line is skipped)
    },
    SCENARIO_TIMEOUT * 4,
  );
});
