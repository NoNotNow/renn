import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { PipeTreeNode } from '@/components/workspace/pipeNav/PipeNavTree'
import type { InsertPipePlacement } from '@/utils/pipeNavMutations'
import { nextFreeDefaultPipeName } from '@/utils/allocatePipeId'
import type { RennWorld } from '@/types/world'

export type PipeTreeContextTarget = {
  node: PipeTreeNode
  /** Path into the pipe container for member-level inserts. */
  containerPath: PipeNavPathSegment[]
}

export function placementForTreeContext(
  action: 'add_before' | 'add_after' | 'add_child',
  target: PipeTreeContextTarget,
): InsertPipePlacement | null {
  const { node, containerPath } = target

  if (node.kind === 'entity') {
    if (action === 'add_child') return null
    return {
      parentPath: [],
      placement: 'stack_sibling',
      insertIndex: action === 'add_before' ? 0 : undefined,
    }
  }

  if (node.kind === 'stack_pipe') {
    if (action === 'add_child') {
      return {
        parentPath: [{ kind: 'stack', index: node.stackIndex }],
        placement: 'member_child',
      }
    }
    return {
      parentPath: [],
      placement: 'stack_sibling',
      insertIndex: action === 'add_before' ? node.stackIndex : node.stackIndex + 1,
    }
  }

  if (node.kind === 'member_pipe') {
    if (action === 'add_child') {
      return {
        parentPath: [...containerPath, { kind: 'member', pipeId: node.parentPipeId, memberIndex: node.memberIndex }],
        placement: 'member_child',
      }
    }
    return {
      parentPath: containerPath,
      placement: 'member_sibling',
      insertIndex: action === 'add_before' ? node.memberIndex : node.memberIndex + 1,
    }
  }

  if (node.kind === 'member_stage') {
    if (action === 'add_child') return null
    return {
      parentPath: containerPath,
      placement: 'member_sibling',
      insertIndex: action === 'add_before' ? node.memberIndex : node.memberIndex + 1,
    }
  }

  return null
}

export function defaultNameForTreeInsert(world: RennWorld): string {
  return nextFreeDefaultPipeName(world.transformerPipes)
}
