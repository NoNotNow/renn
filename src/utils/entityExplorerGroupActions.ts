import type { RennWorld } from '@/types/world'
import { findGroupById, findGroupContaining } from '@/utils/entityGroups'

export interface GroupActionState {
  canCreate: boolean
  canUngroup: boolean
  ungroupTargetId: string | null
  canAddToGroup: boolean
  addTargetGroupId: string | null
  canRemoveFromGroup: boolean
}

/**
 * Inspect the current selection and return which group actions are enabled.
 *
 * - canCreate: ≥ 2 entities/groups selected and not all in the same direct parent group
 * - canUngroup: exactly one group is selected (no entity additionally selected)
 * - canAddToGroup: exactly one group + ≥ 1 entity is selected (and the entity is not already
 *   a direct member of that group)
 * - canRemoveFromGroup: ≥ 1 selected entity is currently a member of any group
 */
export function computeGroupActionState(
  world: RennWorld,
  selectedEntityIds: readonly string[],
  selectedGroupIds: readonly string[],
): GroupActionState {
  const totalSel = selectedEntityIds.length + selectedGroupIds.length
  const canCreate = totalSel >= 2
  const canUngroup = selectedEntityIds.length === 0 && selectedGroupIds.length === 1
  const ungroupTargetId = canUngroup ? selectedGroupIds[0]! : null

  let canAddToGroup = false
  let addTargetGroupId: string | null = null
  if (selectedGroupIds.length === 1 && selectedEntityIds.length >= 1) {
    const gid = selectedGroupIds[0]!
    const group = findGroupById(world, gid)
    if (group) {
      const memberSet = new Set(group.memberIds)
      const someoneOutside = selectedEntityIds.some((id) => !memberSet.has(id))
      if (someoneOutside) {
        canAddToGroup = true
        addTargetGroupId = gid
      }
    }
  }

  const canRemoveFromGroup = selectedEntityIds.some((id) => findGroupContaining(world, id) !== null)

  return { canCreate, canUngroup, ungroupTargetId, canAddToGroup, addTargetGroupId, canRemoveFromGroup }
}
