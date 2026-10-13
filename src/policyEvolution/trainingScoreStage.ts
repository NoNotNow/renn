/**
 * Shared code string of the per-car score stage of the PLAYABLE training worlds (maze + crux): monotone arc-length
 * progress along the own chain polyline (1 pt / m) plus an ALONG-CHAIN speed bonus (credited progress dS/dt, capped at vRef) minus per-second touch penalties, with the wall
 * line-of-sight gate on the progress credit (WALL_LOS_JS), the high-water-mark display score, the goal-reach finish
 * freeze and the chain + carrot drawing. ONE definition so the two training sets cannot diverge; the only per-set
 * difference is the `api.watch` label PREFIX ('maze.*' / 'crux.*' - the training dialog's live overlay reads it).
 * `MAZE_SCORE_STAGE_CODE` = trainingScoreStageCode('maze', ...) (mazeTraining.ts) and `CRUX_SCORE_STAGE_CODE` =
 * trainingScoreStageCode('crux', ...) (cruxTraining.ts) embed the SAME behaviour; see mazeTraining.ts for the full
 * behavioural contract (finish freeze, LOS gate, penalties, drawing).
 */
import { NOSE_M } from './policy'
import { WALL_LOS_JS } from './wallLos'

/**
 * The score-stage transformer code. `prefix` only names the watch labels (maze.score / crux.score ...);
 * `goalReachM` is the goal-reach radius that freezes the score at the finish, `carrotColor` the drawn carrot line.
 */
export function trainingScoreStageCode(prefix: string, goalReachM: number, carrotColor: string): string {
  return `${WALL_LOS_JS}
function transform(input, dt, params, state, api) {
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
  }
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
    function chainPoint(ch2, cum2, s2) {
      var i2 = 0
      while (i2 < ch2.length - 2 && cum2[i2 + 1] < s2) i2++
      var t2 = (s2 - cum2[i2]) / (cum2[i2 + 1] - cum2[i2] || 1)
      return [ch2[i2][0] + (ch2[i2 + 1][0] - ch2[i2][0]) * t2, ch2[i2][1] + (ch2[i2 + 1][1] - ch2[i2][1]) * t2]
    }
    for (var k2 = 0; k2 < params.chains.length; k2++) {
      var chK = params.chains[k2], colK = params.chainColors[k2] || ['#44ff77', '#ffaa44']
      for (var s3 = 0; s3 < chK.length - 1; s3++) {
        api.visualizeLine([chK[s3][0], 0.35, chK[s3][1]], [chK[s3 + 1][0], 0.35, chK[s3 + 1][1]], hexLerp(colK[0], colK[1], chK.length > 2 ? s3 / (chK.length - 2) : 0))
      }
    }
    for (var k3 = 0; k3 < params.cars.length; k3++) {
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
      api.visualizeLine([fx, 0.35, fz], [tp[0], 0.35, tp[1]], '${carrotColor}')
    }
  }
  return {}
}`
}
