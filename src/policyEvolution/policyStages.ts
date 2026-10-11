/**
 * Shared transformer store of the policy pipeline: ONE definition per stage (id, priority, code, params shape) that every
 * world builder references (`policyCourseParts` in episode.ts — used by the episodes, the example worlds and the maze
 * training worlds) and every test evals. The v3 chain is split into an INPUT stage (priority 4: the command / aim vector
 * from the chain, `deriveCmd`, writing `input.av.cmd`) and the DRIVE stage (priority 5: rays + net, reads `input.av.cmd`);
 * the split is behavior-preserving (see policyStages.test.ts: the old single v3 stage and the split chain produce
 * bit-identical actions). v1 / v2 stay single stages (their legacy strings are untouched, in policy.ts).
 */
import { POLICY_STAGE_CODE, POLICY_STAGE_CODE_V2, POLICY_STAGE_CODE_V3, POLICY_STAGE_ID, STAGE_CMD_HELPERS_V3, STAGE_RND } from './policy'

/** Stage id prefix of the input stage (per-copy suffix like the drive stage: `policy_input_<i>`). */
export const POLICY_INPUT_STAGE_ID = 'policy_input'
/** Runs before the drive stage (5) so its command is on the blackboard the same frame. */
export const POLICY_INPUT_STAGE_PRIORITY = 4

/**
 * Code of the input stage: the v3 command logic (`deriveCmd` over the leg-wise chain, same math / dt / refresh period / rng
 * as before, its OWN state) writing `input.av.cmd = { aim, next }` every frame. The drive stage's `input.av.cmd` path is
 * unchanged, so the split only moves the computation — the net sees the same aim / next on the same frame.
 */
export const POLICY_INPUT_STAGE_CODE =
  STAGE_RND +
  STAGE_CMD_HELPERS_V3 +
  `function transform(input, dt, params, state, api) {
  var ch = params.chain
  if (!ch || ch.length < 2) return {}
  var up = api.getUpVector(input.rotation)
  var fwd = api.vec.normalize(api.vec.projectOntoPlane(api.getForwardVector(input.rotation), up))
  var c = deriveCmd(params, state, dt, input.position, Math.abs(api.vec.dot(input.velocity, fwd)))
  var av = input.av || (input.av = {})
  av.cmd = { aim: [c[0], c[1]], next: [c[2], c[3]] }
  return {}
}
`

/** The drive stage id (unchanged: `policy_drive`, per-copy suffix like before). */
export const POLICY_DRIVE_STAGE_ID = POLICY_STAGE_ID
/** Unchanged: after the input stage, before the score stages (6) and the car2 actuator (11). */
export const POLICY_DRIVE_STAGE_PRIORITY = 5
/** Unchanged v3 net stage: rays + `input.av.cmd` (the split input stage) with the `deriveCmd` fallback for legacy worlds. */
export const POLICY_DRIVE_STAGE_CODE = POLICY_STAGE_CODE_V3

/** Legacy single-stage codes, re-exported so the tests exercise the same store the builders embed (v1 / v2 stay single stages). */
export const POLICY_V1_STAGE_CODE = POLICY_STAGE_CODE
export const POLICY_V2_STAGE_CODE = POLICY_STAGE_CODE_V2

/** Transformer config of the v3 input stage (params: chain, legEnds, offM, cmd). */
export function policyInputStage(params: Record<string, unknown>): Record<string, unknown> {
  return { type: 'custom', priority: POLICY_INPUT_STAGE_PRIORITY, enabled: true, name: 'Policy input', code: POLICY_INPUT_STAGE_CODE, params }
}

/** Transformer config of the v3 drive stage (params: w, gain, noise?, noiseSeed?). */
export function policyDriveStage(params: Record<string, unknown>): Record<string, unknown> {
  return { type: 'custom', priority: POLICY_DRIVE_STAGE_PRIORITY, enabled: true, name: 'Policy drive', code: POLICY_DRIVE_STAGE_CODE, params }
}

/** Transformer config of the legacy v1 drive stage (single stage, goals; params: w, goals, reachR, gain, ...). */
export function policyV1Stage(params: Record<string, unknown>): Record<string, unknown> {
  return { type: 'custom', priority: POLICY_DRIVE_STAGE_PRIORITY, enabled: true, name: 'Policy drive', code: POLICY_STAGE_CODE, params }
}

/** Transformer config of the legacy v2 drive stage (single stage, chain command inside; params: w, chain, cmd, gain, ...). */
export function policyV2Stage(params: Record<string, unknown>): Record<string, unknown> {
  return { type: 'custom', priority: POLICY_DRIVE_STAGE_PRIORITY, enabled: true, name: 'Policy drive', code: POLICY_STAGE_CODE_V2, params }
}
