/**
 * The "schlau" driving policy: a second, independently trained net with its OWN input layout (user request
 * 2026-10-21, grilled same day): 14 ray proximities spread evenly over the FULL 360 degrees (the v1/v2/v3 rays are
 * dense in front, 180 deg behind), the forward speed, a MOVEMENT MEMORY (4 movement vectors of the TRAVELED DISTANCE —
 * each covering up to 20 m of arc length, expressed in the car frame), and the goal vector (cos, sin, dist/60).
 * The task has only a START and a GOAL point — no waypoint chains, no carrots; the goal vector is the only guidance.
 *
 * Layout (N_IN_SCHLAU = 26):
 *   x[0..13]   rays: 1 - d/50, angle i = i * (360/14) deg, positive = left (same convention as RAY_ANGLES_DEG)
 *   x[14]      forward speed / 30
 *   x[15..22]  4 movement vectors of the traveled distance, NEWEST segment first: vector k = the displacement from
 *              s - (k+1) * 20 m to s - k * 20 m of traveled arc length (s = odometer, reversing counts), rotated
 *              into the car frame (fwd, left), divided by 20 (a 20 m straight segment reads 1.0)
 *   x[23..25]  goal vector from the car CENTER: cos(bearing), sin(bearing), min(dist / 60, 1)
 * Outputs: (steer, speed target) — the same two outputs and the same car2 actuator law as v1/v3
 * (V_FWD_MAX / V_REV_MAX / TAU_SPEED, gain = power / mass = 1200 for the shipped car).
 *
 * SHAPE COLLISION WARNING: N_IN_SCHLAU = 26 equals N_IN_V3, so a schlau genome has the v3 length formula
 * (len = 29 H + 2) and `genomeShape` / `widenHidden` / `freezeOldMask` (policy.ts) resolve it as nIn 26 — which is
 * exactly right for schlau (the helpers are layout-generic). But a schlau genome can never be told apart from a v3
 * genome by its length: run files / candidate manifests must carry `policy: 'schlau'` and schlau genomes must never
 * be shipped into the v3 worlds (the v3 stage would read the move vectors as touch flags and vice versa).
 */
import { genomeLength, hiddenOfLength, N_RAYS, NOSE_M, RAY_RANGE, STAGE_HIDDEN, STAGE_NET, STAGE_RND, TAU_SPEED, V_FWD_MAX, V_REV_MAX } from './policy'

/** Ray bearings in degrees from the heading (positive = left), evenly spread over the full 360 degrees. */
export const SCHLAU_RAY_ANGLES_DEG: readonly number[] = Array.from({ length: N_RAYS }, (_, i) => (i * 360) / N_RAYS)

/** Movement memory: the last MOVE_SEGS movement vectors of the TRAVELED DISTANCE (arc length / odometer — reversing counts too), each covering up to MOVE_SEG_M metres. */
export const MOVE_SEGS = 4
export const MOVE_SEG_M = 20
/** scale of the movement vectors: a full 20 m straight segment reads 1.0 */
export const MOVE_SCALE_M = MOVE_SEG_M

/** inputs: rays (14) | fwd speed (1) | movement memory (4 x 2) | goal (3) */
export const N_IN_SCHLAU = N_RAYS + 1 + 2 * MOVE_SEGS + 3
export const N_OUT_SCHLAU = 2
/** length of a schlau genome with `hidden` hidden units (len = H * (N_IN_SCHLAU + 3) + 2 = 29 H + 2) */
export const genomeLengthSchlau = (hidden: number) => genomeLength(N_IN_SCHLAU, hidden)
/** hidden size of a schlau genome (len = 29 H + 2); 0 = not an integer H >= 1 */
export const hiddenOfSchlau = (len: number) => hiddenOfLength(len, N_IN_SCHLAU)

/** Stage / actuator / car ids of the schlau pipeline (own namespace — never mixed with the v3 policy stages). */
export const SCHLAU_STAGE_ID = 'schlau_drive'
export const SCHLAU_ACTUATOR_ID = 'schlau_car'
export const SCHLAU_CAR_BODY_ID = 'schlau_car_body'
/** drive stage priority: before the car2 actuator (11), like the v3 drive stage (5) */
export const SCHLAU_STAGE_PRIORITY = 5
/**
 * Color of the drawn target line (api.visualizeLine, user decision 2026-10-23 — "the lila vector"): the straight
 * car NOSE -> goal line the stage draws every frame, THROUGH obstacles (no pathing), at y = 0.35 like the route
 * lines. It REPLACES the blue carrot (no lookahead vector in the schlau worlds); the route stays green -> orange.
 * The net INPUT goal vector stays center-anchored (unchanged) — this is the DRAWN line only.
 */
export const SCHLAU_GOAL_VECTOR_COLOR = '#aa44ff'

/**
 * Stage code (runs every frame before the car2 actuator). Params: `w` (genome), `goal` ([x, z], world), `gain`
 * (actuator acceleration per unit pedal, power / mass), optional `noise` (relative ray-distance noise, seeded by
 * `noiseSeed`). The movement memory lives in the stage state (`state.mh`, a [s, x, z] sample per frame keyed by the
 * traveled arc length, trimmed to the last MOVE_SEGS * MOVE_SEG_M metres); the goal vector is measured from the car
 * center (the SCORE is measured from the nose — see schlauEpisode.ts — the input vector stays center-anchored like v1).
 */
export const SCHLAU_STAGE_HEAD = `
var ANGLES = ${JSON.stringify(SCHLAU_RAY_ANGLES_DEG.map((d) => (d * Math.PI) / 180))}
var N_IN = ${N_IN_SCHLAU}, RANGE = ${RAY_RANGE}, VF = ${V_FWD_MAX}, VR = ${V_REV_MAX}, TAU = ${TAU_SPEED}${STAGE_RND}${STAGE_HIDDEN}`

export const SCHLAU_STAGE_BODY = `function transform(input, dt, params, state, api) {
  var w = params.w
  var noise = params.noise || 0
  if (state.rs === undefined) state.rs = (params.noiseSeed >>> 0) || 1
  if (!w || !input.actions) return {}
  var up = api.getUpVector(input.rotation)
  var fwd = api.vec.normalize(api.vec.projectOntoPlane(api.getForwardVector(input.rotation), up))
  var left = api.vec.normalize(api.vec.cross(up, fwd))
  var pos = input.position
  var x = new Array(N_IN)
  var hl = 4.1, hw = 2.1
  for (var i = 0; i < ANGLES.length; i++) {
    var c = Math.cos(ANGLES[i]), s = Math.sin(ANGLES[i])
    var dir = [fwd[0] * c + left[0] * s, fwd[1] * c + left[1] * s, fwd[2] * c + left[2] * s]
    var tr = Math.min(Math.abs(c) > 1e-6 ? hl / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? hw / Math.abs(s) : 1e9)
    var o = [pos[0] + dir[0] * tr, pos[1], pos[2] + dir[2] * tr]
    var r = api.raycast(o, dir, RANGE, { visualize: false })
    var dist = r.hit ? Math.min(r.distance, RANGE) : RANGE
    if (noise > 0 && r.hit) {
      // seeded multiplicative sensor noise (sum of three uniforms ~ unit variance)
      dist *= 1 + noise * (rnd(state) + rnd(state) + rnd(state) - 1.5) * 2
      dist = dist < 0 ? 0 : dist > RANGE ? RANGE : dist
    }
    x[i] = r.hit ? 1 - dist / RANGE : 0
  }
  var n = ANGLES.length
  var vf = api.vec.dot(input.velocity, fwd)
  x[n] = vf / 30
  // movement memory: the displacement over the last traveled ${MOVE_SEG_M} m in ${MOVE_SEGS} segments (newest first),
  // keyed by the traveled arc length s (odometer — reversing counts), car frame, / ${MOVE_SCALE_M} m
  var s = (state.s || 0) + Math.hypot(input.velocity[0], input.velocity[2]) * dt
  state.s = s
  var mh = state.mh || (state.mh = [[s, pos[0], pos[2]]])
  mh.push([s, pos[0], pos[2]])
  while (mh.length > 1 && mh[1][0] <= s - ${MOVE_SEGS * MOVE_SEG_M}) mh.shift()
  var sampleAt = function (sq) {
    for (var q = mh.length - 1; q >= 0; q--) if (mh[q][0] <= sq) return mh[q]
    return mh[0]
  }
  for (var k = 0; k < ${MOVE_SEGS}; k++) {
    var a = sampleAt(s - (k + 1) * ${MOVE_SEG_M}), b = sampleAt(s - k * ${MOVE_SEG_M})
    var dx = b[1] - a[1], dz = b[2] - a[2]
    x[n + 1 + 2 * k] = (dx * fwd[0] + dz * fwd[2]) / ${MOVE_SCALE_M}
    x[n + 2 + 2 * k] = (dx * left[0] + dz * left[2]) / ${MOVE_SCALE_M}
  }
  // goal vector (from the car center)
  var g = params.goal || [pos[0], pos[2]]
  // the LILA target line (user decision 2026-10-23): the straight car NOSE -> goal line, drawn EVERY frame,
  // THROUGH obstacles (no pathing), at the same y = 0.35 as the route lines. It REPLACES the blue carrot — the
  // lookahead vector is gone from the schlau worlds; ONE target line, nose-anchored like the score anchor
  api.visualizeLine([pos[0] + fwd[0] * ${NOSE_M}, 0.35, pos[2] + fwd[2] * ${NOSE_M}], [g[0], 0.35, g[1]], '${SCHLAU_GOAL_VECTOR_COLOR}')
  var gx = g[0] - pos[0], gz = g[1] - pos[2]
  var gd = Math.hypot(gx, gz) || 1
  x[n + 9] = (gx * fwd[0] + gz * fwd[2]) / gd
  x[n + 10] = (gx * left[0] + gz * left[2]) / gd
  x[n + 11] = Math.min(gd / 60, 1)
`

export const POLICY_STAGE_CODE_SCHLAU = SCHLAU_STAGE_HEAD + SCHLAU_STAGE_BODY + STAGE_NET

/** Transformer config of the schlau drive stage (params: w, goal, gain, noise?, noiseSeed?). */
export function schlauDriveStage(params: Record<string, unknown>): Record<string, unknown> {
  return { type: 'custom', priority: SCHLAU_STAGE_PRIORITY, enabled: true, name: 'Schlau drive', code: POLICY_STAGE_CODE_SCHLAU, params }
}

/** Reference forward pass of the schlau net (26 inputs); the stage computes the identical thing. */
export function policyForwardSchlau(w: ArrayLike<number>, x: ArrayLike<number>): [number, number] {
  const H = hiddenOfLength(w.length, N_IN_SCHLAU)
  if (!H) throw new Error(`schlau forward: genome of ${w.length} numbers has no integer hidden size for ${N_IN_SCHLAU} inputs`)
  const h = new Array<number>(H)
  for (let j = 0; j < H; j++) {
    let s = w[H * N_IN_SCHLAU + j]!
    for (let i = 0; i < N_IN_SCHLAU; i++) s += w[j * N_IN_SCHLAU + i]! * x[i]!
    h[j] = Math.tanh(s)
  }
  const o2 = H * N_IN_SCHLAU + H
  const out: [number, number] = [0, 0]
  for (let k = 0; k < N_OUT_SCHLAU; k++) {
    let s = w[o2 + N_OUT_SCHLAU * H + k]!
    for (let j = 0; j < H; j++) s += w[o2 + k * H + j]! * h[j]!
    out[k] = Math.tanh(s)
  }
  return out
}
