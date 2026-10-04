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
// params: maneuverSpeed, routeInterval, routeExpansions, lookahead, primitiveLength, maxExpansions,
//         gearSwitchPenalty, reversePenalty, maxReverseRun, planMargin, tightMargin, guardMargin, stallTime, stuckTime,
//         contactTtl (s, how long an unseen contact stays a virtual obstacle, default 25), contactRestTime (s at rest before a lateral stall counts as contact, default 1), contactMemory (false = off), restWaitMax (s, wait for rest before a gear change), maxOffPath (m, drop a plan the car is farther from), crawlTime,
//         goalReach, handbackFree, goalTolerance, maxCurvature, vehicleWidth, vehicleLength
function transform(input, dt, params, state, api) {
  var av = input.av
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
    for (var i = 0; i < n; i++) {
      var cx = Math.floor(pts[i][0] / 2)
      var cz = Math.floor(pts[i][1] / 2)
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
        var c = (Math.floor(pts[j][0] / 2) - minCx) * h + (Math.floor(pts[j][1] / 2) - minCz)
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
      return function (x, z, fx, fz) {
        var x0 = Math.max(Math.floor((x - R) / 2), gMinX)
        var x1 = Math.min(Math.floor((x + R) / 2), gMinX + gW - 1)
        var z0 = Math.max(Math.floor((z - R) / 2), gMinZ)
        var z1 = Math.min(Math.floor((z + R) / 2), gMinZ + gH - 1)
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

  function search(sx, sz, sfx, sfz, gx, gz, pts, maxExp, marginOverride) {
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
    function dist(x, z) {
      var dx = gx - x
      var dz = gz - z
      return Math.sqrt(dx * dx + dz * dz)
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
    var start = { x: sx, z: sz, fx: sfx, fz: sfz, g: 0, gear: 0, k: 0, parent: null, f: dist(sx, sz) * HW, d: 0 }
    push(start)
    var s0 = slotOf(sx, sz, sfx, sfz, 0)
    tKeys[s0] = slotKey
    tVals[s0] = 0
    var bestNode = start
    var bestH = dist(sx, sz)
    var goalNode = null
    var expansions = 0
    while (heap.length > 0 && expansions < maxExp) {
      var cur = pop()
      var cs = slotOf(cur.x, cur.z, cur.fx, cur.fz, cur.gear)
      if (tKeys[cs] !== -1 && cur.g > tVals[cs] + 1e-6) continue
      expansions++
      var h = dist(cur.x, cur.z)
      if (h < bestH) {
        bestH = h
        bestNode = cur
      }
      if (h < reach) {
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
          }
          if (!ok) continue
          var step = ell * (gear < 0 ? revPen : 1) + (Math.abs(k) / kmax) * 0.4 * ell
          if (cur.gear !== 0 && cur.gear !== gear) step += gearPen
          if (cur.gear !== 0 && cur.k !== k) step += 0.3
          var g2 = cur.g + step
          var ns = slotOf(nx, nz, nfx, nfz, gear)
          if (tKeys[ns] !== -1 && tVals[ns] <= g2) continue
          tKeys[ns] = slotKey
          tVals[ns] = g2
          push({ x: nx, z: nz, fx: nfx, fz: nfz, g: g2, gear: gear, k: k, revRun: revRun, parent: cur, f: g2 + dist(nx, nz) * HW })
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
    return { segs: segs, reached: !!goalNode, expansions: expansions, hRemaining: bestH, path: pathPts, nodes: nodes }
  }

  function begin(res) {
    state.segs = res.segs
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
    return Math.sqrt(ex * ex + ez * ez) > 0.9 || dot < 0.97
  }
  function plan(maxE) {
    var res = search(pos[0], pos[2], e.fwd[0], e.fwd[2], gxw, gzw, av.points || [], maxE, null)
    // Pressed against something (a corner touching a long wall): every primitive is blocked at the comfort margins, so
    // retry with ever smaller margins until the car can at least drive out of the contact.
    var escape = [0.05, 0.02, 0]
    for (var ei = 0; ei < escape.length && res.segs.length === 0 && !res.reached; ei++) {
      res = search(pos[0], pos[2], e.fwd[0], e.fwd[2], gxw, gzw, av.points || [], maxE, escape[ei])
    }
    return res
  }
  // route summary: first gear, length of the leading forward run, carrot point
  function summarize(res) {
    var nodes = res.nodes
    var firstGear = nodes.length > 1 ? nodes[1].g : 1
    var run = 0
    var carrot = null
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
    for (var si = 0; si < res.segs.length && dAhead < 40 && res.segs[si].g > 0; si++) {
      var kk = Math.abs(res.segs[si].k)
      if (kk > 0.04) {
        var vi = Math.sqrt(aLat / kk)
        var allowed = Math.sqrt(vi * vi + 2 * aBrk * dAhead)
        if (allowed < vLimit) vLimit = allowed
      }
      dAhead += res.segs[si].len
    }
    return { firstGear: firstGear, run: run, carrot: carrot, reached: res.reached, nodes: nodes, path: res.path, vLimit: vLimit }
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
    if (state.route === undefined || e.t - state.routeT >= routeInterval) {
      state.route = summarize(plan(routeExp))
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
        state.stuckT = 0
        begin(res)
      }
    }
    if (!state.active) {
      if (rt.carrot) av.carrot = rt.carrot
      av.route = { firstGear: rt.firstGear, run: rt.run, reached: rt.reached, vLimit: rt.vLimit }
      if (params.debugDraw !== false) {
        var y0 = pos[1]
        for (var di = 2; di < rt.path.length; di += 2) {
          api.visualizeLine([rt.path[di - 2][0], y0, rt.path[di - 2][1]], [rt.path[di][0], y0, rt.path[di][1]], '#ff44ff')
        }
      }
      api.watch('av.route', 'gear ' + rt.firstGear + ' run ' + rt.run.toFixed(1) + (rt.reached ? ' goal' : ' partial'))
      return {}
    }
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
  if (aheadFree) {
    state.active = false
    state.route = undefined
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
  var vMax = Math.min(vMan, 0.9 + Math.sqrt(2 * 3 * remain))
  // waiting for rest before a gear change: demand zero. Once the segment has started but the car still rolls the other
  // way (momentum from the previous segment; an icy car does not stop by itself and a zero-demand brake is below the
  // actuator deadband), drive in the demanded direction: that brakes it hard and turns it around.
  var waitingForRest = state.segStart === null
  var rollingWrong = !waitingForRest && cur.g * e.speed < -0.35
  av.override = { kappa: cur.k, vDesired: waitingForRest ? 0 : rollingWrong ? cur.g * Math.min(vMax, 2.5) : cur.g * vMax }
  av.mode = 'maneuver'
  api.watch('av.maneuver', 'seg ' + state.idx + '/' + state.segs.length + ' g' + cur.g + ' k' + cur.k.toFixed(3) + ' replans ' + state.replans)
  return {}
}
