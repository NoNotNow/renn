import type { PipeParamDef, TransformerConfig, TransformerPipe } from '@/types/transformer'
import { normalizePipeMembers } from '@/utils/transformerPipeResolve'

/** What a pipe contains, for previews (library dialog, Organize cards). Pure; works for project or global registries. */
export type PipeSummaryNode =
  | { kind: 'stage'; stageId: string; label: string; type: string; enabled: boolean }
  | { kind: 'pipe'; pipeId: string; label: string; enabled: boolean; stageCount: number; children: PipeSummaryNode[]; missing?: boolean; cycle?: boolean }

export interface PipeSummary {
  pipeId: string
  name: string
  /** Leaf stages reachable through the whole manifold. */
  stageCount: number
  /** Nested pipes below this one (all levels). */
  nestedPipeCount: number
  /** Nesting depth below the root (0 = only stages). */
  depth: number
  children: PipeSummaryNode[]
  paramDefs: PipeParamDef[]
}

export interface PipeRegistries {
  pipes: Record<string, TransformerPipe>
  transformers: Record<string, TransformerConfig>
}

function stageLabel(cfg: TransformerConfig | undefined, stageId: string): { label: string; type: string } {
  if (!cfg) return { label: stageId, type: 'missing' }
  const type = String(cfg.type)
  const name = (cfg as { name?: string }).name
  return { label: type === 'custom' ? (name ?? 'Custom') : (name ?? type), type }
}

export function summarizePipe(reg: PipeRegistries, pipeId: string): PipeSummary | undefined {
  const root = reg.pipes[pipeId]
  if (!root) return undefined
  let nested = 0
  let maxDepth = 0

  const walk = (pipe: TransformerPipe, depth: number, path: Set<string>): { nodes: PipeSummaryNode[]; stages: number } => {
    const nodes: PipeSummaryNode[] = []
    let stages = 0
    for (const member of normalizePipeMembers(pipe)) {
      const enabled = (member as { enabled?: boolean }).enabled !== false
      if (member.kind === 'stage') {
        const cfg = reg.transformers[member.stageId]
        nodes.push({ kind: 'stage', stageId: member.stageId, ...stageLabel(cfg, member.stageId), enabled: enabled && cfg?.enabled !== false })
        stages += 1
        continue
      }
      const child = reg.pipes[member.pipeId]
      nested += 1
      maxDepth = Math.max(maxDepth, depth)
      if (!child) {
        nodes.push({ kind: 'pipe', pipeId: member.pipeId, label: member.pipeId, enabled, stageCount: 0, children: [], missing: true })
        continue
      }
      if (path.has(child.id)) {
        nodes.push({ kind: 'pipe', pipeId: child.id, label: child.name, enabled, stageCount: 0, children: [], cycle: true })
        continue
      }
      const inner = walk(child, depth + 1, new Set([...path, child.id]))
      stages += inner.stages
      nodes.push({ kind: 'pipe', pipeId: child.id, label: child.name, enabled, stageCount: inner.stages, children: inner.nodes })
    }
    return { nodes, stages }
  }

  const { nodes, stages } = walk(root, 1, new Set([root.id]))
  return {
    pipeId: root.id,
    name: root.name,
    stageCount: stages,
    nestedPipeCount: nested,
    depth: maxDepth,
    children: nodes,
    paramDefs: root.paramDefs ?? [],
  }
}

/** One-line description: "12 stages · 7 nested pipes". */
export function describePipeSummary(s: Pick<PipeSummary, 'stageCount' | 'nestedPipeCount'>): string {
  const stages = `${s.stageCount} stage${s.stageCount === 1 ? '' : 's'}`
  if (s.nestedPipeCount === 0) return stages
  return `${stages} · ${s.nestedPipeCount} nested pipe${s.nestedPipeCount === 1 ? '' : 's'}`
}

/** Every pipe id reachable below `rootIds` (inclusive) — used by "expand all". Cycle-safe. */
export function collectNestedPipeIds(pipes: Record<string, TransformerPipe>, rootIds: string[]): string[] {
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id)) return
    const pipe = pipes[id]
    if (!pipe) return
    seen.add(id)
    for (const m of normalizePipeMembers(pipe)) if (m.kind === 'pipe') visit(m.pipeId)
  }
  for (const id of rootIds) visit(id)
  return [...seen]
}
