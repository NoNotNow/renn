// B0 measurement (test-only, no src change): vitest setup file that records, per test and per WorldSimulator, whether/when the AV's
// `av.profile` watch (published by av-ego when params.mazeProfile is an object, only while av.maze is on + hold) turned on.
// Use with: vitest run --config tools/hunt-profile-evo/probe/vitest.activation.config.ts <files>   (env ACT_OUT=dir)
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, expect } from 'vitest'
import { WorldSimulator, DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'

type Rec = { test: string; sim: number; frames: number; firstOn: number | null; onFrames: number; hash: string; hashAtOn: string | null; onIdx: number; hs: string[] }
const recs: Rec[] = []
const per = new WeakMap<object, { rec: Rec; base: Map<string, number>; h: number }>()
let simCounter = 0
const proto = WorldSimulator.prototype as unknown as { runFrames: (n: number) => unknown }
const orig = proto.runFrames
proto.runFrames = function (this: object, n: number) {
  setAgentObservationWatchActive(true)
  let st = per.get(this)
  if (!st) {
    const rec: Rec = { test: expect.getState().currentTestName ?? '?', sim: simCounter++, frames: 0, firstOn: null, onFrames: 0, hash: '', hashAtOn: null, onIdx: -1, hs: [] }
    recs.push(rec)
    const base = new Map<string, number>()
    for (const [k, e] of getTransformerWatchEntries()) if (e.label === 'av.profile') base.set(k, e.updatedAt)
    st = { rec, base, h: 2166136261 }
    per.set(this, st)
  }
  const r = orig.call(this, n)
  st.rec.frames += n
  // running FNV hash of every chain entity's pose after each runFrames call: a bit-identity fingerprint of the whole trajectory
  {
    const sim = this as unknown as { getChainEntityIds(): string[]; getPosition(id: string): number[] }
    let h = st.h
    for (const id of sim.getChainEntityIds()) for (const c of sim.getPosition(id)) { h = Math.imul(h ^ Math.round(c * 1e6), 16777619) >>> 0 }
    st.h = h
    st.rec.hash = h.toString(16)
    st.rec.hs.push(st.rec.hash)
  }
  let on = false
  for (const [k, e] of getTransformerWatchEntries()) {
    if (e.label !== 'av.profile' || e.value !== 'on') continue
    if (st.base.get(k) === e.updatedAt) continue
    on = true
  }
  if (on) {
    st.rec.onFrames += n
    if (st.rec.firstOn === null) { st.rec.firstOn = +(st.rec.frames * DEFAULT_DT).toFixed(2); st.rec.hashAtOn = st.rec.hash; st.rec.onIdx = st.rec.hs.length - 1 }
  }
  return r
}
afterAll(() => {
  const out = process.env.ACT_OUT
  if (!out) return
  fs.mkdirSync(out, { recursive: true })
  const f = path.basename(expect.getState().testPath ?? 'unknown').replace(/\.ts$/, '')
  fs.writeFileSync(path.join(out, f + '.json'), JSON.stringify(recs, null, 1))
})
