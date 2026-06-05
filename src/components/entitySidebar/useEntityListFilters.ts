import { useCallback, useMemo, useState } from 'react'
import type { Entity } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import { getEntityApproximateSize } from '@/utils/entityApproximateSize'
import { entityIsPlayableAvatar } from '@/utils/avatarUtils'
import { entityHistoryRank } from '@/utils/entityWorkHistory'

export type TriState = 'any' | 'yes' | 'no'

export interface UseEntityListFiltersOptions {
  entityWorkHistory?: readonly string[]
}

export interface EntityListFilters {
  searchQuery: string
  setSearchQuery: (q: string) => void
  filterHasModel: TriState
  setFilterHasModel: (v: TriState) => void
  filterShape: 'any' | AddableShapeType
  setFilterShape: (v: 'any' | AddableShapeType) => void
  filterHasTransformers: TriState
  setFilterHasTransformers: (v: TriState) => void
  filterSizeMin: string
  setFilterSizeMin: (v: string) => void
  filterSizeMax: string
  setFilterSizeMax: (v: string) => void
  filterPlayableAvatar: boolean
  setFilterPlayableAvatar: (v: boolean) => void
  sortByHistory: boolean
  setSortByHistory: (v: boolean) => void
  /** True iff any non-search filter is active (excludes sort-by-history). */
  hasActiveEntityFilters: boolean
  /** True when filters, playable avatar, or sort-by-history are active. */
  hasActivePickerFilters: boolean
  clearEntityFilters: () => void
  /** Entities passing search + filters. */
  filteredEntities: Entity[]
  /** History ids that still exist in the current entity list (MRU order). */
  recentEntityIds: string[]
  /** Empty-state message string (empty when list is non-empty). */
  entityListEmptyMessage: string
}

function entityLabel(entity: Entity): string {
  return (entity.name ?? entity.id).toLowerCase()
}

function sortEntitiesByHistoryThenName(entities: Entity[], history: readonly string[]): Entity[] {
  return [...entities].sort((a, b) => {
    const ra = entityHistoryRank(history, a.id)
    const rb = entityHistoryRank(history, b.id)
    if (ra !== rb) return ra - rb
    return entityLabel(a).localeCompare(entityLabel(b))
  })
}

/**
 * Owns the entity-list search box and filter dropdowns and the derived list.
 * Pure derivation — no side effects, no per-frame work.
 */
export function useEntityListFilters(
  entities: Entity[],
  options: UseEntityListFiltersOptions = {},
): EntityListFilters {
  const entityWorkHistory = options.entityWorkHistory ?? []

  const [searchQuery, setSearchQuery] = useState('')
  const [filterHasModel, setFilterHasModel] = useState<TriState>('any')
  const [filterShape, setFilterShape] = useState<'any' | AddableShapeType>('any')
  const [filterHasTransformers, setFilterHasTransformers] = useState<TriState>('any')
  const [filterSizeMin, setFilterSizeMin] = useState('')
  const [filterSizeMax, setFilterSizeMax] = useState('')
  const [filterPlayableAvatar, setFilterPlayableAvatar] = useState(false)
  const [sortByHistory, setSortByHistory] = useState(false)

  const hasActiveEntityFilters = useMemo(
    () =>
      filterHasModel !== 'any' ||
      filterShape !== 'any' ||
      filterHasTransformers !== 'any' ||
      filterSizeMin.trim() !== '' ||
      filterSizeMax.trim() !== '' ||
      filterPlayableAvatar,
    [filterHasModel, filterShape, filterHasTransformers, filterSizeMin, filterSizeMax, filterPlayableAvatar],
  )

  const hasActivePickerFilters = hasActiveEntityFilters || sortByHistory

  const clearEntityFilters = useCallback(() => {
    setFilterHasModel('any')
    setFilterShape('any')
    setFilterHasTransformers('any')
    setFilterSizeMin('')
    setFilterSizeMax('')
    setFilterPlayableAvatar(false)
    setSortByHistory(false)
  }, [])

  const entityById = useMemo(() => {
    const map = new Map<string, Entity>()
    for (const e of entities) map.set(e.id, e)
    return map
  }, [entities])

  const recentEntityIds = useMemo(() => {
    const out: string[] = []
    for (const id of entityWorkHistory) {
      if (entityById.has(id)) out.push(id)
    }
    return out
  }, [entityWorkHistory, entityById])

  const filteredEntities = useMemo(() => {
    let list = entities
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const name = entityLabel(e)
        return name.includes(q) || e.id.toLowerCase().includes(q)
      })
    }
    if (filterHasModel === 'yes') {
      list = list.filter((e) => Boolean(e.model?.trim()))
    } else if (filterHasModel === 'no') {
      list = list.filter((e) => !e.model?.trim())
    }
    if (filterShape !== 'any') {
      list = list.filter((e) => e.shape?.type === filterShape)
    }
    if (filterHasTransformers === 'yes') {
      list = list.filter((e) => (e.transformers?.length ?? 0) > 0)
    } else if (filterHasTransformers === 'no') {
      list = list.filter((e) => (e.transformers?.length ?? 0) === 0)
    }
    if (filterPlayableAvatar) {
      list = list.filter((e) => entityIsPlayableAvatar(e))
    }
    const minParsed = parseFloat(filterSizeMin)
    const maxParsed = parseFloat(filterSizeMax)
    const hasMin = filterSizeMin.trim() !== '' && !Number.isNaN(minParsed)
    const hasMax = filterSizeMax.trim() !== '' && !Number.isNaN(maxParsed)
    if (hasMin || hasMax) {
      list = list.filter((e) => {
        const sz = getEntityApproximateSize(e)
        if (hasMin && sz < minParsed) return false
        if (hasMax && sz > maxParsed) return false
        return true
      })
    }
    if (sortByHistory) {
      list = sortEntitiesByHistoryThenName(list, entityWorkHistory)
    }
    return list
  }, [
    entities,
    searchQuery,
    filterHasModel,
    filterShape,
    filterHasTransformers,
    filterPlayableAvatar,
    filterSizeMin,
    filterSizeMax,
    sortByHistory,
    entityWorkHistory,
  ])

  const entityListEmptyMessage = useMemo(() => {
    if (entities.length === 0) return 'No entities'
    if (filteredEntities.length > 0) return ''
    const q = searchQuery.trim()
    const hasSearch = Boolean(q)
    if (hasSearch && hasActiveEntityFilters) {
      return `No entities match "${q}" or the current filters`
    }
    if (hasSearch) return `No entities match "${q}"`
    if (hasActiveEntityFilters) return 'No entities match the current filters'
    return 'No entities'
  }, [entities.length, filteredEntities.length, searchQuery, hasActiveEntityFilters])

  return {
    searchQuery,
    setSearchQuery,
    filterHasModel,
    setFilterHasModel,
    filterShape,
    setFilterShape,
    filterHasTransformers,
    setFilterHasTransformers,
    filterSizeMin,
    setFilterSizeMin,
    filterSizeMax,
    setFilterSizeMax,
    filterPlayableAvatar,
    setFilterPlayableAvatar,
    sortByHistory,
    setSortByHistory,
    hasActiveEntityFilters,
    hasActivePickerFilters,
    clearEntityFilters,
    filteredEntities,
    recentEntityIds,
    entityListEmptyMessage,
  }
}
