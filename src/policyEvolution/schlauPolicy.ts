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
 * exactly right for this 1-layer net (the helpers are layout-generic). But a schlau genome can never be told apart from a
 * v3 genome by its length: run files / candidate manifests must carry `policy: 'schlau'` and schlau genomes must never
 * be shipped into the v3 worlds (the v3 stage would read the move vectors as touch flags and vice versa).
 *
 * The DEEP variant ("schlau v2", schlauDeep.ts): TWO hidden layers of equal width H (len = H^2 + 30 H + 2, net tag
 * 'schlau2'). Its length set is DISJOINT from the 1-layer formula by construction (the colliding widths H = 0 / 28
 * mod 29 are forbidden), so the stage below reads the net off params.w.length alone — the same stage code drives BOTH
 * nets: a 1-layer genome computes exactly the old single-hidden-layer pass (bit-identical), a deep genome runs the
 * two-layer pass. The old worlds on disk keep their baked 1-layer-only stage code; applySchlauCandidate therefore
 * REFUSES a deep candidate for a stage without deep support (SCHLAU2_STAGE_MARKER) — re-export the worlds instead.
 */
import { genomeLength, hiddenOfLength, N_RAYS, NOSE_M, RAY_RANGE, STAGE_HIDDEN, STAGE_RND, TAU_SPEED, V_FWD_MAX, V_REV_MAX } from './policy'

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
 * The DRAWN steering-input vectors (TASK B, user note 2026-10-23 ~02:10: "visualize the path vectors"):
 * `SCHLAU_GOAL_INPUT_COLOR` — the center-anchored car -> goal vector (the SAME vector the net gets as
 * x[23..25]; drawn full length next to the lila NOSE line, 4 m apart, so the anchoring difference is visible);
 * `SCHLAU_MOVE_COLORS` — the DRIVEN TRAIL: the odometer history the 4 movement-memory inputs are computed
 * from, drawn as thin world-frame polylines (newest segment brightest; the chord-arrow fan of the first
 * draft read as wrong — user bug report 2026-10-23). The lila nose -> goal line and the score-stage route
 * stay as they are. This is the schlau DRIVE stage (not shared with maze/crux — their stage code is
 * byte-identical by construction).
 */
export const SCHLAU_GOAL_INPUT_COLOR = '#44aaff'
export const SCHLAU_MOVE_COLORS = ['#44ffcc', '#3fd9b0', '#3aad94', '#358078'] as const

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
  // drawVec: a thin arrow (shaft + two 0.8 m head whiskers); lengths < 0.05 m draw nothing (stationary memory)
  var drawVec = function (ax, az, bx, bz, color) {
    var vx = bx - ax, vz = bz - az
    var vl = Math.hypot(vx, vz)
    if (vl < 0.05) return
    api.visualizeLine([ax, 0.35, az], [bx, 0.35, bz], color)
    var ux = vx / vl, uz = vz / vl
    api.visualizeLine([bx, 0.35, bz], [bx - ux * 0.8 - uz * 0.4, 0.35, bz - uz * 0.8 + ux * 0.4], color)
    api.visualizeLine([bx, 0.35, bz], [bx - ux * 0.8 + uz * 0.4, 0.35, bz - uz * 0.8 - ux * 0.4], color)
  }
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
  // TASK B (revised, user bug report 2026-10-23 "die gefahrene Weg wird falsch dargestellt"): the DRIVEN
  // TRAIL — the odometer history itself (the samples the 4 movement-memory inputs are computed FROM), drawn
  // as one thin world-frame polyline per 20 m memory segment, newest brightest. The chord-arrow fan of the
  // first draft read as wrong; the trail IS the driven path. Zero-length steps (stationary / reversing over
  // the own trail) draw nothing.
  var tcol = ${JSON.stringify([...SCHLAU_MOVE_COLORS])}
  for (var k2 = 0; k2 < ${MOVE_SEGS}; k2++) {
    for (var i2 = 0; i2 < 8; i2++) {
      var pa = sampleAt(s - k2 * ${MOVE_SEG_M} - i2 * 2.5), pb = sampleAt(s - k2 * ${MOVE_SEG_M} - (i2 + 1) * 2.5)
      if (Math.hypot(pa[1] - pb[1], pa[2] - pb[2]) < 0.05) continue
      api.visualizeLine([pa[1], 0.35, pa[2]], [pb[1], 0.35, pb[2]], tcol[k2])
    }
  }
  // goal vector (from the car center)
  var g = params.goal || [pos[0], pos[2]]
  // the LILA target line (user decision 2026-10-23): the straight car NOSE -> goal line, drawn EVERY frame,
  // THROUGH obstacles (no pathing), at the same y = 0.35 as the route lines. It REPLACES the blue carrot — the
  // lookahead vector is gone from the schlau worlds; ONE target line, nose-anchored like the score anchor
  api.visualizeLine([pos[0] + fwd[0] * ${NOSE_M}, 0.35, pos[2] + fwd[2] * ${NOSE_M}], [g[0], 0.35, g[1]], '${SCHLAU_GOAL_VECTOR_COLOR}')
  // TASK B: the CENTER-anchored goal vector — the same vector the net gets (x[n + 9..11]) — as a blue arrow
  drawVec(pos[0], pos[2], g[0], g[1], '${SCHLAU_GOAL_INPUT_COLOR}')
  var gx = g[0] - pos[0], gz = g[1] - pos[2]
  var gd = Math.hypot(gx, gz) || 1
  x[n + 9] = (gx * fwd[0] + gz * fwd[2]) / gd
  x[n + 10] = (gx * left[0] + gz * left[2]) / gd
  x[n + 11] = Math.min(gd / 60, 1)
`

/**
 * Marker string the dual-mode stage code carries iff it supports the deep net ('schlau2'). Worlds exported
 * BEFORE the deep support bake stage code WITHOUT it: swapping a deep candidate into such a world would leave
 * the car standing silently (the old stage's hiddenOf finds no integer H and returns {}), so
 * applySchlauCandidate refuses deep candidates for marker-less stages — re-export the worlds instead.
 */
export const SCHLAU2_STAGE_MARKER = 'schlau2: deep two-hidden-layer forward'

/**
 * The schlau stage's forward pass — DUAL MODE (the v1/v2/v3 stages keep the shared single-layer STAGE_NET):
 * a 1-layer genome (len = 29 H + 2, the fallback net) computes exactly the old pass, bit-identical; a deep
 * 'schlau2' genome (len = H^2 + 30 H + 2, schlauDeep.ts) runs the two-hidden-layer pass. The length sets are
 * disjoint (the deep widths colliding with 29 H + 2 are forbidden — H ≡ 0 / 28 mod 29), so the length alone
 * decides. Deep layout: W1 (H x N_IN) | b1 | W2 (H x H, row = layer-2 unit) | b2 | W3 (2 x H) | b3.
 */
export const STAGE_NET_SCHLAU = `  var H = hiddenOf(w)
  var deep = false
  if (!H) {
    // ${SCHLAU2_STAGE_MARKER} (len = H*H + 30*H + 2): 900 + 4*(len-2) = (2H+30)^2 is a perfect square, so the root is exact
    var s2 = Math.sqrt(900 + 4 * (w.length - 2))
    var hd = (s2 - 30) / 2
    if (hd >= 1 && Math.abs(hd - Math.round(hd)) < 1e-9) { H = Math.round(hd); deep = true } else return {}
  }
  var oW3, hh
  if (deep) {
    var oW2 = H * N_IN + H
    var oB2 = oW2 + H * H
    var h1 = new Array(H)
    for (var j = 0; j < H; j++) {
      var sum = w[H * N_IN + j]
      for (var k = 0; k < N_IN; k++) sum += w[j * N_IN + k] * x[k]
      h1[j] = Math.tanh(sum)
    }
    hh = new Array(H)
    for (var j2 = 0; j2 < H; j2++) {
      var sum2 = w[oB2 + j2]
      for (var i2 = 0; i2 < H; i2++) sum2 += w[oW2 + j2 * H + i2] * h1[i2]
      hh[j2] = Math.tanh(sum2)
    }
    oW3 = oB2 + H
  } else {
    hh = new Array(H)
    for (var j3 = 0; j3 < H; j3++) {
      var sum3 = w[H * N_IN + j3]
      for (var k3 = 0; k3 < N_IN; k3++) sum3 += w[j3 * N_IN + k3] * x[k3]
      hh[j3] = Math.tanh(sum3)
    }
    oW3 = H * N_IN + H
  }
  var out = [0, 0]
  for (var q = 0; q < 2; q++) {
    var sq = w[oW3 + 2 * H + q]
    for (var m = 0; m < H; m++) sq += w[oW3 + q * H + m] * hh[m]
    out[q] = Math.tanh(sq)
  }
  state.steer = out[0]
  state.gas = out[1]
  // car2 treats exactly 0 as "no steering command"
  input.actions.steering_angle = Math.abs(out[0]) < 1e-4 ? 1e-4 : out[0]
  var vT = out[1] > 0 ? out[1] * VF : out[1] * VR
  var u = (vT - api.vec.dot(input.velocity, fwd)) / TAU / (params.gain || 1200)
  u = u > 1 ? 1 : u < -1 ? -1 : u
  input.actions.throttle = u > 0 ? u : 0
  input.actions.brake = u < 0 ? -u : 0
  return {}
}
`

export const POLICY_STAGE_CODE_SCHLAU = SCHLAU_STAGE_HEAD + SCHLAU_STAGE_BODY + STAGE_NET_SCHLAU

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
