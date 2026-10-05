// AV stack · SENSE / perception.
// 360° range-scan ring (lidar-like, mounted at the vehicle centre, rays start on the hull)
// + obstacle memory ("local costmap") so the planners also know what is behind / beside.
// Publishes: av.scan {angles, ranges, range}, av.points [[x,z],...] (world), av.rearClear.
// debug draw (params.debugDraw, debugRayStride, debugMaxPoints): red = lidar hit rays, magenta ticks = costmap points.
// Extra ray plane at the car's top edge (params.rayLevels false = off); params.lowRayClearance (m above the underside) adds a low plane.
// Memory clearing: remembered cells that fresh rays pass through (within memClearRange 45 m, 0 = off) are dropped, so moving obstacles leave no ghost trail.
// Zoned scan (params.fwdFovDeg > 0, default off = uniform ring): ~half the rays of a dense ring, aimed where they are needed.
//  - dense long-range cone (fwdFovDeg, fwdStepDeg 2, range = sensorRange) in the DIRECTION OF TRAVEL: forward, or to the rear while reversing (velocity sign;
//    at rest / slow it aims at the freer of front / rear, free distances from the cone and the sweep, hysteresis, scanFollowFree false = always forward);
//  - sparse sides next to the cone (sideStepDeg 12, sideRange, every sideEvery 2nd frame);
//  - cheap coarse 360 sweep (sweepStepDeg 10, sweepRange) every sweepEvery 15 frames (sweepEverySlow 5 while slow / blocked) that finds the freest direction.
// Publishes av.scan {dir, freeFront, freeRear} for the planners / debugging.
// Persistent static map (params.staticMap true, default off): hits on STATIC bodies (walls, props; bodyType 'static', not planes) are kept forever in a 1 m cell map instead of the 15 s memory,
// consecutive hits on the same convex body (<= staticLinkMax 10 m apart in angle order) are linked by interpolated points so far-range scans leave no holes; dynamic / kinematic hits (chasers, props)
// stay in the short-lived memory only and are never burned into the map. av.points also contains the static points within staticRange (130 m) of the car; the route planner reads the whole map as av.smap {list, ver}.
// Moving-body marks (memFollow, default on): a hit on a non-static body is remembered RELATIVE to that body (offset to its live position), so the mark moves with it
// instead of staying behind as a pink ghost; once the body has moved (> 0.5 m since the hit) the mark expires after dynTtl (2 s) unless re-seen. Marks of bodies that
// stay put (parked dynamic cars, props) keep memoryTtl; static bodies keep memoryTtl / the static map. Tracked threats (threatIds) keep the old fixed marks unless memFollowThreats: true
// (the pursuit prediction covers them, and their recent trail measurably helps evasion: corner-trap min gap 5.7 -> 3.5 m, sweep 61 -> 59/75 with following). Followed marks are published as [x, z, 1] in av.points (live position: the motion planner keeps them even on a tracked fast body). Publishes av.dynNear = distance to the nearest moving mark (m, 1e9 = none) and av.movers [[x, z], ...] (moving marks within 150 m).
// Economy (budget 'eco'): while the motion planner is fixated on a free, visible goal (av.prevFix, see av-motion-planner.js) the dense cone is a narrow one
// (fixConeDeg 24, fwdStepDeg 3) around the aim direction, sides every ecoSideEvery 6th frame, the coarse 360 sweep every ecoSweepEvery 20th frame, extra ray planes every 2nd frame.
// params: drivableArea [xmin, xmax, zmin, zmax] (virtual walls at the edge), edgeStep, rayCount, fovDeg, sensorRange, memoryTtl, memoryCell, vehicleWidth, vehicleLength
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && av.preset) params = state.pmP === params && state.pmB === av.preset ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pm = Object.assign({}, av.preset, params)))
  if (!av || !av.ego) return {}
  var e = av.ego
  var n = params.rayCount || 72
  var fov = ((params.fovDeg || 360) * Math.PI) / 180
  // Sense far enough to stop: cruise speed needs v^2 / (2 * decel) of free view (default 24 m covers the stock 10 m/s).
  var cruiseV = params.cruiseSpeed != null ? params.cruiseSpeed : 10
  var stopD = (cruiseV * cruiseV) / (2 * (params.comfortDecel || 5))
  var range = params.sensorRange || Math.min(150, Math.max(24, 1.1 * stopD + 8))
  var ttl = params.memoryTtl != null ? params.memoryTtl : 15
  var cell = params.memoryCell || 0.5
  var hl = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2 + 0.15
  var hw = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + 0.15
  if (!state.mem) state.mem = {}
  var mem = state.mem
  var pos = input.position
  var full = fov >= 2 * Math.PI - 1e-3
  var angles = []
  var ranges = []
  var rearClear = params.rearRange || 8
  var draw = params.debugDraw !== false
  var rayInfo = []
  var rayStride = params.debugRayStride || 2
  // extra ray planes (offsets from the centre ray): the car's top edge (+ optionally just above its underside)
  var levels = []
  var carH = av.vehicle && av.vehicle.height ? av.vehicle.height : 0
  if (params.rayLevels !== false && carH > 0.3) {
    levels = [carH / 2 - 0.08]
    // optional underside plane for low bars (off by default: ground bumps then read as obstacles)
    if (params.lowRayClearance != null) levels.push(-carH / 2 + params.lowRayClearance)
  }
  // ray set: uniform ring (default) or zoned (dense cone in the direction of travel, sparse sides, periodic coarse 360 sweep)
  var scanSet = null
  state.frame = (state.frame || 0) + 1
  var eco = params.budget === 'eco' && !!av.prevFix
  var zoned = params.fwdFovDeg > 0 || eco
  var sideRange = Math.min(range, params.sideRange || 45)
  var sweepRay = Math.min(range, params.sweepRange || 45)
  if (zoned) {
    var half = ((eco ? params.fixConeDeg || 24 : params.fwdFovDeg) * Math.PI) / 360
    var fs = ((params.fwdStepDeg || (eco ? 3 : 2)) * Math.PI) / 180
    var ss = ((params.sideStepDeg || 12) * Math.PI) / 180
    var sweepStep = ((params.sweepStepDeg || 10) * Math.PI) / 180
    var slow = Math.abs(e.speed) < 1.5
    // --- aim: the dense cone follows the direction of travel (velocity sign; gear reverse = cone to the rear). At rest / slow
    // it aims at the freer of front / rear (free distances from the dense cone and the coarse sweep), with hysteresis.
    if (state.dir === undefined) state.dir = 1
    if (e.speed > 1.5) state.dir = 1
    else if (e.speed < -1.5) state.dir = -1
    else if (params.scanFollowFree !== false && state.freeF !== undefined && state.freeR !== undefined) {
      var fOwn = state.dir > 0 ? state.freeF : state.freeR
      var fOther = state.dir > 0 ? state.freeR : state.freeF
      if (fOther > fOwn * 1.3 + 6) state.dir = -state.dir
    }
    var aim = eco ? av.prevFix.ang : state.dir > 0 ? 0 : Math.PI
    var sweepEvery = slow ? params.sweepEverySlow || 5 : eco ? params.ecoSweepEvery || 20 : params.sweepEvery || 15
    var doSweep = state.frame === 1 || state.frame % sweepEvery === 0
    var sideEvery = eco ? params.ecoSideEvery || 6 : params.sideEvery || 2
    var doSides = state.frame % sideEvery === 0
    var zl = []
    var a
    for (a = -half; a <= half + 1e-6; a += fs) zl.push([aim + a, 0])
    if (doSides) {
      for (a = half + ss; a <= (3 * Math.PI) / 4 + 1e-6; a += ss) {
        zl.push([aim + a, 1])
        zl.push([aim - a, 1])
      }
    }
    if (doSweep) {
      for (a = 0; a < 2 * Math.PI - 1e-6; a += sweepStep) zl.push([a > Math.PI ? a - 2 * Math.PI : a, 2])
    }
    scanSet = zl
  }
  var nRays = scanSet ? scanSet.length : n
  var winF = null
  var winR = null
  var useSmap = params.staticMap === true
  var keys
  var hits = []
  if (!state.bt) state.bt = {}
  // moving-body marks follow their body (see header): live positions once per frame per body
  var follow = params.memFollow !== false
  var dynTtl = params.dynTtl != null ? params.dynTtl : 2
  var livePos = {}
  function live(id) {
    var lp = livePos[id]
    if (lp === undefined) lp = livePos[id] = api.getWorldPosition(id)
    return lp
  }
  var dynNear = 1e9
  var threatSet = {}
  if (params.threatIds) for (var tsi = 0; tsi < params.threatIds.length; tsi++) threatSet[params.threatIds[tsi]] = 1
  var movers = []
  if (follow) {
    var fk = Object.keys(mem)
    for (var fi = 0; fi < fk.length; fi++) {
      var fm = mem[fk[fi]]
      if (!fm.id) continue
      var lpp = live(fm.id)
      if (!lpp) continue
      fm.x = lpp[0] + fm.ox
      fm.z = lpp[2] + fm.oz
      if (!fm.mv && (lpp[0] - fm.bx) * (lpp[0] - fm.bx) + (lpp[2] - fm.bz) * (lpp[2] - fm.bz) > 0.25) fm.mv = 1
      if (fm.mv) {
        var fdx = fm.x - pos[0]
        var fdz = fm.z - pos[2]
        var fd = Math.sqrt(fdx * fdx + fdz * fdz)
        if (fd < dynNear) dynNear = fd
        if (fd < 150) movers.push([fm.x, fm.z])
      }
    }
  }
  var levelsNow = eco && state.frame % 2 === 1 ? [] : levels
  for (var i = 0; i < nRays; i++) {
    var rayRange = range
    var th
    if (scanSet) {
      var zone = scanSet[i][1]
      if (zone === 2) rayRange = sweepRay
      else if (zone === 1) rayRange = sideRange
      th = scanSet[i][0]
    } else th = full ? -Math.PI + (2 * Math.PI * i) / n : n === 1 ? 0 : -fov / 2 + (fov * i) / (n - 1)
    var c = Math.cos(th)
    var s = Math.sin(th)
    var dir = [
      e.fwd[0] * c + e.left[0] * s,
      e.fwd[1] * c + e.left[1] * s,
      e.fwd[2] * c + e.left[2] * s,
    ]
    // start just outside the hull rectangle along this ray
    var tHull = Math.min(Math.abs(c) > 1e-6 ? hl / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? hw / Math.abs(s) : 1e9)
    var origin = [pos[0] + dir[0] * tHull, pos[1] + dir[1] * tHull, pos[2] + dir[2] * tHull]
    // One horizontal plane misses what curves away from it (a sphere / dome is farther at the car's top edge than at the
    // equator, a low bar hides under the plane): cast at the car's top edge too and keep the nearest hit.
    var r = api.raycast(origin, dir, rayRange, { visualize: false })
    av.work.rays++
    for (var li = 0; li < levelsNow.length; li++) {
      var lo = [origin[0], origin[1] + levelsNow[li], origin[2]]
      var rl = api.raycast(lo, dir, rayRange, { visualize: false })
      av.work.rays++
      if (rl.hit && (!r.hit || rl.distance < r.distance)) {
        r = rl
        origin = lo
      }
    }
    angles.push(th)
    if (scanSet) {
      var dEff = r.hit ? r.distance : rayRange
      var thN = Math.atan2(s, c)
      if (Math.abs(thN) < 0.35) winF = winF === null || dEff < winF ? dEff : winF
      else if (Math.abs(thN) > Math.PI - 0.35) winR = winR === null || dEff < winR ? dEff : winR
    }
    if (r.hit) {
      if (draw && i % rayStride === 0) api.visualizeLine(origin, api.vec.offsetAlong(origin, dir, r.distance), '#ff4d4d')
      ranges.push(r.distance)
      rayInfo.push([dir, tHull, r.distance])
      var hx = origin[0] + dir[0] * r.distance
      var hz = origin[2] + dir[2] * r.distance
      // body class per entity (cached): 1 = static (map / plain memory), 2 = plane, 0 = dynamic / kinematic (marks follow the body)
      var bt = 2
      if (r.entityId) {
        bt = state.bt[r.entityId]
        if (bt === undefined) {
          var he = api.getEntity(r.entityId)
          bt = state.bt[r.entityId] = !he ? 2 : he.shape && he.shape.type === 'plane' ? 2 : he.bodyType === 'static' ? 1 : 0
        }
      }
      if (useSmap && bt === 1) hits.push([Math.atan2(s, c), r.entityId, hx, hz])
      else {
        var mrec = { x: hx, z: hz, t: e.t }
        var bp = follow && bt === 0 && !(params.memFollowThreats !== true && threatSet[r.entityId]) ? live(r.entityId) : null
        if (bp) {
          mrec.id = r.entityId
          mrec.ox = hx - bp[0]
          mrec.oz = hz - bp[2]
          mrec.bx = bp[0]
          mrec.bz = bp[2]
        }
        mem[Math.round(hx / cell) + ',' + Math.round(hz / cell)] = mrec
      }
      if (c < -0.9 && r.distance < rearClear) rearClear = r.distance
    } else {
      ranges.push(rayRange)
      rayInfo.push([dir, tHull, rayRange])
    }
  }
  // Free-space clearing: a remembered obstacle that a fresh ray now passes straight through is gone (a car that drove
  // on). Without it moving traffic leaves ghost trails that box the car in for the whole memory time.
  // Cells written this frame are never cleared (a ray grazing a thin obstacle must not erase it).
  var cellInv = 1 / cell
  // for a power-of-two cell, x * (1 / cell) is exactly x / cell (the usual 0.5 m): multiply instead of divide
  var cellP2 = cellInv * cell === 1 && Math.log2(cellInv) % 1 === 0
  var clearRange = params.memClearRange != null ? params.memClearRange : 45
  if (clearRange > 0) {
    // numeric cell index -> memory key (built once per frame; avoids building a string key per ray step)
    var cellIdx = new Map()
    var memKeys0 = Object.keys(mem)
    // cheap bloom-style prefilter (small per-frame table): most ray steps pass through empty cells, so skip the Map lookup unless the cell hash is set
    var bloom = new Uint8Array(8192)
    for (var mk = 0; mk < memKeys0.length; mk++) {
      var me = mem[memKeys0[mk]]
      var mix = Math.round(me.x / cell)
      var miz = Math.round(me.z / cell)
      bloom[(Math.imul(mix, 73856093) ^ Math.imul(miz, 19349663)) & 8191] = 1
      cellIdx.set((mix + 4194304) * 8388608 + (miz + 4194304), memKeys0[mk])
    }
    for (var ri = 0; ri < rayInfo.length; ri++) {
      var rd = rayInfo[ri][0]
      var rs = rayInfo[ri][1]
      var rend = Math.min(rayInfo[ri][2] - 1.0, clearRange)
      for (var rt = rs + cell; rt < rend; rt += cell) {
        var kux = pos[0] + rd[0] * rt
        var kuz = pos[2] + rd[2] * rt
        var kix = Math.round(cellP2 ? kux * cellInv : kux / cell)
        var kiz = Math.round(cellP2 ? kuz * cellInv : kuz / cell)
        if (bloom[(Math.imul(kix, 73856093) ^ Math.imul(kiz, 19349663)) & 8191] === 0) continue
        var kk = (kix + 4194304) * 8388608 + (kiz + 4194304)
        var memKey = cellIdx.get(kk)
        if (memKey === undefined) continue
        var mm = mem[memKey]
        if (mm && mm.t < e.t - 1e-6) {
          delete mem[memKey]
          cellIdx.delete(kk)
        }
      }
    }
  }
  if (useSmap) {
    if (!state.sm) state.sm = { cells: {}, list: [], buckets: {} }
    var sm = state.sm
    var addS = function (x, z) {
      var key = Math.round(x) + ',' + Math.round(z)
      if (sm.cells[key]) return
      sm.cells[key] = 1
      var pt = [x, z]
      sm.list.push(pt)
      var bk = Math.floor(x / 16) + ',' + Math.floor(z / 16)
      if (sm.buckets[bk]) sm.buckets[bk].push(pt)
      else sm.buckets[bk] = [pt]
    }
    hits.sort(function (a, b) { return a[0] - b[0] })
    var linkMax = params.staticLinkMax || 10
    for (var hi = 0; hi < hits.length; hi++) {
      var h0 = hits[hi]
      addS(h0[2], h0[3])
      var h1 = hits[hi + 1]
      if (h1 && h1[1] === h0[1]) {
        var cdx = h1[2] - h0[2]
        var cdz = h1[3] - h0[3]
        var clen = Math.sqrt(cdx * cdx + cdz * cdz)
        if (clen > 1 && clen <= linkMax) {
          var nl = Math.ceil(clen)
          for (var li2 = 1; li2 < nl; li2++) addS(h0[2] + (cdx * li2) / nl, h0[3] + (cdz * li2) / nl)
        }
      }
    }
  }
  if (winF !== null) state.freeF = winF
  if (winR !== null) state.freeR = winR
  var pts = []
  // virtual walls along the edge of the drivable area (map prior): [xmin, xmax, zmin, zmax]
  var area = params.drivableArea
  if (area && area.length === 4) {
    var step = params.edgeStep || 1.2
    var reach = range
    var xs = Math.max(area[0], pos[0] - reach)
    var xe = Math.min(area[1], pos[0] + reach)
    var zs = Math.max(area[2], pos[2] - reach)
    var ze = Math.min(area[3], pos[2] + reach)
    var j
    if (pos[2] - area[2] < reach) for (j = xs; j <= xe; j += step) pts.push([j, area[2]])
    if (area[3] - pos[2] < reach) for (j = xs; j <= xe; j += step) pts.push([j, area[3]])
    if (pos[0] - area[0] < reach) for (j = zs; j <= ze; j += step) pts.push([area[0], j])
    if (area[1] - pos[0] < reach) for (j = zs; j <= ze; j += step) pts.push([area[1], j])
  }
  if (useSmap && state.sm) {
    var sR = params.staticRange || 130
    var bx0 = Math.floor((pos[0] - sR) / 16)
    var bx1 = Math.floor((pos[0] + sR) / 16)
    var bz0 = Math.floor((pos[2] - sR) / 16)
    var bz1 = Math.floor((pos[2] + sR) / 16)
    // the static points of the bucket window only change when the window moves to other buckets or the map grows: cache them (non-enumerable, so scene dumps / state clones skip it)
    var spc = state.sm.pc
    if (!spc || spc.x0 !== bx0 || spc.x1 !== bx1 || spc.z0 !== bz0 || spc.z1 !== bz1 || spc.n !== state.sm.list.length) {
      var sa = []
      for (var bxi = bx0; bxi <= bx1; bxi++) {
        for (var bzi = bz0; bzi <= bz1; bzi++) {
          var bl = state.sm.buckets[bxi + ',' + bzi]
          if (bl) for (var bli = 0; bli < bl.length; bli++) sa.push(bl[bli])
        }
      }
      spc = { x0: bx0, x1: bx1, z0: bz0, z1: bz1, n: state.sm.list.length, a: sa }
      Object.defineProperty(state.sm, 'pc', { value: spc, writable: true, enumerable: false, configurable: true })
    }
    for (var spi = 0; spi < spc.a.length; spi++) pts.push(spc.a[spi])
    av.smap = { list: state.sm.list, ver: state.sm.list.length }
  }
  if (useSmap) {
    // dynamic / kinematic obstacles only (short memory): the route planner overlays the STOPPED ones on its goal-distance field (a parked car is an obstacle for the plan, never part of the persistent map)
    var dynPts = []
    var dk = Object.keys(mem)
    for (var di = 0; di < dk.length; di++) {
      var dm = mem[dk[di]]
      dynPts.push([dm.x, dm.z])
    }
    av.dyn = dynPts
    // the memory is unchanged since dk was read: reuse the key list for the expiry pass below
    keys = dk
  } else keys = Object.keys(mem)
  for (var k = 0; k < keys.length; k++) {
    var m = mem[keys[k]]
    if (e.t - m.t > (m.mv ? dynTtl : ttl)) delete mem[keys[k]]
    else pts.push(m.id ? [m.x, m.z, 1] : [m.x, m.z])
  }
  if (draw) {
    // magenta ticks: remembered obstacle points (costmap), nearest 60
    // partial selection (stable): keep only the nearest N in a sorted buffer instead of sorting every point
    var nearMax = params.debugMaxPoints || 60
    var nearD = []
    var near = []
    for (var ni = 0; ni < pts.length; ni++) {
      var ddx = pts[ni][0] - pos[0]
      var ddz = pts[ni][1] - pos[2]
      var dd2 = ddx * ddx + ddz * ddz
      if (nearD.length >= nearMax && dd2 >= nearD[nearD.length - 1]) continue
      var ins = nearD.length
      while (ins > 0 && nearD[ins - 1] > dd2) ins--
      nearD.splice(ins, 0, dd2)
      near.splice(ins, 0, [dd2, pts[ni]])
      if (nearD.length > nearMax) {
        nearD.pop()
        near.pop()
      }
    }
    for (var pi = 0; pi < near.length; pi++) {
      var q2 = near[pi][1]
      api.visualizeLine([q2[0], pos[1] - 0.4, q2[1]], [q2[0], pos[1] + 0.5, q2[1]], '#ff00ff')
    }
  }
  av.scan = { angles: angles, ranges: ranges, range: range, dir: state.dir === undefined ? 1 : state.dir, freeFront: state.freeF, freeRear: state.freeR }
  av.points = pts
  av.rearClear = rearClear
  av.dynNear = dynNear
  av.movers = movers
  return {}
}
