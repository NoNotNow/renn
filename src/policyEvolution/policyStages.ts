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

// --- touch escape (between the input and the drive stage) --------------------------------------------------------------------------

/** Stage id prefix of the touch-escape stage (per-copy suffix like the others: `policy_escape_<i>`). */
export const POLICY_ESCAPE_STAGE_ID = 'policy_escape'
/** Between the input stage (4, writes the chain command) and the drive stage (5, reads it): the escape wins for its hold. */
export const POLICY_ESCAPE_STAGE_PRIORITY = 4.5
/** s the escape aim owns `input.av.cmd` after the last lateral touch (sim time, this stage's own clock). */
export const POLICY_ESCAPE_HOLD_S = 0.3
/** m the escape aim lies from the car along the escape direction; `next` lies ESCAPE_NEXT_M beyond it (the drive stage's turn hint). */
export const POLICY_ESCAPE_AIM_M = 30
export const POLICY_ESCAPE_NEXT_M = 12

/**
 * Code of the touch-escape stage: on a lateral contact (`input.environment.isTouchingSide`) the touch point is localized by a
 * short ray sweep around the hull (12 horizontal directions from just outside the hull edge, hull half length 4.1 / half width
 * 2.1 like the drive stage's ray origins, max 1.5 m — only a body actually touching wins; no hit: the spot half a vehicle
 * length ahead in the driving direction). For POLICY_ESCAPE_HOLD_S the command is OVERRIDDEN with the point POLICY_ESCAPE_AIM_M
 * from the car in the direction OPPOSITE the touch point (`next` ESCAPE_NEXT_M beyond, like the chain command's turn hint),
 * refreshed while the touch persists; after the hold the stage stops writing and the input stage's command of the same frame
 * flows to the drive stage untouched (input 4 -> escape 4.5 -> drive 5). Watch 'policy.escape': 'on <aim> d <dir> <remaining> s'
 * every active frame, 'off' once at the end.
 */
export const POLICY_ESCAPE_STAGE_CODE = `
var ESCAPE_RAYS = 12
var ESCAPE_RAY_M = 1.5
function transform(input, dt, params, state, api) {
  if (state.t === undefined) state.t = 0
  state.t += dt
  var touching = !!(input.environment && input.environment.isTouchingSide)
  if (touching) {
    var pos = input.position
    var up = api.getUpVector(input.rotation)
    var fwd = api.vec.normalize(api.vec.projectOntoPlane(api.getForwardVector(input.rotation), up))
    var left = api.vec.normalize(api.vec.cross(up, fwd))
    var hl = 4.1, hw = 2.1
    var px = 0
    var pz = 0
    var best = Infinity
    for (var ri = 0; ri < ESCAPE_RAYS; ri++) {
      var dx = Math.cos((ri * 2 * Math.PI) / ESCAPE_RAYS)
      var dz = Math.sin((ri * 2 * Math.PI) / ESCAPE_RAYS)
      // distance from the centre to the hull edge along the ray (box frame: fwd = length axis, left = width axis)
      var df = Math.abs(dx * fwd[0] + dz * fwd[2])
      var dl = Math.abs(dx * left[0] + dz * left[2])
      var edge = Math.min(df > 1e-6 ? hl / df : 1e9, dl > 1e-6 ? hw / dl : 1e9) + 0.05
      var rr = api.raycast([pos[0] + dx * edge, pos[1], pos[2] + dz * edge], [dx, 0, dz], ESCAPE_RAY_M, { visualize: false })
      if (!rr.hit || rr.entityId === input.entityId) continue
      if (edge + rr.distance < best) {
        best = edge + rr.distance
        px = pos[0] + dx * (edge + rr.distance)
        pz = pos[2] + dz * (edge + rr.distance)
      }
    }
    if (best === Infinity) {
      var g = api.vec.dot(input.velocity, fwd) < -0.5 ? -1 : 1
      px = pos[0] + fwd[0] * g * (hl + 0.3)
      pz = pos[2] + fwd[2] * g * (hl + 0.3)
    }
    var ex = pos[0] - px
    var ez = pos[2] - pz
    var el = Math.sqrt(ex * ex + ez * ez)
    if (el > 1e-3) state.esc = { dx: ex / el, dz: ez / el, until: state.t + ${POLICY_ESCAPE_HOLD_S} }
  }
  var esc = state.esc
  if (esc && state.t < esc.until) {
    var p2 = input.position
    var ax = p2[0] + esc.dx * ${POLICY_ESCAPE_AIM_M}
    var az = p2[2] + esc.dz * ${POLICY_ESCAPE_AIM_M}
    var av = input.av || (input.av = {})
    av.cmd = { aim: [ax, az], next: [p2[0] + esc.dx * (${POLICY_ESCAPE_AIM_M} + ${POLICY_ESCAPE_NEXT_M}), p2[2] + esc.dz * (${POLICY_ESCAPE_AIM_M} + ${POLICY_ESCAPE_NEXT_M})] }
    api.watch('policy.escape', 'on ' + Math.round(ax) + ',' + Math.round(az) + ' d ' + esc.dx.toFixed(2) + ',' + esc.dz.toFixed(2) + ' ' + (esc.until - state.t).toFixed(2) + ' s')
    state.shown = 1
  } else if (state.esc) {
    state.esc = null
    if (state.shown) {
      state.shown = 0
      api.watch('policy.escape', 'off')
    }
  }
  return {}
}
`

/** Transformer config of the touch-escape stage (no params: the hull dims match the drive stage's hardcoded ray origins). */
export function policyEscapeStage(): Record<string, unknown> {
  return { type: 'custom', priority: POLICY_ESCAPE_STAGE_PRIORITY, enabled: true, name: 'Policy escape', code: POLICY_ESCAPE_STAGE_CODE, params: {} }
}
