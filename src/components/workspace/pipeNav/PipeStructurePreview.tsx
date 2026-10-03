import type { CSSProperties } from 'react'
import { theme } from '@/config/theme'
import type { PipeSummaryNode } from '@/utils/pipeSummary'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function Nodes({ nodes, depth }: { nodes: PipeSummaryNode[]; depth: number }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.kind === 'stage' ?
          <div
            key={`${n.stageId}:${i}`}
            style={{ ...rowStyle, paddingLeft: depth * 12, color: n.enabled ? theme.text.secondary : theme.text.muted }}
            title={n.type}
          >
            <span style={{ color: theme.pipeNav.accent, fontSize: 8 }}>●</span>
            {n.label}
          </div>
        : <div key={`${n.pipeId}:${i}`}>
            <div style={{ ...rowStyle, paddingLeft: depth * 12, color: theme.text.primary, fontWeight: 600 }}>
              <span style={{ color: theme.pipeNav.accent, fontSize: 8 }}>▼</span>
              {n.label}
              {n.missing ? ' (missing)' : n.cycle ? ' (cycle)' : ` · ${n.stageCount}`}
            </div>
            <Nodes nodes={n.children} depth={depth + 1} />
          </div>,
      )}
    </>
  )
}

/** Indented read-only outline of a pipe's stages and nested pipes. */
export default function PipeStructurePreview({
  nodes,
  testId,
}: {
  nodes: PipeSummaryNode[]
  testId?: string
}) {
  if (nodes.length === 0) {
    return (
      <div style={{ fontSize: 11, color: theme.text.muted }} data-testid={testId}>
        Empty pipe
      </div>
    )
  }
  return (
    <div data-testid={testId}>
      <Nodes nodes={nodes} depth={0} />
    </div>
  )
}
