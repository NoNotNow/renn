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
// gapWalls (bool, default OFF; opt-in, needs gapCommit): the escape headings also need a free run over the persistent static map (av.prevSmap = last frame's av.smap, 2 m cells, car half-width + gapWallClear 3.5 m): headings shorter than gapWallMin (60 m) are not candidates unless that costs more than gapWallTrade (8) score points against the best short one (race first); none long enough = the longest run; the goal is put at the last free point of the run (min 8 m, gapWallClamp:false = off), a held goal whose heading hits a known wall is re-picked, a goal clamped that way is re-picked once the car is within gapReach (10 m). Cuts the lab seed-6 maze-pocket shuttle (path 955 -> 1500-1750 m) but flips other lab seeds (chaotic), hence off.
// gapCommit (bool, default ON; false disables): fleeSim's escape-heading search, but only against >= 2 pursuers, and the chosen goal (escapeGoalDist 150 m) is an ABSOLUTE point kept until reached / clearly worse (escapeSwitch 6, eval every 0.3 s) so the motion planner gets a fixed target. Also with gapCommit: gapWarmup (s, 0.1: no commit before the pursuers' velocities are filtered), gapTrackRange (m, 160: far list av.threatsFar for the sim only), escapeAccel default 9, av.fleeSim (motion planner `fleeAimDirect`, default on, aims at the committed goal instead of the route carrot).
// goalOpen (bool, default ON; false disables; flee / escape goals only, never mission goals): candidate goals are scored by openness on the persistent static map (av.prevSmap, 2 m cells): the geometric ring subtracts goalOpenW (1.5) x (wall cells within goalOpenRadius 15 m of the candidate / 100; goalOpenLine:true also the share of the straight way past the first wall, off: it flips corner-trap), the gapCommit escape headings subtract goalOpenGap (6) x (1 - free run / goalOpenRun 60 m); a held escape goal is re-scored every evaluation so new walls around it make it lose.
// fleeLos (bool, default off): the geometric flee / own-goal candidates are also scored by line of sight (one ray per heading from the hull edge): a goal whose straight way is blocked by a wall
// before it is reached (maze, building) is penalised, free length is a bonus, so the car explores along open corridors instead of shuffling in front of a wall towards a goal behind it.
// Goal watchdog (params.goalWatchdog = seconds, default 0 = off; needs fleeArea): a goal the car does not get closer to (>= 8 m) within that time is
// unreachable (outside the walls, boxed in a corner); the car then picks its own open-road goals instead until the source hands over another goal.
// Owns the simulated clock (state.t) so no downstream stage needs a wall clock.
// PRESETS (params.preset, OPT-IN; unset / 'none' = the raw per-stage defaults, no expansion, as before presets existed): one switch that expands to the feature params the stages gate on. Explicit params (pipe binding, scope, stage)
// always override the preset's value for the same key. This stage runs first and publishes the preset table as `av.preset`; every later stage merges its OWN params over it
// (so per-layer scopeParams / stageParams keep working; a stage used without this one sees its raw params). Keep the tables in sync with agent-context/feature-av-stack.md ("Using the AV autopilot in your game").
//  car             generic vehicle: CPU budget 'eco' (economy mode: goal fixation, calm-cruise scanFocus; budget: 'full' in the binding = old behaviour), curvature smoothing + plan hysteresis, footprint-aware hand-back, travel-direction zoned scan, goal watchdog (unreachable goals are replaced by open-road goals),
//                  prediction params (inert without threatIds), selfCalibrate (the longitudinal actuator identifies itself at the first launch, see av-control-longitudinal.js).
//  chaser-evasion  car + style 'escape' (manoeuvres / reversing as fast as the plan can be stopped, not 3 m/s) + pursuit evasion tuning (obstacle slow radius 1 m, minSpeed 9.4, comfortDecel 4, wThreat, hit floor, flee layer); give it `threatIds`.
//  maze            car + persistent static map + 2D goal-distance field (goals behind walls, dead ends, pockets).
//  arena           chaser-evasion + maze.
var AV_PRESET_CAR = {
  budget: 'eco',
  selfCalibrate: true,
  curveSmooth: 0.6,
  curveDeadband: 0.004,
  switchMargin: 3,
  handbackMargin: 0.9,
  maneuverRunSpeed: 7,
  fleeStoppedSpeed: 1.5,
  fwdFovDeg: 70,
  goalWatchdog: 10,
  wRequired: 300,
  threatRadius: 2.8,
  threatBodyRadius: 4.5,
  threatTurnRate: 1.5,
  threatTurnMin: 0.5,
  threatHorizon: 4,
  threatAccel: 7,
  chasedDecel: 9,
}
var AV_PRESET_EVASION = { style: 'escape', wThreat: 30, threatHitFloor: 250, comfortDecel: 4, minSpeed: 9.4, obstacleSlowRadius: 1 }
var AV_PRESET_MAZE = { staticMap: true, fieldHeuristic: true }
// preset table for params.preset (null = none). Built once per preset name; fleeArea defaults to the drivable area, else a 740 m box around the START position.
function avPreset(params, state, pos) {
  var name = params.preset
  if (!name || name === 'none') return null
  if (state.presetName === name && state.preset) return state.preset
  var base = {}
  var layers = [AV_PRESET_CAR]
  if (name === 'chaser-evasion' || name === 'arena') layers.push(AV_PRESET_EVASION)
  if (name === 'maze' || name === 'arena') layers.push(AV_PRESET_MAZE)
  for (var li = 0; li < layers.length; li++) for (var k in layers[li]) base[k] = layers[li][k]
  // flee / own-goal area (open ground: no limit, candidates are 50-110 m away)
  if (!params.fleeArea) base.fleeArea = params.drivableArea || [pos[0] - 370, pos[0] + 370, pos[2] - 370, pos[2] + 370]
  state.presetName = name
  state.preset = base
  return base
}
function transform(input, dt, params, state, api) {
  var preset = avPreset(params, state, input.position)
  if (preset) params = state.pmP === params ? state.pm : ((state.pmP = params), (state.pm = Object.assign({}, preset, params)))
  // fresh blackboard every frame (the input object is reused by the runtime)
  var prevAv = input.av
  var av = (input.av = {})
  // work counters (CPU budget measure, integers only, no effect on behaviour): av.work is this frame's tally, filled by perception (rays), route planner (astarExp, fieldCells) and motion planner (freeLen, cands);
  // the tally of last frame (complete: every stage has run) is added to a cumulative total published as watch 'av.work' = 'rays freeLen cands astarExp fieldCells' (fixtures read it at the end of a run)
  av.work = { rays: 0, freeLen: 0, cands: 0, astarExp: 0, fieldCells: 0 }
  var wt = state.workTot || (state.workTot = [0, 0, 0, 0, 0])
  if (prevAv && prevAv.work) {
    var pw = prevAv.work
    wt[0] += pw.rays
    wt[1] += pw.freeLen
    wt[2] += pw.cands
    wt[3] += pw.astarExp
    wt[4] += pw.fieldCells
  }
  api.watch('av.work', wt.join(' '))
  if (preset) av.preset = preset
  // the route planner (fieldHeuristic) leaves the obstacle-aware distance to its goal on last frame's blackboard (goal watchdog: a long detour is progress)
  if (prevAv && prevAv.fieldGoal) av.prevField = prevAv.fieldGoal
  // economy mode: last frame's goal fixation (av-motion-planner) steers this frame's narrow perception cone
  if (prevAv && prevAv.fix) av.prevFix = prevAv.fix
  // scanFocus (av-perception): last frame's route / carrot / blocked plan decide whether this frame's perception may stay narrow
  if (prevAv) {
    av.prevRoute = prevAv.route
    av.prevCarrot = prevAv.carrot
    av.prevBlocked = !!(prevAv.plan && (prevAv.plan.blocked || prevAv.plan.override || !(prevAv.plan.free >= 0.9 * prevAv.plan.horizon)))
  }
  // last frame's persistent static map (gapWalls: free run of the escape headings)
  if (prevAv && prevAv.smap) av.prevSmap = prevAv.smap
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
    var farRange = params.gapCommit !== false ? (params.gapTrackRange != null ? params.gapTrackRange : 160) : 0
    var far = []
    var tdt = dt > 1e-6 ? dt : 1 / 60
    for (var ti = 0; ti < tids.length; ti++) {
      var tpos = api.getWorldPosition(tids[ti])
      if (!tpos) continue
      var rec = state.trk[tids[ti]]
      if (!rec) rec = state.trk[tids[ti]] = { x: tpos[0], z: tpos[2], vx: 0, vz: 0, psi: null, w: 0, wmax: null, age: 0 }
      else {
        rec.age += tdt
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
      var tEnt = { id: tids[ti], x: rec.x, z: rec.z, vx: rec.vx, vz: rec.vz, turn: rec.wmax, age: rec.age }
      if (tdx * tdx + tdz * tdz < tRange * tRange) thrs.push(tEnt)
      if (tdx * tdx + tdz * tdz < Math.max(tRange, farRange) * Math.max(tRange, farRange)) far.push(tEnt)
    }
    av.threats = thrs
    av.threatsFar = far
  }
  if (params.fleeArea && input.target && input.target.pose && ((tids && tids.length) || params.goalWatchdog > 0)) fleeGoal(av, av.threats || [], input, params, state, api)
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
function fleeGoal(av, thrs, input, params, state, api) {
  var pos = input.position
  var g0 = input.target.pose.position
  var area = params.fleeArea
  var R = params.fleeRadius != null ? params.fleeRadius : 16
  function danger(gx, gz) {
    var sx = gx - pos[0]
    var sz = gz - pos[2]
    var sl2 = sx * sx + sz * sz + 1e-6
    for (var i = 0; i < thrs.length; i++) {
      // fleeStoppedSpeed (m/s, default 0 = off): a stopped body (parked car, stalled chaser) is an obstacle for the planners (memory + prediction), not a reason to flee elsewhere
      if (params.fleeStoppedSpeed > 0 && thrs[i].vx * thrs[i].vx + thrs[i].vz * thrs[i].vz < params.fleeStoppedSpeed * params.fleeStoppedSpeed) continue
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
    var pf = av.prevField
    var usesField = !!(pf && Math.abs(pf.x - g0[0]) < 1.5 && Math.abs(pf.z - g0[2]) < 1.5 && pf.d < 1e8)
    if (usesField) gDist = pf.d
    if (!wd || Math.abs(wd.x - g0[0]) > 1 || Math.abs(wd.z - g0[2]) > 1 || (wd.f && !usesField)) wd = state.wd = { x: g0[0], z: g0[2], best: gDist, t: now, bad: false, f: usesField }
    else if (usesField && !wd.f) {
      // the obstacle-aware distance replaces the euclidean one: restart the window with it
      wd.f = true
      wd.best = gDist
      wd.t = now
    } else if (gDist < wd.best - 8) {
      wd.best = gDist
      wd.t = now
    } else if (now - wd.t > params.goalWatchdog) wd.bad = true
    // the obstacle-aware distance says the goal is reachable without crossing a known wall (a field value >= 600 m crosses one): a long detour is not an unreachable goal
    if (usesField && pf.d < 600) {
      wd.bad = false
      wd.t = now
    }
    bad = wd.bad
    av.goalBad = bad
  }
  var gap = params.gapCommit !== false
  var sim = params.fleeSim === true || gap
  var simQ = null
  var simThrs = null
  var simGoalD = 1e9
  var simYaw = 0
  if (sim) {
    var eR = params.escapeRange != null ? params.escapeRange : 160
    simThrs = []
    var simSrc = av.threatsFar || thrs
    for (var si = 0; si < simSrc.length; si++) {
      var sdx = simSrc[si].x - pos[0]
      var sdz = simSrc[si].z - pos[2]
      if (sdx * sdx + sdz * sdz < eR * eR) simThrs.push(simSrc[si])
    }
    simQ = {
      dt: 0.1,
      H: params.escapeHorizon != null ? params.escapeHorizon : 5,
      kmax: params.maxCurvature || 0.115,
      aLat: params.escapeLatAccel != null ? params.escapeLatAccel : 12,
      aUp: params.escapeAccel != null ? params.escapeAccel : gap ? 9 : 15,
      aDown: params.chasedDecel || 9,
      vTop: params.escapeSpeed != null ? params.escapeSpeed : 36,
      vTurn: params.escapeTurnSpeed != null ? params.escapeTurnSpeed : 12,
      lead: params.threatLead != null ? params.threatLead : 0.3,
      turnMax: params.threatTurnRate || 1.5,
      turnMin: params.threatTurnMin || 0,
    }
    // gapCommit alone only acts against >= 2 pursuers (a lone chaser keeps the geometric flee layer)
    if (gap && params.fleeSim !== true && simThrs.length < 2) sim = false
    // gapWarmup (s, 0 = off): a pursuer's filtered velocity needs a few frames; before that it reads as parked and the sim calls every heading safe (a heading committed at t = 0.02 s that was never revised)
    var gw = params.gapWarmup != null ? params.gapWarmup : gap ? 0.1 : 0
    if (sim && gw > 0 && !fl) {
      for (var wi = 0; wi < simThrs.length; wi++)
        if (simThrs[wi].age < gw) {
          av.fleeing = false
          return
        }
    }
    simYaw = Math.atan2(av.ego.fwd[2], av.ego.fwd[0])
    if (sim && simThrs.length) simGoalD = escapeSim(simThrs, pos, simYaw, Math.max(0, av.ego.speedF), Math.atan2(g0[2] - pos[2], g0[0] - pos[0]), 0, simQ)
  }
  var simDanger = sim && simThrs.length > 0 && simGoalD < (params.escapeTrigger != null ? params.escapeTrigger : 16)
  if (sim && fl && fl.gap && fl.gx != null) {
    var gdx = fl.gx - pos[0]
    var gdz = fl.gz - pos[2]
    if (gdx * gdx + gdz * gdz > 25 * 25) simDanger = true
  }
  if (sim && fl && now - fl.t0 < (params.escapeHold != null ? params.escapeHold : 1.5)) simDanger = true
  if (!sim && fl && fl.gap) fl = state.flee = null
  if (!bad && !simDanger && !danger(g0[0], g0[2])) {
    state.flee = null
    av.fleeing = false
    return
  }
  if (sim && simThrs.length) {
    if (fleeSim(av, input, params, state, g0, area, fl, now, simThrs, simQ, simYaw) !== false) return
    fl = null
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
    var losCache = {}
    var og = params.goalOpen !== false && av.prevSmap && av.prevSmap.list && av.prevSmap.list.length ? wallGrid(av.prevSmap.list, state) : null
    var oW = params.goalOpenW != null ? params.goalOpenW : 1.5
    var oR = params.goalOpenRadius != null ? params.goalOpenRadius : 15
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
          var los = 0
          if (params.fleeLos === true) {
            var lk = ai + ':' + Math.round(dd)
            if (!losCache[lk]) {
              var lr = api.raycast([pos[0] + ux * 5, pos[1], pos[2] + uz * 5], [ux, 0, uz], dMax + 10, { visualize: false })
              losCache[lk] = lr.hit ? lr.distance + 5 : dMax + 15
            }
            var freeLen = losCache[lk]
            los = freeLen < dd * 0.85 ? -2 + freeLen / dd : 0.4 * Math.min(1, freeLen / dMax)
          }
          var turn = Math.acos(Math.max(-1, Math.min(1, ux * hx + uz * hz)))
          var op = og && oW > 0 ? oW * (Math.min(1, openCells(og, cx, cz, oR) / 100) + (params.goalOpenLine === true ? wallShare(og, pos[0], pos[2], cx, cz) : 0)) : 0
          var sc = -op + clear / 150 + (ws > 0 ? away / ws : 0) + (bad ? 0 : 0.5) * ((ux * (g0[0] - pos[0]) + uz * (g0[2] - pos[2])) / gl) + 0.7 * (ux * hx + uz * hz) + los - fleeTurnPen * Math.max(0, (turn - 1.2) / 1.9)
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

// Static-map free run (gapWalls): persistent wall points hashed into 2 m cells (incremental, the map list only grows); freeRun marches a heading from (x, z) and returns the distance to the first
// cell within `half` m of a map point (0 = blocked at once; `maxD` = free). The first 4 m are skipped (walls hugging the hull are the planners' business).
function wallGrid(list, state) {
  var g = state.wg
  if (!g || g.n > list.length) g = state.wg = { n: 0, set: {} }
  for (; g.n < list.length; g.n++) g.set[Math.floor(list[g.n][0] / 2) * 100003 + Math.floor(list[g.n][1] / 2)] = 1
  return g
}
function freeRun(g, x, z, ang, maxD, half) {
  var cx = Math.cos(ang)
  var cz = Math.sin(ang)
  var r = Math.max(1, Math.ceil(half / 2) - 1)
  for (var d = 4; d <= maxD; d += 2) {
    var px = Math.floor((x + cx * d) / 2)
    var pz = Math.floor((z + cz * d) / 2)
    for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) if (g.set[(px + ox) * 100003 + pz + oz]) return d - 2
  }
  return maxD
}

function openCells(g, x, z, R) {
  var r = Math.ceil(R / 2)
  var px = Math.floor(x / 2)
  var pz = Math.floor(z / 2)
  var n = 0
  for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) if (ox * ox + oz * oz <= r * r && g.set[(px + ox) * 100003 + pz + oz]) n++
  return n
}
// share (0..1) of the straight way (x0,z0)->(x1,z1) lying beyond the first wall cell (0 = free)
function wallShare(g, x0, z0, x1, z1) {
  var dx = x1 - x0
  var dz = z1 - z0
  var L = Math.sqrt(dx * dx + dz * dz) + 1e-6
  for (var d = 4; d <= L; d += 2) {
    var px = Math.floor((x0 + (dx * d) / L) / 2)
    var pz = Math.floor((z0 + (dz * d) / L) / 2)
    for (var ox = -1; ox <= 1; ox++) for (var oz = -1; oz <= 1; oz++) if (g.set[(px + ox) * 100003 + pz + oz]) return 1 - d / L
  }
  return 0
}

// fleeSim: pick / keep the escape heading (see the header). The committed heading lives in state.flee = {ang, t, t0, x, z}; the goal handed down is 90 m ahead on it.
function fleeSim(av, input, params, state, g0, area, fl, now, thrs, q, yaw0) {
  var pos = input.position
  var v0 = Math.max(0, av.ego.speedF)
  var safeD = params.escapeSafe != null ? params.escapeSafe : 20
  var wAlign = params.escapeAlign != null ? params.escapeAlign : 4
  var turnPen = params.fleeTurnPenalty != null ? params.fleeTurnPenalty : 1.5
  var gap = params.gapCommit !== false
  var D = params.escapeGoalDist != null ? params.escapeGoalDist : gap ? 150 : 90
  var goalAng = Math.atan2(g0[2] - pos[2], g0[0] - pos[0])
  var walls = gap && params.gapWalls === true && av.prevSmap && av.prevSmap.list && av.prevSmap.list.length ? wallGrid(av.prevSmap.list, state) : null
  var og = params.goalOpen !== false && av.prevSmap && av.prevSmap.list && av.prevSmap.list.length ? wallGrid(av.prevSmap.list, state) : null
  var oW = params.goalOpenGap != null ? params.goalOpenGap : 6
  var oRun = params.goalOpenRun != null ? params.goalOpenRun : 60
  var wNeed = params.gapWallNeed != null ? params.gapWallNeed : 60
  var wPen = params.gapWallPen != null ? params.gapWallPen : 0
  var wFilter = params.gapWallFilter !== false
  var wMin = params.gapWallMin != null ? params.gapWallMin : 60
  var wHalf = params.gapWallClear != null ? params.gapWallClear : 3.5
  function scoreOf(ang, dGoal) {
    var d0 = escapeSim(thrs, pos, yaw0, v0, ang, 0, q)
    var d1 = escapeSim(thrs, pos, yaw0, v0, ang, 1, q)
    var d = d0 > d1 ? d0 : d1
    var turn = Math.abs(ang - yaw0)
    while (turn > Math.PI) turn = Math.abs(turn - 2 * Math.PI)
    var al = Math.cos(ang - goalAng)
    var run = D
    var wp = 0
    var blocked = false
    if (walls) {
      run = freeRun(walls, pos[0], pos[2], ang, D, wHalf)
      var need = dGoal != null ? Math.min(wNeed, dGoal) : Math.min(wNeed, D)
      if (run < need) wp = wPen * (1 - run / need)
      if (run < Math.min(wMin, need)) blocked = true
    }
    var op = 0
    if (og && oW > 0) op = oW * (1 - Math.min(freeRun(og, pos[0], pos[2], ang, oRun, wHalf), oRun) / oRun)
    return { d: d, run: run, blocked: blocked, score: (d > safeD ? safeD : d) + wAlign * al - 2 * turnPen * Math.max(0, (turn - 1.2) / 1.9) - wp - op }
  }
  // the committed heading is re-simulated from the current state; another one replaces it only when clearly better
  // gapCommit: the committed goal is an ABSOLUTE point (fixed at commit time); its bearing from the moving car is what is re-simulated
  if (gap && fl && fl.ang != null && fl.gx != null) fl.ang = Math.atan2(fl.gz - pos[2], fl.gx - pos[0])
  var cur = fl && fl.ang != null ? scoreOf(fl.ang, fl.gx != null ? Math.sqrt((fl.gx - pos[0]) * (fl.gx - pos[0]) + (fl.gz - pos[2]) * (fl.gz - pos[2])) : null) : null
  // gapWalls: a committed goal that was clamped to the free run is reached when the car gets within gapReach (m, 10): re-pick from here instead of sitting on it
  var curBlocked = !!(cur && cur.blocked && wFilter)
  var reached = !!(cur && !curBlocked && walls && fl.gx != null && (fl.gx - pos[0]) * (fl.gx - pos[0]) + (fl.gz - pos[2]) * (fl.gz - pos[2]) < Math.pow(params.gapReach != null ? params.gapReach : 10, 2))
  if (reached) cur = null
  var evalDue = !fl || fl.ang == null || now - (fl.te || 0) > (params.escapeEvalEvery != null ? params.escapeEvalEvery : gap ? 0.3 : 0.15)
  if (evalDue || !cur || curBlocked) {
    var best = null
    var bestS = -Infinity
    var any = null
    var ub = null
    var ubS = -Infinity
    var uns = false
    var anyS = -Infinity
    for (var ai = 0; ai < 24; ai++) {
      var ang = (ai * Math.PI * 2) / 24 - Math.PI
      var cx = pos[0] + Math.cos(ang) * D
      var cz = pos[2] + Math.sin(ang) * D
      if (cx < area[0] + 10 || cx > area[1] - 10 || cz < area[2] + 10 || cz > area[3] - 10) continue
      var r = scoreOf(ang)
      // fallback when every heading is short (inside a pocket): the longest free run, the score only breaks ties
      var rs = r.run + 0.2 * r.score
      if (rs > anyS) {
        anyS = rs
        any = { ang: ang, d: r.d, run: r.run, score: r.score }
      }
      if (r.score > ubS) {
        ubS = r.score
        ub = { ang: ang, d: r.d, run: r.run, score: r.score }
      }
      if (wFilter && r.blocked) continue
      if (r.score > bestS) {
        bestS = r.score
        best = { ang: ang, d: r.d, run: r.run }
      }
    }
    // a long-run heading must not cost more than gapWallTrade (8) score points against the best short one (the race comes first)
    if (best && ub && walls && wFilter && bestS < ubS - (params.gapWallTrade != null ? params.gapWallTrade : 8)) {
      best = ub
      bestS = ubS
      uns = true
    }
    if (!best && any && walls && wFilter) {
      // every heading ends at a wall within gapWallMin (maze / clutter): the unfiltered best, goal as before
      best = any
      bestS = any.score
    }
    if (best) {
      var Dg = walls && wFilter && !uns && params.gapWallClamp !== false && best.run < D ? Math.max(8, best.run - 3) : D
      if (!cur || curBlocked || bestS > cur.score + (params.escapeSwitch != null ? params.escapeSwitch : gap ? 6 : 3)) fl = { ang: best.ang, t: now, t0: fl && fl.t0 != null && cur ? fl.t0 : now, te: now, gap: gap, gx: gap ? pos[0] + Math.cos(best.ang) * Dg : null, gz: gap ? pos[2] + Math.sin(best.ang) * Dg : null }
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
  if (fl.gx != null) {
    fl.x = fl.gx
    fl.z = fl.gz
  } else {
    fl.x = pos[0] + Math.cos(fl.ang) * D
    fl.z = pos[2] + Math.sin(fl.ang) * D
  }
  state.flee = fl
  av.fleeing = true
  av.fleeSim = gap
  input.target.pose.position = [fl.x, g0[1], fl.z]
}
