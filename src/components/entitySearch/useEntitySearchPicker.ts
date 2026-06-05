import { useMemo, useState } from 'react'
import type { Entity } from '@/types/world'
import { useEntityListFilters, type EntityListFilters } from '@/components/entitySidebar/useEntityListFilters'

export type EntitySearchPickerState = EntityListFilters & {
  filterPopoverOpen: boolean
  setFilterPopoverOpen: (open: boolean) => void
  resultsOpen: boolean
  setResultsOpen: (open: boolean) => void
}

export function useEntitySearchPicker(
  entities: Entity[],
  entityWorkHistory: readonly string[],
): EntitySearchPickerState {
  const filters = useEntityListFilters(entities, { entityWorkHistory })
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)

  return useMemo(
    () => ({
      ...filters,
      filterPopoverOpen,
      setFilterPopoverOpen,
      resultsOpen,
      setResultsOpen,
    }),
    [filters, filterPopoverOpen, resultsOpen],
  )
}
