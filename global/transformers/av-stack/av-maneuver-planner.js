// AV stack · PLAN / tight-space manoeuvre planner (Hybrid-A* over forward/reverse arc primitives).
// Activated by the supervisor (`av.needManeuver`). Searches (x, z, heading, gear) with a swept
// footprint check against the costmap, executes the resulting multi-point turn segment by segment
// and re-plans from the real pose after every segment. Hands back to the local planner as soon as it
// has a comfortable free path ahead.
// debug draw: magenta = planned path + status mast while manoeuvring, orange = current segment end.
// params: maneuverSpeed, primitiveLength, maxExpansions, gearSwitchPenalty, reversePenalty,
//         planMargin, tightMargin, guardMargin, stallTime, goalReach, handbackFree, maxCurvature, vehicleWidth, vehicleLength
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan || !av.ego || !av.goal) return {}
  var e = av.ego
  var plan = av.plan
  var kmax = params.maxCurvature || 0.115
  var planMargin = params.planMargin != null ? params.planMargin : 0.4
  var tightMargin = params.tightMargin != null ? params.tightMargin : 0.1
  var guardMargin = params.guardMargin != null ? params.guardMargin : 0.15
  var ell = params.primitiveLength || 1.8
  var maxExp = params.maxExpansions || 4000
  var gearPen = params.gearSwitchPenalty != null ? params.gearSwitchPenalty : 4
  var revPen = params.reversePenalty != null ? params.reversePenalty : 1.6
  var reach = params.goalReach != null ? params.goalReach : 3.5
  var handback = params.handbackFree != null ? params.handbackFree : 10
  var vMan = params.maneuverSpeed != null ? params.maneuverSpeed : 3
  var ks = [-kmax, -kmax / 2, 0, kmax / 2, kmax]

  // spatial hash over costmap points + swept-footprint test (hl/hw are the active margins)
  function makeHit(pts, hlA, hwA) {
    var grid = {}
    for (var i = 0; i < pts.length; i++) {
      var key = Math.floor(pts[i][0] / 2) + ',' + Math.floor(pts[i][1] / 2)
      ;(grid[key] || (grid[key] = [])).push(pts[i])
    }
    var R = Math.sqrt(hlA * hlA + hwA * hwA)
    return function (x, z, fx, fz) {
      var x0 = Math.floor((x - R) / 2)
      var x1 = Math.floor((x + R) / 2)
      var z0 = Math.floor((z - R) / 2)
      var z1 = Math.floor((z + R) / 2)
      for (var cx = x0; cx <= x1; cx++) {
        for (var cz = z0; cz <= z1; cz++) {
          var list = grid[cx + ',' + cz]
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

  function search(sx, sz, sfx, sfz, gx, gz, pts) {
    var hlS = (params.vehicleLength || 4) / 2 + planMargin
    var hwS = (params.vehicleWidth || 2) / 2 + planMargin
    var hit = makeHit(pts, hlS, hwS)
    // start already inside the comfort margin (drift, soft contact): re-plan with the tight margin so
    // the planner can still drive out of the margin band instead of finding every primitive blocked
    if (hit(sx, sz, sfx, sfz)) {
      hlS = (params.vehicleLength || 4) / 2 + tightMargin
      hwS = (params.vehicleWidth || 2) / 2 + tightMargin
      hit = makeHit(pts, hlS, hwS)
    }
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
    function skey(x, z, fx, fz, g) {
      var ih = Math.round((Math.atan2(fz, fx) / (2 * Math.PI)) * 36)
      if (ih < 0) ih += 36
      return Math.round(x / 0.6) + ',' + Math.round(z / 0.6) + ',' + (ih % 36) + ',' + g
    }
    var HW = 1.4
    var start = { x: sx, z: sz, fx: sfx, fz: sfz, g: 0, gear: 0, k: 0, parent: null, f: dist(sx, sz) * HW, d: 0 }
    push(start)
    var best = {}
    best[skey(sx, sz, sfx, sfz, 0)] = 0
    var bestNode = start
    var bestH = dist(sx, sz)
    var goalNode = null
    var expansions = 0
    while (heap.length > 0 && expansions < maxExp) {
      var cur = pop()
      var ck = skey(cur.x, cur.z, cur.fx, cur.fz, cur.gear)
      if (best[ck] !== undefined && cur.g > best[ck] + 1e-6) continue
      expansions++
      var h = dist(cur.x, cur.z)
      if (h < bestH) {
        bestH = h
        bestNode = cur
      }
      if (h < reach) {
        goalNode = cur
        break
      }
      for (var gi = 0; gi < 2; gi++) {
        var gear = gi === 0 ? 1 : -1
        for (var ki = 0; ki < ks.length; ki++) {
          var k = ks[ki]
          var lx = cur.fz
          var lz = -cur.fx
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
          var nk = skey(nx, nz, nfx, nfz, gear)
          if (best[nk] !== undefined && best[nk] <= g2) continue
          best[nk] = g2
          push({ x: nx, z: nz, fx: nfx, fz: nfz, g: g2, gear: gear, k: k, parent: cur, f: g2 + dist(nx, nz) * HW })
        }
      }
    }
    var end = goalNode || bestNode
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
    return { segs: segs, reached: !!goalNode, expansions: expansions, hRemaining: bestH, path: pathPts }
  }

  function begin(res) {
    state.segs = res.segs
    state.idx = 0
    state.segStart = null
    state.prevGear = 0
    state.exp = res.expansions
    state.path = res.path
  }
  function deviates(seg) {
    if (!seg || !seg.end) return false
    var ex = input.position[0] - seg.end.x
    var ez = input.position[2] - seg.end.z
    var dot = e.fwd[0] * seg.end.fx + e.fwd[2] * seg.end.fz
    return Math.sqrt(ex * ex + ez * ez) > 0.9 || dot < 0.97
  }

  if (!state.active) {
    if (!av.needManeuver) return {}
    var res = search(input.position[0], input.position[2], e.fwd[0], e.fwd[2], av.goal.x, av.goal.z, av.points || [])
    if (res.segs.length === 0) return {}
    state.active = true
    state.replans = (state.replans || 0) + 1
    begin(res)
  }

  // --- execute ---
  var cur = state.segs[state.idx]
  if (state.segStart === null) {
    // a gear change must come to rest first so the odometer does not count coasting
    if (cur.g === state.prevGear || Math.abs(e.speed) < 0.4) state.segStart = [input.position[0], input.position[2]]
  }
  var travelled = 0
  if (state.segStart) {
    var dx = input.position[0] - state.segStart[0]
    var dz = input.position[2] - state.segStart[1]
    travelled = Math.sqrt(dx * dx + dz * dz)
  }
  // --- execution guard: re-plan when the real pose makes the rest of the segment collide, or when stalled ---
  if (state.segStart !== null) {
    var guardL = (params.vehicleLength || 4) / 2 + guardMargin
    var guardW = (params.vehicleWidth || 2) / 2 + guardMargin
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
      var px = input.position[0] + e.fwd[0] * gx2 + lx0 * gy2
      var pz = input.position[2] + e.fwd[2] * gx2 + lz0 * gy2
      var pfx = e.fwd[0] * Math.cos(gth) + lx0 * Math.sin(gth)
      var pfz = e.fwd[2] * Math.cos(gth) + lz0 * Math.sin(gth)
      if (gHit(px, pz, pfx, pfz)) blockedAhead = true
    }
    state.stallT = Math.abs(e.speed) < 0.15 ? (state.stallT || 0) + dt : 0
    var stallTime = params.stallTime != null ? params.stallTime : 1.2
    if ((blockedAhead || state.stallT > stallTime) && e.t - (state.lastReplanT || -9) > 0.6) {
      var fix = search(input.position[0], input.position[2], e.fwd[0], e.fwd[2], av.goal.x, av.goal.z, av.points || [])
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
  var finished = state.segStart !== null && travelled >= cur.len - 0.25
  var handbackOk = plan.free >= handback && state.idx > 0 && (cur.g > 0 || Math.abs(e.speed) < 0.3)
  if (handbackOk) {
    state.active = false
    return {}
  }
  if (finished) {
    state.prevGear = cur.g
    if (state.idx + 1 >= state.segs.length || deviates(cur)) {
      var again = search(input.position[0], input.position[2], e.fwd[0], e.fwd[2], av.goal.x, av.goal.z, av.points || [])
      state.replans++
      if (again.segs.length === 0) {
        state.active = false
        return {}
      }
      begin(again)
      state.prevGear = cur.g
    } else {
      state.idx++
      state.segStart = null
    }
    cur = state.segs[state.idx]
    travelled = 0
  }
  if (params.debugDraw !== false && state.path) {
    // magenta: planned multi-point-turn path (hybrid A*), orange: end of current segment
    var py = input.position[1]
    for (var di = 1; di < state.path.length; di++) {
      api.visualizeLine([state.path[di - 1][0], py, state.path[di - 1][1]], [state.path[di][0], py, state.path[di][1]], '#ff44ff')
    }
    if (cur.end) api.visualizeLine(input.position, [cur.end.x, py, cur.end.z], '#ff8800')
    api.visualizeLine([input.position[0], py + 1.2, input.position[2]], [input.position[0], py + 4, input.position[2]], '#ff44ff')
  }
  var remain = state.segStart ? Math.max(0, cur.len - travelled) : cur.len
  var vMax = Math.min(vMan, 0.9 + Math.sqrt(2 * 3 * remain))
  var wrongWay = state.segStart === null || cur.g * e.speed < -0.35
  plan.kappa = cur.k
  plan.vDesired = wrongWay ? 0 : cur.g * vMax
  plan.maneuver = true
  av.mode = 'maneuver'
  api.watch('av.maneuver', 'seg ' + state.idx + '/' + state.segs.length + ' g' + cur.g + ' k' + cur.k.toFixed(3) + ' replans ' + state.replans)
  return {}
}
