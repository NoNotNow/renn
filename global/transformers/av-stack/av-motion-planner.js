// AV stack · PLAN / local motion planner (sampling-based, receding horizon).
// Candidate paths = constant-curvature turn (limited turn angle) followed by a straight, so a path can
// swing around an obstacle and then run alongside it. Each path is swept with the vehicle footprint
// (margin grows with speed) against the costmap. Cost = progress to goal, heading, required stopping
// length, clearance, smoothness. Publishes av.plan {kappa, free, freeSoft, clearance, blocked, horizon}.
// debug draw: yellow = line to goal / route carrot, dark blue = candidate fan, green = chosen path, orange = where it would hit.
// params: vehicleWidth, vehicleLength, safetyMargin, marginSpeedGain, softMargin, maxCurvature, arcCount,
//         horizonMin, horizonGain, horizonMax, comfortDecel, wProgress, wHeading, wRequired, wFree, wSoft,
//         wSmooth, wTurn, minFree, rearIgnore, debugDraw
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.ego) return {}
  var e = av.ego
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
  var aim = av.carrot ? [av.carrot[0], 0, av.carrot[1]] : tgt
  var gdx = aim[0] - pos[0]
  var gdz = aim[2] - pos[2]
  var gx = gdx * e.fwd[0] + gdz * e.fwd[2]
  var gy = gdx * e.left[0] + gdz * e.left[2]
  var goalDist = Math.sqrt(gx * gx + gy * gy)

  var v = Math.max(0, e.speedF)
  var margin = (params.safetyMargin != null ? params.safetyMargin : 0.5) + (params.marginSpeedGain != null ? params.marginSpeedGain : 0.05) * v
  var soft = params.softMargin != null ? params.softMargin : 1.1
  var halfW = (params.vehicleWidth || 2) / 2 + margin
  var halfL = (params.vehicleLength || 4) / 2 + margin
  var kmax = params.maxCurvature || 0.115
  var count = params.arcCount || 31
  var hMin = params.horizonMin != null ? params.horizonMin : 10
  var hMax = params.horizonMax != null ? params.horizonMax : 26
  var H = Math.min(hMax, hMin + (params.horizonGain != null ? params.horizonGain : 1.2) * v)
  var aBrake = params.comfortDecel || 5
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
  for (var i = 0; i < pts.length; i++) {
    var dx = pts[i][0] - pos[0]
    var dz = pts[i][1] - pos[2]
    var px = dx * e.fwd[0] + dz * e.fwd[2]
    var py = dx * e.left[0] + dz * e.left[2]
    if (px > -halfL - soft - 3 && px < H + halfL + soft + 3 && py > -H - 4 && py < H + 4) {
      ox.push(px)
      oy.push(py)
    }
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

  // forward paths only sweep the front of the footprint: an obstacle already behind/at the tail (touching
  // start pose) must not veto driving away from it
  var rearIgnore = params.rearIgnore != null ? params.rearIgnore : 1.4
  function freeLength(kappa, turnLen, hw, hl) {
    var hlRear = Math.max(0.3, hl - rearIgnore)
    for (var s = 0; s <= H; s += ds) {
      poseAt(kappa, turnLen, s, P)
      var ct = Math.cos(P.th)
      var st = Math.sin(P.th)
      for (var q = 0; q < ox.length; q++) {
        var rx = ox[q] - P.x
        var ry = oy[q] - P.y
        var lx = ct * rx + st * ry
        var ly = -st * rx + ct * ry
        if (lx > -hlRear && lx < hl && ly > -hw && ly < hw) return Math.max(0, s - ds)
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
  var cand = []
  for (var a = 0; a < count; a++) {
    var kappa = count === 1 ? 0 : -kmax + (2 * kmax * a) / (count - 1)
    for (var ti = 0; ti < turnAngles.length; ti++) {
      if (Math.abs(kappa) < 1e-6 && ti > 0) continue
      var turnLen = Math.abs(kappa) < 1e-6 ? H : Math.min(H, turnAngles[ti] / Math.abs(kappa))
      var fHard = freeLength(kappa, turnLen, halfW, halfL)
      var fSoft = freeLength(kappa, turnLen, halfW + soft - margin, halfL + soft - margin)
      var L = fHard
      poseAt(kappa, turnLen, L, P)
      var gdEnd = Math.sqrt((gx - P.x) * (gx - P.x) + (gy - P.y) * (gy - P.y))
      var progress = goalDist - gdEnd
      var herr = Math.atan2(gy - P.y, gx - P.x) - P.th
      while (herr > Math.PI) herr -= 2 * Math.PI
      while (herr < -Math.PI) herr += 2 * Math.PI
      var cost =
        -wProg * progress +
        wHead * Math.abs(herr) +
        wReq * Math.max(0, 1 - L / Lreq) +
        wFree * (1 - L / H) +
        wSoft * (1 - Math.min(fSoft, H) / H) +
        wSmooth * (Math.abs(kappa - prev) / kmax) +
        wTurn * Math.abs(kappa * turnLen)
      if (cost < bestCost) {
        bestCost = cost
        best = kappa
        bestHard = fHard
        bestSoft = fSoft
        bestTurnLen = turnLen
      }
      if (params.debugDraw !== false && a % 8 === 0 && ti === 0) cand.push([kappa, turnLen, fHard])
    }
  }
  state.prevKappa = best

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
