/**
 * Neural driving policy as a plain number vector: `inputs -> tanh(W1 x + b1) -> tanh(W2 h + b2) -> (steer, gas)`.
 * The genome IS the flat weight vector; the only code is one custom transformer stage (a matrix product in front of the
 * unchanged `car2` actuator). No planner, no state machine.
 */

/** Ray bearings in degrees from the heading (positive = left); dense in front, sparse behind. */
export const RAY_ANGLES_DEG = [0, 10, -10, 20, -20, 35, -35, 55, -55, 80, -80, 120, -120, 180] as const
export const RAY_RANGE = 50

/** inputs: rays, fwd speed, side speed, yaw rate, goal (fwd, left, dist), previous steer + gas */
export const N_RAYS = RAY_ANGLES_DEG.length
export const N_IN = N_RAYS + 3 + 3 + 2
export const N_HIDDEN = 10
export const N_OUT = 2
/** layout: W1 (hidden x in), b1, W2 (out x hidden), b2 */
export const GENOME_LENGTH = N_HIDDEN * N_IN + N_HIDDEN + N_OUT * N_HIDDEN + N_OUT

/**
 * The second output is a TARGET SPEED, not a raw pedal: the car2 actuator turns the pedal into an acceleration of
 * `power / mass` (1200 m/s^2 for the shipped car), so a raw pedal is a bang-bang switch. One fixed proportional law
 * `pedal = (vTarget - v) / TAU_SPEED / gain` (the same relation av_control_longitudinal uses) puts the pedal on a usable scale.
 */
export const V_FWD_MAX = 30
export const V_REV_MAX = 8
export const TAU_SPEED = 0.05

export const POLICY_STAGE_ID = 'policy_drive'
export const POLICY_ACTUATOR_ID = 'policy_car'

/** Reference forward pass (the stage below computes the identical thing inside the transformer chain). */
export function policyForward(w: ArrayLike<number>, x: ArrayLike<number>): [number, number] {
  const h = new Array<number>(N_HIDDEN)
  for (let j = 0; j < N_HIDDEN; j++) {
    let s = w[N_HIDDEN * N_IN + j]!
    for (let i = 0; i < N_IN; i++) s += w[j * N_IN + i]! * x[i]!
    h[j] = Math.tanh(s)
  }
  const o2 = N_HIDDEN * N_IN + N_HIDDEN
  const out: [number, number] = [0, 0]
  for (let k = 0; k < N_OUT; k++) {
    let s = w[o2 + N_OUT * N_HIDDEN + k]!
    for (let j = 0; j < N_HIDDEN; j++) s += w[o2 + k * N_HIDDEN + j]! * h[j]!
    out[k] = Math.tanh(s)
  }
  return out
}

/**
 * Stage code (runs every frame before the car2 actuator). Params: `w` (genome), `goals` ([[x, z], ...]), `reachR`, `gain` (actuator acceleration per unit pedal, power / mass).
 * The target is the first goal not yet within `reachR`; goals are passed in order and never revisited.
 */
export const POLICY_STAGE_CODE = `
var ANGLES = ${JSON.stringify(RAY_ANGLES_DEG.map((d) => (d * Math.PI) / 180))}
var N_IN = ${N_IN}, H = ${N_HIDDEN}, RANGE = ${RAY_RANGE}, VF = ${V_FWD_MAX}, VR = ${V_REV_MAX}, TAU = ${TAU_SPEED}
function transform(input, dt, params, state, api) {
  var w = params.w
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
    var t = Math.min(Math.abs(c) > 1e-6 ? hl / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? hw / Math.abs(s) : 1e9)
    var o = [pos[0] + dir[0] * t, pos[1], pos[2] + dir[2] * t]
    var r = api.raycast(o, dir, RANGE, { visualize: false })
    x[i] = r.hit ? 1 - Math.min(r.distance, RANGE) / RANGE : 0
  }
  var n = ANGLES.length
  x[n] = api.vec.dot(input.velocity, fwd) / 30
  x[n + 1] = api.vec.dot(input.velocity, left) / 10
  x[n + 2] = api.vec.dot(input.angularVelocity, up) / 2
  var goals = params.goals || []
  var reachR = params.reachR != null ? params.reachR : 8
  if (state.gi === undefined) state.gi = 0
  while (state.gi < goals.length - 1 && Math.hypot(goals[state.gi][0] - pos[0], goals[state.gi][1] - pos[2]) < reachR) state.gi++
  var g = goals[state.gi] || [pos[0], pos[2]]
  var gx = g[0] - pos[0], gz = g[1] - pos[2]
  var gd = Math.hypot(gx, gz) || 1
  x[n + 3] = (gx * fwd[0] + gz * fwd[2]) / gd
  x[n + 4] = (gx * left[0] + gz * left[2]) / gd
  x[n + 5] = Math.min(gd / 60, 1)
  x[n + 6] = state.steer || 0
  x[n + 7] = state.gas || 0
  var h = new Array(H)
  for (var j = 0; j < H; j++) {
    var sum = w[H * N_IN + j]
    for (var k = 0; k < N_IN; k++) sum += w[j * N_IN + k] * x[k]
    h[j] = Math.tanh(sum)
  }
  var o2 = H * N_IN + H
  var out = [0, 0]
  for (var q = 0; q < 2; q++) {
    var sq = w[o2 + 2 * H + q]
    for (var m = 0; m < H; m++) sq += w[o2 + q * H + m] * h[m]
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
