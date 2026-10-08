/** Task definitions shared by the runner, the pool workers and the compare tool (no sim imports: main-thread safe). */
import type { EpSpec } from '../hunt-maze/episode'

export type Budget = 'full' | 'eco' | 'none'
export interface EpTask { t: 'ep'; id: string; spec: EpSpec; params: Record<string, unknown>; seconds: number; world?: string }
export interface PxTask { t: 'px'; id: string; name: string; budget: Budget; extra: Record<string, unknown> }
export type Task = EpTask | PxTask

/** Constraint proxy cases (B0): maze suite rows + evasion rows + keep-right rows. kr cases take no budget (as validated in B0). */
const MAZE = ['turnaround-corridor', 'maze-dead-end', 'maze-u-trap', 'maze-u-trap-inside', 'maze-corridor-chase', 'maze-gate-exit', 'pocket-escape', 'pocket-ghost', 's-chicane', 's-bend-14', 's-bend-14-short', 'mazemod-one-exit', 'mazemod-two-exits', 'mazemod-dead-end-branch']
const EVASION = ['corridor-block', 'reverse-escape', 'boxed-in-corner', 'open-road-reverse']
const FULL_ONLY = ['wide-berth-open-field']
export const KR = ['kr-right', 'kr-left', 'kr-old-hits']
export const SENTINEL_CASES = ['turnaround-corridor', 'maze-dead-end', 'maze-gate-exit', 'mazemod-one-exit', 'kr-old-hits']

export interface ProxyId { name: string; budget: Budget }
export const proxyId = (p: ProxyId) => `${p.name}:${p.budget}`
export function proxyCases(): ProxyId[] {
  const out: ProxyId[] = []
  for (const b of ['full', 'eco'] as const) for (const n of [...MAZE, ...EVASION]) out.push({ name: n, budget: b })
  for (const n of FULL_ONLY) out.push({ name: n, budget: 'full' })
  for (const n of KR) out.push({ name: n, budget: 'none' })
  return out
}
export function sentinelCases(): ProxyId[] {
  return proxyCases().filter((p) => SENTINEL_CASES.includes(p.name))
}
export const epTaskId = (hash: string, specId: string, seconds: number, world?: string) => `ep|${hash}|${specId}|${seconds}|${world ?? ''}`
export const pxTaskId = (hash: string, p: ProxyId) => `px|${hash}|${proxyId(p)}`
export const isSentinel =(p: ProxyId) => SENTINEL_CASES.includes(p.name)
