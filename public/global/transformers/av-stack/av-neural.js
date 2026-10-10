/* @params
[
  {"key":"neuralMode","label":"Neural drive mode","type":"enum","options":[{"value":"off"},{"value":"always"},{"value":"auto"}],"default":"off","group":"Neural","description":"'off' = classic stack only (bit-identical); 'always' = the net drives whenever allowed (debug); 'auto' = the net takes over in crowded surroundings and hands back when they clear."},
  {"key":"neuralVMax","label":"Neural speed cap","type":"number","default":12,"min":0,"unit":"m/s","group":"Neural","description":"Upper bound of the net target speed while it drives."},
  {"key":"neuralGain","label":"Neural pedal gain","type":"number","default":1200,"min":1,"group":"Neural","description":"Actuator acceleration per unit pedal the net was trained on (power / mass of the 4 x 8 car).","advanced":true},
  {"key":"neuralWeights","label":"Neural weights","type":"json","group":"Neural","description":"Flat v2 genome (272 numbers); default = the weights shipped in the stage params.","advanced":true},
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
  {"key":"neuralDebugDraw","label":"Draw neural aim line","type":"boolean","default":true,"group":"Debug","advanced":true}
]
*/
var ANGLES = [0,0.17453292519943295,-0.17453292519943295,0.3490658503988659,-0.3490658503988659,0.6108652381980153,-0.6108652381980153,0.9599310885968813,-0.9599310885968813,1.3962634015954636,-1.3962634015954636,2.0943951023931953,-2.0943951023931953,3.141592653589793]
var N_IN = 24, H = 10, RANGE = 50, VF = 30, VR = 8, TAU = 0.05
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

// AV stack · NEURAL drive mode (Phase 1: v2 policy, 24 inputs, no speed command). GENERATED from src/policyEvolution/policyStage.ts: do not edit by hand.
// The shipped net (the policy evolved in src/policyEvolution) follows the command the AV stack hands over: the car is projected onto av.routePath
// (fallback: straight line to av.carrot / maze goal / input.target), aim = clamp(lmin + tau * v, lmin, 40) m ahead along it, next = direction of the
// segment beyond the aim, refreshed every period s: the SAME rule as in training (deriveCmd above). It writes steering / throttle / brake; the lateral,
// longitudinal and supervisor stages yield while av.neural.on (like av.manual), the AEB does not.
// neuralMode: 'off' (default, returns before anything is touched = bit-identical) | 'always' (debug) | 'auto' (trigger from the net's own rays + av.movers,
// hysteresis + dwell). Never ON: manual override, manoeuvre (av.override), hold at the final goal, tracked threats in range, vehicle not ~4 x 8, no aim, cooldown / lockout.
// Watchdog (forces OFF + cooldown; 3 fails in 30 s lock it out): < neuralStallM m along the command in neuralStallT s, AEB braking for neuralAebT s,
// hull-ray distance < 0.4 m at > 3 m/s, side speed > 4 m/s, a classic manoeuvre starting while the net drives. Pedal law and gain as in training (neuralGain 1200); target speed capped at neuralVMax.
// Watch: av.neural (on/off + why), av.neural.n (onS, handovers, fails). Overlay: violet line car -> aim.
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
function transform(input, dt, params, state, api) {
  var mode = params.neuralMode
  if (mode !== 'always' && mode !== 'auto') {
    // switched off at runtime: forget the state so a later switch-on starts clean
    if (state.t !== undefined) state.t = undefined
    return {}
  }
  var av = input.av
  if (!av || !av.ego || !input.actions) return {}
  if (!av.plan) {
    // the stage must run after the motion planner (library priority 4.55: between the speed planner and the supervisor)
    api.watch('av.neural', 'off (no av.plan yet: stage priority must be after the motion planner)')
    return {}
  }
  var w = params.neuralWeights || params.w
  if (!w || w.length !== N_IN * H + H + 2 * H + 2) return {}
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
  }
  state.t += dt
  state.dwell += dt
  if (state.cool > 0) state.cool -= dt
  if (state.lock > 0) state.lock -= dt
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
  if (!why) {
    if (rp && rp.length > 1) {
      if (rp !== P.srcRp) {
        P.srcRp = rp
        P.fb = null
        newChain(P, rp, pos[0], pos[2])
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
          newChain(P, P.fb, pos[0], pos[2])
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
        gain: params.neuralGain != null ? params.neuralGain : 1200,
        vMax: params.neuralVMax != null ? params.neuralVMax : 12,
        noise: 0,
        cmd: { lmin: params.neuralLmin != null ? params.neuralLmin : 8, tau: params.neuralTau != null ? params.neuralTau : 0.6, period: params.neuralPeriod != null ? params.neuralPeriod : 0.5, noiseDeg: 0, seed: 1 },
      }
    }
    policyStep(sin, dt, pp, P, api)
    var x = P.x
    // trigger inputs from the net's own rays: x = 1 - dist / RANGE (0 = no hit)
    var occR = params.neuralOccR != null ? params.neuralOccR : 12
    var confR = params.neuralConfR != null ? params.neuralConfR : 18
    var occN = 0, confN = 0, minAll = RANGE
    for (var ri = 0; ri < ANGLES.length; ri++) {
      var rd = x[ri] > 0 ? (1 - x[ri]) * RANGE : RANGE
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
      if (!failWhy && minAll < 0.4 && Math.abs(spd) > 3) failWhy = 'close'
      if (!failWhy && Math.abs(x[ANGLES.length + 1]) * 10 > 4) failWhy = 'slide'
      if (failWhy) {
        state.on = false
        state.dwell = 0
        state.candOn = 0
        state.candOff = 0
        registerFail(state, params)
      } else if (mode === 'auto') {
        if (clear) state.candOff += dt
        else state.candOff = 0
        if (state.candOff >= (params.neuralOffT != null ? params.neuralOffT : 1.5) && state.dwell >= dwellMin) {
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
      state.onS += dt
    }
  }
  if (!state.on) state.wdT = undefined

  av.neural = { on: state.on, justOff: wasOn && !state.on, why: why || failWhy, occ: occ, mov: nMov, conf: conf }
  var txt
  if (state.on) txt = 'on ' + (mode === 'always' ? 'always ' : 'crowd ') + 'occ ' + occ.toFixed(2) + ' mov ' + nMov + ' conf ' + conf.toFixed(2)
  else if (why) txt = 'off (' + why + ')'
  else if (state.lock > 0) txt = 'locked ' + state.lock.toFixed(0) + ' s'
  else if (state.cool > 0) txt = 'cooldown ' + state.cool.toFixed(1) + ' s ' + (failWhy || state.last)
  else txt = 'off occ ' + occ.toFixed(2) + ' mov ' + nMov + ' conf ' + conf.toFixed(2)
  if (failWhy) state.last = failWhy
  api.watch('av.neural', txt)
  api.watch('av.neural.n', 'on ' + state.onS.toFixed(1) + ' s, handovers ' + state.handovers + ', fails ' + state.nFail)
  if (state.on && params.neuralDebugDraw !== false && P.aim) {
    // violet: car -> aim point
    api.visualizeLine([pos[0], pos[1] + 1, pos[2]], [P.aim[0], pos[1] + 1, P.aim[1]], '#aa44ff')
  }
  return {}
}

