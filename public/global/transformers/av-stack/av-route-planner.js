// AV stack · PLAN / route + manoeuvre planner (Hybrid-A* over forward/reverse arc primitives).
// Two jobs, one search:
//  1. ROUTE: every `routeInterval` s plans a collision-free route to the goal over the costmap and publishes
//     `av.carrot` (a point ~lookahead metres along the forward part of the route). The local planner chases
//     the carrot instead of the raw goal, so a goal behind an obstacle no longer produces endless orbits.
//  2. MANOEUVRE: if the route starts by reversing (or the car is stuck) it takes over (`av.override`): drives the
//     multi-point turn segment by segment, re-plans on drift/blockage/stall, and hands back as soon as the route
//     has a long forward run.
// Runs BEFORE the local motion planner. Simulated time only.
// debug draw: magenta = route / manoeuvre path (+ status mast while manoeuvring), orange = current segment end.
// params: style ('comfort' | 'escape', see below), maneuverDecel (10), escapeManeuverSpeed (15), maneuverSpeed, mazeManeuverSpeed (off; maze-mode shuffle floor, e.g. 4.5), headingHeuristic / mazeLatch / runTotal (opt-in, see below), maneuverMargin, handbackMargin, maneuverRunSpeed (maze mode only), mazeDetour (15) / mazeDeviate (2.5) / mazeReversePenalty / mazeMaxReverseRun (maze mode, see below), routeInterval, routeExpansions, lookahead, primitiveLength, maxExpansions,
//         exploreTime (s, 0 = off; see below), fieldHeuristic (2D goal-distance field over the persistent static map, see ensureField), fieldCell, fieldInflate, fieldBlockCost, fieldEvery, gearSwitchPenalty, reversePenalty, maxReverseRun, planMargin, tightMargin, guardMargin, stallTime, stuckTime,
//         contactTtl (s, how long an unseen contact stays a virtual obstacle, default 25), contactRestTime (s at rest before a lateral stall counts as contact, default 1), contactMemory (false = off), restWaitMax (s, wait for rest before a gear change), maxOffPath (m, drop a plan the car is farther from), crawlTime,
//         goalReach, handbackFree, goalTolerance, maxCurvature, vehicleWidth, vehicleLength
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && av.preset) params = state.pmP === params && state.pmB === av.preset ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pm = Object.assign({}, av.preset, params)))
  if (!av || !av.ego) return {}
  var e = av.ego
  var tgt = input.target && input.target.pose && input.target.pose.position
  if (!tgt) return {}
  var gxw = tgt[0]
  var gzw = tgt[2]
  var kmax = params.maxCurvature || 0.115
  var planMargin = params.planMargin != null ? params.planMargin : 0.4
  var tightMargin = params.tightMargin != null ? params.tightMargin : 0.1
  var guardMargin = params.guardMargin != null ? params.guardMargin : 0.15
  var ell = params.primitiveLength || 1.8
  var maxExpFull = params.maxExpansions || 4000
  var routeExp = params.routeExpansions || 1500
  var routeInterval = params.routeInterval != null ? params.routeInterval : 0.8
  // economy (budget 'eco'): while the motion planner is fixated on a free, visible aim point the route is refreshed ecoRouteFactor (2.5) x less often
  if (params.budget === 'eco' && av.prevFix) routeInterval *= params.ecoRouteFactor || 2.5
  var lookahead = params.lookahead != null ? params.lookahead : 14
  var gearPen = params.gearSwitchPenalty != null ? params.gearSwitchPenalty : 4
  var revPen = params.reversePenalty != null ? params.reversePenalty : 4
  var handback = params.handbackFree != null ? params.handbackFree : 10
  var vMan = params.maneuverSpeed != null ? params.maneuverSpeed : 3
  var stuckTime = params.stuckTime != null ? params.stuckTime : 1.5
  var restWaitMax = params.restWaitMax != null ? params.restWaitMax : 1.2
  var maxOffPath = params.maxOffPath != null ? params.maxOffPath : 6
  var holdTol = params.goalTolerance != null ? params.goalTolerance : 3.5
  // route ends inside the waypoint acceptance zone (not only at its centre)
  var reach = params.goalReach != null ? params.goalReach : 3.5
  var maxRevRun = params.maxReverseRun != null ? params.maxReverseRun : 8
  var termHeadW = params.exitHeadingWeight != null ? params.exitHeadingWeight : 0
  var ks = [-kmax, -kmax / 2, 0, kmax / 2, kmax]
  var pos = input.position
  // next waypoint after the current target: the route should arrive heading towards it
  var nextWp = null
  var wps = av.mission ? av.mission.waypoints : params.waypoints
  if (wps && wps.length) {
    for (var wi = 0; wi < wps.length - 1; wi++) {
      if (Math.abs(wps[wi][0] - gxw) < 0.05 && Math.abs(wps[wi][1] - gzw) < 0.05) {
        nextWp = wps[wi + 1]
        break
      }
    }
  }
  var goalDist = Math.sqrt((gxw - pos[0]) * (gxw - pos[0]) + (gzw - pos[2]) * (gzw - pos[2]))
  // Exploration (params.exploreTime s, 0 = off): a goal that cannot be reached (behind walls: maze, building; the Hybrid-A* then returns the 'least bad' partial
  // route, and the car shuffles 1.8 m back and forth in its local minimum) is dropped when the car has not left a 12 m disc for exploreTime seconds. It then drives to a
  // reachable point (A* over the costmap, unknown = free) 30-100 m away that is far from the earlier dead ends, for at most 25 s, and tries the real goal again.
  var exploreT = params.exploreTime != null ? params.exploreTime : 0
  if (exploreT > 0) {
    if (!state.xa || Math.hypot(pos[0] - state.xa.x, pos[2] - state.xa.z) > 12) state.xa = { x: pos[0], z: pos[2], t: e.t }
    var xg = state.explore
    if (xg && (Math.hypot(pos[0] - xg.x, pos[2] - xg.z) < 6 || e.t - xg.t0 > 25)) {
      state.explore = xg = null
      state.xa = { x: pos[0], z: pos[2], t: e.t }
      state.route = undefined
    }
    if (!xg && e.t - state.xa.t > exploreT && goalDist > holdTol * 2) {
      if (!state.dead) state.dead = []
      state.dead.push([pos[0], pos[2]])
      if (state.dead.length > 8) state.dead.shift()
      var bestC = null
      var bestSc = -Infinity
      for (var xr = 30; xr <= 100; xr += 35) {
        for (var xi = 0; xi < 16; xi++) {
          var xa2 = (xi * Math.PI * 2) / 16
          var cxw = pos[0] + Math.cos(xa2) * xr
          var czw = pos[2] + Math.sin(xa2) * xr
          var rs = search(pos[0], pos[2], e.fwd[0], e.fwd[2], cxw, czw, av.points || [], routeExp, null)
          if (!rs.reached) continue
          var plen = 0
          for (var xn = 1; xn < rs.nodes.length; xn++) plen += Math.hypot(rs.nodes[xn].x - rs.nodes[xn - 1].x, rs.nodes[xn].z - rs.nodes[xn - 1].z)
          var dmin = 60
          for (var xd = 0; xd < state.dead.length; xd++) dmin = Math.min(dmin, Math.hypot(cxw - state.dead[xd][0], czw - state.dead[xd][1]))
          var sc = dmin + 0.2 * xr - 0.5 * Math.max(0, plen - xr) - 0.05 * Math.hypot(cxw - gxw, czw - gzw)
          if (sc > bestSc) {
            bestSc = sc
            bestC = { x: cxw, z: czw }
          }
        }
      }
      if (bestC) {
        state.explore = xg = { x: bestC.x, z: bestC.z, t0: e.t }
        state.route = undefined
        state.active = false
        state.stuckT = 0
        state.xa = { x: pos[0], z: pos[2], t: e.t }
      } else state.xa = { x: pos[0], z: pos[2], t: e.t }
    }
    if (xg) {
      gxw = xg.x
      gzw = xg.z
      goalDist = Math.sqrt((gxw - pos[0]) * (gxw - pos[0]) + (gzw - pos[2]) * (gzw - pos[2]))
    }
  }
  // Contacts the lidar cannot see (a low bar under the ray plane, a car pressed against the hull): remembered as
  // virtual obstacle points so every planner after this stage routes around them instead of driving into them again.
  var contactTtl = params.contactTtl != null ? params.contactTtl : 25
  if (!state.contacts) state.contacts = []
  // drop expired marks and any mark that now lies inside (or hugging) the car's own footprint: it is obsolete by
  // definition and, left in place, makes every start pose collide so the car can never plan a way out
  var pHalfL = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + 0.1
  var pHalfW = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + 0.1
  state.contacts = state.contacts.filter(function (c) {
    if (e.t - c.t >= contactTtl) return false
    var rx = c.x - pos[0]
    var rz = c.z - pos[2]
    var lf = rx * e.fwd[0] + rz * e.fwd[2]
    var ll = rx * e.left[0] + rz * e.left[2]
    return !(Math.abs(lf) < pHalfL && Math.abs(ll) < pHalfW)
  })
  state.restT = Math.abs(e.speed) < 0.25 && goalDist > ((params.goalTolerance != null ? params.goalTolerance : 3.5)) ? (state.restT || 0) + dt : 0
  api.watch('av.contacts', state.contacts.length + ' rest ' + (state.restT || 0).toFixed(1) + ' side ' + (input.environment && input.environment.isTouchingSide ? 1 : 0))
  function markContact(g, stalledAlready) {
    // only a LATERAL contact (isTouchingSide: wall, other body, low bar) counts — isTouchingObject is also true on the floor — and only after the car has really been pushing
    // without moving for a while, and never build a cage (no new mark where a recent one already sits ahead).
    if (params.contactMemory === false) return
    if (!stalledAlready && (state.restT || 0) < (params.contactRestTime != null ? params.contactRestTime : 1.0)) return
    var cdd = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + 0.3
    for (var ck = 0; ck < state.contacts.length; ck++) {
      var dxk = state.contacts[ck].x - (pos[0] + e.fwd[0] * g * cdd)
      var dzk = state.contacts[ck].z - (pos[2] + e.fwd[2] * g * cdd)
      if (dxk * dxk + dzk * dzk < 2.25) return
    }
    var cd = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + 0.3
    var cw = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2
    for (var cl = -cw; cl <= cw + 1e-6; cl += cw) {
      state.contacts.push({
        x: pos[0] + e.fwd[0] * g * cd + e.left[0] * cl,
        z: pos[2] + e.fwd[2] * g * cd + e.left[2] * cl,
        t: e.t,
      })
    }
    if (state.contacts.length > 40) state.contacts.splice(0, state.contacts.length - 40)
  }
  if (state.contacts.length > 0) {
    var withContacts = (av.points || []).slice()
    for (var ci2 = 0; ci2 < state.contacts.length; ci2++) withContacts.push([state.contacts[ci2].x, state.contacts[ci2].z])
    av.points = withContacts
  }

  // spatial hash over costmap points + swept-footprint test (hl/hw are the active margins)
  // one grid per point list (several margins / guard / handback tests share it). Dense counting-sort layout over the
  // points' bounding box (cell lists keep the input order); a Map fallback covers absurdly wide point sets.
  var gridCache = null
  function gridFor(pts) {
    if (gridCache && gridCache.pts === pts && gridCache.n === pts.length) return gridCache
    var n = pts.length
    var minCx = Infinity
    var maxCx = -Infinity
    var minCz = Infinity
    var maxCz = -Infinity
    var cxA = new Float64Array(n)
    var czA = new Float64Array(n)
    for (var i = 0; i < n; i++) {
      var pi = pts[i]
      var cx = Math.floor(pi[0] / 2)
      var cz = Math.floor(pi[1] / 2)
      cxA[i] = cx
      czA[i] = cz
      if (cx < minCx) minCx = cx
      if (cx > maxCx) maxCx = cx
      if (cz < minCz) minCz = cz
      if (cz > maxCz) maxCz = cz
    }
    var g = { pts: pts, n: n, dense: false, minCx: minCx, minCz: minCz, w: 0, h: 0, start: null, xs: null, zs: null, map: null }
    var w = maxCx - minCx + 1
    var h = maxCz - minCz + 1
    if (n > 0 && w * h <= 1048576) {
      g.dense = true
      g.w = w
      g.h = h
      var start = new Int32Array(w * h + 1)
      var cellOf = new Int32Array(n)
      for (var j = 0; j < n; j++) {
        var c = (cxA[j] - minCx) * h + (czA[j] - minCz)
        cellOf[j] = c
        start[c + 1]++
      }
      for (var k = 0; k < w * h; k++) start[k + 1] += start[k]
      var fill = start.slice(0, w * h)
      var xs = new Float64Array(n)
      var zs = new Float64Array(n)
      for (var m = 0; m < n; m++) {
        var pos2 = fill[cellOf[m]]++
        xs[pos2] = pts[m][0]
        zs[pos2] = pts[m][1]
      }
      g.start = start
      g.xs = xs
      g.zs = zs
    } else {
      var map = new Map()
      for (var q = 0; q < n; q++) {
        var key = (Math.floor(pts[q][0] / 2) + 524288) * 1048576 + (Math.floor(pts[q][1] / 2) + 524288)
        var cell = map.get(key)
        if (cell) cell.push(pts[q])
        else map.set(key, [pts[q]])
      }
      g.map = map
    }
    gridCache = g
    return g
  }
  function makeHit(pts, hlA, hwA) {
    var grid = gridFor(pts)
    var R = Math.sqrt(hlA * hlA + hwA * hwA)
    if (grid.dense) {
      var gMinX = grid.minCx
      var gMinZ = grid.minCz
      var gW = grid.w
      var gH = grid.h
      var gStart = grid.start
      var gXs = grid.xs
      var gZs = grid.zs
      // summed-area table of the cell counts (built once per grid): an all-empty query window (the common case in open terrain) returns false without walking its cells
      var sat = grid.sat
      if (!sat) {
        var sh = gH + 1
        sat = grid.sat = new Int32Array((gW + 1) * sh)
        for (var si = 0; si < gW; si++) {
          var rowSum = 0
          for (var sj = 0; sj < gH; sj++) {
            var sc = si * gH + sj
            rowSum += gStart[sc + 1] - gStart[sc]
            sat[(si + 1) * sh + sj + 1] = sat[si * sh + sj + 1] + rowSum
          }
        }
      }
      var satH = gH + 1
      return function (x, z, fx, fz) {
        var x0 = Math.max(Math.floor((x - R) / 2), gMinX)
        var x1 = Math.min(Math.floor((x + R) / 2), gMinX + gW - 1)
        var z0 = Math.max(Math.floor((z - R) / 2), gMinZ)
        var z1 = Math.min(Math.floor((z + R) / 2), gMinZ + gH - 1)
        if (x0 > x1 || z0 > z1) return false
        var sa0 = x0 - gMinX
        var sa1 = x1 - gMinX + 1
        var sb0 = z0 - gMinZ
        var sb1 = z1 - gMinZ + 1
        if (sat[sa1 * satH + sb1] - sat[sa0 * satH + sb1] - sat[sa1 * satH + sb0] + sat[sa0 * satH + sb0] === 0) return false
        for (var cx = x0; cx <= x1; cx++) {
          for (var cz = z0; cz <= z1; cz++) {
            var ci = (cx - gMinX) * gH + (cz - gMinZ)
            for (var q = gStart[ci], qe = gStart[ci + 1]; q < qe; q++) {
              var dx = gXs[q] - x
              var dz = gZs[q] - z
              var lx = dx * fx + dz * fz
              var ly = dx * fz - dz * fx
              if (lx > -hlA && lx < hlA && ly > -hwA && ly < hwA) return true
            }
          }
        }
        return false
      }
    }
    var map = grid.map
    return function (x, z, fx, fz) {
      var x0 = Math.floor((x - R) / 2)
      var x1 = Math.floor((x + R) / 2)
      var z0 = Math.floor((z - R) / 2)
      var z1 = Math.floor((z + R) / 2)
      for (var cx = x0; cx <= x1; cx++) {
        for (var cz = z0; cz <= z1; cz++) {
          var list = map.get((cx + 524288) * 1048576 + (cz + 524288))
          if (!list) continue
          for (var q = 0; q < list.length; q++) {
            var dx = list[q][0] - x
            var dz = list[q][1] - z
            var lx = dx * fx + dz * fz
            var ly = dx * fz - dz * fx
            if (lx > -hlA && lx < hlA && ly > -hwA && ly < hwA) return true
          }
        }
      }
      return false
    }
  }



  // --- route clearance (routeClearance, param; v2): smooth "wide berth" cost for FORWARD CRUISE route plans only (never maze / turn-around / reverse cruise / manoeuvre plans).
  // One distance transform of the costmap points per plan (1 m lattice, two-pass nearest-point propagation, window = car..goal box +-25 m, <= 300 m square); the cost is integrated along every primitive
  // (4 samples per 1.8 m, bilinear lookup): clearWeight (0.03) * max(0, Dc - gap)^2 / Dc per metre, gap = distance to the nearest costmap point - half vehicle width, Dc = clearMin (3) + clearSpeedGain (0.12) * speed, capped at clearMax (6).
  // Quadratic and small: a berth is bought only where it costs little path (no zig-zag around obstacles that are far from the line). Not a veto (planMargin stays the hard margin).
  var clrField = null
  var clrActive = false
  function clearDc() {
    return Math.min(params.clearMax != null ? params.clearMax : 6, (params.clearMin != null ? params.clearMin : 3) + (params.clearSpeedGain != null ? params.clearSpeedGain : 0.12) * Math.max(0, e.speedF || 0))
  }
  function buildClearField(pts) {
    var cap = (params.clearMax != null ? params.clearMax : 6) + ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2
    var x0 = Math.min(pos[0], gxw) - 25
    var x1 = Math.max(pos[0], gxw) + 25
    var z0 = Math.min(pos[2], gzw) - 25
    var z1 = Math.max(pos[2], gzw) + 25
    if (x1 - x0 > 300) { x0 = pos[0] - 150; x1 = pos[0] + 150 }
    if (z1 - z0 > 300) { z0 = pos[2] - 150; z1 = pos[2] + 150 }
    var W = Math.ceil(x1 - x0) + 1
    var H = Math.ceil(z1 - z0) + 1
    var n = W * H
    var px = new Float32Array(n)
    var pz = new Float32Array(n)
    var dd = new Float32Array(n).fill(1e9)
    for (var i = 0; i < pts.length; i++) {
      var qx = pts[i][0]
      var qz = pts[i][1]
      if (qx < x0 - cap || qx > x1 + cap || qz < z0 - cap || qz > z1 + cap) continue
      var cx = Math.round(qx - x0)
      var cz = Math.round(qz - z0)
      if (cx < 0) cx = 0
      else if (cx >= W) cx = W - 1
      if (cz < 0) cz = 0
      else if (cz >= H) cz = H - 1
      var ci = cx * H + cz
      var dx = qx - (x0 + cx)
      var dz = qz - (z0 + cz)
      var d2 = dx * dx + dz * dz
      if (d2 < dd[ci]) {
        dd[ci] = d2
        px[ci] = qx
        pz[ci] = qz
      }
    }
    function relax(ci, cx, cz, nx2, nz2) {
      if (nx2 < 0 || nx2 >= W || nz2 < 0 || nz2 >= H) return
      var ni = nx2 * H + nz2
      if (dd[ni] >= 1e9) return
      var dx2 = px[ni] - (x0 + cx)
      var dz2 = pz[ni] - (z0 + cz)
      var d3 = dx2 * dx2 + dz2 * dz2
      if (d3 < dd[ci]) {
        dd[ci] = d3
        px[ci] = px[ni]
        pz[ci] = pz[ni]
      }
    }
    var cxi
    var czi
    for (cxi = 0; cxi < W; cxi++) {
      for (czi = 0; czi < H; czi++) {
        var c0 = cxi * H + czi
        relax(c0, cxi, czi, cxi - 1, czi)
        relax(c0, cxi, czi, cxi, czi - 1)
        relax(c0, cxi, czi, cxi - 1, czi - 1)
        relax(c0, cxi, czi, cxi - 1, czi + 1)
      }
    }
    for (cxi = W - 1; cxi >= 0; cxi--) {
      for (czi = H - 1; czi >= 0; czi--) {
        var c1 = cxi * H + czi
        relax(c1, cxi, czi, cxi + 1, czi)
        relax(c1, cxi, czi, cxi, czi + 1)
        relax(c1, cxi, czi, cxi + 1, czi + 1)
        relax(c1, cxi, czi, cxi + 1, czi - 1)
      }
    }
    var dist = new Float32Array(n)
    for (var k2 = 0; k2 < n; k2++) dist[k2] = dd[k2] >= 1e9 ? cap : Math.min(cap, Math.sqrt(dd[k2]))
    return { x0: x0, z0: z0, W: W, H: H, d: dist, cap: cap }
  }
  // bilinear distance to the nearest costmap point (cap outside the window)
  function clearDist(F, x, z) {
    var fx = x - F.x0
    var fz = z - F.z0
    if (fx < 0 || fz < 0 || fx >= F.W - 1 || fz >= F.H - 1) return F.cap
    var ix = Math.floor(fx)
    var iz = Math.floor(fz)
    var tx = fx - ix
    var tz = fz - iz
    var b = ix * F.H + iz
    var a00 = F.d[b]
    var a01 = F.d[b + 1]
    var a10 = F.d[b + F.H]
    var a11 = F.d[b + F.H + 1]
    return (a00 * (1 - tx) + a10 * tx) * (1 - tz) + (a01 * (1 - tx) + a11 * tx) * tz
  }

  // --- 2D goal-distance field (params.fieldHeuristic true, needs av.smap from the perception stage with staticMap) ---
  // Hybrid-A* with a euclidean heuristic is blind to walls: in a maze it floods the pocket in front of a wall, runs out of expansions and returns a PARTIAL route whose best node is a local
  // minimum of the euclidean distance (the car then shuffles 1.8 m back and forth). The field is the holonomic obstacle-aware distance to the goal over the PERSISTENT static map
  // (walls seen once stay known), unknown cells count as free (optimistic: the car explores by following the field and re-plans as walls appear, dead ends it has seen stay closed),
  // blocked (inflated) cells are passable at 400x cost so the field is finite everywhere (a goal inside a wall / fully enclosed still has a gradient). cell 2 m, window snapped to 32 m.
  var fld = null
  function ensureField() {
    if (params.fieldHeuristic !== true || !av.smap) {
      fld = null
      return
    }
    var F = state.fl
    var c0 = params.fieldCell || 2
    var pad = 70
    var wx0 = Math.floor((Math.min(pos[0], gxw) - pad) / 32) * 32
    var wz0 = Math.floor((Math.min(pos[2], gzw) - pad) / 32) * 32
    var wx1 = Math.ceil((Math.max(pos[0], gxw) + pad) / 32) * 32
    var wz1 = Math.ceil((Math.max(pos[2], gzw) + pad) / 32) * 32
    var cs = c0
    while (((wx1 - wx0) / cs) * ((wz1 - wz0) / cs) > 100000) cs += 1
    var W = Math.ceil((wx1 - wx0) / cs)
    var H = Math.ceil((wz1 - wz0) / cs)
    var sameWin = F && F.wx0 === wx0 && F.wz0 === wz0 && F.W === W && F.H === H && F.cs === cs
    if (!sameWin) {
      F = state.fl = { wx0: wx0, wz0: wz0, W: W, H: H, cs: cs, occ: new Uint8Array(W * H), used: 0, d: new Float64Array(W * H), hk: new Float64Array(W * H * 8 + 16), hi: new Int32Array(W * H * 8 + 16), bn: new Int32Array(W * H * 8 + 16), bh: null, gcell: -1, ver: -1, t: -9 }
    }
    var list = av.smap.list
    var rInf = (params.fieldInflate != null ? params.fieldInflate : ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + 0.8)
    var rc = Math.ceil(rInf / cs)
    var ecoExact = params.budget === 'eco' && params.ecoFieldExact !== false
    var ecoDynSlow = params.budget === 'eco' && (params.ecoFieldFactor || 3) > 1
    for (; F.used < list.length; F.used++) {
      var pp = list[F.used]
      var ix = Math.floor((pp[0] - wx0) / cs)
      var iz = Math.floor((pp[1] - wz0) / cs)
      if (ix < -rc || iz < -rc || ix >= W + rc || iz >= H + rc) continue
      for (var ox = -rc; ox <= rc; ox++) {
        for (var oz = -rc; oz <= rc; oz++) {
          var jx = ix + ox
          var jz = iz + oz
          if (jx < 0 || jz < 0 || jx >= W || jz >= H) continue
          var cxm = wx0 + (jx + 0.5) * cs - pp[0]
          var czm = wz0 + (jz + 0.5) * cs - pp[1]
          if (cxm * cxm + czm * czm <= (rInf + cs * 0.5) * (rInf + cs * 0.5)) {
            // eco (ecoFieldExact): a point landing in an already blocked cell changes nothing, the field is not marked dirty (no identical rebuild)
            if (!ecoExact || !F.occ[jx * H + jz]) F.dirty = true
            F.occ[jx * H + jz] = 1
          }
        }
      }
    }
    // stopped dynamic bodies (parked car, stalled chaser: remembered lidar points not near a moving tracked threat) are stamped on a per-build copy of the occupancy; moving ones are the motion planner's job
    var dsig = ''
    var dynIn = []
    if (params.fieldDynamic !== false && av.dyn && av.dyn.length) {
      var thr = av.threats || []
      for (var dpi = 0; dpi < av.dyn.length; dpi++) {
        var dp = av.dyn[dpi]
        var moving = false
        for (var ti = 0; ti < thr.length; ti++) {
          if (thr[ti].vx * thr[ti].vx + thr[ti].vz * thr[ti].vz > 4 && (thr[ti].x - dp[0]) * (thr[ti].x - dp[0]) + (thr[ti].z - dp[1]) * (thr[ti].z - dp[1]) < 100) {
            moving = true
            break
          }
        }
        if (!moving) dynIn.push(dp)
      }
      var sx = 0
      var sz = 0
      for (var dq = 0; dq < dynIn.length; dq++) {
        sx += dynIn[dq][0]
        sz += dynIn[dq][1]
      }
      dsig = dynIn.length + ':' + Math.round(sx / 6) + ':' + Math.round(sz / 6)
    }
    if (dsig !== F.dsig) {
      F.dsig = dsig
      // eco: a change of the stopped-body stamps (they flicker as lidar re-sees them) waits ecoFieldFactor x fieldEvery; new static map points keep the normal rate
      if (ecoDynSlow) F.dirtyDyn = true
      else F.dirty = true
    }
    var gcx = Math.max(0, Math.min(W - 1, Math.floor((gxw - wx0) / cs)))
    var gcz = Math.max(0, Math.min(H - 1, Math.floor((gzw - wz0) / cs)))
    var gcell = gcx * H + gcz
    var fieldEvery = params.fieldEvery != null ? params.fieldEvery : 0.3
    if (gcell !== F.gcell || (F.dirty && e.t - F.t >= fieldEvery) || (F.dirtyDyn && e.t - F.t >= fieldEvery * (params.ecoFieldFactor || 3))) {
      F.gcell = gcell
      F.dirty = false
      F.dirtyDyn = false
      F.t = e.t
      F.builds = (F.builds || 0) + 1
      var N = W * H
      var occ = F.occ
      if (dynIn.length) {
        occ = F.occD || (F.occD = new Uint8Array(N))
        occ.set(F.occ)
        for (var dz2 = 0; dz2 < dynIn.length; dz2++) {
          var ix2 = Math.floor((dynIn[dz2][0] - wx0) / cs)
          var iz2 = Math.floor((dynIn[dz2][1] - wz0) / cs)
          for (var ox2 = -rc; ox2 <= rc; ox2++) {
            for (var oz2 = -rc; oz2 <= rc; oz2++) {
              var jx2 = ix2 + ox2
              var jz2 = iz2 + oz2
              if (jx2 >= 0 && jz2 >= 0 && jx2 < W && jz2 < H) occ[jx2 * H + jz2] = 1
            }
          }
        }
      }
      var d = F.d
      d.fill(1e9)
      var hk = F.hk
      var hi = F.hi
      var bnext = F.bn
      var blockCost = params.fieldBlockCost != null ? params.fieldBlockCost : 400
      // Dial's algorithm (circular bucket queue). Bucket width < the smallest edge cost, so nodes of one bucket never improve each other and settle order is irrelevant:
      // the resulting d values are exactly those of a heap Dijkstra (same float sums), just without the log factor.
      var cdiag = cs * 1.4142
      var bw = 0.99 * cs * Math.min(1, blockCost > 0.05 ? blockCost : 0.05)
      var maxEdge = cdiag * Math.max(1, blockCost)
      // ring size: any R above the largest bucket span keeps the pop order (absolute bucket index decides it); a power of two turns the slot modulo into a mask
      var R = 16
      while (R < Math.ceil(maxEdge / bw) + 2) R *= 2
      var RM = R - 1
      var heads = F.bh && F.bh.length >= R ? F.bh : (F.bh = new Int32Array(R))
      for (var bi0 = 0; bi0 < R; bi0++) heads[bi0] = -1
      var np = 0
      var pending = 1
      d[gcell] = 0
      hk[0] = 0
      hi[0] = gcell
      bnext[0] = -1
      heads[0] = 0
      np = 1
      var curB = 0
      var settled = 0
      var fieldCut = params.budget === 'eco' && params.ecoFieldCut != null ? params.ecoFieldCut : params.budget === 'eco' ? 1.1 : 0
      var fieldPad = params.ecoFieldPad != null ? params.ecoFieldPad : 20
      var cutoff = fieldCut > 0 ? Infinity : -1
      var carCell = fieldCut > 0 ? Math.max(0, Math.min(W - 1, Math.floor((pos[0] - wx0) / cs))) * H + Math.max(0, Math.min(H - 1, Math.floor((pos[2] - wz0) / cs))) : -1
      // neighbour order, offsets and edge costs are fixed (push order = bucket list order = same tentative values at the cut): free / blocked edge cost precomputed (same float product as stepA * blockCost)
      var offs = [H, -H, 1, -1, H + 1, H - 1, 1 - H, -H - 1]
      var dxs = [1, -1, 0, 0, 1, 1, -1, -1]
      var dzs = [0, 0, 1, -1, 1, -1, 1, -1]
      var stepF = [cs, cs, cs, cs, cdiag, cdiag, cdiag, cdiag]
      var stepB = [cs * blockCost, cs * blockCost, cs * blockCost, cs * blockCost, cdiag * blockCost, cdiag * blockCost, cdiag * blockCost, cdiag * blockCost]
      var invBw = 1 / bw
      // bucket index by int truncation (== floor for nd >= 0) when the largest possible distance stays below 2^31 buckets
      var intBucket = N * maxEdge * invBw < 2000000000
      while (pending > 0) {
        var slot = intBucket ? curB & RM : curB % R
        var ent = heads[slot]
        if (ent < 0) {
          curB++
          continue
        }
        heads[slot] = bnext[ent]
        pending--
        var topK = hk[ent]
        var topI = hi[ent]
        if (topK > d[topI]) continue
        // eco (ecoFieldCut 1.1, 0 = off): the Dijkstra stops once it is past ecoFieldCut x the car's own distance + ecoFieldPad (20): the search never goes farther from the goal than the route it looks for
        if (topI === carCell) cutoff = topK * fieldCut + fieldPad
        else if (cutoff >= 0 && topK > cutoff) break
        settled++
        var tx = (topI / H) | 0
        var tz = topI - tx * H
        var inner = tx > 0 && tz > 0 && tx < W - 1 && tz < H - 1
        for (var q = 0; q < 8; q++) {
          if (!inner) {
            var nx = tx + dxs[q]
            var nz = tz + dzs[q]
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue
          }
          var ni = topI + offs[q]
          var nd = topK + (occ[ni] ? stepB[q] : stepF[q])
          if (nd < d[ni]) {
            d[ni] = nd
            var pe = np++
            hk[pe] = nd
            hi[pe] = ni
            var nb = intBucket ? ((nd * invBw) | 0) & RM : Math.floor(nd * invBw) % R
            bnext[pe] = heads[nb]
            heads[nb] = pe
            pending++
          }
        }
      }
      av.work.fieldCells += settled
    }
    fld = { gx: gxw, gz: gzw, F: F }
    av.fieldGoal = { x: gxw, z: gzw, d: fieldAt(pos[0], pos[2]) }
  }
  // point ~`dist` m along the steepest descent of the field from (x, z): where the obstacle-aware route leads (the goal itself when no field)
  function fieldGuide(x, z, dist) {
    if (!fld) return [gxw, gzw]
    var F = fld.F
    var cx = Math.max(0, Math.min(F.W - 1, Math.floor((x - F.wx0) / F.cs)))
    var cz = Math.max(0, Math.min(F.H - 1, Math.floor((z - F.wz0) / F.cs)))
    var n = Math.max(1, Math.round(dist / F.cs))
    for (var i = 0; i < n; i++) {
      var best = F.d[cx * F.H + cz]
      var bx = cx
      var bz = cz
      for (var ox = -1; ox <= 1; ox++) {
        for (var oz = -1; oz <= 1; oz++) {
          var nx = cx + ox
          var nz = cz + oz
          if (nx < 0 || nz < 0 || nx >= F.W || nz >= F.H) continue
          var dv = F.d[nx * F.H + nz]
          if (dv < best) {
            best = dv
            bx = nx
            bz = nz
          }
        }
      }
      if (bx === cx && bz === cz) break
      cx = bx
      cz = bz
    }
    return [F.wx0 + (cx + 0.5) * F.cs, F.wz0 + (cz + 0.5) * F.cs]
  }
  function fieldAt(x, z) {
    var F = fld.F
    var fx = (x - F.wx0) / F.cs - 0.5
    var fz = (z - F.wz0) / F.cs - 0.5
    var extra = 0
    var cx = Math.round(fx)
    var cz = Math.round(fz)
    if (cx < 0 || cx >= F.W || cz < 0 || cz >= F.H) {
      var ex = cx < 0 ? -cx : cx >= F.W ? cx - F.W + 1 : 0
      var ez = cz < 0 ? -cz : cz >= F.H ? cz - F.H + 1 : 0
      extra = Math.sqrt(ex * ex + ez * ez) * F.cs
      cx = Math.max(0, Math.min(F.W - 1, cx))
      cz = Math.max(0, Math.min(F.H - 1, cz))
    }
    return F.d[cx * F.H + cz] + extra
  }

  var turnOk = false
  var clearOn = false
  function search(sx, sz, sfx, sfz, gx, gz, pts, maxExp, marginOverride) {
    var useField = fld !== null && Math.abs(gx - fld.gx) < 1.5 && Math.abs(gz - fld.gz) < 1.5
    var hlS = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + planMargin
    var hwS = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + planMargin
    var hit = makeHit(pts, hlS, hwS)
    // start already inside the comfort margin (drift, soft contact): re-plan with the tight margin so
    // the planner can still drive out of the margin band instead of finding every primitive blocked
    // start already inside the comfort margin (drift, soft contact): re-plan with the tight margin so
    // the planner can still drive out of the margin band instead of finding every primitive blocked
    var marginUsed = planMargin
    if (marginOverride != null) {
      marginUsed = marginOverride
      hlS = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + marginUsed
      hwS = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + marginUsed
      hit = makeHit(pts, hlS, hwS)
    } else if (hit(sx, sz, sfx, sfz)) {
      marginUsed = tightMargin
      hlS = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + tightMargin
      hwS = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + tightMargin
      hit = makeHit(pts, hlS, hwS)
    }
    state.startMargin = marginUsed
    var clrF = null
    var clrDc = 0
    var clrW = 0
    var clrHalfW = 0
    if (clearOn && marginOverride == null && marginUsed === planMargin && pts.length > 0) {
      clrF = clrField && clrField.pts === pts && clrField.n === pts.length ? clrField : (clrField = buildClearField(pts))
      clrF.pts = pts
      clrF.n = pts.length
      clrDc = clearDc()
      // confined (walls on BOTH sides of the start pose within ~4 m: corridor, gate, dead end): no berth to buy there, keep the plain plan
      var lat = params.clearConfineLat != null ? params.clearConfineLat : 4
      if (clearDist(clrF, sx + e.left[0] * lat, sz + e.left[2] * lat) < 2.5 && clearDist(clrF, sx - e.left[0] * lat, sz - e.left[2] * lat) < 2.5) clrF = null
      // corridor / dead end wider than that (walls on both sides within clearConfineWide, 11 m): a wall line is crossed laterally on BOTH sides -> plain plan (no berth to buy, and the unseen end of a corridor counts as free)
      if (clrF !== null) {
        var wide = params.clearConfineWide != null ? params.clearConfineWide : 11
        var wl = false
        var wr = false
        for (var wd = 1; wd <= wide; wd++) {
          if (!wl && clearDist(clrF, sx + e.left[0] * wd, sz + e.left[2] * wd) < 0.8) wl = true
          if (!wr && clearDist(clrF, sx - e.left[0] * wd, sz - e.left[2] * wd) < 0.8) wr = true
        }
        if (wl && wr) clrF = null
      }
      clrActive = clrF !== null
      clrW = params.clearWeight != null ? params.clearWeight : 0.03
      clrHalfW = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2
    }
    function eu(x, z) {
      var dx = gx - x
      var dz = gz - z
      return Math.sqrt(dx * dx + dz * dz)
    }
    // Heading-aware heuristic (headingHeuristic, OPT-IN: true; off in maze mode where the field already carries the geometry): a goal BEHIND the car costs the turn that is needed to face it (arc of the minimum turn radius, scaled 0.8), not just the
    // straight distance. With the pure distance a goal 80 m behind was "approached" by reversing in a straight line (the cheapest way to shrink the distance inside the expansion budget):
    // 8 m reverse runs, a short forward arc, reverse again, 46 m reversed in 20 s instead of one 3-point turn.
    // Opt-in because the inadmissible extra cost misleads the budgeted search where turning is impossible (18 m alley, goal behind: it explores turns instead of reversing out;
    // reverse-escape / open-road-reverse fail with it). Turnaround tests: av-maze-scenarios KNOWN_FAILING until that is solved.
    var hHead = (params.headingHeuristic === true || turnOk) && !state.maze
    var Rturn = 1 / kmax
    var hW = params.headingWeight != null ? params.headingWeight : 0.8
    var hMin = params.headingMin != null ? params.headingMin : 0.4
    function dist(x, z, fx, fz) {
      var e1 = eu(x, z)
      var base = e1
      if (useField) {
        var f1 = fieldAt(x, z)
        if (f1 > e1) base = f1
      }
      if (!hHead || fx === undefined || e1 < 12) return base
      var c = (fx * (gx - x) + fz * (gz - z)) / e1
      var th = Math.acos(c > 1 ? 1 : c < -1 ? -1 : c)
      return th > hMin ? base + hW * Rturn * (th - hMin) : base
    }
    // binary min-heap on f
    var heap = []
    function push(nd) {
      heap.push(nd)
      var c = heap.length - 1
      while (c > 0) {
        var p = (c - 1) >> 1
        if (heap[p].f <= heap[c].f) break
        var t = heap[p]
        heap[p] = heap[c]
        heap[c] = t
        c = p
      }
    }
    function pop() {
      var top = heap[0]
      var last = heap.pop()
      if (heap.length > 0) {
        heap[0] = last
        var c = 0
        for (;;) {
          var l = 2 * c + 1
          var r = l + 1
          var m = c
          if (l < heap.length && heap[l].f < heap[m].f) m = l
          if (r < heap.length && heap[r].f < heap[m].f) m = r
          if (m === c) break
          var t = heap[m]
          heap[m] = heap[c]
          heap[c] = t
          c = m
        }
      }
      return top
    }
    // best-cost table: open addressing over typed arrays (numeric state key = cell x, cell z, heading bin, gear)
    var cap = 1024
    while (cap < maxExp * 24) cap <<= 1
    var capMask = cap - 1
    var tKeys = new Float64Array(cap).fill(-1)
    var tVals = new Float64Array(cap)
    var slotKey = 0
    function slotOf(x, z, fx, fz, g) {
      var ih = Math.round((Math.atan2(fz, fx) / (2 * Math.PI)) * 36)
      if (ih < 0) ih += 36
      var ix = Math.round(x / 0.6) + 524288
      var iz = Math.round(z / 0.6) + 524288
      var ihg = (ih % 36) * 3 + (g + 1)
      slotKey = (ix * 1048576 + iz) * 108 + ihg
      var h = (Math.imul(ix, 0x9e3779b1) ^ Math.imul(iz, 0x85ebca6b) ^ Math.imul(ihg + 1, 0xc2b2ae35)) >>> 0
      var sl = (h ^ (h >>> 15)) & capMask
      while (tKeys[sl] !== -1 && tKeys[sl] !== slotKey) sl = (sl + 1) & capMask
      return sl
    }
    var HW = 1.4
    var start = { x: sx, z: sz, fx: sfx, fz: sfz, g: 0, gear: 0, k: 0, parent: null, f: dist(sx, sz, sfx, sfz) * HW, d: 0 }
    push(start)
    var s0 = slotOf(sx, sz, sfx, sfz, 0)
    tKeys[s0] = slotKey
    tVals[s0] = 0
    var bestNode = start
    var bestH = dist(sx, sz, sfx, sfz)
    var goalNode = null
    var expansions = 0
    while (heap.length > 0 && expansions < maxExp) {
      var cur = pop()
      var cs = slotOf(cur.x, cur.z, cur.fx, cur.fz, cur.gear)
      if (tKeys[cs] !== -1 && cur.g > tVals[cs] + 1e-6) continue
      expansions++
      var h = dist(cur.x, cur.z, cur.fx, cur.fz)
      if (h < bestH) {
        bestH = h
        bestNode = cur
      }
      if (eu(cur.x, cur.z) < reach) {
        if (cur.terminal || !nextWp) {
          goalNode = cur
          break
        }
        // arrival cost: leave the goal zone heading towards the next waypoint
        var ndx = nextWp[0] - cur.x
        var ndz = nextWp[1] - cur.z
        var nl = Math.sqrt(ndx * ndx + ndz * ndz) || 1
        var cosA = Math.max(-1, Math.min(1, (cur.fx * ndx + cur.fz * ndz) / nl))
        var termG = cur.g + termHeadW * Math.acos(cosA)
        push({ x: cur.x, z: cur.z, fx: cur.fx, fz: cur.fz, g: termG, gear: cur.gear, k: cur.k, parent: cur, terminal: true, f: termG })
        continue
      }
      for (var gi = 0; gi < 2; gi++) {
        var gear = gi === 0 ? 1 : -1
        for (var ki = 0; ki < ks.length; ki++) {
          var k = ks[ki]
          var lx = cur.fz
          var lz = -cur.fx
          var revRun = gear < 0 ? (cur.gear < 0 ? cur.revRun || 0 : 0) + ell : 0
          if (revRun > maxRevRun) continue
          var ok = true
          var clrPen = 0
          var nx = cur.x
          var nz = cur.z
          var nfx = cur.fx
          var nfz = cur.fz
          for (var sIdx = 1; sIdx <= 4; sIdx++) {
            var d = (gear * ell * sIdx) / 4
            var th = k * d
            var ddx
            var ddy
            if (Math.abs(k) < 1e-6) {
              ddx = d
              ddy = 0
            } else {
              ddx = Math.sin(th) / k
              ddy = (1 - Math.cos(th)) / k
            }
            nx = cur.x + cur.fx * ddx + lx * ddy
            nz = cur.z + cur.fz * ddx + lz * ddy
            var ct = Math.cos(th)
            var st = Math.sin(th)
            nfx = cur.fx * ct + lx * st
            nfz = cur.fz * ct + lz * st
            if (hit(nx, nz, nfx, nfz)) {
              ok = false
              break
            }
            if (clrF !== null && gear > 0) {
              var cgap = clrDc - (clearDist(clrF, nx, nz) - clrHalfW)
              if (cgap > 0) clrPen += cgap * cgap
            }
          }
          if (!ok) continue
          var step = ell * (gear < 0 ? revPen : 1) + (Math.abs(k) / kmax) * 0.4 * ell
          if (cur.gear !== 0 && cur.gear !== gear) step += gearPen
          if (cur.gear !== 0 && cur.k !== k) step += 0.3
          if (clrPen > 0) step += (clrW * clrPen * ell) / (4 * clrDc)
          var g2 = cur.g + step
          var ns = slotOf(nx, nz, nfx, nfz, gear)
          if (tKeys[ns] !== -1 && tVals[ns] <= g2) continue
          tKeys[ns] = slotKey
          tVals[ns] = g2
          push({ x: nx, z: nz, fx: nfx, fz: nfz, g: g2, gear: gear, k: k, revRun: revRun, parent: cur, f: g2 + dist(nx, nz, nfx, nfz) * HW })
        }
      }
    }
    var end = goalNode || bestNode
    if (end.terminal) end = end.parent
    var segs = []
    for (var nd = end; nd && nd.parent; nd = nd.parent) {
      var last = segs[0]
      if (last && last.g === nd.gear && last.k === nd.k) {
        last.len += ell
      } else {
        segs.unshift({ g: nd.gear, k: nd.k, len: ell, end: null })
      }
    }
    // expected pose at the end of every segment (walk the chain again, front to back)
    var chain = []
    for (var cn = end; cn; cn = cn.parent) chain.unshift(cn)
    var si = -1
    var prevG = null
    var prevK = null
    for (var ci = 1; ci < chain.length; ci++) {
      var nn = chain[ci]
      if (si < 0 || nn.gear !== prevG || nn.k !== prevK) {
        si++
        prevG = nn.gear
        prevK = nn.k
      }
      segs[si].end = { x: nn.x, z: nn.z, fx: nn.fx, fz: nn.fz }
    }
    var pathPts = []
    for (var pj = 0; pj < chain.length; pj++) pathPts.push([chain[pj].x, chain[pj].z])
    var nodes = []
    for (var nj = 0; nj < chain.length; nj++) nodes.push({ x: chain[nj].x, z: chain[nj].z, g: chain[nj].gear })
    av.work.astarExp += expansions
    return { segs: segs, reached: !!goalNode, expansions: expansions, hRemaining: bestH, path: pathPts, nodes: nodes }
  }

  function begin(res) {
    state.segs = res.segs
    state.mazePlan = state.maze
    state.turnPlan = turnOk
    state.idx = 0
    state.segStart = null
    state.prevGear = 0
    state.path = res.path
  }
  function deviates(seg) {
    if (!seg || !seg.end) return false
    var ex = pos[0] - seg.end.x
    var ez = pos[2] - seg.end.z
    var dot = e.fwd[0] * seg.end.fx + e.fwd[2] * seg.end.fz
    // maze mode: commit to the plan (a re-plan from every small drift picks another equal-cost K-turn and flips direction); only a real deviation re-plans
    if (state.maze) return Math.sqrt(ex * ex + ez * ez) > (params.mazeDeviate != null ? params.mazeDeviate : 2.5) || dot < 0.85
    // a U / 3-point turn planned here (turnOk at plan time) is committed to as well (turnCommit: false = off): the drift at each gear change re-planned it into another turn
    if (state.turnPlan && params.turnCommit !== false) return Math.sqrt(ex * ex + ez * ez) > (params.turnDeviate != null ? params.turnDeviate : 2.5) || dot < 0.85
    return Math.sqrt(ex * ex + ez * ez) > 0.9 || dot < 0.97
  }
  function plan(maxE) {
    ensureField()
    // maneuverMargin (m, default off): a manoeuvre is first planned with this larger margin (squeezing past a parked car at 0.2 m is a plan the local planner would refuse after the hand-back);
    // the normal margins are the fallback when no complete route exists with it.
    if (params.maneuverMargin > planMargin && maxE === maxExpFull) {
      var wide = search(pos[0], pos[2], e.fwd[0], e.fwd[2], gxw, gzw, av.points || [], maxE, params.maneuverMargin)
      if (wide.reached && wide.segs.length > 0) return wide
    }
    var res = search(pos[0], pos[2], e.fwd[0], e.fwd[2], gxw, gzw, av.points || [], maxE, null)
    // Pressed against something (a corner touching a long wall): every primitive is blocked at the comfort margins, so
    // retry with ever smaller margins until the car can at least drive out of the contact.
    var escape = [0.05, 0.02, 0]
    for (var ei = 0; ei < escape.length && res.segs.length === 0 && !res.reached; ei++) {
      res = search(pos[0], pos[2], e.fwd[0], e.fwd[2], gxw, gzw, av.points || [], maxE, escape[ei])
    }
    return res
  }
  // Carrot string-pulling (carrotPull, default on): Hybrid-A* headings are discretised, so the route zig-zags around the straight line (+-5-10 m at 25 m
  // lookahead) and a carrot taken from it makes the car weave on an empty road. Line-of-sight shortcut on the same costmap and margin: the farthest node of the
  // leading forward run that the car can reach in a straight, footprint-free line; the carrot is the point `want` m along that line (the route itself is unchanged).
  // `want` = max(lookahead, carrotLookT (1.6) s * speed): over a free line the carrot is a time-headway ahead (a 14 m carrot at 30 m/s is 0.5 s: pure-pursuit loop unstable, +-10 m weave).
  function pullCarrot(nodes, want, fallback, reached) {
    var hitP = makeHit(av.points || [], ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + planMargin, ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + planMargin)
    // wide-berth pass first (routeClearance cruise plans): the shortcut must keep Dc where possible; the plain margin test is the second pass
    var hitW = clrActive && params.clearPull !== false ? makeHit(av.points || [], ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + clearDc(), ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + clearDc()) : null
    var last = 1
    while (last + 1 < nodes.length && nodes[last + 1].g === 1) last++
    var acc2 = 0
    var reach = Math.max(2.5 * want, 60)
    var cands = []
    for (var i2 = 1; i2 <= last; i2++) {
      acc2 += Math.hypot(nodes[i2].x - nodes[i2 - 1].x, nodes[i2].z - nodes[i2 - 1].z)
      if (acc2 > reach) break
      cands.push(i2)
    }
    var stride = Math.max(1, Math.ceil(cands.length / 14))
    // the route ends a cell short of / beside the goal (grid tolerance): when the whole route is one forward run, try the goal itself first (index -1)
    if (reached && last === nodes.length - 1) cands.push(-1)
    for (var pass = hitW ? 0 : 1; pass < 2; pass++) {
    var hitUse = pass === 0 ? hitW : hitP
    for (var ci = cands.length - 1; ci >= 0; ci -= ci >= cands.length - 2 ? 1 : stride) {
      var nd = cands[ci] < 0 ? { x: gxw, z: gzw } : nodes[cands[ci]]
      var dx = nd.x - pos[0]
      var dz = nd.z - pos[2]
      var dl = Math.hypot(dx, dz)
      if (dl < want * 0.5) break
      var ux = dx / dl
      var uz = dz / dl
      // only a car that already heads about that way (cos 20 deg): the pull refines a straight run, it does not decide turns / avoidance (those keep the route's own carrot)
      if (ux * e.fwd[0] + uz * e.fwd[2] < (params.carrotPullCos != null ? params.carrotPullCos : 0.94)) continue
      var ok = true
      for (var d = 1.5; d < Math.min(dl, 150); d += 1.5) {
        if (hitUse(pos[0] + ux * d, pos[2] + uz * d, ux, uz)) {
          ok = false
          break
        }
      }
      if (ok) {
        var dd = Math.min(want, dl)
        // `pull` = the line-of-sight target; the carrot is re-aimed at it every frame (the route is replanned only every routeInterval, a world-fixed carrot would go stale / shrink)
        return { carrot: [pos[0] + ux * dd, pos[2] + uz * dd], pull: [nd.x, nd.z] }
      }
    }
    }
    return { carrot: fallback, pull: null }
  }
  // route speed limit re-evaluated from the car's current pose: its along-route offset (nearest plan node) is subtracted from every bend distance
  // A fast tracked body that closes in within routeLimitChaseT (8) s keeps the old short-horizon limit: braking early in front of a chaser costs sweep cases (corner-trap).
  function chasedSoon() {
    var th = av.threats
    if (!th || !th.length) return false
    var tMax = params.routeLimitChaseT != null ? params.routeLimitChaseT : 8
    for (var ti = 0; ti < th.length; ti++) {
      var tx = th[ti].x - pos[0]
      var tz = th[ti].z - pos[2]
      var dd = Math.hypot(tx, tz) || 1
      var tsp = Math.hypot(th[ti].vx, th[ti].vz)
      if (tsp <= 4) continue
      var closing = -(th[ti].vx * tx + th[ti].vz * tz) / dd + Math.max(0, e.speedF) * ((e.fwd[0] * tx + e.fwd[2] * tz) / dd)
      if (closing > 4 && dd / closing < tMax) return true
    }
    return false
  }
  function routeLimitNow(rt) {
    if (rt.vOld != null && chasedSoon()) return rt.vOld
    if (!rt.bends || !rt.bends.length || !rt.nodes) return rt.vLimit
    var nn = rt.nodes
    var best = 0
    var bd = Infinity
    var cum = 0
    var bc = 0
    for (var ni = 0; ni < nn.length && nn[ni].g === 1 || ni === 0; ni++) {
      if (ni > 0) cum += Math.hypot(nn[ni].x - nn[ni - 1].x, nn[ni].z - nn[ni - 1].z)
      var dd = Math.hypot(nn[ni].x - pos[0], nn[ni].z - pos[2])
      if (dd < bd) { bd = dd; bc = cum; best = ni }
    }
    var aL = params.maxLatAccel || 9
    var aB = params.comfortDecel || 5
    var lim = Infinity
    for (var bi = 0; bi < rt.bends.length; bi++) {
      var ds = Math.max(0, rt.bends[bi].s - ((params.routeLimitPose != null ? params.routeLimitPose : params.budget === 'eco') ? bc : 0))
      var al = Math.sqrt(rt.bends[bi].vi * rt.bends[bi].vi + 2 * aB * ds)
      if (al < lim) lim = al
    }
    return lim
  }

  // route summary: first gear, length of the leading forward run, carrot point
  function summarize(res) {
    var nodes = res.nodes
    var firstGear = nodes.length > 1 ? nodes[1].g : 1
    var run = 0
    var carrot = null
    var pulled = null
    if (firstGear === 1) {
      var want = Math.min(lookahead, 6 + 1.0 * Math.max(0, e.speedF))
      var acc = 0
      for (var i = 1; i < nodes.length && nodes[i].g === 1; i++) {
        var dx = nodes[i].x - nodes[i - 1].x
        var dz = nodes[i].z - nodes[i - 1].z
        acc += Math.sqrt(dx * dx + dz * dz)
        carrot = [nodes[i].x, nodes[i].z]
        if (acc >= want) break
      }
      run = acc
      if (params.carrotPull !== false && carrot && !(av.threats && av.threats.length)) {
        pulled = pullCarrot(nodes, Math.max(want, (params.carrotLookT != null ? params.carrotLookT : 1.6) * Math.max(0, e.speedF)), carrot, res.reached)
        carrot = pulled.carrot
      }
      for (var j = i; j < nodes.length && nodes[j].g === 1; j++) {
        var ddx = nodes[j].x - nodes[j - 1].x
        var ddz = nodes[j].z - nodes[j - 1].z
        run += Math.sqrt(ddx * ddx + ddz * ddz)
      }
    }
    // speed limit from the bends ahead on the route: corner speed sqrt(aLat / kappa), reachable by braking
    var aLat = params.maxLatAccel || 9
    var aBrk = params.comfortDecel || 5
    var vLimit = Infinity
    var dAhead = 0
    // Hybrid-A* arcs are discrete (k = 0.058 / 0.115) and zig-zag around a smooth line, so a single short arc is no real bend:
    // the corner speed uses the net heading change over a window (kWin m) ahead of each segment (S-wiggles cancel).
    var kWin = params.routeCurveWindow != null ? params.routeCurveWindow : 14
    var segs = res.segs
    // routeLimitFull (default on): horizon = the whole forward run (braking from cruise needs ~100 m, not 40), bends from kk 0.005 (the corner speed
    // sqrt(aLat/kk) is harmless at low kk); the bends are kept (bends) so the limit is re-evaluated from the car's CURRENT pose, not the plan start.
    var full = params.routeLimitFull !== false
    var horizon = full ? 160 : 40
    var kMin = full ? (params.routeLimitKappa != null ? params.routeLimitKappa : 0.04) : 0.04
    var bends = []
    var vOld = Infinity
    for (var si = 0; si < segs.length && dAhead < horizon && segs[si].g > 0; si++) {
      var turn = 0
      var wl = 0
      for (var sj = si; sj < segs.length && segs[sj].g > 0 && wl < kWin; sj++) {
        var take = Math.min(segs[sj].len, kWin - wl)
        turn += segs[sj].k * take
        wl += take
      }
      var kk = Math.abs(turn) / Math.max(kWin, wl)
      if (full && dAhead < 40 && kk > 0.04) vOld = Math.min(vOld, Math.sqrt(Math.sqrt(aLat / kk) * Math.sqrt(aLat / kk) + 2 * aBrk * dAhead))
      if (kk > kMin) {
        // routeLimitLatScale (1): the extended horizon sees every bend of the weave around obstacles, the plain maxLatAccel budget (9) is too slow for the route-clearance weave
        var vi = Math.sqrt(aLat * (params.routeLimitLatScale != null ? params.routeLimitLatScale : 1) / kk)
        var allowed = Math.sqrt(vi * vi + 2 * aBrk * dAhead)
        if (allowed < vLimit) vLimit = allowed
        bends.push({ s: dAhead, vi: vi })
      }
      dAhead += segs[si].len
    }
    // the forward run ends in a gear change (a reversal ahead): the car has to be (nearly) stopped there, not at cruise
    if (full && params.routeLimitStops === true && firstGear === 1 && run > 0 && run < horizon && nodes.some(function (nd) { return nd.g !== 1 })) {
      var vEnd = params.routeLimitGearSwitch != null ? params.routeLimitGearSwitch : 3
      var aEnd = Math.sqrt(vEnd * vEnd + 2 * aBrk * run)
      if (aEnd < vLimit) vLimit = aEnd
      bends.push({ s: run, vi: vEnd })
    }
    return { firstGear: firstGear, run: run, carrot: carrot, pull: pulled && pulled.pull, reached: res.reached, expansions: res.expansions, hRem: res.hRemaining, nodes: nodes, path: res.path, vLimit: vLimit, vOld: vOld, bends: full ? bends : null }
  }

  // --- reverse cruise: the goal is behind, the way ahead is blocked, the way behind is free -> drive backwards steadily (long reverse
  // run, no gear flips, speed from the free distance behind) instead of 8 m reverse hops between forward shuffles.
  // Entry needs the forward way blocked (a free road is better crossed by a forward U-turn); it holds until the goal is no longer behind
  // or the rear is blocked (hysteresis, the planner's own gear-switch penalty does the rest).
  ensureField()
  var revCruiseOn = params.reverseCruise !== false
  var revCruiseSpeed = params.reverseSpeed != null ? params.reverseSpeed : params.style === 'escape' ? 15 : 10
  var scanRange = (av.scan && av.scan.range) || 40
  var turnRoom = params.turnRoom != null ? params.turnRoom : 20
  // lazy: the costmap grid is only built when a reverse-cruise check actually needs it (most frames: goal ahead, nothing to check)
  var freeStraight = (function () {
    var hitS = null
    return function (g, maxD) {
      if (!hitS) hitS = makeHit(av.points || [], ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + planMargin, ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + planMargin)
      for (var d = 1; d <= maxD; d += 1) {
        if (hitS(pos[0] + e.fwd[0] * g * d, pos[2] + e.fwd[2] * g * d, e.fwd[0], e.fwd[2])) return d - 1
      }
      return maxD
    }
  })()
  turnOk = false
  if (revCruiseOn && goalDist > holdTol) {
    // where the route leads: the goal, or (field) the point 24 m down the obstacle-aware route
    var gd = fieldGuide(pos[0], pos[2], 24)
    var gdl = Math.max(Math.hypot(gd[0] - pos[0], gd[1] - pos[2]), 1e-6)
    var gBehind = -((gd[0] - pos[0]) * e.fwd[0] + (gd[1] - pos[2]) * e.fwd[2]) / gdl
    var revLook = Math.min(40, scanRange)
    var fbW = '-'
    var ffW = '-'
    if (!state.revCruise) {
      if (gBehind > 0.3) {
        fbW = freeStraight(-1, revLook)
        if (fbW >= Math.min(30, revLook)) {
          ffW = freeStraight(1, 20)
          if (ffW < 20) state.revCruise = true
        }
      }
    } else if (gBehind < 0 || freeStraight(-1, 12) < 10) state.revCruise = false
    // turn-around: goal behind, not reversing out of a blocked way, and room ahead to swing round -> the heading-aware heuristic (see search) makes the search find the U / 3-point turn
    // instead of the cheapest-looking reverse run (distance only). Where the way ahead is short (alley, dead end) reversing out stays the plan.
    if (params.turnAround !== false && !state.revCruise && gBehind > 0.3) turnOk = freeStraight(1, turnRoom) >= turnRoom
    // a U / 3-point turn is a long search (the turn pays off only after ~30 m of arcs): bigger budget while turning is the plan
    if (turnOk) {
      routeExp = Math.max(routeExp, params.turnRouteExpansions != null ? params.turnRouteExpansions : 5000)
      maxExpFull = Math.max(maxExpFull, params.turnMaxExpansions != null ? params.turnMaxExpansions : 12000)
    }
    api.watch('av.revc', (state.revCruise ? 'on ' : 'off ') + gBehind.toFixed(2) + ' fb ' + fbW + ' ff ' + ffW)
  } else state.revCruise = false
  if (state.revCruise) {
    maxRevRun = 1e4
    revPen = 1
  }
  // Maze mode: the obstacle-aware route is much longer than the straight line (walls in between: backing out of a dead end, turning around in a corridor). Reversing is then cheap
  // (mazeReversePenalty 1.5 per m instead of 4, runs up to mazeMaxReverseRun 40 m) so the search finds 'back out 30 m' / a K-turn inside its expansion budget, and runs in one gear
  // are driven at maneuverRunSpeed. Open ground (field ~ straight line) keeps the normal costs.
  // mazeLatch (OPT-IN: true): hysteresis (on above mazeDetour, off below half of it) and latched while a manoeuvre runs: the detour of a pocket shrinks as the car backs out of it (16-17 m near the threshold),
  // which flipped the mode from plan to plan and in the middle of a plan (other reverse costs / speeds / re-plan thresholds each time).
  var detourM = params.mazeDetour != null ? params.mazeDetour : 15
  var mazeNow = !!(fld && av.fieldGoal && (av.fieldGoal.d - goalDist > detourM || (params.mazeLatch === true && state.mazeOn && av.fieldGoal.d - goalDist > 0.5 * detourM)))
  if (!state.active) state.mazeOn = mazeNow
  state.maze = state.active && params.mazeLatch === true ? !!state.mazePlan : mazeNow
  if (state.maze) {
    revPen = Math.min(revPen, params.mazeReversePenalty != null ? params.mazeReversePenalty : 1.5)
    maxRevRun = Math.max(maxRevRun, params.mazeMaxReverseRun != null ? params.mazeMaxReverseRun : 40)
  }

  // stuck watchdog (own, independent of the local planner)
  if (state.stuckT === undefined) state.stuckT = 0
  if (!state.active && Math.abs(e.speed) < 0.25 && goalDist > holdTol) state.stuckT += dt
  else state.stuckT = 0
  // Scraping along an obstacle (wheels spinning against contact friction) is slow but not "stopped": also count it as
  // stuck when the car has hardly moved over a longer window while driving slowly.
  if (!state.crawlAnchor) state.crawlAnchor = [pos[0], pos[2]]
  var crawlMoved = Math.sqrt((pos[0] - state.crawlAnchor[0]) * (pos[0] - state.crawlAnchor[0]) + (pos[2] - state.crawlAnchor[1]) * (pos[2] - state.crawlAnchor[1]))
  if (state.active || goalDist <= holdTol || Math.abs(e.speed) > 1.2 || crawlMoved > 2.5) {
    state.crawlAnchor = [pos[0], pos[2]]
    state.crawlT = 0
  } else {
    state.crawlT = (state.crawlT || 0) + dt
    if (state.crawlT > (params.crawlTime != null ? params.crawlTime : 6)) {
      state.stuckT = Math.max(state.stuckT, stuckTime + 0.1)
      state.crawlT = 0
      state.crawlAnchor = [pos[0], pos[2]]
    }
  }

  if (!state.active) {
    // eco (ecoPartialFactor 2): the last plan found no route to the goal and used its whole expansion budget (goal behind a wall, searching again 0.8 s later finds the same dead end): wait longer
    var ri = routeInterval
    if (params.budget === 'eco' && state.route !== undefined && !state.route.reached && state.route.expansions >= 0.9 * routeExp) ri *= params.ecoPartialFactor || 2
    if (state.route === undefined || e.t - state.routeT >= (params.routeFastRefresh === true && (e.speedF || 0) > 20 ? Math.max(0.3, ri * 20 / e.speedF) : ri)) {
      // wide berth (routeClearance): forward cruise route plans only
      clrField = null
      clrActive = false
      // maze mode only while the previous plan was a long forward run (a wall to drive around is 'maze' by the field detour, a dead end / corridor turn-around is not a cruise plan)
      clearOn = params.routeClearance === true && !turnOk && !state.revCruise && (!state.maze || ((e.speedF || 0) >= (params.clearMinSpeed != null ? params.clearMinSpeed : 9) && state.route !== undefined && state.route.firstGear === 1 && state.route.reached && state.route.run >= (params.clearMazeRun != null ? params.clearMazeRun : 40)))
      state.route = summarize(plan(routeExp))
      api.watch('av.clr', clrActive ? clearDc().toFixed(1) : '-')
      clearOn = false
      state.routeT = e.t
      state.revFresh = true
      state.routes = (state.routes || 0) + 1
    }
    var rt = state.route
    // hysteresis: a reverse-first route must be confirmed by two consecutive plans before the car manoeuvres
    state.revVotes = rt.firstGear === -1 ? (state.revFresh ? (state.revVotes || 0) + 1 : state.revVotes || 1) : 0
    state.revFresh = false
    var wantManeuver = (rt.firstGear === -1 && (state.revVotes >= 2 || Math.abs(e.speed) < 0.3) && Math.abs(e.speed) < 1.5) || state.stuckT > stuckTime
    if (wantManeuver && goalDist > holdTol) {
      // stuck although the costmap shows a free way, and in contact with something: it is invisible to the lidar
      if (state.stuckT > stuckTime && input.environment && input.environment.isTouchingSide) {
        markContact(rt.firstGear === -1 ? -1 : 1)
        av.points = (av.points || []).concat(state.contacts.slice(-3).map(function (c) { return [c.x, c.z] }))
      }
      var res = plan(maxExpFull)
      if (res.segs.length > 0) {
        state.active = true
        state.replans = (state.replans || 0) + 1
        // stuck again soon after a hand-back: the local planner (larger margins than this planner's) refuses the forward run the manoeuvre handed over
        // (a parked car's corner 0.8 m from the nose: route 'free', local planner free 0.8 m, car at rest for 30 s). Drive the first 8 m of this one ourselves.
        state.noHandbackFrom = state.stuckT > stuckTime && state.handbackT !== undefined && e.t - state.handbackT < 40 ? [pos[0], pos[2]] : null
        state.stuckT = 0
        begin(res)
      }
    }
    if (!state.active) {
      if (rt.carrot) av.carrot = rt.carrot
      if (rt.pull && !(av.threats && av.threats.length)) {
        var pdx = rt.pull[0] - pos[0]
        var pdz = rt.pull[1] - pos[2]
        var pdl = Math.hypot(pdx, pdz)
        var pwant = Math.max(14, (params.carrotLookT != null ? params.carrotLookT : 1.6) * Math.max(0, e.speedF))
        if (pdl > 1e-3 && pdx * e.fwd[0] + pdz * e.fwd[2] > 0) {
          var pk = Math.min(pwant, pdl) / pdl
          av.carrot = [pos[0] + pdx * pk, pos[2] + pdz * pk]
        }
      }
      api.watch('av.carrotw', rt.carrot ? rt.carrot[0].toFixed(0) + ',' + rt.carrot[1].toFixed(0) : '-')
      // a route that was driving forward (>= 2 s on a long forward run) turns reverse-first for two plans in a row (the vote that starts the manoeuvre), the car still
      // rolling: a missed turn. Brake to a stop for the manoeuvre instead of accelerating on the old forward limit (crawl floor ignored, av-speed-planner 'rstop').
      // Decided once per such flip. OPT-IN (routeLimitRevStop: true): it fixes missed entrances but turns forward U-turns of the maze cases into K-turns (dead-end, corridor turnaround).
      if (rt.bends && params.routeLimitRevStop === true) {
        if (rt.firstGear === 1 && rt.run > 10) {
          state.fwdStreak = (state.fwdStreak || 0) + dt
          state.revStopOn = false
          state.revDecided = false
        } else if (rt.firstGear === -1) {
          if (state.revVotes >= 2 && !state.revDecided) {
            state.revDecided = true
            state.revStopOn = (state.fwdStreak || 0) > 2 && e.speedF > 1.5
            state.fwdStreak = 0
          }
        } else state.revStopOn = false
      }
      var revStop = !!state.revStopOn && rt.firstGear === -1
      av.route = { firstGear: rt.firstGear, run: rt.run, reached: rt.reached, vLimit: revStop ? 0 : routeLimitNow(rt), revFirst: revStop }
      if (params.debugDraw !== false) {
        var y0 = pos[1]
        for (var di = 2; di < rt.path.length; di += 2) {
          api.visualizeLine([rt.path[di - 2][0], y0, rt.path[di - 2][1]], [rt.path[di][0], y0, rt.path[di][1]], '#ff44ff')
        }
      }
      api.watch('av.route', 'gear ' + rt.firstGear + ' run ' + rt.run.toFixed(1) + (rt.reached ? ' goal' : ' partial') + ' exp ' + rt.expansions + ' h ' + rt.hRem.toFixed(0) + (fld ? ' fd ' + av.fieldGoal.d.toFixed(0) : ''))
      return {}
    }
  }

  // free distance (m, up to `look`) along a reverse segment's arc behind the car, same swept footprint / costmap as the planner
  function revArcFree(seg, look, gearSign) {
    var gs = gearSign || -1
    var hitR = makeHit(av.points || [], ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + planMargin, ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + planMargin)
    for (var rd = 1; rd <= look; rd += 1) {
      var rth = seg.k * gs * rd
      var rx = Math.abs(seg.k) < 1e-6 ? gs * rd : Math.sin(rth) / seg.k
      var ry = Math.abs(seg.k) < 1e-6 ? 0 : (1 - Math.cos(rth)) / seg.k
      var rpx = pos[0] + e.fwd[0] * rx + e.left[0] * ry
      var rpz = pos[2] + e.fwd[2] * rx + e.left[2] * ry
      var rfx = e.fwd[0] * Math.cos(rth) + e.left[0] * Math.sin(rth)
      var rfz = e.fwd[2] * Math.cos(rth) + e.left[2] * Math.sin(rth)
      if (hitR(rpx, rpz, rfx, rfz)) return rd - 1
    }
    return look
  }
  // --- execute manoeuvre ---
  var cur = state.segs[state.idx]
  if (state.segStart === null) {
    // a gear change must come to rest first so the odometer does not count coasting
    // (not forever: a car that chatters around zero speed never reads as stopped)
    state.restWaitT = (state.restWaitT || 0) + dt
    if (cur.g === state.prevGear || Math.abs(e.speed) < 0.4 || state.restWaitT > restWaitMax) {
      state.segStart = [pos[0], pos[2]]
      state.restWaitT = 0
    }
  }
  // a plan the car is far away from (pushed, teleported, stale): drop it and plan from the real pose
  if (state.path && state.path.length > 1) {
    var offPath = Infinity
    for (var oi = 1; oi < state.path.length; oi++) {
      var ax0 = state.path[oi - 1][0]
      var az0 = state.path[oi - 1][1]
      var abx = state.path[oi][0] - ax0
      var abz = state.path[oi][1] - az0
      var ab2 = abx * abx + abz * abz
      var tt = ab2 > 1e-9 ? Math.max(0, Math.min(1, ((pos[0] - ax0) * abx + (pos[2] - az0) * abz) / ab2)) : 0
      var dd = Math.hypot(pos[0] - (ax0 + tt * abx), pos[2] - (az0 + tt * abz))
      if (dd < offPath) offPath = dd
    }
    if (offPath > maxOffPath) {
      state.active = false
      state.route = undefined
      state.stuckT = 0
      return {}
    }
  }
  var travelled = 0
  if (state.segStart) {
    var dx = pos[0] - state.segStart[0]
    var dz = pos[2] - state.segStart[1]
    travelled = Math.sqrt(dx * dx + dz * dz)
  }
  // --- execution guard: re-plan when the real pose makes the rest of the segment collide, or when stalled ---
  if (state.segStart !== null) {
    // the guard must not be stricter than the margin the manoeuvre was planned with (escaping from contact)
    var guardM = Math.min(guardMargin, state.startMargin != null ? state.startMargin : guardMargin)
    var guardL = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + guardM
    var guardW = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + guardM
    var gHit = makeHit(av.points || [], guardL, guardW)
    var lx0 = e.left[0]
    var lz0 = e.left[2]
    var look = Math.min(2.0, Math.max(0, cur.len - travelled))
    // revGuard (default on): look ahead the stopping distance (v^2 / 2a + 1 m) along the planned segment, not a fixed 2 m (a 6.6 m/s reverse needs ~4.4 m to stop)
    if (params.revGuard !== false) look = Math.min(Math.max(2.0, e.speed * e.speed / (2 * (params.comfortDecel || 5)) + 1), Math.max(0, cur.len - travelled))
    var blockedAhead = false
    for (var gd = 0.5; gd <= look + 1e-6 && !blockedAhead; gd += 0.5) {
      var gdd = cur.g * gd
      var gth = cur.k * gdd
      var gx2 = Math.abs(cur.k) < 1e-6 ? gdd : Math.sin(gth) / cur.k
      var gy2 = Math.abs(cur.k) < 1e-6 ? 0 : (1 - Math.cos(gth)) / cur.k
      var px = pos[0] + e.fwd[0] * gx2 + lx0 * gy2
      var pz = pos[2] + e.fwd[2] * gx2 + lz0 * gy2
      var pfx = e.fwd[0] * Math.cos(gth) + lx0 * Math.sin(gth)
      var pfz = e.fwd[2] * Math.cos(gth) + lz0 * Math.sin(gth)
      if (gHit(px, pz, pfx, pfz)) blockedAhead = true
    }
    // steady reverse: an obstacle the plan did not know (seen later, farther than the 2 m look-ahead) inside this segment -> re-plan at once
    if (!blockedAhead && state.revCruise && cur.g < 0) {
      var revLookG = Math.min(60, scanRange, Math.max(0, cur.len - travelled))
      if (revArcFree(cur, revLookG) < revLookG) blockedAhead = true
    }
    state.stallT = Math.abs(e.speed) < 0.15 ? (state.stallT || 0) + dt : 0
    var stallTime = params.stallTime != null ? params.stallTime : 1.2
    if ((blockedAhead || state.stallT > stallTime) && e.t - (state.lastReplanT || -9) > 0.6) {
      // pushing against something the costmap does not show: mark the spot ahead (in the driving direction) as occupied
      if (!blockedAhead && input.environment && input.environment.isTouchingSide) markContact(cur.g, true)
      var fix = plan(maxExpFull)
      state.lastReplanT = e.t
      state.stallT = 0
      state.replans++
      if (fix.segs.length > 0) {
        begin(fix)
        state.prevGear = cur.g
        cur = state.segs[0]
        travelled = 0
      }
    }
  }
  // hand back once the rest of the plan starts with a long forward run
  var fwdRun = 0
  // (also from the first segment: a plan that simply starts with a long forward run is a route, not a manoeuvre — creeping
  // along it at manoeuvre speed with open-loop segments is what made the car shuttle back and forth next to obstacles)
  for (var si = state.idx; si < state.segs.length && state.segs[si].g > 0; si++) fwdRun += state.segs[si].len
  fwdRun -= travelled
  var aheadFree = false
  if (fwdRun >= handback && cur.g > 0) {
    // the car must really have room ahead on its own heading, not just a plan that will get there
    var aHit = makeHit(av.points || [], ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + planMargin, ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + planMargin)
    aheadFree = true
    for (var ad = 0; ad <= handback && aheadFree; ad += 1) {
      // along the current segment's arc (what the local planner would also pick), not just straight on
      var ath = cur.k * ad
      var ax = Math.abs(cur.k) < 1e-6 ? ad : Math.sin(ath) / cur.k
      var ay = Math.abs(cur.k) < 1e-6 ? 0 : (1 - Math.cos(ath)) / cur.k
      var apx = pos[0] + e.fwd[0] * ax + e.left[0] * ay
      var apz = pos[2] + e.fwd[2] * ax + e.left[2] * ay
      if (aHit(apx, apz, e.fwd[0] * Math.cos(ath) + e.left[0] * Math.sin(ath), e.fwd[2] * Math.cos(ath) + e.left[2] * Math.sin(ath))) aheadFree = false
    }
  }
  // handbackMargin (m, default off): the local planner works with larger margins than this planner (comfort 0.4). Hand back only when the ROUTE itself stays clear with that margin
  // for the next handback metres (footprint-swept along the planned segments, not the car's current heading): otherwise the local planner refuses the squeeze and turns back into the pocket.
  if (aheadFree && params.handbackMargin > 0 && cur.g > 0) {
    var hbHit = makeHit(av.points || [], ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + params.handbackMargin, ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + params.handbackMargin)
    var qx = pos[0]
    var qz = pos[2]
    var qfx = e.fwd[0]
    var qfz = e.fwd[2]
    var walked = 0
    for (var hs = state.idx; hs < state.segs.length && walked < handback && aheadFree; hs++) {
      var sg = state.segs[hs]
      if (sg.g < 0) break
      var sl = hs === state.idx ? Math.max(0, sg.len - travelled) : sg.len
      for (var hd = 0.5; hd <= sl + 1e-6 && aheadFree; hd += 0.5) {
        var dth = sg.k * 0.5
        var cth = Math.cos(dth)
        var sth = Math.sin(dth)
        // advance 0.5 m along the arc: chord in the current frame, then rotate the heading
        var chord = Math.abs(sg.k) < 1e-6 ? 0.5 : (2 * Math.sin(dth / 2)) / sg.k
        var mx = Math.cos(dth / 2)
        var my = Math.sin(dth / 2)
        qx += chord * (qfx * mx + qfz * my)
        qz += chord * (qfz * mx - qfx * my)
        var nfx = qfx * cth + qfz * sth
        qfz = qfz * cth - qfx * sth
        qfx = nfx
        walked += 0.5
        if (hbHit(qx, qz, qfx, qfz)) aheadFree = false
      }
    }
  }
  if (aheadFree && state.noHandbackFrom) {
    if (Math.hypot(pos[0] - state.noHandbackFrom[0], pos[2] - state.noHandbackFrom[1]) > 8) state.noHandbackFrom = null
    else aheadFree = false
  }
  if (aheadFree) {
    state.active = false
    state.route = undefined
    state.handbackT = e.t
    return {}
  }
  var finished = state.segStart !== null && travelled >= cur.len - 0.25
  if (finished) {
    state.prevGear = cur.g
    if (state.idx + 1 >= state.segs.length || deviates(cur)) {
      var again = plan(maxExpFull)
      state.replans++
      if (again.segs.length === 0 || state.idx + 1 >= state.segs.length) {
        state.active = false
        state.route = undefined
        if (again.segs.length === 0) return {}
      }
      if (again.segs.length > 0 && state.active) {
        begin(again)
        state.prevGear = cur.g
      }
    } else {
      state.idx++
      state.segStart = null
    }
    if (!state.active) return {}
    cur = state.segs[state.idx]
    travelled = 0
  }
  if (params.debugDraw !== false && state.path) {
    var py = pos[1]
    for (var pi = 2; pi < state.path.length; pi += 2) {
      api.visualizeLine([state.path[pi - 2][0], py, state.path[pi - 2][1]], [state.path[pi][0], py, state.path[pi][1]], '#ff44ff')
    }
    if (cur.end) api.visualizeLine(pos, [cur.end.x, py, cur.end.z], '#ff8800')
    api.visualizeLine([pos[0], py + 1.2, pos[2]], [pos[0], py + 4, pos[2]], '#ff44ff')
  }
  var remain = state.segStart ? Math.max(0, cur.len - travelled) : cur.len
  // maneuverRunSpeed (default off): a long run of segments in one gear (backing out of a dead end, a straight corridor leg) is driven faster than the shuffle speed
  var runLen = remain
  for (var rq = state.idx + 1; rq < state.segs.length && state.segs[rq].g === cur.g; rq++) runLen += state.segs[rq].len
  // runTotal (OPT-IN: true): the whole run counts (what was driven already too): a 13 m reverse run used to drop to the shuffle speed (3 m/s) for its last 5 m because only the REMAINING length was > 8 m
  var runTot = runLen
  for (var rb = state.idx - 1; params.runTotal === true && rb >= 0 && state.segs[rb].g === cur.g; rb--) runTot += state.segs[rb].len
  var vShuffle = state.maze && params.mazeManeuverSpeed != null ? Math.max(vMan, params.mazeManeuverSpeed) : vMan
  // a U / 3-point turn planned by this planner (turnOk at plan time) shuffles faster (short legs at 3 m/s took 16 s in a 14 m corridor)
  if (state.turnPlan) vShuffle = Math.max(vShuffle, params.turnManeuverSpeed != null ? params.turnManeuverSpeed : 4.5)
  var vRun = state.maze && params.maneuverRunSpeed != null && runTot > 8 ? Math.max(params.maneuverRunSpeed, vShuffle) : vShuffle
  var vMax = Math.min(vRun, 0.9 + Math.sqrt(2 * 3 * (runLen > 8 ? runLen : remain)))
  // style 'escape': the plan is collision-free along its whole length (footprint-exact, same costmap), so a run is driven as fast as it can still be STOPPED at its end with the real braking
  // capability (maneuverDecel, default 10 m/s^2: v <= sqrt(2 a run)), cornering limit of its arcs (maxLatAccel) and escapeManeuverSpeed (15): 'fits = go'. 'comfort' keeps the 3 m/s shuffle / 7 m/s runs.
  if (params.style === 'escape') {
    var aStop = params.maneuverDecel != null ? params.maneuverDecel : 10
    var vEsc = Math.min(params.escapeManeuverSpeed != null ? params.escapeManeuverSpeed : 15, Math.sqrt(2 * aStop * Math.max(runLen, 0.8)))
    var kRun = Math.abs(cur.k)
    for (var rk = state.idx + 1; rk < state.segs.length && state.segs[rk].g === cur.g && rk <= state.idx + 2; rk++) kRun = Math.max(kRun, Math.abs(state.segs[rk].k))
    if (kRun > 1e-4) vEsc = Math.min(vEsc, Math.sqrt((params.maxLatAccel || 9) / kRun))
    vMax = Math.max(vMax, vEsc)
  }
  if (state.revCruise && cur.g < 0 && state.segStart !== null) {
    // steady reverse: speed from the free distance along this segment's arc behind the car (stop within it at the comfort deceleration),
    // the lateral acceleration of the arc and the remaining segment length
    var arcLook = Math.min(60, scanRange)
    var freeR = revArcFree(cur, arcLook)
    // the plan itself is collision-free (same costmap) up to its end: a blocked arc beyond this segment is where the plan turns away, not a
    // wall to brake for; only a blockage inside the segment (an obstacle the plan did not know) limits the speed by stopping distance
    var runRemain = remain
    for (var qi = state.idx + 1; qi < state.segs.length && state.segs[qi].g < 0; qi++) runRemain += state.segs[qi].len
    var vRevFree = freeR < Math.min(arcLook, remain) ? Math.sqrt(2 * (params.comfortDecel || 5) * Math.max(0, freeR - 2)) : 1e9
    var vRevCurve = Math.abs(cur.k) > 1e-4 ? Math.sqrt((params.maxLatAccel || 9) / Math.abs(cur.k)) : 1e9
    vMax = Math.min(revCruiseSpeed, vRevFree, vRevCurve, 0.9 + Math.sqrt(2 * (params.style === 'escape' ? (params.maneuverDecel != null ? params.maneuverDecel : 10) : 3) * runRemain))
  }
  // revGuard: every manoeuvre segment (either gear) not already capped above: stop within the free arc ahead (v <= sqrt(2 a (free - margin))); only a blockage inside the segment limits the speed
  if (params.revGuard !== false && state.segStart !== null && cur.g < 0 && !state.revCruise) {
    var rgLook = Math.min(30, scanRange, remain)
    if (rgLook >= 1) {
      var rgFree = revArcFree(cur, rgLook, cur.g < 0 ? -1 : 1)
      if (rgFree < rgLook) vMax = Math.min(vMax, Math.sqrt(2 * (params.comfortDecel || 5) * Math.max(0, rgFree - 0.5)) + 0.5)
    }
  }
  // waiting for rest before a gear change: demand zero. Once the segment has started but the car still rolls the other
  // way (momentum from the previous segment; an icy car does not stop by itself and a zero-demand brake is below the
  // actuator deadband), drive in the demanded direction: that brakes it hard and turns it around.
  var waitingForRest = state.segStart === null
  var rollingWrong = !waitingForRest && cur.g * e.speed < -0.35
  // Path tracking (manTrack, default on in style 'escape'): the executor used to be open loop (the arcs' curvature only), so a 6 degree heading error accumulated over a 10 m reverse run at 9 m/s and the
  // rear corner scraped the wall of a U that the plan cleared by 0.4 m. Cross-track and heading error against the polyline of THIS segment steer the commanded curvature (pure-pursuit style).
  var kCmd = cur.k
  if ((params.manTrack != null ? params.manTrack : params.style === 'escape') && state.path && !waitingForRest && Math.abs(e.speed) > 1) {
    var n0 = 0
    for (var sj = 0; sj < state.idx; sj++) n0 += Math.round(state.segs[sj].len / ell)
    var n1 = n0 + Math.round(cur.len / ell)
    var gearS = cur.g
    var bestD = 1e9
    var bi = -1
    var jLo = Math.max(0, n0 - 1)
    var jHi = Math.min(state.path.length - 2, n1)
    for (var pj2 = jLo; pj2 <= jHi; pj2++) {
      var ax = state.path[pj2][0]
      var az = state.path[pj2][1]
      var bx = state.path[pj2 + 1][0]
      var bz = state.path[pj2 + 1][1]
      var abx = bx - ax
      var abz = bz - az
      var tt = Math.max(0, Math.min(1, ((pos[0] - ax) * abx + (pos[2] - az) * abz) / (abx * abx + abz * abz + 1e-9)))
      var qx = ax + tt * abx - pos[0]
      var qz = az + tt * abz - pos[2]
      var dq = qx * qx + qz * qz
      if (dq < bestD) {
        bestD = dq
        bi = pj2
      }
    }
    if (bi >= 0) {
      var tx = state.path[bi + 1][0] - state.path[bi][0]
      var tz = state.path[bi + 1][1] - state.path[bi][1]
      var tl = Math.sqrt(tx * tx + tz * tz) || 1
      tx /= tl
      tz /= tl
      // travel direction frame: m = gear * fwd, its left normal = gear * left
      var mx = gearS * e.fwd[0]
      var mz = gearS * e.fwd[2]
      var lx2 = gearS * e.left[0]
      var lz2 = gearS * e.left[2]
      var ptx = state.path[bi][0] - pos[0]
      var ptz = state.path[bi][1] - pos[2]
      var eyL = ptx * lx2 + ptz * lz2 // path point is to the left (positive) of the car in the travel frame
      var psiE = Math.atan2(tx * lx2 + tz * lz2, tx * mx + tz * mz) // tangent angle relative to the travel direction, left positive
      var Lk = Math.max(5, 0.5 * Math.abs(e.speed) + 3)
      var kM = cur.k * gearS + (params.trackGain != null ? params.trackGain : 0.7) * (psiE / Lk + (2 * Math.max(-3, Math.min(3, eyL))) / (Lk * Lk))
      kCmd = Math.max(-kmax, Math.min(kmax, kM * gearS))
    }
  }
  av.override = { kappa: kCmd, vDesired: waitingForRest ? 0 : rollingWrong ? cur.g * Math.min(vMax, 2.5) : cur.g * vMax, maze: !!state.maze }
  av.mode = 'maneuver'
  api.watch('av.maneuver', 'seg ' + state.idx + '/' + state.segs.length + ' g' + cur.g + ' k' + cur.k.toFixed(3) + ' replans ' + state.replans + (state.maze ? ' maze' : '') + ' vm ' + vMax.toFixed(1))
  return {}
}
