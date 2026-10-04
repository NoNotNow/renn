// AV stack · SENSE / state estimation ("localization" layer).
// Publishes the ego state on the shared blackboard `input.av.ego` for all later stages.
// Also publishes av.vehicle {width, length, height} = max(params, own box collider) used by all planners.
// debug draw (params.debugDraw, default true): cyan = velocity vector.
// Tracked bodies (params.threatIds: entity ids, e.g. pursuers; default none): live positions -> filtered velocities, published as av.threats [{id,x,z,vx,vz,turn}] (turn = recent max observed turn rate rad/s, null until seen moving)
// within params.threatRange (default 120 m). The motion planner predicts them (cost wThreat) and the flee layer below steers the goal away from them:
// params.fleeArea [xmin,xmax,zmin,zmax] (world; required for the flee layer), fleeRadius (m, 16: a goal way passing a near threat closer than this is unsafe),
// fleeMinDist / fleeMaxDist (candidate goal distance, 50 / 110), fleeHold (s a chosen flee goal is kept, 4), fleeTurnPenalty (1.5: score penalty of a candidate needing a turn of 180 deg, growing from 70 deg).
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
  if (!bad && !danger(g0[0], g0[2])) {
    state.flee = null
    av.fleeing = false
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
