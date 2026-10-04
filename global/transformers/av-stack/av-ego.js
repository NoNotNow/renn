// AV stack · SENSE / state estimation ("localization" layer).
// Publishes the ego state on the shared blackboard `input.av.ego` for all later stages.
// Also publishes av.vehicle {width, length, height} = max(params, own box collider) used by all planners.
// debug draw (params.debugDraw, default true): cyan = velocity vector.
// Tracked bodies (params.threatIds: entity ids, e.g. pursuers; default none): live positions -> filtered velocities, published as av.threats [{id,x,z,vx,vz,turn}] (turn = recent max observed turn rate rad/s, null until seen moving)
// within params.threatRange (default 120 m). The motion planner predicts them (cost wThreat) and the flee layer below steers the goal away from them:
// params.fleeArea [xmin,xmax,zmin,zmax] (world; required for the flee layer), fleeRadius (m, 16: a goal way passing a near threat closer than this is unsafe),
// fleeMinDist / fleeMaxDist (candidate goal distance, 50 / 110), fleeHold (s a chosen flee goal is kept, 4), fleeTurnPenalty (1.5: score penalty of a candidate needing a turn of 180 deg, growing from 70 deg).
// fleeSim (bool, default off): the flee layer commits to an ESCAPE HEADING chosen by simulation instead of the geometric ring score: 24 headings x 2 speed policies are driven by an idealised car
// (escapeAccel 15 m/s^2, escapeSpeed 36 m/s top, kappa <= maxCurvature, lateral accel <= maxLatAccel) for escapeHorizon (5 s) against the pursuit-predicted pursuers (pure pursuit with their observed turn
// rate, as the motion planner); score = smallest centre distance reached (capped at escapeSafe) + goal alignment / turn penalties. The heading is kept (hysteresis) and the goal is 90 m ahead on it. It also
// triggers when the heading to the real goal is predicted to come within escapeTrigger (m, 16) of a pursuer, which can be far outside the 90 m geometric danger range. escapeRange (m, 160): pursuers considered.
// Goal watchdog (params.goalWatchdog = seconds, default 0 = off; needs fleeArea): a goal the car does not get closer to (>= 8 m) within that time is
// unreachable (outside the walls, boxed in a corner); the car then picks its own open-road goals instead until the source hands over another goal.
// Owns the simulated clock (state.t) so no downstream stage needs a wall clock.
function transform(input, dt, params, state, api) {
  // fresh blackboard every frame (the input object is reused by the runtime)
  var av = (input.av = {})
  // a goal source running in front of this stage hands its mission over via input.goalSource (see av-wander.js)
  if (input.goalSource) {
    av.mission = input.goalSource
    input.goalSource = undefined
  }
  // Goal contract: a source that declares `input.target.isFinal === false` (preset wanderer, ...) makes the stack cruise
  // through its goals instead of braking at each one. (Sources without that flag are single, final goals.)
  if (!av.mission && input.target && input.target.pose && input.target.isFinal === false) {
    var tp = input.target.pose.position
    av.mission = { index: 0, waypoints: [[tp[0], tp[2]]], isFinal: false }
  }
  if (state.t === undefined) {
    state.t = 0
    state.speedF = 0
    state.prevSpeed = 0
    state.accelF = 0
  }
  state.t += dt
  // Vehicle footprint: never plan with a hull smaller than the entity's own box collider (a 4 x 8 m body driven with the
  // 2 x 4 defaults touches every neighbour). params.vehicleWidth / vehicleLength can only enlarge it. Cached (getEntity copies).
  if (state.vehT === undefined || state.t - state.vehT > 2) {
    state.vehT = state.t
    var ent = api.getEntity(input.entityId)
    var sh = ent && ent.shape
    var sc = (ent && ent.scale) || [1, 1, 1]
    state.vehW = sh && sh.type === 'box' ? Math.abs(sh.width * (sc[0] || 1)) : 0
    state.vehL = sh && sh.type === 'box' ? Math.abs(sh.depth * (sc[2] || 1)) : 0
    state.vehH = sh && sh.type === 'box' ? Math.abs(sh.height * (sc[1] || 1)) : 0
  }
  av.vehicle = {
    width: Math.max(params.vehicleWidth || 2, state.vehW || 0),
    length: Math.max(params.vehicleLength || 4, state.vehL || 0),
    height: state.vehH || 0,
  }
  var up = api.getUpVector(input.rotation)
  var fwd = api.vec.normalize(api.vec.projectOntoPlane(api.getForwardVector(input.rotation), up))
  var left = api.vec.normalize(api.vec.cross(up, fwd))
  var speed = api.vec.getForwardSpeed(input.velocity, fwd)
  var yawRate = api.vec.dot(input.angularVelocity, up)
  var a = dt > 1e-6 ? (speed - state.prevSpeed) / dt : 0
  state.prevSpeed = speed
  state.accelF += (a - state.accelF) * Math.min(1, dt * 8)
  state.speedF += (speed - state.speedF) * Math.min(1, dt * 20)
  av.ego = {
    t: state.t,
    dt: dt,
    pos: input.position,
    fwd: fwd,
    left: left,
    up: up,
    speed: speed,
    speedF: state.speedF,
    accel: state.accelF,
    yawRate: yawRate,
    kappa: Math.abs(speed) > 1.5 ? yawRate / speed : 0,
  }
  var tids = params.threatIds
  if (tids && tids.length) {
    if (!state.trk) state.trk = {}
    var thrs = []
    var tRange = params.threatRange || 120
    var tdt = dt > 1e-6 ? dt : 1 / 60
    for (var ti = 0; ti < tids.length; ti++) {
      var tpos = api.getWorldPosition(tids[ti])
      if (!tpos) continue
      var rec = state.trk[tids[ti]]
      if (!rec) rec = state.trk[tids[ti]] = { x: tpos[0], z: tpos[2], vx: 0, vz: 0, psi: null, w: 0, wmax: null }
      else {
        rec.vx += 0.5 * ((tpos[0] - rec.x) / tdt - rec.vx)
        rec.vz += 0.5 * ((tpos[2] - rec.z) / tdt - rec.vz)
        rec.x = tpos[0]
        rec.z = tpos[2]
        // observed turn rate of the body (heading of its filtered velocity): the largest recent value is a lower bound of what it can do (a pursuer
        // that is saturated turns at its limit); the planner predicts it with that instead of a fixed worst case (see threatTurnMin)
        if (rec.vx * rec.vx + rec.vz * rec.vz > 16) {
          var psi = Math.atan2(rec.vz, rec.vx)
          if (rec.psi !== null) {
            var dpsi = psi - rec.psi
            while (dpsi > Math.PI) dpsi -= 2 * Math.PI
            while (dpsi < -Math.PI) dpsi += 2 * Math.PI
            rec.w += Math.min(1, tdt * 8) * (Math.abs(dpsi) / tdt - rec.w)
            rec.wmax = rec.wmax === null ? rec.w : Math.max(rec.w, rec.wmax - 0.3 * tdt)
          }
          rec.psi = psi
        } else rec.psi = null
      }
      var tdx = rec.x - input.position[0]
      var tdz = rec.z - input.position[2]
      if (tdx * tdx + tdz * tdz < tRange * tRange) thrs.push({ id: tids[ti], x: rec.x, z: rec.z, vx: rec.vx, vz: rec.vz, turn: rec.wmax })
    }
    av.threats = thrs
  }
  if (params.fleeArea && input.target && input.target.pose && ((tids && tids.length) || params.goalWatchdog > 0)) fleeGoal(av, av.threats || [], input, params, state)
  api.watch('av.speed', Math.round(speed * 10) / 10)
  if (state.flee) api.watch('av.flee', Math.round(state.flee.x) + ',' + Math.round(state.flee.z))
  if (params.debugDraw !== false) {
    // cyan: velocity vector
    api.visualizeLine(input.position, api.vec.add(input.position, api.vec.scale(input.velocity, 0.6)), '#00e5ff')
  }
  return {}
}

// Flee layer: when the way to the goal leads past a near pursuer, drive to a goal that is away from the pursuers instead
// (candidates on a ring around the car, scored by clearance from the pursuers, heading away, alignment with the real goal and the car's heading).
function fleeGoal(av, thrs, input, params, state) {
  var pos = input.position
  var g0 = input.target.pose.position
  var area = params.fleeArea
  var R = params.fleeRadius != null ? params.fleeRadius : 16
  function danger(gx, gz) {
    var sx = gx - pos[0]
    var sz = gz - pos[2]
    var sl2 = sx * sx + sz * sz + 1e-6
    for (var i = 0; i < thrs.length; i++) {
      var qx = thrs[i].x - pos[0]
      var qz = thrs[i].z - pos[2]
      if (qx * qx + qz * qz > 90 * 90) continue
      var dot = qx * sx + qz * sz
      if (dot <= 0) continue
      var tt = Math.min(1, dot / sl2)
      var ddx = qx - sx * tt
      var ddz = qz - sz * tt
      if (ddx * ddx + ddz * ddz < R * R) return true
    }
    return false
  }
  var fl = state.flee
  var now = state.t
  var bad = false
  if (params.goalWatchdog > 0) {
    var wd = state.wd
    var gDist = Math.sqrt((g0[0] - pos[0]) * (g0[0] - pos[0]) + (g0[2] - pos[2]) * (g0[2] - pos[2]))
    if (!wd || Math.abs(wd.x - g0[0]) > 1 || Math.abs(wd.z - g0[2]) > 1) wd = state.wd = { x: g0[0], z: g0[2], best: gDist, t: now, bad: false }
    else if (gDist < wd.best - 8) {
      wd.best = gDist
      wd.t = now
    } else if (now - wd.t > params.goalWatchdog) wd.bad = true
    bad = wd.bad
    av.goalBad = bad
  }
  var sim = params.fleeSim === true
  var simQ = null
  var simThrs = null
  var simGoalD = 1e9
  var simYaw = 0
  if (sim) {
    var eR = params.escapeRange != null ? params.escapeRange : 160
    simThrs = []
    for (var si = 0; si < thrs.length; si++) {
      var sdx = thrs[si].x - pos[0]
      var sdz = thrs[si].z - pos[2]
      if (sdx * sdx + sdz * sdz < eR * eR) simThrs.push(thrs[si])
    }
    simQ = {
      dt: 0.1,
      H: params.escapeHorizon != null ? params.escapeHorizon : 5,
      kmax: params.maxCurvature || 0.115,
      aLat: params.escapeLatAccel != null ? params.escapeLatAccel : 12,
      aUp: params.escapeAccel != null ? params.escapeAccel : 15,
      aDown: params.chasedDecel || 9,
      vTop: params.escapeSpeed != null ? params.escapeSpeed : 36,
      vTurn: params.escapeTurnSpeed != null ? params.escapeTurnSpeed : 12,
      lead: params.threatLead != null ? params.threatLead : 0.3,
      turnMax: params.threatTurnRate || 1.5,
      turnMin: params.threatTurnMin || 0,
    }
    simYaw = Math.atan2(av.ego.fwd[2], av.ego.fwd[0])
    if (simThrs.length) simGoalD = escapeSim(simThrs, pos, simYaw, Math.max(0, av.ego.speedF), Math.atan2(g0[2] - pos[2], g0[0] - pos[0]), 0, simQ)
  }
  var simDanger = sim && simThrs.length > 0 && simGoalD < (params.escapeTrigger != null ? params.escapeTrigger : 16)
  if (sim && fl && now - fl.t0 < (params.escapeHold != null ? params.escapeHold : 1.5)) simDanger = true
  if (!bad && !simDanger && !danger(g0[0], g0[2])) {
    state.flee = null
    av.fleeing = false
    return
  }
  if (sim && simThrs.length) {
    fleeSim(av, input, params, state, g0, area, fl, now, simThrs, simQ, simYaw)
    return
  }
  if (fl) {
    var rdx = fl.x - pos[0]
    var rdz = fl.z - pos[2]
    if (now - fl.t > (params.fleeHold != null ? params.fleeHold : 4) || rdx * rdx + rdz * rdz < 15 * 15 || (!bad && danger(fl.x, fl.z))) fl = null
  }
  if (!fl) {
    var dMin = params.fleeMinDist != null ? params.fleeMinDist : 50
    var dMax = params.fleeMaxDist != null ? params.fleeMaxDist : 110
    var hx = av.ego.fwd[0]
    var hz = av.ego.fwd[2]
    var gl = Math.sqrt((g0[0] - pos[0]) * (g0[0] - pos[0]) + (g0[2] - pos[2]) * (g0[2] - pos[2])) + 1e-6
    var fleeTurnPen = params.fleeTurnPenalty != null ? params.fleeTurnPenalty : 1.5
    var best = null
    var bestS = -Infinity
    for (var pass = 0; pass < 2 && !best; pass++) {
      for (var ai = 0; ai < 24; ai++) {
        var ang = (ai * Math.PI * 2) / 24
        var ux = Math.cos(ang)
        var uz = Math.sin(ang)
        for (var dd = dMin; dd <= dMax + 1e-6; dd += (dMax - dMin) / 2 || 1) {
          var cx = pos[0] + ux * dd
          var cz = pos[2] + uz * dd
          if (cx < area[0] + 10 || cx > area[1] - 10 || cz < area[2] + 10 || cz > area[3] - 10) continue
          if (pass === 0 && danger(cx, cz)) continue
          var clear = 150
          var away = 0
          var ws = 0
          for (var k = 0; k < thrs.length; k++) {
            var ex = cx - thrs[k].x
            var ez = cz - thrs[k].z
            var ed = Math.sqrt(ex * ex + ez * ez)
            if (ed < clear) clear = ed
            var px = pos[0] - thrs[k].x
            var pz = pos[2] - thrs[k].z
            var pd = Math.sqrt(px * px + pz * pz) + 1e-6
            if (pd < 90) {
              var wg = 1 / (pd + 10)
              away += (wg * (ux * px + uz * pz)) / pd
              ws += wg
            }
          }
          // a flee goal that needs a big turn is reached at curve speed (a hairpin is ~9 m/s): a chaser at 20+ m/s catches the car in the turn
          // (head-on chaser: the 'away' goal behind the car sent it into a U-turn across the chaser's nose). Penalise the turn beyond ~70 deg.
          var turn = Math.acos(Math.max(-1, Math.min(1, ux * hx + uz * hz)))
          var sc = clear / 150 + (ws > 0 ? away / ws : 0) + (bad ? 0 : 0.5) * ((ux * (g0[0] - pos[0]) + uz * (g0[2] - pos[2])) / gl) + 0.7 * (ux * hx + uz * hz) - fleeTurnPen * Math.max(0, (turn - 1.2) / 1.9)
          if (sc > bestS) {
            bestS = sc
            best = [cx, cz]
          }
        }
      }
    }
    if (best) fl = { x: best[0], z: best[1], t: now }
  }
  state.flee = fl
  av.fleeing = !!fl
  if (fl) input.target.pose.position = [fl.x, g0[1], fl.z]
}

// Escape simulation (fleeSim): an idealised car turns to the world heading `psi` (angle in the x/z plane, ux = cos, uz = sin) while the pursuers home on it; returns the smallest
// centre distance reached. pol 0 = keep accelerating to the top speed, pol 1 = slow down to a turning speed until roughly aligned (a tight turn at low speed, then run).
function escapeSim(thrs, pos, yaw0, v0, psi, pol, q) {
  var x = pos[0]
  var z = pos[2]
  var yaw = yaw0
  var v = Math.max(0, v0)
  var n = thrs.length
  var px = []
  var pz = []
  var ph = []
  var ps = []
  var pl = []
  var pvx = []
  var pvz = []
  for (var i = 0; i < n; i++) {
    var t = thrs[i]
    px.push(t.x)
    pz.push(t.z)
    pvx.push(t.vx)
    pvz.push(t.vz)
    ps.push(Math.sqrt(t.vx * t.vx + t.vz * t.vz))
    ph.push(Math.atan2(t.vz, t.vx))
    var lim = q.turnMax
    if (t.turn != null && q.turnMin > 0) lim = Math.min(q.turnMax, Math.max(q.turnMin, 1.3 * t.turn + 0.15))
    pl.push(lim)
  }
  var dt = q.dt
  var steps = Math.round(q.H / dt)
  var minD = 1e9
  for (var s = 0; s < steps; s++) {
    var err = psi - yaw
    while (err > Math.PI) err -= 2 * Math.PI
    while (err < -Math.PI) err += 2 * Math.PI
    var kLim = Math.min(q.kmax, q.aLat / (v * v + 1))
    var k = err / (Math.max(v, 4) * 0.35)
    k = k > kLim ? kLim : k < -kLim ? -kLim : k
    var vt = pol === 1 && Math.abs(err) > 0.4 ? q.vTurn : q.vTop
    var dv = vt - v
    var up = q.aUp * dt
    var dn = q.aDown * dt
    v += dv > up ? up : dv < -dn ? -dn : dv
    yaw += k * v * dt
    var cy = Math.cos(yaw)
    var sy = Math.sin(yaw)
    x += cy * v * dt
    z += sy * v * dt
    var tx = x + cy * v * q.lead
    var tz = z + sy * v * q.lead
    for (var j = 0; j < n; j++) {
      if (ps[j] > 4) {
        var dh = Math.atan2(tz - pz[j], tx - px[j]) - ph[j]
        while (dh > Math.PI) dh -= 2 * Math.PI
        while (dh < -Math.PI) dh += 2 * Math.PI
        var l = pl[j] * dt
        ph[j] += dh > l ? l : dh < -l ? -l : dh
        px[j] += Math.cos(ph[j]) * ps[j] * dt
        pz[j] += Math.sin(ph[j]) * ps[j] * dt
      } else {
        px[j] += pvx[j] * dt
        pz[j] += pvz[j] * dt
      }
      var ddx = px[j] - x
      var ddz = pz[j] - z
      var d = ddx * ddx + ddz * ddz
      if (d < minD) minD = d
    }
  }
  return Math.sqrt(minD)
}

// fleeSim: pick / keep the escape heading (see the header). The committed heading lives in state.flee = {ang, t, t0, x, z}; the goal handed down is 90 m ahead on it.
function fleeSim(av, input, params, state, g0, area, fl, now, thrs, q, yaw0) {
  var pos = input.position
  var v0 = Math.max(0, av.ego.speedF)
  var safeD = params.escapeSafe != null ? params.escapeSafe : 20
  var wAlign = params.escapeAlign != null ? params.escapeAlign : 4
  var turnPen = params.fleeTurnPenalty != null ? params.fleeTurnPenalty : 1.5
  var D = params.escapeGoalDist != null ? params.escapeGoalDist : 90
  var goalAng = Math.atan2(g0[2] - pos[2], g0[0] - pos[0])
  function scoreOf(ang) {
    var d0 = escapeSim(thrs, pos, yaw0, v0, ang, 0, q)
    var d1 = escapeSim(thrs, pos, yaw0, v0, ang, 1, q)
    var d = d0 > d1 ? d0 : d1
    var turn = Math.abs(ang - yaw0)
    while (turn > Math.PI) turn = Math.abs(turn - 2 * Math.PI)
    var al = Math.cos(ang - goalAng)
    return { d: d, score: (d > safeD ? safeD : d) + wAlign * al - 2 * turnPen * Math.max(0, (turn - 1.2) / 1.9) }
  }
  // the committed heading is re-simulated from the current state; another one replaces it only when clearly better
  var cur = fl && fl.ang != null ? scoreOf(fl.ang) : null
  var evalDue = !fl || fl.ang == null || now - (fl.te || 0) > (params.escapeEvalEvery != null ? params.escapeEvalEvery : 0.15)
  if (evalDue || !cur) {
    var best = null
    var bestS = -Infinity
    for (var ai = 0; ai < 24; ai++) {
      var ang = (ai * Math.PI * 2) / 24 - Math.PI
      var cx = pos[0] + Math.cos(ang) * D
      var cz = pos[2] + Math.sin(ang) * D
      if (cx < area[0] + 10 || cx > area[1] - 10 || cz < area[2] + 10 || cz > area[3] - 10) continue
      var r = scoreOf(ang)
      if (r.score > bestS) {
        bestS = r.score
        best = { ang: ang, d: r.d }
      }
    }
    if (best) {
      if (!cur || bestS > cur.score + (params.escapeSwitch != null ? params.escapeSwitch : 3)) fl = { ang: best.ang, t: now, t0: fl && fl.t0 != null && cur ? fl.t0 : now, te: now }
      else {
        fl.te = now
      }
    }
  }
  if (!fl || fl.ang == null) {
    state.flee = null
    av.fleeing = false
    return
  }
  fl.x = pos[0] + Math.cos(fl.ang) * D
  fl.z = pos[2] + Math.sin(fl.ang) * D
  state.flee = fl
  av.fleeing = true
  input.target.pose.position = [fl.x, g0[1], fl.z]
}
