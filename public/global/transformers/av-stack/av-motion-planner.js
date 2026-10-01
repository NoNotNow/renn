// AV stack · PLAN / local motion planner (sampling-based, dynamic-window style).
// Rolls out constant-curvature arcs of the bicycle model, checks the swept vehicle footprint
// against the costmap, and picks the arc with the best progress / clearance / smoothness cost.
// debug draw: yellow = goal line, dark blue = candidate arcs, green = chosen arc, orange = where it would hit.
// Publishes av.plan {kappa, free, freeSoft, blocked, horizon}.
// params: vehicleWidth, vehicleLength, safetyMargin, softMargin, maxCurvature, arcCount,
//         horizonMin, horizonGain, horizonMax, wProgress, wHeading, wFree, wSoft, wSmooth, minFree
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.ego) return {}
  var e = av.ego
  var tgt = input.target && input.target.pose && input.target.pose.position
  if (!tgt) {
    av.plan = { kappa: 0, free: 0, freeSoft: 0, blocked: false, horizon: 0, noGoal: true }
    return {}
  }
  var pos = input.position
  var gdx = tgt[0] - pos[0]
  var gdz = tgt[2] - pos[2]
  var gx = gdx * e.fwd[0] + gdz * e.fwd[2]
  var gy = gdx * e.left[0] + gdz * e.left[2]
  var goalDist = Math.sqrt(gx * gx + gy * gy)
  av.goal = { x: tgt[0], z: tgt[2], dist: goalDist, fx: gx, fy: gy }

  var margin = params.safetyMargin != null ? params.safetyMargin : 0.5
  var soft = params.softMargin != null ? params.softMargin : 1.1
  var halfW = (params.vehicleWidth || 2) / 2 + margin
  var halfL = (params.vehicleLength || 4) / 2 + margin
  var kmax = params.maxCurvature || 0.115
  var count = params.arcCount || 41
  var hMin = params.horizonMin != null ? params.horizonMin : 9
  var hMax = params.horizonMax != null ? params.horizonMax : 20
  var H = Math.min(hMax, hMin + (params.horizonGain != null ? params.horizonGain : 0.9) * Math.max(0, e.speedF))
  var wProg = params.wProgress != null ? params.wProgress : 1.0
  var wHead = params.wHeading != null ? params.wHeading : 2.0
  var wFree = params.wFree != null ? params.wFree : 14
  var wSoft = params.wSoft != null ? params.wSoft : 5
  var wSmooth = params.wSmooth != null ? params.wSmooth : 2.5
  var minFree = params.minFree != null ? params.minFree : 4.5
  var ds = 0.75

  // costmap into ego frame
  var pts = av.points || []
  var ox = []
  var oy = []
  for (var i = 0; i < pts.length; i++) {
    var dx = pts[i][0] - pos[0]
    var dz = pts[i][1] - pos[2]
    var px = dx * e.fwd[0] + dz * e.fwd[2]
    var py = dx * e.left[0] + dz * e.left[2]
    if (px > -halfL - soft - 1 && px < H + halfL + soft + 1 && py > -H - 3 && py < H + 3) {
      ox.push(px)
      oy.push(py)
    }
  }

  function freeLength(kappa, hw, hl) {
    var sMax = H
    for (var s = 0; s <= sMax; s += ds) {
      var th = kappa * s
      var cx
      var cy
      if (Math.abs(kappa) < 1e-6) {
        cx = s
        cy = 0
      } else {
        cx = Math.sin(th) / kappa
        cy = (1 - Math.cos(th)) / kappa
      }
      var ct = Math.cos(th)
      var st = Math.sin(th)
      for (var q = 0; q < ox.length; q++) {
        var rx = ox[q] - cx
        var ry = oy[q] - cy
        var lx = ct * rx + st * ry
        var ly = -st * rx + ct * ry
        if (lx > -hl && lx < hl && ly > -hw && ly < hw) return Math.max(0, s - ds)
      }
    }
    return sMax
  }

  var prev = state.prevKappa || 0
  var best = null
  var bestCost = Infinity
  var bestHard = 0
  var bestFree = 0
  for (var a = 0; a < count; a++) {
    var kappa = count === 1 ? 0 : -kmax + (2 * kmax * a) / (count - 1)
    var fHard = freeLength(kappa, halfW, halfL)
    var fSoft = freeLength(kappa, halfW + soft - margin, halfL + soft - margin)
    var L = fHard
    var th = kappa * L
    var ex
    var ey
    if (Math.abs(kappa) < 1e-6) {
      ex = L
      ey = 0
    } else {
      ex = Math.sin(th) / kappa
      ey = (1 - Math.cos(th)) / kappa
    }
    var gdEnd = Math.sqrt((gx - ex) * (gx - ex) + (gy - ey) * (gy - ey))
    var progress = goalDist - gdEnd
    var bearing = Math.atan2(gy - ey, gx - ex)
    var herr = bearing - th
    while (herr > Math.PI) herr -= 2 * Math.PI
    while (herr < -Math.PI) herr += 2 * Math.PI
    var cost =
      -wProg * progress +
      wHead * Math.abs(herr) +
      wFree * (1 - L / H) +
      wSoft * (1 - Math.min(fSoft, H) / H) +
      wSmooth * (Math.abs(kappa - prev) / kmax)
    if (cost < bestCost) {
      bestCost = cost
      best = kappa
      bestHard = fHard
      bestFree = fSoft
    }
  }
  state.prevKappa = best
  if (params.debugDraw !== false) {
    var py = pos[1]
    function arcPoint(kk, ss) {
      var tt = kk * ss
      var ax = Math.abs(kk) < 1e-6 ? ss : Math.sin(tt) / kk
      var ay = Math.abs(kk) < 1e-6 ? 0 : (1 - Math.cos(tt)) / kk
      return [pos[0] + e.fwd[0] * ax + e.left[0] * ay, py, pos[2] + e.fwd[2] * ax + e.left[2] * ay]
    }
    function drawArc(kk, len, color) {
      var prevP = arcPoint(kk, 0)
      for (var ss = 1.5; ss <= len + 1e-6; ss += 1.5) {
        var np = arcPoint(kk, ss)
        api.visualizeLine(prevP, np, color)
        prevP = np
      }
    }
    // yellow: line to the mission goal
    api.visualizeLine(pos, [tgt[0], py, tgt[2]], '#ffcc00')
    // dark blue: candidate fan (every 4th arc, collision-free part)
    for (var ca = 0; ca < count; ca += 4) {
      var ck = -kmax + (2 * kmax * ca) / (count - 1)
      drawArc(ck, freeLength(ck, halfW, halfL), '#3a5a9a')
    }
    // green: chosen arc up to the hard-free length; orange continuation up to the planning horizon
    drawArc(best, bestHard, '#22dd66')
    if (bestHard < H) drawArc(best, Math.min(H, bestHard + 3), '#ff8800')
  }
  av.plan = {
    kappa: best,
    free: bestHard,
    freeSoft: bestFree,
    blocked: bestHard < minFree,
    horizon: H,
    cost: bestCost,
  }
  api.watch('av.plan.kappa', Math.round(best * 1000) / 1000)
  api.watch('av.plan.free', Math.round(bestHard * 10) / 10)
  return {}
}
