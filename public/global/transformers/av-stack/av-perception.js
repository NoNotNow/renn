// AV stack · SENSE / perception.
// 360° range-scan ring (lidar-like, mounted at the vehicle centre, rays start on the hull)
// + obstacle memory ("local costmap") so the planners also know what is behind / beside.
// Publishes: av.scan {angles, ranges, range}, av.points [[x,z],...] (world), av.rearClear.
// debug draw (params.debugDraw, debugRayStride, debugMaxPoints): red = lidar hit rays, magenta ticks = costmap points.
// params: drivableArea [xmin, xmax, zmin, zmax] (virtual walls at the edge), edgeStep, rayCount, fovDeg, sensorRange, memoryTtl, memoryCell, vehicleWidth, vehicleLength
function transform(input, dt, params, state, api) {
  var av = input.av
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
  var hl = (params.vehicleLength || 4) / 2 + 0.15
  var hw = (params.vehicleWidth || 2) / 2 + 0.15
  if (!state.mem) state.mem = {}
  var mem = state.mem
  var pos = input.position
  var full = fov >= 2 * Math.PI - 1e-3
  var angles = []
  var ranges = []
  var rearClear = params.rearRange || 8
  var draw = params.debugDraw !== false
  var rayStride = params.debugRayStride || 2
  for (var i = 0; i < n; i++) {
    var th = full ? -Math.PI + (2 * Math.PI * i) / n : n === 1 ? 0 : -fov / 2 + (fov * i) / (n - 1)
    var c = Math.cos(th)
    var s = Math.sin(th)
    var dir = [
      e.fwd[0] * c + e.left[0] * s,
      e.fwd[1] * c + e.left[1] * s,
      e.fwd[2] * c + e.left[2] * s,
    ]
    // start just outside the hull rectangle along this ray
    var tHull = Math.min(Math.abs(c) > 1e-6 ? hl / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? hw / Math.abs(s) : 1e9)
    var origin = api.vec.offsetAlong(pos, dir, tHull)
    var r = api.raycast(origin, dir, range, { visualize: false })
    angles.push(th)
    if (r.hit) {
      if (draw && i % rayStride === 0) api.visualizeLine(origin, api.vec.offsetAlong(origin, dir, r.distance), '#ff4d4d')
      ranges.push(r.distance)
      var hx = origin[0] + dir[0] * r.distance
      var hz = origin[2] + dir[2] * r.distance
      mem[Math.round(hx / cell) + ',' + Math.round(hz / cell)] = { x: hx, z: hz, t: e.t }
      if (c < -0.9 && r.distance < rearClear) rearClear = r.distance
    } else {
      ranges.push(range)
    }
  }
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
  var keys = Object.keys(mem)
  for (var k = 0; k < keys.length; k++) {
    var m = mem[keys[k]]
    if (e.t - m.t > ttl) delete mem[keys[k]]
    else pts.push([m.x, m.z])
  }
  if (draw) {
    // magenta ticks: remembered obstacle points (costmap), nearest 60
    var near = pts
      .map(function (q) {
        var ddx = q[0] - pos[0]
        var ddz = q[1] - pos[2]
        return [ddx * ddx + ddz * ddz, q]
      })
      .sort(function (a, b) {
        return a[0] - b[0]
      })
      .slice(0, params.debugMaxPoints || 60)
    for (var pi = 0; pi < near.length; pi++) {
      var q2 = near[pi][1]
      api.visualizeLine([q2[0], pos[1] - 0.4, q2[1]], [q2[0], pos[1] + 0.5, q2[1]], '#ff00ff')
    }
  }
  av.scan = { angles: angles, ranges: ranges, range: range }
  av.points = pts
  av.rearClear = rearClear
  return {}
}
