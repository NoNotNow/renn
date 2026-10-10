/* @params
[
  {"key":"neuralPolicy","label":"Neural policy","type":"enum","options":[{"value":"v2"},{"value":"v3"}],"default":"v2","group":"Neural","description":"'v2' = the promoted v2 net, forward only (default, bit-identical to worlds without this key); 'v3' = the leg-trained v3 net (same 24 inputs / 2 outputs, H 24, default weights from shippedPolicyV3.json), can reverse when neuralReverse is on."},
  {"key":"neuralReverse","label":"Neural: allow reversing (v3)","type":"boolean","default":false,"group":"Neural","description":"v3 only. Off: the net never reverses (target speed floored at 0). On: when blocked ahead with the rear rays clear the stage drives a short back leg (5-10 m along the own heading, at most neuralRevMaxM), then the route again."},
  {"key":"neuralRevMaxM","label":"Neural: max reverse distance","type":"number","default":12,"min":0,"unit":"m","group":"Neural","description":"Cap of the metres reversed in one back leg (v3 with neuralReverse).","advanced":true},
  {"key":"neuralMode","label":"Neural drive mode","type":"enum","options":[{"value":"off"},{"value":"always"},{"value":"auto"}],"default":"off","group":"Neural","description":"'off' = classic stack only (bit-identical); 'always' = the net drives whenever allowed (debug); 'auto' = the net takes over in crowded surroundings and hands back when they clear."},
  {"key":"neuralVMax","label":"Neural speed cap","type":"number","default":30,"min":0,"unit":"m/s","group":"Neural","description":"Upper bound of the net target speed while it drives."},
  {"key":"neuralGain","label":"Neural pedal gain","type":"number","default":1200,"min":1,"group":"Neural","description":"Actuator acceleration per unit pedal the net was trained on (power / mass of the 4 x 8 car).","advanced":true},
  {"key":"neuralWeights","label":"Neural weights","type":"json","group":"Neural","description":"Flat genome (27 H + 2 numbers, H hidden units inferred from the length; 272 for H = 10, 650 for H = 24); default = the weights shipped in the stage params (v2: `w`, v3: `wV3`).","advanced":true},
  {"key":"neuralLmin","label":"Aim distance (min)","type":"number","default":8,"min":0,"unit":"m","group":"Neural","advanced":true},
  {"key":"neuralTau","label":"Aim distance per speed","type":"number","default":0.6,"min":0,"unit":"s","group":"Neural","advanced":true},
  {"key":"neuralPeriod","label":"Aim refresh period","type":"number","default":0.5,"min":0,"unit":"s","group":"Neural","advanced":true},
  {"key":"neuralOccR","label":"Occupied ray range","type":"number","default":12,"min":0,"unit":"m","group":"Neural trigger","advanced":true},
  {"key":"neuralConfR","label":"Confined ray range","type":"number","default":18,"min":0,"unit":"m","group":"Neural trigger","advanced":true},
  {"key":"neuralMoverR","label":"Mover range","type":"number","default":25,"min":0,"unit":"m","group":"Neural trigger","advanced":true},
  {"key":"neuralOnOcc","label":"ON: occupied share","type":"number","default":0.5,"min":0,"max":1,"group":"Neural trigger","advanced":true},
  {"key":"neuralOnMov","label":"ON: movers","type":"integer","default":3,"min":0,"group":"Neural trigger","advanced":true},
  {"key":"neuralOnConf","label":"ON: confined share","type":"number","default":0.6,"min":0,"max":1,"group":"Neural trigger","advanced":true},
  {"key":"neuralOffOcc","label":"OFF: occupied share below","type":"number","default":0.3,"min":0,"max":1,"group":"Neural trigger","advanced":true},
  {"key":"neuralOffMov","label":"OFF: movers below","type":"integer","default":2,"min":0,"group":"Neural trigger","advanced":true},
  {"key":"neuralOffConf","label":"OFF: confined share below","type":"number","default":0.4,"min":0,"max":1,"group":"Neural trigger","advanced":true},
  {"key":"neuralOnT","label":"ON delay","type":"number","default":0.5,"min":0,"unit":"s","group":"Neural trigger","advanced":true},
  {"key":"neuralOffT","label":"OFF delay","type":"number","default":1.5,"min":0,"unit":"s","group":"Neural trigger","advanced":true},
  {"key":"neuralDwell","label":"Minimum dwell per state","type":"number","default":2,"min":0,"unit":"s","group":"Neural trigger","advanced":true},
  {"key":"neuralCooldown","label":"Cooldown after a watchdog fail","type":"number","default":5,"min":0,"unit":"s","group":"Neural watchdog","advanced":true},
  {"key":"neuralLockout","label":"Lockout after 3 fails in 30 s","type":"number","default":30,"min":0,"unit":"s","group":"Neural watchdog","advanced":true},
  {"key":"neuralStallT","label":"Stall window","type":"number","default":3,"min":0,"unit":"s","group":"Neural watchdog","advanced":true},
  {"key":"neuralStallM","label":"Stall: min progress along the command","type":"number","default":2,"min":0,"unit":"m","group":"Neural watchdog","advanced":true},
  {"key":"neuralAebT","label":"AEB fail: continuous braking","type":"number","default":0.3,"min":0,"unit":"s","group":"Neural watchdog","advanced":true},
  {"key":"neuralDebugDraw","label":"Draw neural aim line","type":"boolean","default":true,"group":"Debug","advanced":true},
  {"key":"neuralTint","label":"Tint car while the policy drives","type":"boolean","default":true,"group":"Debug","description":"In-play visual indicator: tint the car mesh violet while the neural policy drives (transformer color output; restored on switch-off)."}
]
*/
var ANGLES = [0,0.17453292519943295,-0.17453292519943295,0.3490658503988659,-0.3490658503988659,0.6108652381980153,-0.6108652381980153,0.9599310885968813,-0.9599310885968813,1.3962634015954636,-1.3962634015954636,2.0943951023931953,-2.0943951023931953,3.141592653589793]
var N_IN = 24, RANGE = 50, VF = 30, VR = 8, TAU = 0.05
function rnd(state) {
  state.rs = (state.rs + 0x6d2b79f5) >>> 0
  var t = state.rs
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

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

function hiddenOf(w) {
  var h = (w.length - 2) / (N_IN + 3)
  return h >= 1 && h === Math.floor(h) ? h : 0
}

function legInit(ch, ends) {
  var n = ch.length
  var cum = [0]
  for (var q = 1; q < n; q++) cum.push(cum[q - 1] + Math.hypot(ch[q][0] - ch[q - 1][0], ch[q][1] - ch[q - 1][1]))
  var es = ends && ends.length ? ends : [n - 1]
  var legs = []
  var a = 0
  for (var k = 0; k < es.length; k++) {
    var len = cum[es[k]] - cum[a]
    legs.push({ a: a, b: es[k], s0: cum[a], len: len, reach: Math.min(5, Math.max(2.5, 0.4 * len)) })
    a = es[k]
  }
  return { ch: ch, cum: cum, legs: legs, li: 0, s: 0, seg: 0, done: false, dist: 0, doneLen: 0, total: cum[n - 1], off: 6 }
}
function legStep(t, px, pz) {
  if (t.done) return
  var L = t.legs[t.li]
  var ch = t.ch
  var bestD = Infinity, bestS = t.s, bestSeg = Math.max(L.a, t.seg)
  for (var i = Math.max(L.a, t.seg - 1); i <= Math.min(L.b - 1, t.seg + 2); i++) {
    var ax = ch[i][0], az = ch[i][1]
    var dx = ch[i + 1][0] - ax, dz = ch[i + 1][1] - az
    var len2 = dx * dx + dz * dz || 1
    var u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    var d = Math.hypot(px - (ax + u * dx), pz - (az + u * dz))
    if (d < bestD) {
      bestD = d
      bestS = t.cum[i] - L.s0 + u * Math.sqrt(len2)
      bestSeg = i
    }
  }
  t.seg = bestSeg
  t.dist = bestD
  if (bestS > t.s) t.s = bestS
  var e = ch[L.b]
  var endD = Math.hypot(px - e[0], pz - e[1])
  if (endD < L.reach || (t.s >= L.len - 1e-6 && bestD <= t.off)) {
    if (t.li >= t.legs.length - 1) {
      t.done = true
      t.s = L.len
    } else {
      t.doneLen += L.len
      t.li++
      t.s = 0
      t.seg = t.legs[t.li].a
    }
  }
}
function legProgress(t) {
  return t.done ? t.total : t.doneLen + t.s
}
function legPoint(t, leg, s) {
  var ch = t.ch, cum = t.cum
  var target = leg.s0 + Math.max(0, Math.min(s, leg.len))
  var i = leg.a
  while (i < leg.b - 1 && cum[i + 1] < target) i++
  var seglen = (cum[i + 1] - cum[i]) || 1
  var f = (target - cum[i]) / seglen
  return [ch[i][0] + (ch[i + 1][0] - ch[i][0]) * f, ch[i][1] + (ch[i + 1][1] - ch[i][1]) * f]
}

function deriveCmdV3(params, state, dt, pos, speed) {
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

// AV stack · NEURAL drive mode (Phase 1: v2 policy, 24 inputs, no speed command). GENERATED from src/policyEvolution/policyStage.ts: do not edit by hand.
// The shipped net (the policy evolved in src/policyEvolution) follows the command the AV stack hands over: the car is projected onto av.routePath
// (fallback: straight line to av.carrot / maze goal / input.target), aim = clamp(lmin + tau * v, lmin, 40) m ahead along it, next = direction of the
// segment beyond the aim, refreshed every period s: the SAME rule as in training (deriveCmd above). It writes steering / throttle / brake; the lateral,
// longitudinal and supervisor stages yield while av.neural.on (like av.manual), the AEB does not.
// neuralMode: 'off' (default, returns before anything is touched = bit-identical) | 'always' (debug) | 'auto' (trigger from the net's own rays + av.movers,
// hysteresis + dwell). Never ON: manual override, manoeuvre (av.override), hold at the final goal, tracked threats in range, vehicle not ~4 x 8, no aim, cooldown / lockout.
// Watchdog (forces OFF + cooldown; 3 fails in 30 s lock it out): < neuralStallM m along the command in neuralStallT s, AEB braking for neuralAebT s,
// hull-ray distance < 0.4 m at > 3 m/s, side speed > 4 m/s, a classic manoeuvre starting while the net drives. Pedal law and gain as in training (neuralGain 1200); target speed capped at neuralVMax.
// neuralPolicy 'v3' (+ neuralReverse): the leg-trained v3 net (same inputs/outputs) on a leg-wise chain (the SAME leg tracker + command helper as in training). Forward: the route is ONE leg.
// Reversing (only with neuralReverse): blocked ahead (|v| < 1.2 m/s, front rays < 3 m, aim not behind) for 1 s with the rear rays (120 / 180 / -120 deg) clear -> a back leg of 5-10 m
// along the own heading (never more than neuralRevMaxM, never into the rear free distance), then the route again. A net target speed < 0 reads av.neural.dir = 'rev'.
// Handback while reversing (|v| >= 1 m/s) is deferred: the stage brakes to a stop first. The watchdog's hull-ray test uses the rear rays when reversing.
// Watch: av.neural (on/off + why), av.neural.n (onS, handovers, fails; v3: dir + reverse metres). av.neural = { on, justOff, why, occ, mov, conf, dir: 'fwd' | 'rev', revM }. Overlay: violet line car -> aim.
function policyStep(input, dt, params, state, api) {
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
  var cmd = input.av && input.av.cmd
  var ac
  if (cmd && cmd.aim) ac = [cmd.aim[0], cmd.aim[1], (cmd.next || cmd.aim)[0], (cmd.next || cmd.aim)[1]]
  else if (params.chain && params.chain.length > 1) ac = (params.v3 ? deriveCmdV3 : deriveCmd)(params, state, dt, pos, Math.abs(api.vec.dot(input.velocity, fwd)))
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
  var H = hiddenOf(w)
  if (!H) return {}
  state.x = x
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
  if (params.vMax != null && vT > params.vMax) vT = params.vMax
  if (params.noRev && vT < 0) vT = 0
  state.vT = vT
  var u = (vT - api.vec.dot(input.velocity, fwd)) / TAU / (params.gain || 1200)
  u = u > 1 ? 1 : u < -1 ? -1 : u
  input.actions.throttle = u > 0 ? u : 0
  input.actions.brake = u < 0 ? -u : 0
  return {}
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
function newChain(P, ch, px, pz) {
  var n = ch.length
  P.cum = [0]
  for (var q = 1; q < n; q++) P.cum.push(P.cum[q - 1] + Math.hypot(ch[q][0] - ch[q - 1][0], ch[q][1] - ch[q - 1][1]))
  var bd = Infinity, bs = 0, bi = 0
  for (var i = 0; i < n - 1; i++) {
    var ax = ch[i][0], az = ch[i][1]
    var dx = ch[i + 1][0] - ax, dz = ch[i + 1][1] - az
    var len2 = dx * dx + dz * dz || 1
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    var d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
    if (d < bd) {
      bd = d
      bi = i
      bs = P.cum[i] + t * Math.sqrt(len2)
    }
  }
  P.cs = bs
  P.cseg = bi
  P.ct = 1e9
  if (!P.cr) P.cr = { rs: 1 }
  P.aim = undefined
}
// v3: a fresh leg-wise chain (route = ONE leg; a back leg chain has legEnds): start at the nearest segment of the first leg, like newChain
function newChainV3(P, ch, ends, px, pz) {
  var t = legInit(ch, ends)
  var bd = Infinity
  for (var i = 0; i < t.legs[0].b; i++) {
    var ax = ch[i][0], az = ch[i][1]
    var dx = ch[i + 1][0] - ax, dz = ch[i + 1][1] - az
    var len2 = dx * dx + dz * dz || 1
    var u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    var d = Math.hypot(px - (ax + u * dx), pz - (az + u * dz))
    if (d < bd) {
      bd = d
      t.seg = i
      t.s = t.cum[i] + u * Math.sqrt(len2)
    }
  }
  P.lt = t
  P.ct = 1e9
  P.lastLi = 0
  if (!P.cr) P.cr = { rs: 1 }
  P.aim = undefined
}
// a watchdog fail: cooldown, and a lockout after 3 fails within 30 s
function registerFail(state, params) {
  state.nFail++
  state.cool = params.neuralCooldown != null ? params.neuralCooldown : 5
  state.fails.push(state.t)
  while (state.fails.length && state.t - state.fails[0] > 30) state.fails.shift()
  if (state.fails.length >= 3) {
    state.lock = params.neuralLockout != null ? params.neuralLockout : 30
    state.fails = []
  }
}
// in-play visual indicator (neuralTint): while the policy drives, the car mesh is tinted violet (same color as the Builder aim line);
// the tint survives the stage bailing early, so every exit path runs it and the switch-off returns color: null to restore the base color
function tintOff(state) {
  if (!state.tinted) return {}
  state.tinted = false
  return { color: null }
}
function transform(input, dt, params, state, api) {
  var mode = params.neuralMode
  if (mode !== 'always' && mode !== 'auto') {
    // switched off at runtime: forget the state so a later switch-on starts clean
    if (state.tinted) {
      // the tint outlives the state reset: restore the car's color first
      state.tinted = false
      return { color: null }
    }
    if (state.t !== undefined) state.t = undefined
    return {}
  }
  var av = input.av
  if (!av || !av.ego || !input.actions) return tintOff(state)
  if (!av.plan) {
    // the stage must run after the motion planner (library priority 4.55: between the speed planner and the supervisor)
    api.watch('av.neural', 'off (no av.plan yet: stage priority must be after the motion planner)')
    return tintOff(state)
  }
  var v3 = params.neuralPolicy === 'v3'
  var w = params.neuralWeights || (v3 ? params.wV3 : params.w)
  if (!w || !hiddenOf(w)) return tintOff(state)
  var revAllowed = v3 && params.neuralReverse === true
  var revMax = params.neuralRevMaxM != null ? params.neuralRevMaxM : 12
  var e = av.ego
  var pos = input.position
  if (state.t === undefined) {
    state.t = 0
    state.on = false
    state.dwell = 1e9
    state.candOn = 0
    state.candOff = 0
    state.cool = 0
    state.lock = 0
    state.fails = []
    state.onS = 0
    state.handovers = 0
    state.nFail = 0
    state.aebT = 0
    state.p = {}
    state.last = 'off'
    state.revM = 0
    state.blockT = 0
    state.revCool = 0
    state.pend = ''
  }
  state.t += dt
  state.dwell += dt
  if (state.cool > 0) state.cool -= dt
  if (state.lock > 0) state.lock -= dt
  if (state.revCool > 0) state.revCool -= dt
  var P = state.p
  var veh = av.vehicle
  // the REAL body counts too (av.vehicle is max(params, own box), so a small car with 4 x 8 params would pass): the net's hull offsets and pedal gain are those of the 4 x 8 car
  if (state.bodyT === undefined || state.t - state.bodyT > 2) {
    state.bodyT = state.t
    var ent = api.getEntity ? api.getEntity(input.entityId) : null
    var bsh = ent && ent.shape
    var bsc = (ent && ent.scale) || [1, 1, 1]
    state.bodyW = bsh && bsh.type === 'box' ? Math.abs(bsh.width * (bsc[0] || 1)) : 0
    state.bodyL = bsh && bsh.type === 'box' ? Math.abs(bsh.depth * (bsc[2] || 1)) : 0
  }
  var vehOk = !!veh && Math.abs(veh.width - 4) <= 0.6 && Math.abs(veh.length - 8) <= 0.8 && (!state.bodyW || (Math.abs(state.bodyW - 4) <= 0.6 && Math.abs(state.bodyL - 8) <= 0.8))
  var why = ''
  if (!vehOk) why = 'vehicle'
  else if (av.manual) why = 'manual'

  // --- aim chain: av.routePath, else the straight line to carrot / maze goal / target ---
  var chain = null
  var rp = av.routePath
  // v3: the back leg is done (the tracker moved on to the route leg): back to the route chain (re-projected below)
  if (P.revLeg && P.lt && P.lt.li >= 1) {
    P.revLeg = false
    P.srcRp = null
    P.fb = null
    state.revCool = 3
  }
  if (!why) {
    if (P.revLeg) chain = P.revChain
    else if (rp && rp.length > 1) {
      if (rp !== P.srcRp) {
        P.srcRp = rp
        P.fb = null
        if (v3) newChainV3(P, rp, undefined, pos[0], pos[2])
        else newChain(P, rp, pos[0], pos[2])
      }
      chain = rp
    } else {
      var tg = av.carrot
      if (!tg && av.maze && av.maze.goal && av.maze.goal.length >= 2) tg = av.maze.goal
      if (!tg && input.target && input.target.pose && input.target.pose.position) tg = [input.target.pose.position[0], input.target.pose.position[2]]
      if (tg) {
        if (!P.fb || Math.hypot(tg[0] - P.fbT[0], tg[1] - P.fbT[1]) > 1 || Math.hypot(pos[0] - P.fbS[0], pos[2] - P.fbS[1]) > 3) {
          P.srcRp = null
          P.fb = [[pos[0], pos[2]], [tg[0], tg[1]]]
          P.fbS = [pos[0], pos[2]]
          P.fbT = [tg[0], tg[1]]
          if (v3) newChainV3(P, P.fb, undefined, pos[0], pos[2])
          else newChain(P, P.fb, pos[0], pos[2])
        }
        chain = P.fb
      }
    }
    if (!chain) why = 'no aim'
  }
  if (!why) {
    if (av.override || av.plan.override) why = 'maneuver'
    else {
      var tol = params.goalTolerance != null ? params.goalTolerance : 3.5
      if (params.holdAtGoal !== false && (!av.mission || av.mission.isFinal) && av.goal && av.goal.dist < tol) why = 'hold'
      else if (av.threats && av.threats.length) {
        var thrR = params.fixThreatRange != null ? params.fixThreatRange : 90
        for (var ti = 0; ti < av.threats.length; ti++) {
          if (Math.hypot(av.threats[ti].x - pos[0], av.threats[ti].z - pos[2]) < thrR) {
            why = 'threat'
            break
          }
        }
      }
    }
  }

  var wasOn = state.on
  var failWhy = ''
  var occ = 0, conf = 0, nMov = 0, minF = RANGE
  if (why) {
    // not allowed: classic stack only (rays are not cast)
    if (state.on) {
      state.on = false
      state.dwell = 0
      // the classic route planner started a manoeuvre while the net drove (it judged the car stuck): the net failed
      if (why === 'maneuver') {
        failWhy = 'maneuver'
        registerFail(state, params)
      }
    }
    state.candOn = 0
    state.candOff = 0
  } else {
    // --- one forward pass of the shared policy code into scratch actions: the net inputs (rays) feed the trigger, the outputs are used only while ON ---
    var spd = e.speed
    if (!state.on) {
      // warm handover: the memory inputs start from the classic stack's current steering / speed
      P.steer = clamp(e.kappa / 0.12, -1, 1)
      P.gas = spd >= 0 ? clamp(spd / VF, -1, 1) : clamp(spd / VR, -1, 1)
    }
    var sa = state.sa || (state.sa = { steering_angle: 0, throttle: 0, brake: 0 })
    var sin = { position: input.position, rotation: input.rotation, velocity: input.velocity, angularVelocity: input.angularVelocity, actions: sa, av: null }
    var pp = state.pp
    if (!pp || pp.w !== w || pp.chain !== chain) {
      pp = state.pp = {
        w: w,
        chain: chain,
        v3: v3,
        legEnds: P.revLeg ? P.revEnds : undefined,
        offM: 6,
        gain: params.neuralGain != null ? params.neuralGain : 1200,
        vMax: params.neuralVMax != null ? params.neuralVMax : 30,
        noise: 0,
        cmd: { lmin: params.neuralLmin != null ? params.neuralLmin : 8, tau: params.neuralTau != null ? params.neuralTau : 0.6, period: params.neuralPeriod != null ? params.neuralPeriod : 0.5, noiseDeg: 0, seed: 1 },
      }
    }
    // v3 without neuralReverse never reverses; with it the metres of one reversal are capped
    pp.noRev = v3 && (!revAllowed || state.revM >= revMax)
    policyStep(sin, dt, pp, P, api)
    var x = P.x
    var revving = v3 && state.on && spd < -1
    // trigger inputs from the net's own rays: x = 1 - dist / RANGE (0 = no hit)
    var occR = params.neuralOccR != null ? params.neuralOccR : 12
    var confR = params.neuralConfR != null ? params.neuralConfR : 18
    var occN = 0, confN = 0, minAll = RANGE, rearD = RANGE
    for (var ri = 0; ri < ANGLES.length; ri++) {
      var rd = x[ri] > 0 ? (1 - x[ri]) * RANGE : RANGE
      if (ri >= 11 && rd < rearD) rearD = rd
      if (rd < confR) confN++
      if (ri < 11 && rd < occR) occN++
      if (ri < 7 && rd < minF) minF = rd
      if (rd < minAll) minAll = rd
    }
    occ = occN / 11
    conf = confN / ANGLES.length
    var mv = av.movers
    var movR = params.neuralMoverR != null ? params.neuralMoverR : 25
    if (mv) for (var mi = 0; mi < mv.length; mi++) if (Math.hypot(mv[mi][0] - pos[0], mv[mi][1] - pos[2]) < movR) nMov++
    var crowded = occ >= (params.neuralOnOcc != null ? params.neuralOnOcc : 0.5) || nMov >= (params.neuralOnMov != null ? params.neuralOnMov : 3) || conf >= (params.neuralOnConf != null ? params.neuralOnConf : 0.6)
    var clear = occ < (params.neuralOffOcc != null ? params.neuralOffOcc : 0.3) && nMov < (params.neuralOffMov != null ? params.neuralOffMov : 2) && conf < (params.neuralOffConf != null ? params.neuralOffConf : 0.4)
    var dwellMin = params.neuralDwell != null ? params.neuralDwell : 2
    // v3 reversing: metres reversed so far (reset by forward motion), and the trigger for a back leg
    if (v3) {
      if (state.on && spd < -0.2) state.revM += -spd * dt
      else if (spd > 1) state.revM = 0
      if (state.on && revAllowed && !P.revLeg && !state.pend && state.revCool <= 0 && revMax > 0) {
        var blocked = Math.abs(spd) < 1.2 && minF < 3 && x[ANGLES.length + 3] > -0.2
        state.blockT = blocked ? state.blockT + dt : 0
        if (state.blockT >= 1) {
          var back = Math.min(10, revMax, rearD - 2)
          if (back >= Math.min(5, revMax) && P.lt) {
            var hx = e.fwd[0], hz = e.fwd[2]
            var hn = Math.hypot(hx, hz) || 1
            var pts = [[pos[0], pos[2]], [pos[0] - hx / hn * back, pos[2] - hz / hn * back]]
            // then the rest of the current chain ahead of the car (leg 2 = the route again)
            for (var ci = P.lt.seg + 1; ci < chain.length; ci++) pts.push(chain[ci])
            if (pts.length < 3) pts.push([pts[1][0] + hx / hn * 12, pts[1][1] + hz / hn * 12])
            P.revChain = pts
            P.revEnds = [1, pts.length - 1]
            P.revLeg = true
            state.revM = 0
            state.blockT = 0
            newChainV3(P, pts, P.revEnds, pos[0], pos[2])
            // the stall window starts with the back leg
            state.wdT = state.t
            state.wdPos = [pos[0], pos[2]]
            state.wdAim = null
          }
        }
      } else state.blockT = 0
    }
    if (state.on) {
      // watchdog
      if (state.wdT === undefined) {
        state.wdT = state.t
        state.wdPos = [pos[0], pos[2]]
        state.wdAim = P.aim ? [P.aim[0], P.aim[1]] : null
      }
      var stallT = params.neuralStallT != null ? params.neuralStallT : 3
      if (state.t - state.wdT >= stallT) {
        if (state.wdAim) {
          var ux = state.wdAim[0] - state.wdPos[0], uz = state.wdAim[1] - state.wdPos[1]
          var ul = Math.hypot(ux, uz)
          if (ul > 3 && ((pos[0] - state.wdPos[0]) * ux + (pos[2] - state.wdPos[1]) * uz) / ul < (params.neuralStallM != null ? params.neuralStallM : 2)) failWhy = 'stall'
        }
        state.wdT = state.t
        state.wdPos = [pos[0], pos[2]]
        state.wdAim = P.aim ? [P.aim[0], P.aim[1]] : null
      }
      if (av.prevAeb) state.aebT += dt
      else state.aebT = 0
      if (!failWhy && state.aebT >= (params.neuralAebT != null ? params.neuralAebT : 0.3)) failWhy = 'aeb'
      // v3 reversing: the rear rays (120 / 180 / -120 deg) are the ones that matter; forward: all rays as in v2
      var closeD = v3 && spd < -3 ? rearD : minAll
      if (!failWhy && closeD < 0.4 && Math.abs(spd) > 3) failWhy = 'close'
      if (!failWhy && Math.abs(x[ANGLES.length + 1]) * 10 > 4) failWhy = 'slide'
      if (!failWhy && state.pend) failWhy = state.pend
      if (failWhy && revving) {
        // never hand a reversing car back (the classic longitudinal stage knows forward only): brake to a stop, then hand back (|v| < 1 m/s)
        state.pend = failWhy
        failWhy = ''
      } else if (failWhy) state.pend = ''
      if (failWhy) {
        state.on = false
        state.dwell = 0
        state.candOn = 0
        state.candOff = 0
        registerFail(state, params)
      } else if (mode === 'auto') {
        if (clear) state.candOff += dt
        else state.candOff = 0
        if (state.candOff >= (params.neuralOffT != null ? params.neuralOffT : 1.5) && state.dwell >= dwellMin && !revving) {
          state.on = false
          state.dwell = 0
          state.candOff = 0
        }
      }
    } else if (state.cool <= 0 && state.lock <= 0) {
      if (mode === 'always') {
        state.on = true
      } else {
        if (crowded) state.candOn += dt
        else state.candOn = 0
        if (state.candOn >= (params.neuralOnT != null ? params.neuralOnT : 0.5) && state.dwell >= dwellMin) state.on = true
      }
      if (state.on) {
        state.dwell = 0
        state.candOn = 0
        state.candOff = 0
        state.handovers++
        state.wdT = undefined
        state.aebT = 0
      }
    } else state.candOn = 0
    if (state.on) {
      input.actions.steering_angle = sa.steering_angle
      input.actions.throttle = sa.throttle
      input.actions.brake = sa.brake
      if (state.pend) {
        // waiting for |v| < 1 m/s while reversing: target speed 0 through the pedal law
        input.actions.throttle = clamp(-spd / TAU / (pp.gain || 1200), 0, 1)
        input.actions.brake = 0
      }
      state.onS += dt
    }
  }
  if (!state.on) {
    state.wdT = undefined
    state.pend = ''
    state.blockT = 0
    if (P.revLeg) {
      // handed back during a back leg: the next switch-on starts from the route again
      P.revLeg = false
      P.srcRp = null
      P.fb = null
    }
    if (state.revM > 0 && Math.abs(e.speed) < 1) state.revM = 0
  }
  var dir = v3 && revAllowed && state.on && P.vT < 0 ? 'rev' : 'fwd'

  av.neural = { on: state.on, justOff: wasOn && !state.on, why: why || failWhy, occ: occ, mov: nMov, conf: conf, dir: dir, revM: v3 ? state.revM : 0 }
  var txt
  if (state.on) txt = 'on ' + (mode === 'always' ? 'always ' : 'crowd ') + 'occ ' + occ.toFixed(2) + ' mov ' + nMov + ' conf ' + conf.toFixed(2)
  else if (why) txt = 'off (' + why + ')'
  else if (state.lock > 0) txt = 'locked ' + state.lock.toFixed(0) + ' s'
  else if (state.cool > 0) txt = 'cooldown ' + state.cool.toFixed(1) + ' s ' + (failWhy || state.last)
  else txt = 'off occ ' + occ.toFixed(2) + ' mov ' + nMov + ' conf ' + conf.toFixed(2)
  if (failWhy) state.last = failWhy
  api.watch('av.neural', txt)
  api.watch('av.neural.n', 'on ' + state.onS.toFixed(1) + ' s, handovers ' + state.handovers + ', fails ' + state.nFail + (v3 ? ', dir ' + dir + ' ' + state.revM.toFixed(1) + ' m' : ''))
  if (state.on && params.neuralDebugDraw !== false && P.aim) {
    // violet: car -> aim point
    api.visualizeLine([pos[0], pos[1] + 1, pos[2]], [P.aim[0], pos[1] + 1, P.aim[1]], '#aa44ff')
  }
  if (state.on && params.neuralTint !== false) {
    state.tinted = true
    return { color: [0.67, 0.27, 1] }
  }
  return tintOff(state)
}

