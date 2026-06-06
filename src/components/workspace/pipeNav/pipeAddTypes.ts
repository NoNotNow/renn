import type { PipeNavViewMode } from '@/types/pipeNav'

export type PipeAddAction =
  | 'add_stage'
  | 'create_pipe'
  | 'add_existing_pipe'
  | 'add_child_pipe'

export type PipeAddSection = 'stage' | 'create_pipe' | 'existing_pipe' | 'child_pipe'

export function pipeAddSectionsForMode(mode: PipeNavViewMode, hasPipeStack: boolean): PipeAddSection[] {
  const sections: PipeAddSection[] = []
  if (mode !== 'pipe_siblings') sections.push('stage')
  if (mode === 'pipe_siblings' || mode === 'pipe_members') sections.push('create_pipe')
  if ((mode === 'pipe_siblings' && hasPipeStack) || mode === 'pipe_members') sections.push('existing_pipe')
  if (mode === 'pipe_members') sections.push('child_pipe')
  return sections
}

export function pipeAddSectionLabel(section: PipeAddSection): string {
  switch (section) {
    case 'stage':
      return 'Transformer'
    case 'create_pipe':
      return 'New pipe'
    case 'existing_pipe':
      return 'Existing pipe'
    case 'child_pipe':
      return 'Child pipe'
  }
}
