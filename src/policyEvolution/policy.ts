/**
 * Neural driving policy as a plain number vector: `inputs -> tanh(W1 x + b1) -> tanh(W2 h + b2) -> (steer, gas)`.
 * The genome IS the flat weight vector; the only code is one custom transformer stage (a matrix product in front of the
 * unchanged `car2` actuator). No planner, no state machine.
 */
import { gaussian, type Rng } from '@/avEvolution/core/rng'
import { LEG_TRACK_JS } from './legs'

/** Ray bearings in degrees from the heading (positive = left); dense in front, sparse behind. */
export const RAY_ANGLES_DEG = [0, 10, -10, 20, -20, 35, -35, 55, -55, 80, -80, 120, -120, 180] as const
export const RAY_RANGE = 50

/** inputs: rays, fwd speed, side speed, yaw rate, goal (fwd, left, dist), previous steer + gas */
export const N_RAYS = RAY_ANGLES_DEG.length
export const N_IN = N_RAYS + 3 + 3 + 2
export const N_HIDDEN = 10
export const N_OUT = 2
/** layout: W1 (hidden x in), b1, W2 (out x hidden), b2 */
export const genomeLength = (nIn: number, hidden = N_HIDDEN) => hidden * nIn + hidden + N_OUT * hidden + N_OUT
/** hidden size of a genome with `nIn` inputs (len = H * (nIn + 1 + N_OUT) + N_OUT); NaN-free: returns 0 when the length fits no integer H >= 1 */
export const hiddenOfLength = (len: number, nIn: number): number => {
  const h = (len - N_OUT) / (nIn + 1 + N_OUT)
  return Number.isInteger(h) && h >= 1 ? h : 0
}
export const GENOME_LENGTH = genomeLength(N_IN)

/**
 * v2 (command chains): the same net with 24 inputs. rays (14) | fwd speed, side speed, yaw rate | aim cos, sin, min(dist / 60, 1) |
 * next-segment cos, sin (car frame) | previous steer, gas. v1 stays as it is (shipped example worlds, shippedPolicy.json).
 */
export const N_IN_V2 = N_RAYS + 3 + 3 + 2 + 2
export const GENOME_LENGTH_V2 = genomeLength(N_IN_V2)
/**
 * Shape of a genome from its length alone: v2 (24 inputs, len = 27 H + 2) is tried first, then v1 (16 inputs, len = 19 H + 2); the two only collide
 * at H multiples of 19 / 27 (len - 2 divisible by 513), far beyond any hidden size used here. Throws for a length that fits neither.
 */
export function genomeShape(len: number): { nIn: number; hidden: number } {
  for (const nIn of [N_IN_V2, N_IN]) {
    const hidden = hiddenOfLength(len, nIn)
    if (hidden) return { nIn, hidden }
  }
  throw new Error(`genome of ${len} numbers fits no hidden size (v2: 27 H + 2, v1: 19 H + 2)`)
}
/** number of network inputs of a genome of this length (v1 or v2 layout, any hidden size) */
export const inputsOfGenome = (len: number) => genomeShape(len).nIn
/** hidden size of a v2 genome (len = 27 H + 2); throws when the length is not of that form */
export function hiddenOfV2(len: number): number {
  const h = hiddenOfLength(len, N_IN_V2)
  if (!h) throw new Error(`v2 genome of ${len} numbers: no integer hidden size (len = 27 H + 2)`)
  return h
}
/** length of a v2 genome with `hidden` hidden units */
export const genomeLengthV2 = (hidden: number) => genomeLength(N_IN_V2, hidden)

/**
 * Widen a v2 genome to `newH` hidden units WITHOUT changing its function: new units get zero outgoing weights (so they add nothing now) and small
 * random incoming weights (std 0.1, to break the symmetry so evolution can use them later), zero bias. The old units are copied exactly.
 */
export function widenHidden(genome: ArrayLike<number>, newH: number, rng: Rng): number[] {
  const nIn = N_IN_V2
  const oldH = hiddenOfV2(genome.length)
  if (!Number.isInteger(newH) || newH < oldH) throw new Error(`widenHidden: new hidden size ${newH} must be an integer >= ${oldH}`)
  const out = new Array<number>(genomeLength(nIn, newH)).fill(0)
  for (let j = 0; j < newH; j++) {
    for (let i = 0; i < nIn; i++) out[j * nIn + i] = j < oldH ? genome[j * nIn + i]! : gaussian(rng) * 0.1
    out[newH * nIn + j] = j < oldH ? genome[oldH * nIn + j]! : 0
  }
  const o2Old = oldH * nIn + oldH
  const o2New = newH * nIn + newH
  for (let k = 0; k < N_OUT; k++) for (let j = 0; j < oldH; j++) out[o2New + k * newH + j] = genome[o2Old + k * oldH + j]!
  for (let k = 0; k < N_OUT; k++) out[o2New + N_OUT * newH + k] = genome[o2Old + N_OUT * oldH + k]!
  return out
}

/**
 * v1 genome -> v2 genome with identical outputs: the two new inputs (next-segment cos, sin) get zero weights, the aim inputs take over
 * the goal weights (goal fwd, left, dist = aim cos, sin, dist), previous steer / gas move to their new input slots.
 */
export function padV1Genome(g: ArrayLike<number>): number[] {
  if (g.length !== GENOME_LENGTH) throw new Error(`padV1Genome: expected a v1 genome of ${GENOME_LENGTH} numbers, got ${g.length}`)
  const out = new Array<number>(GENOME_LENGTH_V2).fill(0)
  const first = N_RAYS + 6 // rays + speeds + goal / aim: unchanged positions
  for (let j = 0; j < N_HIDDEN; j++) {
    for (let i = 0; i < N_IN; i++) out[j * N_IN_V2 + (i < first ? i : i + 2)] = g[j * N_IN + i]!
  }
  const tail = N_HIDDEN * N_IN
  for (let i = 0; i < N_HIDDEN + N_OUT * N_HIDDEN + N_OUT; i++) out[N_HIDDEN * N_IN_V2 + i] = g[tail + i]!
  return out
}

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

function forwardN(w: ArrayLike<number>, x: ArrayLike<number>, nIn: number): [number, number] {
  const H = hiddenOfLength(w.length, nIn)
  if (!H) throw new Error(`policy forward: genome of ${w.length} numbers has no integer hidden size for ${nIn} inputs`)
  const h = new Array<number>(H)
  for (let j = 0; j < H; j++) {
    let s = w[H * nIn + j]!
    for (let i = 0; i < nIn; i++) s += w[j * nIn + i]! * x[i]!
    h[j] = Math.tanh(s)
  }
  const o2 = H * nIn + H
  const out: [number, number] = [0, 0]
  for (let k = 0; k < N_OUT; k++) {
    let s = w[o2 + N_OUT * H + k]!
    for (let j = 0; j < H; j++) s += w[o2 + k * H + j]! * h[j]!
    out[k] = Math.tanh(s)
  }
  return out
}

/** Reference forward pass (the stage below computes the identical thing inside the transformer chain). */
export function policyForward(w: ArrayLike<number>, x: ArrayLike<number>): [number, number] {
  return forwardN(w, x, N_IN)
}

/** Reference forward pass of the v2 net (24 inputs). */
export function policyForwardV2(w: ArrayLike<number>, x: ArrayLike<number>): [number, number] {
  return forwardN(w, x, N_IN_V2)
}

/**
 * Stage code (runs every frame before the car2 actuator). Params: `w` (genome), `goals` ([[x, z], ...]), `reachR`, `gain` (actuator acceleration per unit pedal, power / mass), optional `noise` (relative ray-distance noise, seeded by `noiseSeed`).
 * The target is the first goal not yet within `reachR`; goals are passed in order and never revisited.
 *
 * v2 (`POLICY_STAGE_CODE_V2`) replaces `goals` by a command: `input.av.cmd = { aim: [x, z], next: [x, z] }` (world points) when present, else it
 * is derived every frame from `params.chain` (polyline [[x, z], ...]) and `params.cmd` = { lmin, tau, period, noiseDeg, seed }: the car is projected
 * onto the chain (monotone), the aim point lies `clamp(lmin + tau * speed, lmin, 40)` m further along, is refreshed every `period` s (held in
 * between) with a bearing noise of +-noiseDeg degrees; `next` is the chain point 12 m beyond the aim point (its direction = next-turn hint).
 * The ray, forward-pass and actuator code is shared between v1 and v2 (the string pieces below).
 */
export const STAGE_RND = `
function rnd(state) {
  state.rs = (state.rs + 0x6d2b79f5) >>> 0
  var t = state.rs
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
`

export const STAGE_CMD_HELPERS = `
function chainPoint(ch, cum, s) {
  var n = ch.length
  if (s <= 0) return ch[0]
  if (s >= cum[n - 1]) return ch[n - 1]
  var i = 0
  while (i < n - 2 && cum[i + 1] < s) i++
  var t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1)
  return [ch[i][0] + (ch[i + 1][0] - ch[i][0]) * t, ch[i][1] + (ch[i + 1][1] - ch[i][1]) * t]
}
function deriveCmd(params, state, dt, pos, speed) {
  var ch = params.chain
  var cfg = params.cmd || {}
  var n = ch.length
  if (!state.cum) {
    state.cum = [0]
    for (var q = 1; q < n; q++) state.cum.push(state.cum[q - 1] + Math.hypot(ch[q][0] - ch[q - 1][0], ch[q][1] - ch[q - 1][1]))
    state.cs = 0
    state.cseg = 0
    state.ct = 1e9
    state.cr = { rs: (cfg.seed >>> 0) || 1 }
  }
  var px = pos[0], pz = pos[2]
  var bestD = Infinity, bestS = state.cs, bestSeg = state.cseg
  for (var i = Math.max(0, state.cseg - 1); i <= Math.min(n - 2, state.cseg + 2); i++) {
    var ax = ch[i][0], az = ch[i][1]
    var dx = ch[i + 1][0] - ax, dz = ch[i + 1][1] - az
    var len2 = dx * dx + dz * dz || 1
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    var d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
    if (d < bestD) {
      bestD = d
      bestS = state.cum[i] + t * Math.sqrt(len2)
      bestSeg = i
    }
  }
  state.cseg = bestSeg
  if (bestS > state.cs) state.cs = bestS
  state.ct += dt
  if (!state.aim || state.ct >= (cfg.period != null ? cfg.period : 0.5)) {
    state.ct = 0
    var total = state.cum[n - 1]
    var lmin = cfg.lmin != null ? cfg.lmin : 12
    var L = Math.min(Math.max(lmin + (cfg.tau != null ? cfg.tau : 1.5) * speed, lmin), 40)
    var sa = Math.min(state.cs + L, total)
    var a = chainPoint(ch, state.cum, sa)
    var nd = cfg.noiseDeg != null ? cfg.noiseDeg : 3
    if (nd > 0) {
      var e = (rnd(state.cr) * 2 - 1) * nd * Math.PI / 180
      var c = Math.cos(e), sn = Math.sin(e)
      var vx = a[0] - px, vz = a[1] - pz
      a = [px + vx * c - vz * sn, pz + vx * sn + vz * c]
    }
    var b = chainPoint(ch, state.cum, Math.min(sa + 12, total))
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) {
      var lx = ch[n - 1][0] - ch[n - 2][0], lz = ch[n - 1][1] - ch[n - 2][1]
      var ll = Math.hypot(lx, lz) || 1
      b = [a[0] + lx / ll * 12, a[1] + lz / ll * 12]
    }
    state.aim = a
    state.nxt = b
  }
  return [state.aim[0], state.aim[1], state.nxt[0], state.nxt[1]]
}
`

/**
 * v3 command helpers (replace STAGE_CMD_HELPERS in `POLICY_STAGE_CODE_V3`, same `deriveCmd` name so STAGE_GOAL_V2 is reused unchanged): the chain is split into
 * LEGS (`params.legEnds`, see legs.ts; none = one leg) and the car is tracked leg-wise with the shared leg tracker. The aim point lies `clamp(lmin + tau speed)` m further
 * along the CURRENT leg, but never beyond its end (a reversal leg of 5 m puts the aim 5 m behind the car); `next` is the point 12 m beyond the aim, continuing on the
 * next leg when the aim sits at the leg end. A leg change refreshes the command at once. Speed in the lookahead is |forward speed| (a reversing car looks ahead too).
 */
export const STAGE_CMD_HELPERS_V3 = LEG_TRACK_JS + `
function deriveCmd(params, state, dt, pos, speed) {
  var cfg = params.cmd || {}
  if (!state.lt) {
    state.lt = legInit(params.chain, params.legEnds)
    state.lt.off = params.offM != null ? params.offM : 6
    state.ct = 1e9
    state.lastLi = 0
    state.cr = { rs: (cfg.seed >>> 0) || 1 }
  }
  var t = state.lt
  var px = pos[0], pz = pos[2]
  legStep(t, px, pz)
  if (t.li !== state.lastLi) {
    state.lastLi = t.li
    state.ct = 1e9
  }
  state.ct += dt
  if (!state.aim || state.ct >= (cfg.period != null ? cfg.period : 0.5)) {
    state.ct = 0
    var leg = t.legs[t.li]
    var lmin = cfg.lmin != null ? cfg.lmin : 12
    var L = Math.min(Math.max(lmin + (cfg.tau != null ? cfg.tau : 1.5) * speed, lmin), 40)
    var sa = Math.min(t.s + L, leg.len)
    var a = legPoint(t, leg, sa)
    var nd = cfg.noiseDeg != null ? cfg.noiseDeg : 3
    if (nd > 0) {
      var e = (rnd(state.cr) * 2 - 1) * nd * Math.PI / 180
      var c = Math.cos(e), sn = Math.sin(e)
      var vx = a[0] - px, vz = a[1] - pz
      a = [px + vx * c - vz * sn, pz + vx * sn + vz * c]
    }
    var b
    if (sa + 12 > leg.len && t.li < t.legs.length - 1) {
      var nl = t.legs[t.li + 1]
      b = legPoint(t, nl, Math.min(sa + 12 - leg.len, nl.len))
    } else b = legPoint(t, leg, Math.min(sa + 12, leg.len))
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) {
      var ch = params.chain
      var lx = ch[leg.b][0] - ch[leg.b - 1][0], lz = ch[leg.b][1] - ch[leg.b - 1][1]
      var ll = Math.hypot(lx, lz) || 1
      b = [a[0] + lx / ll * 12, a[1] + lz / ll * 12]
    }
    state.aim = a
    state.nxt = b
  }
  return [state.aim[0], state.aim[1], state.nxt[0], state.nxt[1]]
}
`

/** hidden size from the genome length (len = H * (N_IN + 3) + 2); 0 = not an integer H (the stage then does nothing) */
export const STAGE_HIDDEN = `
function hiddenOf(w) {
  var h = (w.length - 2) / (N_IN + 3)
  return h >= 1 && h === Math.floor(h) ? h : 0
}
`

export const stageHead = (nIn: number, v2: boolean, v3 = false) => `
var ANGLES = ${JSON.stringify(RAY_ANGLES_DEG.map((d) => (d * Math.PI) / 180))}
var N_IN = ${nIn}, RANGE = ${RAY_RANGE}, VF = ${V_FWD_MAX}, VR = ${V_REV_MAX}, TAU = ${TAU_SPEED}${STAGE_RND}${v3 ? STAGE_CMD_HELPERS_V3 : v2 ? STAGE_CMD_HELPERS : ''}${STAGE_HIDDEN}`

/** rays + own speeds (shared by v1 and v2) */
export const STAGE_SENSE = `function transform(input, dt, params, state, api) {
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
    var t = Math.min(Math.abs(c) > 1e-6 ? hl / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? hw / Math.abs(s) : 1e9)
    var o = [pos[0] + dir[0] * t, pos[1], pos[2] + dir[2] * t]
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
  x[n] = api.vec.dot(input.velocity, fwd) / 30
  x[n + 1] = api.vec.dot(input.velocity, left) / 10
  x[n + 2] = api.vec.dot(input.angularVelocity, up) / 2
`

const STAGE_GOAL_V1 = `  var goals = params.goals || []
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
`

export const STAGE_GOAL_V2 = `  var cmd = input.av && input.av.cmd
  var ac
  if (cmd && cmd.aim) ac = [cmd.aim[0], cmd.aim[1], (cmd.next || cmd.aim)[0], (cmd.next || cmd.aim)[1]]
  else if (params.chain && params.chain.length > 1) ac = deriveCmd(params, state, dt, pos, Math.abs(api.vec.dot(input.velocity, fwd)))
  else ac = [pos[0], pos[2], pos[0], pos[2]]
  var gx = ac[0] - pos[0], gz = ac[1] - pos[2]
  var gd = Math.hypot(gx, gz) || 1
  x[n + 3] = (gx * fwd[0] + gz * fwd[2]) / gd
  x[n + 4] = (gx * left[0] + gz * left[2]) / gd
  x[n + 5] = Math.min(gd / 60, 1)
  var tx = ac[2] - ac[0], tz = ac[3] - ac[1]
  var td = Math.hypot(tx, tz)
  x[n + 6] = td > 1e-6 ? (tx * fwd[0] + tz * fwd[2]) / td : 1
  x[n + 7] = td > 1e-6 ? (tx * left[0] + tz * left[2]) / td : 0
  x[n + 8] = state.steer || 0
  x[n + 9] = state.gas || 0
`

/** forward pass + target-speed law + actuator inputs (shared by v1 and v2) */
export const STAGE_NET = `  var H = hiddenOf(w)
  if (!H) return {}
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

export const POLICY_STAGE_CODE = stageHead(N_IN, false) + STAGE_SENSE + STAGE_GOAL_V1 + STAGE_NET
export const POLICY_STAGE_CODE_V2 = stageHead(N_IN_V2, true) + STAGE_SENSE + STAGE_GOAL_V2 + STAGE_NET

/** v3 training stage: the v2 net on leg-wise chains (params: chain, legEnds, offM, cmd); everything but the command helpers is the v2 code. */
export const POLICY_STAGE_CODE_V3 = stageHead(N_IN_V2, true, true) + STAGE_SENSE + STAGE_GOAL_V2 + STAGE_NET
