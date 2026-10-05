// AV stack · SENSE / goal + mission overlay (debug only, no effect on driving).
// Runs every frame (never decimated), right after av-ego, so its lines are always on the first lines of the overlay budget and never flicker.
// Reads av.mission.waypoints (av-mission stage) or params.waypoints [[x, z], ...]; av.goalRaw / av.goalReachDist (av-ego), av.carrot / av.routePath (route planner).
// goalViz (default 'dim'): true | 'full' = the full goal display, 'dim' = old behaviour (mint mission route, yellow pole at the active waypoint), false = nothing.
//   full:  LIME beacon (tall four-line pillar + ring and cross on top) and ground ring (radius goalReachDist = the radius that counts as "goal reached") at the car's own goal, lime line car -> goal;
//          ORANGE small mast + diamond at the route carrot (the intermediate goal the planners steer to; in eco mode the route is refreshed less often, the carrot persists), light-orange polyline of the planned route (goal chain);
//          while the flee layer overrides the goal: small RED-ORANGE marker at the flee goal (lime stays at the real goal).
// params: waypoints, debugDraw, goalViz, goalMastHeight (40), goalChainMax (24 segments)
function transform(input, dt, params, state, api) {
  if (params.debugDraw === false || params.goalViz === false) return {}
  var av = input.av
  var y = input.position[1]
  var full = params.goalViz === true || params.goalViz === 'full'
  var wps = (av && av.mission && av.mission.waypoints) || params.waypoints
  var cur = input.target && input.target.pose && input.target.pose.position
  var own = full && av && av.goalRaw ? av.goalRaw : null
  if (wps && wps.length) {
    for (var i = 0; i < wps.length; i++) {
      var w = wps[i]
      var active = cur && Math.abs(cur[0] - w[0]) < 0.05 && Math.abs(cur[2] - w[1]) < 0.05
      // the full display draws the active goal itself (beacon below)
      if (!(full && (active || (own && Math.abs(own[0] - w[0]) < 0.05 && Math.abs(own[1] - w[1]) < 0.05)))) api.visualizeLine([w[0], y - 0.5, w[1]], [w[0], y + 5, w[1]], active ? '#ffcc00' : '#00ffcc')
      if (i > 0) api.visualizeLine([wps[i - 1][0], y - 0.4, wps[i - 1][1]], [w[0], y - 0.4, w[1]], '#7dffb0')
    }
  }
  if (!full || !av) return {}
  var pos = input.position
  if (own) {
    var gx = own[0]
    var gz = own[1]
    var H = params.goalMastHeight != null ? params.goalMastHeight : 40
    var R = av.goalReachDist || 9
    var LIME = '#b6ff00'
    // overlay lines are ~7 cm thin tubes: a fat four-line pillar + a ring on top stays visible from far away
    for (var c = 0; c < 4; c++) {
      var cx = c < 2 ? -0.7 : 0.7
      var cz = c % 2 ? -0.7 : 0.7
      api.visualizeLine([gx + cx, y - 0.5, gz + cz], [gx + cx, y + H, gz + cz], LIME)
    }
    var tx = gx + 4
    var tz = gz
    for (var t = 1; t <= 8; t++) {
      var ta = (t * 2 * Math.PI) / 8
      api.visualizeLine([tx, y + H, tz], [gx + 4 * Math.cos(ta), y + H, gz + 4 * Math.sin(ta)], LIME)
      tx = gx + 4 * Math.cos(ta)
      tz = gz + 4 * Math.sin(ta)
    }
    api.visualizeLine([gx - 4, y + H, gz], [gx + 4, y + H, gz], LIME)
    api.visualizeLine([gx, y + H, gz - 4], [gx, y + H, gz + 4], LIME)
    api.visualizeLine([gx - 3, y + 0.3, gz], [gx + 3, y + 0.3, gz], LIME)
    api.visualizeLine([gx, y + 0.3, gz - 3], [gx, y + 0.3, gz + 3], LIME)
    var px = gx + R
    var pz = gz
    for (var k = 1; k <= 28; k++) {
      var a = (k * 2 * Math.PI) / 28
      var qx = gx + R * Math.cos(a)
      var qz = gz + R * Math.sin(a)
      api.visualizeLine([px, y + 0.3, pz], [qx, y + 0.3, qz], LIME)
      px = qx
      pz = qz
    }
    api.visualizeLine([pos[0], y + 0.6, pos[2]], [gx, y + 0.6, gz], LIME)
  }
  // flee goal (the stack's current target differs from the source's own goal)
  if (av.fleeing && cur) {
    var FL = '#ff5533'
    api.visualizeLine([cur[0], y - 0.5, cur[2]], [cur[0], y + 10, cur[2]], FL)
    api.visualizeLine([cur[0] - 2, y + 0.3, cur[2]], [cur[0] + 2, y + 0.3, cur[2]], FL)
    api.visualizeLine([cur[0], y + 0.3, cur[2] - 2], [cur[0], y + 0.3, cur[2] + 2], FL)
  }
  // route carrot (intermediate goal) + planned route chain
  var cr = av.carrot
  if (cr) {
    var OR = '#ff9a1f'
    api.visualizeLine([cr[0], y - 0.5, cr[1]], [cr[0], y + 7, cr[1]], OR)
    api.visualizeLine([cr[0] - 1.5, y + 0.4, cr[1]], [cr[0], y + 0.4, cr[1] + 1.5], OR)
    api.visualizeLine([cr[0], y + 0.4, cr[1] + 1.5], [cr[0] + 1.5, y + 0.4, cr[1]], OR)
    api.visualizeLine([cr[0] + 1.5, y + 0.4, cr[1]], [cr[0], y + 0.4, cr[1] - 1.5], OR)
    api.visualizeLine([cr[0], y + 0.4, cr[1] - 1.5], [cr[0] - 1.5, y + 0.4, cr[1]], OR)
  }
  var rp = av.routePath
  if (rp && rp.length > 1) {
    var maxSeg = params.goalChainMax != null ? params.goalChainMax : 24
    var step = Math.max(1, Math.ceil((rp.length - 1) / maxSeg))
    var prev = rp[0]
    for (var j = step; j < rp.length + step - 1; j += step) {
      var cp = rp[Math.min(j, rp.length - 1)]
      api.visualizeLine([prev[0], y + 0.5, prev[1]], [cp[0], y + 0.5, cp[1]], '#ffd27f')
      prev = cp
    }
  }
  return {}
}
