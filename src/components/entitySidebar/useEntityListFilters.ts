import { useCallback, useMemo, useState } from 'react'
import type { Entity } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import { getEntityApproximateSize } from '@/utils/entityApproximateSize'

export type TriState = 'any' | 'yes' | 'no'

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
  /** True iff any non-search filter is active. */
  hasActiveEntityFilters: boolean
  clearEntityFilters: () => void
  /** Entities passing search + filters, preserving input order. */
  filteredEntities: Entity[]
  /** Empty-state message string (empty when list is non-empty). */
  entityListEmptyMessage: string
}

/**
 * Owns the entity-list search box and filter dropdowns and the derived list.
 * Pure derivation — no side effects, no per-frame work.
 */
export function useEntityListFilters(entities: Entity[]): EntityListFilters {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterHasModel, setFilterHasModel] = useState<TriState>('any')
  const [filterShape, setFilterShape] = useState<'any' | AddableShapeType>('any')
  const [filterHasTransformers, setFilterHasTransformers] = useState<TriState>('any')
  const [filterSizeMin, setFilterSizeMin] = useState('')
  const [filterSizeMax, setFilterSizeMax] = useState('')

  const hasActiveEntityFilters = useMemo(
    () =>
      filterHasModel !== 'any' ||
      filterShape !== 'any' ||
      filterHasTransformers !== 'any' ||
      filterSizeMin.trim() !== '' ||
      filterSizeMax.trim() !== '',
    [filterHasModel, filterShape, filterHasTransformers, filterSizeMin, filterSizeMax],
  )

  const clearEntityFilters = useCallback(() => {
    setFilterHasModel('any')
    setFilterShape('any')
    setFilterHasTransformers('any')
    setFilterSizeMin('')
    setFilterSizeMax('')
  }, [])

  const filteredEntities = useMemo(() => {
    let list = entities
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const name = (e.name ?? e.id).toLowerCase()
        return name.includes(q)
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
    return list
  }, [
    entities,
    searchQuery,
    filterHasModel,
    filterShape,
    filterHasTransformers,
    filterSizeMin,
    filterSizeMax,
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
    hasActiveEntityFilters,
    clearEntityFilters,
    filteredEntities,
    entityListEmptyMessage,
  }
}
