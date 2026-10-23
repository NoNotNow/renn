/**
 * Shared code string of the per-car score stage of the PLAYABLE training worlds (maze + crux): monotone arc-length
 * progress along the own chain polyline (1 pt / m) plus an ALONG-CHAIN speed bonus (credited progress dS/dt, capped at vRef) minus per-second touch penalties, with the wall
 * line-of-sight gate on the progress credit (WALL_LOS_JS), the high-water-mark display score, the goal-reach finish
 * freeze and the chain + carrot drawing. ONE definition so the two training sets cannot diverge; the only per-set
 * difference is the `api.watch` label PREFIX ('maze.*' / 'crux.*' - the training dialog's live overlay reads it).
 * `MAZE_SCORE_STAGE_CODE` = trainingScoreStageCode('maze', ...) (mazeTraining.ts) and `CRUX_SCORE_STAGE_CODE` =
 * trainingScoreStageCode('crux', ...) (cruxTraining.ts) embed the SAME behaviour; see mazeTraining.ts for the full
 * behavioural contract (finish freeze, LOS gate, penalties, drawing).
 * The carrot drawing is OPTIONAL: an EMPTY `carrotColor` emits no carrot (the schlau worlds since 2026-10-23 — the
 * lookahead vector is gone there, ONE nose -> goal target line drawn by the schlau drive stage instead); maze and
 * crux keep it, byte-identical.
 */
import { NOSE_M } from './policy'
import { WALL_LOS_JS } from './wallLos'

/**
 * The chainPoint helper of the carrot lookahead drawing (the point at arc length s2 of a chain). Emitted ONLY for
 * a non-empty `carrotColor` (byte-identical for maze / crux); the schlau worlds pass '' — no carrot there (user
 * decision 2026-10-23: the lookahead vector is gone, ONE nose -> goal target line drawn by the schlau drive stage).
 */
const chainPointJs = `    function chainPoint(ch2, cum2, s2) {
      var i2 = 0
      while (i2 < ch2.length - 2 && cum2[i2 + 1] < s2) i2++
      var t2 = (s2 - cum2[i2]) / (cum2[i2 + 1] - cum2[i2] || 1)
      return [ch2[i2][0] + (ch2[i2 + 1][0] - ch2[i2][0]) * t2, ch2[i2][1] + (ch2[i2 + 1][1] - ch2[i2][1]) * t2]
    }`

/**
 * The per-car carrot lookahead drawing (the per-car 8 m arc-ahead line). Emitted ONLY for a non-empty
 * `carrotColor` (byte-identical for maze / crux); the schlau worlds pass '' — no carrot there (user decision
 * 2026-10-23: the lookahead vector misled, the schlau drive stage draws the nose -> goal target line instead).
 */
const carrotLoopJs = (color: string) => `    for (var k3 = 0; k3 < params.cars.length; k3++) {
      var fx = px, fz = pz, arc = 0
      if (k3 === params.idx) {
        arc = Math.min(state.s + 8, total)
      } else {
        var w = api.getWorldPosition(params.cars[k3])
        if (!w) continue
        fx = w[0]
        fz = w[2]
        var chW = params.chains[k3], cumW = state.cums[k3]
        var bd = Infinity
        for (var i3 = 0; i3 < chW.length - 1; i3++) {
          var ax2 = chW[i3][0], az2 = chW[i3][1]
          var dx2 = chW[i3 + 1][0] - ax2, dz2 = chW[i3 + 1][1] - az2
          var l2 = dx2 * dx2 + dz2 * dz2 || 1
          var t3 = Math.max(0, Math.min(1, ((fx - ax2) * dx2 + (fz - az2) * dz2) / l2))
          var d2 = Math.hypot(fx - (ax2 + t3 * dx2), fz - (az2 + t3 * dz2))
          if (d2 < bd) {
            bd = d2
            arc = cumW[i3] + t3 * Math.sqrt(l2)
          }
        }
        arc = Math.min(arc + 8, cumW[chW.length - 1])
      }
      var tp = chainPoint(params.chains[k3], state.cums[k3], arc)
      api.visualizeLine([fx, 0.35, fz], [tp[0], 0.35, tp[1]], '${color}')
    }`

/**
 * The LIVE-ROUTE drawing (schlau ONLY, `liveRoute = true`, user note 2026-10-23 ~02:55: "the drawn route looks
 * predetermined"): the geodesic route is REDRAWN from the car's CURRENT nose — at most every 0.5 s of stage time
 * or after a 2 m nose move — instead of the once-baked spawn -> goal polyline. VISUAL ONLY: `params.chain`
 * stays the SCORE basis (monotone progress, LOS gate, finish freeze — the scorer itself is position-live via
 * the distance field, alternative routes are fully rewarded). The static parts (walls + goal) are preprocessed
 * ONCE into a 1 m grid with 2.5 m wall inflation + a BFS distance field from the goal cell; a redraw walks the
 * field downhill from the nose (O(path)) and string-pulls with the rect LOS helper. A blocked/unreachable nose
 * keeps the LAST drawn route (no flicker); at spawn the live route equals the old baked one. maze / crux never
 * pass the flag — their stage code stays byte-identical (pinned by trainingScoreStage.test.ts).
 */

/** the live-route helpers (emitted ONLY for `liveRoute`): the point -> convex-poly distance (0 inside). */
const LIVE_ROUTE_HELPERS_JS = `function lrPolyDist(px, pz, poly) {
  var pos = false, neg = false, best = Infinity
  for (var i = 0; i < poly.length; i++) {
    var a = poly[i], b = poly[(i + 1) % poly.length]
    var ex = b[0] - a[0], ez = b[1] - a[1]
    var cr = (px - a[0]) * ez - (pz - a[1]) * ex
    if (cr > 0) pos = true
    else if (cr < 0) neg = true
    var t = ((px - a[0]) * ex + (pz - a[1]) * ez) / (ex * ex + ez * ez || 1)
    t = t < 0 ? 0 : t > 1 ? 1 : t
    var dx = px - (a[0] + ex * t), dz = pz - (a[1] + ez * t)
    var d = Math.sqrt(dx * dx + dz * dz)
    if (d < best) best = d
  }
  return pos && neg ? best : 0
}
function lrInit(params) {
  var walls = params.walls || []
  var ch = params.chain
  var g = ch[ch.length - 1]
  var minX = g[0] - 24, maxX = g[0] + 24, minZ = g[1] - 24, maxZ = g[1] + 24
  for (var w = 0; w < walls.length; w++)
    for (var p = 0; p < walls[w].length; p++) {
      var x = walls[w][p][0], z = walls[w][p][1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  minX = Math.floor(minX) - 2
  minZ = Math.floor(minZ) - 2
  maxX = Math.ceil(maxX) + 2
  maxZ = Math.ceil(maxZ) + 2
  var nx = maxX - minX + 1, nz = maxZ - minZ + 1
  var blocked = new Uint8Array(nx * nz)
  var dist = new Int32Array(nx * nz)
  for (var i = 0; i < dist.length; i++) dist[i] = -1
  for (var wi = 0; wi < walls.length; wi++) {
    var poly = walls[wi]
    var bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity
    for (var pi = 0; pi < poly.length; pi++) {
      if (poly[pi][0] < bx0) bx0 = poly[pi][0]
      if (poly[pi][0] > bx1) bx1 = poly[pi][0]
      if (poly[pi][1] < bz0) bz0 = poly[pi][1]
      if (poly[pi][1] > bz1) bz1 = poly[pi][1]
    }
    for (var cz = Math.max(minZ, Math.floor(bz0 - 2.5)); cz <= Math.min(maxZ, Math.ceil(bz1 + 2.5)); cz++)
      for (var cx = Math.max(minX, Math.floor(bx0 - 2.5)); cx <= Math.min(maxX, Math.ceil(bx1 + 2.5)); cx++)
        if (lrPolyDist(cx, cz, poly) <= 2.5) blocked[(cz - minZ) * nx + (cx - minX)] = 1
  }
  var gx = Math.round(g[0]) - minX, gz = Math.round(g[1]) - minZ
  var start = gz * nx + gx
  if (!blocked[start]) {
    var q = [start]
    dist[start] = 0
    for (var qi = 0; qi < q.length; qi++) {
      var c = q[qi]
      var d = dist[c] + 1
      var bx = c % nx, bz = (c - bx) / nx
      if (bx > 0 && !blocked[c - 1] && dist[c - 1] < 0) { dist[c - 1] = d; q.push(c - 1) }
      if (bx < nx - 1 && !blocked[c + 1] && dist[c + 1] < 0) { dist[c + 1] = d; q.push(c + 1) }
      if (bz > 0 && !blocked[c - nx] && dist[c - nx] < 0) { dist[c - nx] = d; q.push(c - nx) }
      if (bz < nz - 1 && !blocked[c + nx] && dist[c + nx] < 0) { dist[c + nx] = d; q.push(c + nx) }
    }
  }
  return { minX: minX, minZ: minZ, nx: nx, nz: nz, blocked: blocked, dist: dist, goal: [g[0], g[1]] }
}
function lrWalk(lr, x, z, los) {
  var cx = Math.round(x) - lr.minX, cz = Math.round(z) - lr.minZ
  if (cx < 0 || cz < 0 || cx >= lr.nx || cz >= lr.nz) return null
  var c = cz * lr.nx + cx
  if (lr.blocked[c] || lr.dist[c] < 0) return null
  var pts = [[x, z]]
  var guard = 0
  while (lr.dist[c] > 0 && guard++ < 10000) {
    var bx = c % lr.nx, bz = (c - bx) / lr.nx
    var best = -1, bd = lr.dist[c]
    if (bx > 0 && lr.dist[c - 1] >= 0 && lr.dist[c - 1] < bd) { best = c - 1; bd = lr.dist[c - 1] }
    if (bx < lr.nx - 1 && lr.dist[c + 1] >= 0 && lr.dist[c + 1] < bd) { best = c + 1; bd = lr.dist[c + 1] }
    if (bz > 0 && lr.dist[c - lr.nx] >= 0 && lr.dist[c - lr.nx] < bd) { best = c - lr.nx; bd = lr.dist[c - lr.nx] }
    if (bz < lr.nz - 1 && lr.dist[c + lr.nx] >= 0 && lr.dist[c + lr.nx] < bd) { best = c + lr.nx; bd = lr.dist[c + lr.nx] }
    if (best < 0) return null
    c = best
    var bx2 = c % lr.nx, bz2 = (c - bx2) / lr.nx
    pts.push([bx2 + lr.minX, bz2 + lr.minZ])
  }
  pts.push(lr.goal)
  // WINDOWED string-pull (max ~8 cells per skip): an unbounded pull collapses the route into 2-3 long
  // straight corridor-cutters that read as wrong (user bug report 2026-10-23) — the window keeps the
  // polyline close to the 2.5 m-cleared BFS path (a smooth corridor line like the baked geodesic, but live)
  var out = [pts[0]]
  var i = 0
  while (i < pts.length - 1) {
    var j = Math.min(i + 8, pts.length - 1)
    for (; j > i + 1; j--) if (!losBlocked(los, pts[i][0], pts[i][1], pts[j][0], pts[j][1])) break
    out.push(pts[j])
    i = j
  }
  return out
}`

/** the live-route DRAW inside the hud block (emitted ONLY for `liveRoute`; replaces the baked chain loop). */
const LIVE_ROUTE_DRAW_JS = `    // LIVE route (schlau only): redrawn from the car's CURRENT nose — every >= 0.5 s of stage time or after a
    // 2 m nose move; a blocked / unreachable nose keeps the last drawn route (no flicker). VISUAL ONLY: the
    // score keeps running on params.chain (the baked geodesic), the drawing shows where the car can still go.
    if (state.t - state.lrT >= 0.5 || Math.hypot(px - state.lrNose[0], pz - state.lrNose[1]) > 2) {
      var lrPts = lrWalk(state.lr, px, pz, state.los)
      if (lrPts) {
        state.lrPts = lrPts
        state.lrT = state.t
        state.lrNose = [px, pz]
      }
      // a blocked / null walk keeps the last drawn route (no flicker)
    }
    // re-anchor the drawn route at the CURRENT nose every frame (between the throttled recomputes the car
    // keeps moving — a detached route start reads as wrongly displayed)
    if (state.lrPts) state.lrPts[0] = [px, pz]
    if (state.lrPts && state.lrPts.length > 1) {
      var colL = params.chainColors[params.idx] || ['#44ff77', '#ffaa44']
      for (var s4 = 0; s4 < state.lrPts.length - 1; s4++)
        api.visualizeLine([state.lrPts[s4][0], 0.35, state.lrPts[s4][1]], [state.lrPts[s4 + 1][0], 0.35, state.lrPts[s4 + 1][1]], hexLerp(colL[0], colL[1], state.lrPts.length > 2 ? s4 / (state.lrPts.length - 2) : 0))
    }`

/**
 * The baked chain drawing (maze / crux keep it; the schlau live route replaces it). Extracted verbatim — the
 * false-branch output must stay byte-identical (hash-pinned by trainingScoreStage.test.ts).
 */
const CHAIN_DRAW_JS = `    for (var k2 = 0; k2 < params.chains.length; k2++) {
      var chK = params.chains[k2], colK = params.chainColors[k2] || ['#44ff77', '#ffaa44']
      for (var s3 = 0; s3 < chK.length - 1; s3++) {
        api.visualizeLine([chK[s3][0], 0.35, chK[s3][1]], [chK[s3 + 1][0], 0.35, chK[s3 + 1][1]], hexLerp(colK[0], colK[1], chK.length > 2 ? s3 / (chK.length - 2) : 0))
      }
    }`

/**
 * The score-stage transformer code. `prefix` only names the watch labels (maze.score / crux.score ...);
 * `goalReachM` is the goal-reach radius that freezes the score at the finish, `carrotColor` the drawn carrot line —
 * an EMPTY string draws no carrot (see the header note). `liveRoute` (schlau only) replaces the baked route
 * drawing with the LIVE nose -> goal route (see LIVE_ROUTE_*, above) — the flag is OFF for maze / crux, whose
 * stage code stays byte-identical.
 */
export function trainingScoreStageCode(prefix: string, goalReachM: number, carrotColor: string, liveRoute = false): string {
  return `${WALL_LOS_JS}
${liveRoute ? LIVE_ROUTE_HELPERS_JS + '\n' : ''}function transform(input, dt, params, state, api) {
  if (state.t === undefined) state.t = 0
  state.t += dt
  var env = input.environment
  var wallT = !!(env && env.isTouchingSide)
  var objT = !wallT && !!(env && env.isTouchingObject)
  if (objT) {
    // any contact without a lateral one and without support below the hull: object contact, not standing on the ground
    var sup = api.raycast([input.position[0], input.position[1], input.position[2]], [0, -1, 0], 1.2, { visualize: false })
    if (sup.hit) objT = false
  }
  var ch = params.chain
  var n = ch.length
  if (!state.cum) {
    state.cum = [0]
    for (var q = 1; q < n; q++) state.cum.push(state.cum[q - 1] + Math.hypot(ch[q][0] - ch[q - 1][0], ch[q][1] - ch[q - 1][1]))
    state.s = 0
    state.bonus = 0
    state.penalty = 0
    state.seg = 0
    state.best = 0
    // line-of-sight gate cache: the own copy's wall rects, preprocessed with bounding circles (empty = ungated)
    state.los = losWallsInit(params.walls || [])
${liveRoute ? `    // the live-route preprocessing: static (walls + goal) — the 1 m grid + the BFS field, computed ONCE
    state.lr = lrInit(params)
    state.lrT = -1
    state.lrNose = [px, pz]
    state.lrPts = null
` : ''}  }
  var total = state.cum[n - 1]
  var up = api.getUpVector(input.rotation)
  var fwd = api.vec.normalize(api.vec.projectOntoPlane(api.getForwardVector(input.rotation), up))
  // the own-car anchor is the car NOSE (center + fwd * NOSE_M, the same front edge the ray sensing and the v3 command use):
  // projection, LOS gate, goal reach and the own carrot all lead from the front — NO leading-edge flip here (the maze worlds
  // have no reversal legs and the score counts forward progress); the other cars stay center-anchored (visualization)
  var px = input.position[0] + fwd[0] * ${NOSE_M}, pz = input.position[2] + fwd[2] * ${NOSE_M}
  var vRef = params.vRef || 20
  var v = Math.min(Math.hypot(input.velocity[0], input.velocity[2]), vRef)
  // finish: within MAZE_GOAL_REACH_M of the chain end the route is cleared (same rule as the exporter early-stop).
  // Progress jumps to the full chain length (the leg-off margin is never driven), then the score FREEZES: no more
  // progress, bonus or touch penalties, the carrot parks on the end point — the watch score can only stand still.
  if (!state.done && Math.hypot(px - ch[n - 1][0], pz - ch[n - 1][1]) < ${goalReachM}) {
    state.done = true
    state.s = total
    state.seg = n - 2
  }
  if (!state.done) {
    var bestD = Infinity, bestS = state.s, bestSeg = state.seg, bestPX = px, bestPZ = pz
    for (var i = Math.max(0, state.seg - 2); i <= Math.min(n - 2, state.seg + 3); i++) {
      var ax = ch[i][0], az = ch[i][1]
      var dx = ch[i + 1][0] - ax, dz = ch[i + 1][1] - az
      var len2 = dx * dx + dz * dz || 1
      var t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
      var d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
      if (d < bestD) {
        bestD = d
        bestS = state.cum[i] + t * Math.sqrt(len2)
        bestSeg = i
        bestPX = ax + t * dx
        bestPZ = az + t * dz
      }
    }
    state.seg = bestSeg
    // line-of-sight gate: only credit the projection when the car -> projected chain point segment crosses no wall —
    // the previous credit stands while occluded (the carrot vector, 8 m of arc ahead, can round a corner and cross a
    // wall: it is a preview, the credit itself is what is gated). Penalties keep running while occluded.
    var sPrev = state.s
    if (bestS > state.s && !losBlocked(state.los, px, pz, bestPX, bestPZ)) state.s = bestS
    // the speed bonus pays the ALONG-CHAIN speed: this frame's CREDITED progress (dS / dt, capped at vRef). Raw
    // |velocity| paid wrong-way driving, reversing and fast approaches at frozen progress (carrot through the wall,
    // LOS-gated s) up to bonusRate pts/s — the score rose without any credited metre. Credited dS is 0 in all of
    // those cases, so only forward progress along the chain earns the bonus.
    var alongV = dt > 0 ? (state.s - sPrev) / dt : 0
    if (alongV > vRef) alongV = vRef
    state.bonus += (alongV / vRef) * dt * (params.bonusRate || 5)
    state.penalty += dt * (wallT ? (params.wallPenaltyPerS || 12) : objT ? (params.objectPenaltyPerS || 4) : 0)
  }
  var score = state.s + state.bonus - state.penalty
  if (score < 0) score = 0
  // high-water mark: the run score above still drains on touches, but the shown / snapshotted score is its maximum
  // over time — a stall against a wall can no longer zero out the points earned on the way. NOT rounded: a continuous
  // score is the finer signal (sub-point crawling progress, tie-break between candidates with equal integer scores).
  if (score > state.best) state.best = score
  if (params.hud) api.setScore(state.best)
  api.watch('${prefix}.score', state.best.toFixed(1) + ' pts')
  api.watch('${prefix}.prog', state.s.toFixed(1) + ' / ' + total.toFixed(0) + ' m')
  api.watch('${prefix}.speed', v.toFixed(1) + ' m/s')
  api.watch('${prefix}.seg', String(state.seg))
  if (params.hud) {
    function hexChannel(h, k) {
      return parseInt(h.slice(1 + k * 2, 3 + k * 2), 16)
    }
    function hexLerp(a, b, t) {
      var out = '#'
      for (var k = 0; k < 3; k++) {
        var va = hexChannel(a, k), vb = hexChannel(b, k)
        var vv = Math.round(va + (vb - va) * t)
        out += (vv < 16 ? '0' : '') + vv.toString(16)
      }
      return out
    }
    if (!state.cums) {
      state.cums = []
      for (var c = 0; c < params.chains.length; c++) {
        var chC = params.chains[c]
        var cumC = [0]
        for (var q2 = 1; q2 < chC.length; q2++) cumC.push(cumC[q2 - 1] + Math.hypot(chC[q2][0] - chC[q2 - 1][0], chC[q2][1] - chC[q2 - 1][1]))
        state.cums.push(cumC)
      }
    }
${carrotColor ? chainPointJs : ''}
${liveRoute ? LIVE_ROUTE_DRAW_JS : CHAIN_DRAW_JS}
${carrotColor ? carrotLoopJs(carrotColor) : ''}
  }
  return {}
}`
}
