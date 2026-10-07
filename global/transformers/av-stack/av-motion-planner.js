// AV stack · PLAN / local motion planner (sampling-based, receding horizon).
// Candidate paths = constant-curvature turn (limited turn angle) followed by a straight, so a path can
// swing around an obstacle and then run alongside it. Each path is swept with the vehicle footprint
// (margin grows with speed) against the costmap. Cost = progress to goal, heading, required stopping
// length, clearance, smoothness. Publishes av.plan {kappa, free, freeSoft, clearance, blocked, horizon}.
// CPU budget (params.budget 'full' (default) | 'normal' | 'eco'): with 'normal' / 'eco' the planner FIXATES on a free, visible aim point instead of sampling ~190 candidates every frame:
// aim (route carrot or goal) within fixAimDeg (35) of the heading, no tracked threat that is within fixThreatMin (25 m) or reaches the car within fixThreatTime (5 s) at max(closing speed along the line of sight, the body's own speed: a homing body turns onto the car; floor fixThreatVMin 2 m/s) (bodies beyond fixThreatRange 90 m never block, the same reach the old rule effectively had; fixThreatTime 0 = old rule: any threat within fixThreatRange; a 30 m/s pursuer closes 60 m in ~1 s, corner-trap collided with a 60 m range), no moving costmap mark (av.movers) within fixDynRange (12 m) or inside
// the band of fixDynBand (6 m) beside the fixation arc up to 10 m beyond the aim / horizon,
// and the footprint corridor of the pure-pursuit arc to it is free (hard + soft margin) up to min(aim distance, horizon) -> plan = that arc (av.fix, cyan in debug draw).
// Any condition failing -> the full sampling planner this frame. Path blocked -> the route planner's carrot becomes the next waypoint the car fixates on.
// debug draw: yellow = line to goal / route carrot, dark blue = candidate fan, green = chosen path, orange = where it would hit.
// params: vehicleWidth, vehicleLength, safetyMargin, marginSpeedGain, softMargin, maxCurvature, arcCount,
//         horizonMin, horizonGain, horizonMax, horizonClear (m floor, 0 = off), switchMargin (cost; keep last candidate unless better by this, 0 = off), comfortDecel, wProgress, wHeading, wRequired, wFree, wSoft,
//         wSmooth, wTurn, minFree, rearIgnore, wThreat (0 = off; cost of predicted proximity to av.threats), threatHorizon (s, 2.5), threatRadius (m, 1.8), threatRange (m, 10: proximity felt inside this gap), threatTurnRate (rad/s, 0 = constant-velocity prediction; > 0: bodies faster than threatPursuitSpeed (4 m/s) are predicted HOMING on the car: pure pursuit with that turn-rate limit, threatLead s), threatBodyRadius (m, 0 = off: costmap points within this radius of a fast tracked body are dropped), threatAccel (m/s^2, 0 = constant speed along the candidate), threatHit (x wThreat: penalty of a predicted contact by its time, default 3), threatHitFloor (flat cost of any predicted contact, default 0), marginRamp (m over which the margin grows from the current clearance), debugDraw
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && av.preset) params = state.pmP === params && state.pmB === av.preset ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pm = Object.assign({}, av.preset, params)))
  if (!av || !av.ego) return {}
  var e = av.ego
  // economy: tell next frame's perception whether this frame is a non-maze (multi-point) manoeuvre (the blackboard is rebuilt per frame, the input object is not)
  input.avMan = !!av.override && !av.override.maze
  var tgt = input.target && input.target.pose && input.target.pose.position
  if (!tgt) {
    av.plan = { kappa: 0, free: 0, freeSoft: 0, clearance: 0, blocked: false, horizon: 0, noGoal: true }
    return {}
  }
  var pos = input.position
  var tdx = tgt[0] - pos[0]
  var tdz = tgt[2] - pos[2]
  av.goal = { x: tgt[0], z: tgt[2], dist: Math.sqrt(tdx * tdx + tdz * tdz) }
  // manoeuvre planner owns the controls (multi-point turn): pass its command through
  if (av.override) {
    av.plan = { kappa: av.override.kappa, vDesired: av.override.vDesired, free: 99, freeSoft: 99, clearance: 9, blocked: false, horizon: 0, override: true }
    return {}
  }
  // chase the route's carrot (global plan) when there is one, else the raw goal
  var direct = params.fleeAimDirect !== false && av.fleeSim
  // fleeAimLos (default on; false = always aim direct): the direct aim at the absolute flee goal only while the straight line to it is clear of STATIC costmap points for
  // max(fleeLosMin 30, fleeLosK 1.2 x stopping distance) m (swept by the footprint half-width + fleeLosMargin 0.8); otherwise the route carrot (the route already goes to the flee goal). Hysteresis: back to direct only after a clear line (1.3 x length, +0.5 m width) for fleeLosHold 0.5 s.
  if (direct && av.carrot && params.fleeAimLos !== false) {
    var lv = Math.max(0, e.speedF)
    var lL = Math.max(params.fleeLosMin != null ? params.fleeLosMin : 30, (params.fleeLosK != null ? params.fleeLosK : 1.2) * ((lv * lv) / (2 * (params.comfortDecel || 5))))
    var lW = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + (params.fleeLosMargin != null ? params.fleeLosMargin : 0.8)
    var ls = state.fleeLos || (state.fleeLos = { carrot: false, clearT: 0 })
    var lh = ls.carrot
    var ldx = tgt[0] - pos[0]
    var ldz = tgt[2] - pos[2]
    var ld = Math.sqrt(ldx * ldx + ldz * ldz)
    var losClear = true
    if (ld > 1e-3) {
      var lux = ldx / ld
      var luz = ldz / ld
      var lLen = Math.min(ld, lL * (lh ? 1.3 : 1))
      var lw = lW + (lh ? 0.5 : 0)
      var lp = av.points || []
      var lGR2 = (params.fleeLosGoalR != null ? params.fleeLosGoalR : 20) * (params.fleeLosGoalR != null ? params.fleeLosGoalR : 20)
      for (var li = 0; li < lp.length; li++) {
        if (lp[li][2] === 1) continue
        var lgx = lp[li][0] - tgt[0]
        var lgz = lp[li][1] - tgt[2]
        if (lgx * lgx + lgz * lgz < lGR2) continue
        var lpx = lp[li][0] - pos[0]
        var lpz = lp[li][1] - pos[2]
        var la = lpx * lux + lpz * luz
        if (la < 0 || la > lLen) continue
        var lb = lpx * luz - lpz * lux
        if (lb < lw && lb > -lw) {
          losClear = false
          break
        }
      }
    }
    if (!losClear) {
      ls.carrot = true
      ls.clearT = 0
    } else if (lh) {
      ls.clearT += dt
      if (ls.clearT >= (params.fleeLosHold != null ? params.fleeLosHold : 0.5)) ls.carrot = false
    }
    if (ls.carrot) direct = false
  }
  var aim = av.carrot && !direct ? [av.carrot[0], 0, av.carrot[1]] : tgt
  var gdx = aim[0] - pos[0]
  var gdz = aim[2] - pos[2]
  var gx = gdx * e.fwd[0] + gdz * e.fwd[2]
  var gy = gdx * e.left[0] + gdz * e.left[2]
  var goalDist = Math.sqrt(gx * gx + gy * gy)

  var v = Math.max(0, e.speedF)
  var margin = (params.safetyMargin != null ? params.safetyMargin : 0.5) + (params.marginSpeedGain != null ? params.marginSpeedGain : 0.05) * v
  var soft = params.softMargin != null ? params.softMargin : 1.1
  var halfW = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + margin
  var halfL = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + margin
  var kmax = params.maxCurvature || 0.115
  var count = params.arcCount || 31
  var hMin = params.horizonMin != null ? params.horizonMin : 10
  var aBrake = params.comfortDecel || 5
  // The planning horizon has to cover the stopping distance of the speed we want to drive, otherwise the free-path
  // limit (sqrt(2 * decel * horizon)) silently caps cruiseSpeed (26 m / 5 m/s^2 = 15.8 m/s).
  var cruiseV = params.cruiseSpeed != null ? params.cruiseSpeed : 10
  var hMax = params.horizonMax != null ? params.horizonMax : Math.min(150, Math.max(26, 1.1 * ((cruiseV * cruiseV) / (2 * aBrake)) + 10))
  var H = Math.min(hMax, hMin + Math.max((params.horizonGain != null ? params.horizonGain : 1.2) * v, (1.1 * v * v) / (2 * aBrake)))
  // horizonClear (m, 0 = off): generous minimum look-ahead independent of the current speed, so a clear road is judged far
  // ahead from a standstill (otherwise slow -> short horizon -> low free-path speed limit stays low). Only a floor: blocked
  // paths still end at the obstacle.
  var hClear = params.horizonClear != null ? params.horizonClear : 0
  if (hClear > H) H = Math.min(hMax, hClear)
  var Lreq = Math.min(H, (v * v) / (2 * aBrake) + 5)
  var wProg = params.wProgress != null ? params.wProgress : 1.0
  var wHead = params.wHeading != null ? params.wHeading : 2.0
  var wReq = params.wRequired != null ? params.wRequired : 60
  var wFree = params.wFree != null ? params.wFree : 10
  var wSoft = params.wSoft != null ? params.wSoft : 8
  var wSmooth = params.wSmooth != null ? params.wSmooth : 2.5
  var wTurn = params.wTurn != null ? params.wTurn : 1.5
  var minFree = params.minFree != null ? params.minFree : 4.5
  var ds = 0.75
  var turnAngles = [0.5, 1.15]

  // costmap into ego frame
  var pts = av.points || []
  var ox = []
  var oy = []
  var olive = []
  // every point of the ego window below lies within wRad of the car: a world-axis box test rejects the far ones without the rotation (conservative: the exact window test still decides)
  var wX = H + halfL + soft + 3
  var wRad = Math.sqrt(wX * wX + (H + 4) * (H + 4)) * 1.000001 + 1e-3
  for (var i = 0; i < pts.length; i++) {
    var dx = pts[i][0] - pos[0]
    var dz = pts[i][1] - pos[2]
    if (dx > wRad || dx < -wRad || dz > wRad || dz < -wRad) continue
    var px = dx * e.fwd[0] + dz * e.fwd[2]
    var py = dx * e.left[0] + dz * e.left[2]
    if (px > -halfL - soft - 3 && px < H + halfL + soft + 3 && py > -H - 4 && py < H + 4) {
      ox.push(px)
      oy.push(py)
      olive.push(pts[i][2] === 1)
    }
  }

  // tracked moving bodies (av.threats from perception) in the ego frame, predicted at constant velocity along every candidate
  var wThreat = params.wThreat != null ? params.wThreat : 0
  var thr = []
  if (wThreat > 0 && av.threats && av.threats.length) {
    for (var tk = 0; tk < av.threats.length; tk++) {
      var tq = av.threats[tk]
      var tdx0 = tq.x - pos[0]
      var tdz0 = tq.z - pos[2]
      if (tdx0 * tdx0 + tdz0 * tdz0 > 90 * 90) continue
      thr.push({
        x: tdx0 * e.fwd[0] + tdz0 * e.fwd[2],
        y: tdx0 * e.left[0] + tdz0 * e.left[2],
        vx: tq.vx * e.fwd[0] + tq.vz * e.fwd[2],
        vy: tq.vx * e.left[0] + tq.vz * e.left[2],
        turn: tq.turn,
      })
      var tl = thr[thr.length - 1]
      tl.sp = Math.sqrt(tl.vx * tl.vx + tl.vy * tl.vy)
      tl.h = Math.atan2(tl.vy, tl.vx)
    }
  }
  var thrH = params.threatHorizon != null ? params.threatHorizon : 2.5
  var thrR = params.threatRadius != null ? params.threatRadius : 1.8
  var thrGap = params.threatRange != null ? params.threatRange : 10
  var thrSteps = Math.max(1, Math.round(thrH / 0.25))
  // pursuit prediction (threatTurnRate rad/s > 0 = on): a fast tracked body is assumed to HOME on the car (pure pursuit of the
  // car's pose on the candidate path + threatLead s of its motion, speed kept, heading change limited to threatTurnRate). Per step the
  // nearer of the constant-velocity and the pursuit prediction counts. Without it a pursuer aimed at the car reads as a straight line
  // that misses, and the gap between two converging pursuers looks free.
  var thrTurn = params.threatTurnRate != null ? params.threatTurnRate : 0
  var thrLead = params.threatLead != null ? params.threatLead : 0.3
  // threatTurnMin (rad/s, 0 = off): the pursuit prediction uses the body's OBSERVED turn rate (av.threats[].turn, x1.3 + 0.15), clamped to [threatTurnMin, threatTurnRate]
  var thrTurnMin = params.threatTurnMin != null ? params.threatTurnMin : 0
  var thrHit = params.threatHit != null ? params.threatHit : 3
  // threatHitFloor (cost units, default 0): extra flat penalty of ANY predicted contact. Progress toward the goal is worth ~1 per metre over a 100+ m horizon, so a candidate that
  // reaches the goal but is predicted to hit used to beat the straight run with no hit (corner-trap: the 'aim at the carrot' arc into a pursuer won by 115 m of progress).
  var thrHitFloor = params.threatHitFloor != null ? params.threatHitFloor : 0
  var thrMinPursuit = params.threatPursuitSpeed != null ? params.threatPursuitSpeed : 4
  var vEff = Math.max(v, 5)
  // distance travelled after t s along a candidate for the threat prediction: the car is assumed to keep accelerating (threatAccel m/s^2, 0 = constant speed)
  // up to the cruise speed (a car that is about to launch / is accelerating covers more ground than its current speed says)
  var thrAcc = params.threatAccel != null ? params.threatAccel : 0
  var vTop = Math.max(vEff, params.cruiseSpeed != null ? params.cruiseSpeed : 10)
  var aLatThr = params.maxLatAccel || 9
  var vCurveMin = params.minSpeed != null ? params.minSpeed : 4
  var sKappa = 0
  var sVt = vEff
  // speed profile along the candidate with curvature kappa: towards min(cruise, curve limit sqrt(aLat / |kappa|)) at threatAccel (up) / comfortDecel (down);
  // a hard dodge is slow (and therefore tight), a straight run keeps accelerating
  function setProfile(kappa) {
    sKappa = kappa
    var vt = vTop
    var ak = Math.abs(kappa)
    if (ak > 1e-3) vt = Math.min(vt, Math.max(vCurveMin, Math.sqrt(aLatThr / ak)))
    if (thrAcc <= 0 && vt > vEff) vt = vEff
    sVt = vt
  }
  function sAt(t) {
    if (thrAcc <= 0 && sVt >= vEff) return vEff * t
    var dv = sVt - vEff
    var acc = dv >= 0 ? thrAcc : aBrake
    if (acc <= 0) return vEff * t
    var t1 = Math.abs(dv) / acc
    var sg = dv >= 0 ? 1 : -1
    if (t <= t1) return vEff * t + 0.5 * sg * acc * t * t
    return vEff * t1 + 0.5 * sg * acc * t1 * t1 + sVt * (t - t1)
  }
  // Points on a FAST tracked body (threatPursuitSpeed) are not static obstacles: it is predicted (threatCost), and its current position
  // smeared into the costmap reads as a wall that it has long left (a chaser alongside blocked every path -> full stop in front of it).
  var moverR = params.threatBodyRadius != null ? params.threatBodyRadius : 0
  if (moverR > 0 && thr.length) {
    var fx = []
    var fy = []
    for (var oi = 0; oi < ox.length; oi++) {
      var skip = false
      // a mark that follows the body (perception memFollow) is where the body IS, not a stale trail: keep it
      if (olive[oi]) {
        fx.push(ox[oi])
        fy.push(oy[oi])
        continue
      }
      for (var mi = 0; mi < thr.length; mi++) {
        if (thr[mi].sp > thrMinPursuit) {
          var mx = ox[oi] - thr[mi].x
          var my = oy[oi] - thr[mi].y
          if (mx * mx + my * my < moverR * moverR) skip = true
        }
      }
      if (!skip) {
        fx.push(ox[oi])
        fy.push(oy[oi])
      }
    }
    ox = fx
    oy = fy
  }

  // pose along a path: turn at `kappa` for `turnLen`, then straight
  function poseAt(kappa, turnLen, s, out) {
    var sa = s < turnLen ? s : turnLen
    var th = kappa * sa
    var x
    var y
    if (Math.abs(kappa) < 1e-6) {
      x = sa
      y = 0
    } else {
      x = Math.sin(th) / kappa
      y = (1 - Math.cos(th)) / kappa
    }
    if (s > turnLen) {
      x += Math.cos(th) * (s - turnLen)
      y += Math.sin(th) * (s - turnLen)
    }
    out.x = x
    out.y = y
    out.th = th
  }
  var P = { x: 0, y: 0, th: 0 }
  // Predicted proximity of the car (hull at the pose reached at time t along the path) to each tracked body (constant velocity):
  // sum over time of the relative penetration of the gap band, earlier = heavier; an actual overlap counts double.
  var PQ = []
  function threatCost(kappa, turnLen, hullLx, hullWx) {
    var tc = 0
    var hit = 0
    setProfile(kappa)
    var pursue = thrTurn > 0
    if (pursue) {
      for (var pi = 0; pi < thr.length; pi++) {
        var q0 = thr[pi]
        PQ[pi] = { x: q0.x, y: q0.y, h: q0.h }
      }
    }
    var sub = 2
    var tprev = 0
    for (var si = 1; si <= thrSteps; si++) {
      var t = si * 0.25
      var sPath = sAt(t)
      poseAt(kappa, turnLen, sPath, P)
      var ct = Math.cos(P.th)
      var st = Math.sin(P.th)
      var wt = 1 - (0.6 * (si - 1)) / thrSteps
      for (var qi = 0; qi < thr.length; qi++) {
        var q = thr[qi]
        var rx = q.x + q.vx * t - P.x
        var ry = q.y + q.vy * t - P.y
        var lx = ct * rx + st * ry
        var ly = -st * rx + ct * ry
        var ex = Math.max(Math.abs(lx) - hullLx, 0)
        var ey = Math.max(Math.abs(ly) - hullWx, 0)
        var d = Math.sqrt(ex * ex + ey * ey) - thrR
        if (pursue && q.sp > thrMinPursuit) {
          var c = PQ[qi]
          var tgx = P.x + (sAt(t + thrLead) - sPath) * ct
          var tgy = P.y + (sAt(t + thrLead) - sPath) * st
          var sdt = (t - tprev) / sub
          for (var ss = 0; ss < sub; ss++) {
            var dh = Math.atan2(tgy - c.y, tgx - c.x) - c.h
            while (dh > Math.PI) dh -= 2 * Math.PI
            while (dh < -Math.PI) dh += 2 * Math.PI
            var lim = (q.turn != null && thrTurnMin > 0 ? Math.min(thrTurn, Math.max(thrTurnMin, 1.3 * q.turn + 0.15)) : thrTurn) * sdt
            c.h += dh > lim ? lim : dh < -lim ? -lim : dh
            c.x += Math.cos(c.h) * q.sp * sdt
            c.y += Math.sin(c.h) * q.sp * sdt
          }
          var prx = c.x - P.x
          var pry = c.y - P.y
          var plx = ct * prx + st * pry
          var ply = -st * prx + ct * pry
          var pex = Math.max(Math.abs(plx) - hullLx, 0)
          var pey = Math.max(Math.abs(ply) - hullWx, 0)
          var pd = Math.sqrt(pex * pex + pey * pey) - thrR
          if (pd < d) d = pd
        }
        if (d < thrGap) tc += wt * (d < 0 ? 2 : 0) + (wt * (thrGap - Math.max(d, 0))) / thrGap
        // predicted contact: one penalty by the EARLIEST hit (a later hit can still be dodged by re-planning), not diluted by the horizon average
        if (d < 0 && hit === 0) hit = 1 - (0.5 * (si - 1)) / thrSteps
      }
      tprev = t
    }
    return tc / thrSteps + thrHit * hit + (hit > 0 ? thrHitFloor / wThreat : 0)
  }

  // forward paths only sweep the front of the footprint: an obstacle already behind/at the tail (touching
  // start pose) must not veto driving away from it
  var rearIgnore = params.rearIgnore != null ? params.rearIgnore : 1.4
  // Start already inside the margin (parked next to a car / wall): the full margin would veto every path at s = 0 and
  // freeze the car. The margin therefore starts at the clearance the car has now and grows to the full value over
  // `marginRamp` metres — a path may not get closer than the car already is, but it may drive away.
  var hullL = halfL - margin
  var hullW = halfW - margin
  var startGap = margin + soft
  for (var sg = 0; sg < ox.length; sg++) {
    if (ox[sg] < -hullL + rearIgnore - margin) continue
    var gap = Math.max(Math.abs(ox[sg]) - hullL, Math.abs(oy[sg]) - hullW)
    if (gap < startGap) startGap = gap
  }
  var ramp = params.marginRamp != null ? params.marginRamp : 3
  // 8 m spatial hash over the ego-frame costmap: only points near the swept pose can hit its rectangle
  var HC = 8
  // dense grid over the occupied cell range (an array lookup instead of a Map lookup per swept cell); cells keep insertion order
  var gx0 = 1e9
  var gx1 = -1e9
  var gy0 = 1e9
  var gy1 = -1e9
  for (var hi = 0; hi < ox.length; hi++) {
    var hcx = Math.floor(ox[hi] / HC)
    var hcy = Math.floor(oy[hi] / HC)
    if (hcx < gx0) gx0 = hcx
    if (hcx > gx1) gx1 = hcx
    if (hcy < gy0) gy0 = hcy
    if (hcy > gy1) gy1 = hcy
  }
  var gNy = gy1 - gy0 + 1
  var grid = []
  if (ox.length) {
    var gN = (gx1 - gx0 + 1) * gNy
    for (var gi = 0; gi < gN; gi++) grid.push(null)
    for (var hj = 0; hj < ox.length; hj++) {
      var hgi = (Math.floor(ox[hj] / HC) - gx0) * gNy + (Math.floor(oy[hj] / HC) - gy0)
      var hcell = grid[hgi]
      if (hcell) hcell.push(hj)
      else grid[hgi] = [hj]
    }
  }
  // pose cache of the candidate last swept (hard and soft sweeps of one candidate share every pose; the clearance probes too): per step index x, y, cos, sin of the heading
  var pcK = NaN
  var pcT = NaN
  var pcX = []
  var pcY = []
  var pcC = []
  var pcS = []
  function freeLength(kappa, turnLen, hw, hl) {
    av.work.freeLen++
    if (kappa !== pcK || turnLen !== pcT) {
      pcK = kappa
      pcT = turnLen
      pcX.length = 0
      pcY.length = 0
      pcC.length = 0
      pcS.length = 0
    }
    var extra = hw - hullW
    var m0 = Math.max(0, Math.min(extra, startGap - 0.05))
    var si = 0
    for (var s = 0; s <= H; s += ds, si++) {
      var m = s >= ramp || m0 >= extra ? extra : m0 + ((extra - m0) * s) / ramp
      var hwS = hullW + m
      var hlS = hullL + m
      var hlRear = Math.max(0.3, hlS - rearIgnore)
      if (si >= pcX.length) {
        // same arithmetic as poseAt (heading th = kappa * min(s, turnLen); cos / sin of it are shared with the footprint rotation)
        var sa = s < turnLen ? s : turnLen
        var th = kappa * sa
        var cth = Math.cos(th)
        var sth = Math.sin(th)
        var qx
        var qy
        if (Math.abs(kappa) < 1e-6) {
          qx = sa
          qy = 0
        } else {
          qx = sth / kappa
          qy = (1 - cth) / kappa
        }
        if (s > turnLen) {
          qx += cth * (s - turnLen)
          qy += sth * (s - turnLen)
        }
        pcX.push(qx)
        pcY.push(qy)
        pcC.push(cth)
        pcS.push(sth)
      }
      var Px = pcX[si]
      var Py = pcY[si]
      var hlMax = hlS > hlRear ? hlS : hlRear
      var rad = Math.sqrt(hlMax * hlMax + hwS * hwS) + 1e-6
      var cx0 = Math.floor((Px - rad) / HC)
      var cx1 = Math.floor((Px + rad) / HC)
      var cy0 = Math.floor((Py - rad) / HC)
      var cy1 = Math.floor((Py + rad) / HC)
      if (cx0 < gx0) cx0 = gx0
      if (cx1 > gx1) cx1 = gx1
      if (cy0 < gy0) cy0 = gy0
      if (cy1 > gy1) cy1 = gy1
      for (var cx = cx0; cx <= cx1; cx++) {
        for (var cy = cy0; cy <= cy1; cy++) {
          var cell = grid[(cx - gx0) * gNy + (cy - gy0)]
          if (!cell) continue
          var ct = pcC[si]
          var st = pcS[si]
          for (var qi = 0; qi < cell.length; qi++) {
            var q = cell[qi]
            var rx = ox[q] - Px
            var ry = oy[q] - Py
            var lx = ct * rx + st * ry
            var ly = -st * rx + ct * ry
            if (lx > -hlRear && lx < hlS && ly > -hwS && ly < hwS) return Math.max(0, s - ds)
          }
        }
      }
    }
    return H
  }

  var prev = state.prevKappa || 0
  var prevTurn = state.prevTurn || 0
  var best = null
  var bestCost = Infinity
  var bestHard = 0
  var bestSoft = 0
  var bestTurnLen = 0
  var bestKey = -1
  var prevKey = state.prevKey != null ? state.prevKey : -1
  var prevHit = null
  var cand = []
  // --- economy: fixate on a free, visible aim point (see header) ---
  var budget = params.budget || 'full'
  if (budget !== 'full') {
    // why not fixated (watch av.fixWhy): aim (outside the cone / behind / too close / standing), threat, dyn (moving mark near), curve, blocked (corridor not free)
    var why = v <= 0.5 ? 'slow' : gx <= 1.5 ? 'near' : 'cone'
    if (gx > 1.5 && Math.abs(Math.atan2(gy, gx)) < ((params.fixAimDeg || 35) * Math.PI) / 180 && v > 0.5) {
      why = ''
      var fixThrR = params.fixThreatRange != null ? params.fixThreatRange : 90
      var fixThrT = params.fixThreatTime != null ? params.fixThreatTime : 5
      if (fixThrT > 0) {
        // time rule: a tracked body blocks fixation when it is within fixThreatMin (25 m) or reaches the car within fixThreatTime s at its closing speed
        // (max of the relative velocity on the line of sight and the body's own speed, floored at fixThreatVMin); fixThreatRange (90 m) is the upper bound (further bodies never block)
        var fixThrMin = params.fixThreatMin != null ? params.fixThreatMin : 25
        var fixThrVMin = params.fixThreatVMin != null ? params.fixThreatVMin : 2
        var ats = av.threats || []
        var evx = input.velocity ? input.velocity[0] : v * e.fwd[0]
        var evz = input.velocity ? input.velocity[2] : v * e.fwd[2]
        for (var tq2 = 0; tq2 < ats.length && !why; tq2++) {
          var tdx2 = ats[tq2].x - pos[0]
          var tdz2 = ats[tq2].z - pos[2]
          var td2 = Math.sqrt(tdx2 * tdx2 + tdz2 * tdz2)
          if (td2 >= fixThrR) continue
          var tcl = td2 > 1e-6 ? -(tdx2 * (ats[tq2].vx - evx) + tdz2 * (ats[tq2].vz - evz)) / td2 : 1e9
          // a homing body closes at its own speed whatever the instantaneous line-of-sight rate (it turns toward the car): use the larger of the two
          var tsp = Math.sqrt(ats[tq2].vx * ats[tq2].vx + ats[tq2].vz * ats[tq2].vz)
          if (td2 < fixThrMin || td2 < fixThrT * Math.max(tcl, tsp, fixThrVMin)) why = 'threat'
        }
      } else for (var tq2 = 0; tq2 < thr.length; tq2++) if (thr[tq2].x * thr[tq2].x + thr[tq2].y * thr[tq2].y < fixThrR * fixThrR) why = 'threat'
      var kFix = (2 * gy) / (goalDist * goalDist)
      if (!why && av.movers && av.movers.length) {
        var dynR = params.fixDynRange != null ? params.fixDynRange : 12
        var band = halfW + (params.fixDynBand != null ? params.fixDynBand : 6)
        var xEnd = Math.min(goalDist, H) + 10
        for (var mv = 0; mv < av.movers.length && !why; mv++) {
          var mdx = av.movers[mv][0] - pos[0]
          var mdz = av.movers[mv][1] - pos[2]
          var mx2 = mdx * e.fwd[0] + mdz * e.fwd[2]
          var my2 = mdx * e.left[0] + mdz * e.left[2]
          if (mx2 * mx2 + my2 * my2 < dynR * dynR || (mx2 > -halfL && mx2 < xEnd && Math.abs(my2 - 0.5 * kFix * mx2 * mx2) < band)) why = 'dyn'
        }
      }
      if (!why && Math.abs(kFix) >= kmax) why = 'curve'
      if (!why) {
        var need = Math.min(goalDist, H)
        var fH = freeLength(kFix, H, halfW, halfL)
        var fS = fH >= need - 1e-6 ? freeLength(kFix, H, halfW + soft - margin, halfL + soft - margin) : 0
        if (fH >= need - 1e-6 && fS >= Math.min(need, Lreq) - 1e-6) {
          state.prevKappa = kFix
          state.prevKey = -1
          av.fix = { ang: Math.atan2(gy, gx), dist: goalDist }
          av.plan = { kappa: kFix, free: fH, freeSoft: fS, clearance: 1, margin: margin, blocked: false, startGap: startGap, horizon: H, required: Lreq, cost: 0, fixed: true }
          api.watch('av.plan.kappa', Math.round(kFix * 1000) / 1000)
          api.watch('av.plan.free', Math.round(fH * 10) / 10 + ' fix')
          api.watch('av.fixWhy', 'fix')
          if (params.debugDraw !== false) api.visualizeLine(pos, [aim[0], pos[1], aim[2]], '#00e5ff')
          return {}
        }
        why = 'blocked'
      }
    }
    api.watch('av.fixWhy', why)
  }
  // Direct aim: turn at curvature `kappa` until the car points at the goal, then drive straight (shortest way when the
  // way is free). Returns the turn angle (rad), or 0 when the goal is on the other side / cannot be aimed at this way.
  var aimTh = null
  var aimSin = null
  var aimCos = null
  function aimTurnAngle(kappa) {
    var ak = Math.abs(kappa)
    if (ak < 1e-6) return 0
    var gyS = kappa > 0 ? gy : -gy
    if (gyS <= 0.05 && gx > 0) return 0
    var prevF = null
    // sin / cos of the fixed angle grid, built once per frame (identical values for every curvature)
    if (!aimTh) {
      aimTh = []
      aimSin = []
      aimCos = []
      for (var ath = 0.02; ath <= Math.PI; ath += 0.02) {
        aimTh.push(ath)
        aimSin.push(Math.sin(ath))
        aimCos.push(Math.cos(ath))
      }
    }
    for (var ti2 = 0; ti2 < aimTh.length; ti2++) {
      var th = aimTh[ti2]
      var x = aimSin[ti2] / ak
      var y = (1 - aimCos[ti2]) / ak
      var f = Math.atan2(gyS - y, gx - x) - th
      while (f > Math.PI) f -= 2 * Math.PI
      while (f < -Math.PI) f += 2 * Math.PI
      if (prevF !== null && prevF > 0 && f <= 0) return th
      prevF = f
    }
    return 0
  }
  // eco (ecoPrune, default on): branch and bound over the fan. Candidates are tried from the arc nearest the aim curvature outward (last frame's choice first); after the
  // hard sweep a candidate whose cost WITHOUT the soft sweep (soft term at its minimum: with soft >= margin the soft free length is at most the hard one, else only 0 is known) and without
  // the threat prediction is already >= the best so far is dropped (both terms are >= 0 / >= that bound), so the winner is the same as without pruning (up to exact cost ties).
  var prune = budget === 'eco' && params.ecoPrune !== false && count >= 5
  // the soft sweep uses a footprint extra of `soft` where the hard one has `margin` (which grows with speed): it is the LARGER footprint (so it never sweeps farther than the hard one) only while soft >= margin
  var softSuper = soft >= margin + 1e-9
  var order = []
  for (var oa = 0; oa < count; oa++) order.push(oa)
  if (prune) {
    var aimA = goalDist > 1e-6 ? Math.max(0, Math.min(count - 1, Math.round(((2 * gy) / (goalDist * goalDist) / kmax + 1) * 0.5 * (count - 1)))) : count >> 1
    var prevA = prevKey >= 0 ? prevKey >> 2 : -1
    order.sort(function (p, q) {
      var dp = p === prevA ? -1 : Math.abs(p - aimA)
      var dq = q === prevA ? -1 : Math.abs(q - aimA)
      return dp - dq || p - q
    })
  }
  // closest approach (m) of the candidate path (arc `turnLen` at `kappa`, then straight up to the horizon H) to the aim point (gx, gy): analytic, a lower bound of the distance at the pose the candidate is judged at
  function minGoalDist(kappa, turnLen) {
    var best2
    var ex
    var ey
    var eth = 0
    if (Math.abs(kappa) < 1e-6) {
      ex = 0
      ey = 0
      best2 = 1e18
    } else {
      var Rr = 1 / Math.abs(kappa)
      var cy = 1 / kappa
      var vx = gx
      var vy = gy - cy
      var vl = Math.sqrt(vx * vx + vy * vy)
      var kT = kappa * turnLen
      var lo = kT < 0 ? kT : 0
      var span = Math.abs(kT)
      var sg = kappa > 0 ? 1 : -1
      var thS = Math.atan2(sg * vx, -sg * vy)
      var rel = (thS - lo) % (2 * Math.PI)
      if (rel < 0) rel += 2 * Math.PI
      eth = kT
      ex = Math.sin(kT) / kappa
      ey = (1 - Math.cos(kT)) / kappa
      if (vl > 1e-9 && rel <= span) best2 = Math.abs(vl - Rr)
      else best2 = Math.sqrt((gx - ex) * (gx - ex) + (gy - ey) * (gy - ey))
    }
    var Ls = Math.abs(kappa) < 1e-6 ? H : Math.max(0, H - turnLen)
    var dx = Math.cos(eth)
    var dy = Math.sin(eth)
    var tp = (gx - ex) * dx + (gy - ey) * dy
    tp = tp < 0 ? 0 : tp > Ls ? Ls : tp
    var sx = gx - (ex + dx * tp)
    var sy = gy - (ey + dy * tp)
    var dseg = Math.sqrt(sx * sx + sy * sy)
    var d0 = Math.sqrt(gx * gx + gy * gy)
    return Math.max(0, Math.min(best2, dseg, d0) - 1e-6)
  }
  var pruneGeom = prune && params.ecoPruneGeom !== false && wProg >= 0 && wHead >= 0 && wReq >= 0 && wFree >= 0 && wSoft >= 0
  for (var oi = 0; oi < count; oi++) {
    var a = order[oi]
    var kappa = count === 1 ? 0 : -kmax + (2 * kmax * a) / (count - 1)
    var aimAng = aimTurnAngle(kappa)
    var nAngles = turnAngles.length + (aimAng > 0 ? 1 : 0)
    for (var ti = 0; ti < nAngles; ti++) {
      if (Math.abs(kappa) < 1e-6 && ti > 0) continue
      var isAim = ti >= turnAngles.length
      var turnLen = Math.abs(kappa) < 1e-6 ? H : Math.min(H, (isAim ? aimAng : turnAngles[ti]) / Math.abs(kappa))
      av.work.cands++
      // geometry bound before any sweep: progress <= goalDist - closest approach, every other term (heading, required / free length, soft, threat) is >= 0 -> cannot beat the best so far
      if (pruneGeom && bestCost < Infinity && a * 4 + ti !== prevKey && -wProg * (goalDist - minGoalDist(kappa, turnLen)) + wSmooth * (Math.abs(kappa - prev) / kmax) + wTurn * Math.abs(kappa * turnLen) > bestCost + 1e-9) continue
      var fHard = freeLength(kappa, turnLen, halfW, halfL)
      var L = fHard
      var Lpose = L
      if (isAim) {
        // judged where it reaches the goal (not far beyond it); free-length terms still use the full free path
        poseAt(kappa, turnLen, turnLen, P)
        Lpose = Math.min(L, turnLen + Math.sqrt((gx - P.x) * (gx - P.x) + (gy - P.y) * (gy - P.y)))
      }
      poseAt(kappa, turnLen, Lpose, P)
      var gdEnd = Math.sqrt((gx - P.x) * (gx - P.x) + (gy - P.y) * (gy - P.y))
      var progress = goalDist - gdEnd
      var herr = Math.atan2(gy - P.y, gx - P.x) - P.th
      while (herr > Math.PI) herr -= 2 * Math.PI
      while (herr < -Math.PI) herr += 2 * Math.PI
      var key = a * 4 + ti
      var fSoft
      var cost
      var cBase = -wProg * progress + wHead * Math.abs(herr) + wReq * Math.max(0, 1 - L / Lreq) + wFree * (1 - L / H)
      var cTail = wSmooth * (Math.abs(kappa - prev) / kmax)
      var cTurn = wTurn * Math.abs(kappa * turnLen)
      if (prune && key !== prevKey) {
        // bit-identical to the full cost with fSoft = fHard (same summation order); ties keep the lower key like the unordered loop
        var cLb = cBase + (softSuper ? wSoft * (1 - Math.min(fHard, H) / H) : 0) + cTail + cTurn
        if (cLb > bestCost || (cLb === bestCost && key > bestKey)) continue
      }
      fSoft = prune && softSuper && fHard <= 0 ? 0 : freeLength(kappa, turnLen, halfW + soft - margin, halfL + soft - margin)
      cost = cBase + wSoft * (1 - Math.min(fSoft, H) / H) + cTail + cTurn
      if (thr.length) cost += wThreat * threatCost(kappa, turnLen, hullL, hullW)
      if (key === prevKey) prevHit = { cost: cost, kappa: kappa, hard: fHard, soft: fSoft, turnLen: turnLen }
      if (cost < bestCost || (prune && cost === bestCost && key < bestKey)) {
        bestKey = key
        bestCost = cost
        best = kappa
        bestHard = fHard
        bestSoft = fSoft
        bestTurnLen = turnLen
      }
      if (params.debugDraw !== false && a % 8 === 0 && ti === 0) cand.push([kappa, turnLen, fHard])
    }
  }
  // plan-switch hysteresis (switchMargin, cost units, 0 = off): keep last frame's candidate (same curvature index / turn
  // segment) unless another one is cheaper by the margin. Stops the chosen path flipping between near-equal candidates.
  var switchMargin = params.switchMargin != null ? params.switchMargin : 0
  if (switchMargin > 0 && prevHit && bestKey !== prevKey && bestCost > prevHit.cost - switchMargin && prevHit.hard >= minFree) {
    bestKey = prevKey
    bestCost = prevHit.cost
    best = prevHit.kappa
    bestHard = prevHit.hard
    bestSoft = prevHit.soft
    bestTurnLen = prevHit.turnLen
  }
  state.prevKappa = best
  state.prevKey = bestKey

  // lateral clearance of the chosen path over the distance that matters (beyond the hard margin)
  var clearance = 0
  var margins = [0.5, 1.0, 1.5, 2.5]
  var needLen = Math.min(bestHard, Lreq)
  for (var mi = 0; mi < margins.length; mi++) {
    var fm = freeLength(best, bestTurnLen, halfW + margins[mi], halfL + margins[mi])
    if (fm >= needLen - 1e-6) clearance = margins[mi]
    else break
  }

  av.plan = {
    kappa: best,
    free: bestHard,
    freeSoft: bestSoft,
    clearance: clearance,
    margin: margin,
    blocked: bestHard < minFree,
    startGap: startGap,
    horizon: H,
    required: Lreq,
    cost: bestCost,
  }
  api.watch('av.plan.kappa', Math.round(best * 1000) / 1000)
  api.watch('av.plan.free', Math.round(bestHard * 10) / 10 + ' clr ' + clearance)

  if (params.debugDraw !== false) {
    var y0 = pos[1]
    var W = { x: 0, y: 0, th: 0 }
    function world(x, y) {
      return [pos[0] + e.fwd[0] * x + e.left[0] * y, y0, pos[2] + e.fwd[2] * x + e.left[2] * y]
    }
    function drawPath(kk, tl, len, color, step) {
      var prevW = null
      for (var s = 0; s <= len + 1e-6; s += step) {
        poseAt(kk, tl, s, W)
        var wp = world(W.x, W.y)
        if (prevW) api.visualizeLine(prevW, wp, color)
        prevW = wp
      }
    }
    api.visualizeLine(pos, [aim[0], y0, aim[2]], '#ffcc00')
    for (var ci = 0; ci < cand.length; ci++) drawPath(cand[ci][0], cand[ci][1], cand[ci][2], '#3a5a9a', Math.max(4, cand[ci][2] / 3))
    drawPath(best, bestTurnLen, bestHard, '#22dd66', 2.5)
    if (bestHard < H) drawPath(best, bestTurnLen, Math.min(H, bestHard + 3), '#ff8800', 3)
  }
  return {}
}
