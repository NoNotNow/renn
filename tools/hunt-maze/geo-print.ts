/* Prints the computed labyrinth geometry (bbox, deep starts, gates, goals): npx tsx tools/hunt-maze/geo-print.ts [exampleId] */
import { loadSourceWorld } from '../av-evolution/loadSource'
import { analyseMaze, collectObstacles, mazeIds } from './geometry'

const w = loadSourceWorld(process.argv[2])
const obs = collectObstacles(w)
for (const id of mazeIds(w)) {
  const m = analyseMaze(w, id, obs)
  console.log(`${id} bbox ${m.bbox.join(',')} walls ${m.nWalls} maxDepth ${m.maxDepthM} m`)
  for (const s of m.starts) console.log(`   start ${s.x},${s.z} yaw ${s.yawDeg} depth ${s.depthM} m (${s.role}) gate ${s.gate} goal ${s.goal}`)
}
