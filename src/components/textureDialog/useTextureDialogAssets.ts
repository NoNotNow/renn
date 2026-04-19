import { useCallback, useMemo, useState } from 'react'
import type { RennWorld } from '@/types/world'
import { TextureManager } from '@/utils/textureManager'
import { listVideoMapPickerAssets } from '@/utils/videoManager'
import {
  buildTextureDialogGroups,
  isInternalTextureAssetKey,
  type TextureDialogGroup,
} from '@/utils/textureAssetVersioning'

export interface TextureDialogFilteredItem {
  id: string
  blob: Blob
}

export interface TextureDialogAssetsState {
  searchQuery: string
  setSearchQuery: (q: string) => void
  /** User-uploaded image assets after the search filter (no internal keys). */
  filteredTextures: TextureDialogFilteredItem[]
  /** Family/single grouping derived from `filteredTextures` ids. */
  dialogGroups: TextureDialogGroup[]
  /** Lookup table for `id -> blob` across all filtered images (covers grouped versions too). */
  blobById: Map<string, Blob>
  /** Video assets after the search filter (empty when `allowVideo` is false). */
  filteredVideos: TextureDialogFilteredItem[]
  /** True when both lists are empty after filtering. */
  leftColumnEmpty: boolean
  expandedFamilies: Set<string>
  toggleFamilyExpanded: (stem: string) => void
}

/**
 * Owns the texture-picker browse state: search box, expanded family rows, and
 * all derived lists shown in the left column. Pure derivation — no effects.
 */
export function useTextureDialogAssets(
  assets: Map<string, Blob>,
  world: RennWorld,
  allowVideo: boolean,
): TextureDialogAssetsState {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(() => new Set())

  const userTextureAssets = useMemo(
    () => TextureManager.getTextureAssets(assets).filter(({ id }) => !isInternalTextureAssetKey(id)),
    [assets],
  )

  const filteredTextures = useMemo(
    () =>
      userTextureAssets.filter(({ id }) =>
        id.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [userTextureAssets, searchQuery],
  )

  const dialogGroups = useMemo(
    () => buildTextureDialogGroups(filteredTextures.map((t) => t.id)),
    [filteredTextures],
  )

  const blobById = useMemo(
    () => new Map(filteredTextures.map((t) => [t.id, t.blob] as const)),
    [filteredTextures],
  )

  const videoPickerAssets = useMemo(
    () => listVideoMapPickerAssets(assets, world),
    [assets, world],
  )

  const filteredVideos = useMemo(
    () =>
      allowVideo
        ? videoPickerAssets.filter(({ id }) =>
            id.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : [],
    [allowVideo, videoPickerAssets, searchQuery],
  )

  const toggleFamilyExpanded = useCallback((stem: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(stem)) next.delete(stem)
      else next.add(stem)
      return next
    })
  }, [])

  const leftColumnEmpty =
    filteredTextures.length === 0 && (!allowVideo || filteredVideos.length === 0)

  return {
    searchQuery,
    setSearchQuery,
    filteredTextures,
    dialogGroups,
    blobById,
    filteredVideos,
    leftColumnEmpty,
    expandedFamilies,
    toggleFamilyExpanded,
  }
}
