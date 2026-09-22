import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TextureDocument, TextureLayer, TextureLayerDest } from '@/utils/textureCompositor'
import { layerDestOrDefault } from '@/utils/textureCompositor'

export interface UseTextureMakerLayerDraftsArgs {
  doc: TextureDocument
  selectedLayerId: string | null
  onPatchLayer: (
    layerId: string,
    patch: Partial<Pick<TextureLayer, 'opacity' | 'blendMode' | 'visible' | 'name' | 'dest'>>,
  ) => void
}

export interface UseTextureMakerLayerDraftsResult {
  selectedLayer: TextureLayer | undefined
  nameDraft: string
  setNameDraft: Dispatch<SetStateAction<string>>
  opacityDraft: number
  setOpacityDraft: Dispatch<SetStateAction<number>>
  placementDraft: TextureLayerDest | null
  setPlacementDraft: Dispatch<SetStateAction<TextureLayerDest | null>>
  commitLayerDest: (d: TextureLayerDest) => void
}

export function useTextureMakerLayerDrafts({
  doc,
  selectedLayerId,
  onPatchLayer,
}: UseTextureMakerLayerDraftsArgs): UseTextureMakerLayerDraftsResult {
  const [nameDraft, setNameDraft] = useState('')
  const [opacityDraft, setOpacityDraft] = useState(1)
  const [placementDraft, setPlacementDraft] = useState<TextureLayerDest | null>(null)

  const selectedLayer = selectedLayerId ? doc.layers.find((l) => l.id === selectedLayerId) : undefined

  useEffect(() => {
    if (!selectedLayer) {
      setNameDraft('')
      return
    }
    setNameDraft(selectedLayer.name)
    setOpacityDraft(selectedLayer.opacity)
  }, [selectedLayer])

  const layerPlacementSig = selectedLayer
    ? [
        selectedLayer.id,
        selectedLayer.dest?.x ?? '',
        selectedLayer.dest?.y ?? '',
        selectedLayer.dest?.w ?? '',
        selectedLayer.dest?.h ?? '',
      ].join(':')
    : ''
  const layersOrderSig = doc.layers.map((l) => l.id).join(',')

  useEffect(() => {
    if (!selectedLayerId) {
      setPlacementDraft(null)
      return
    }
    const layer = doc.layers.find((l) => l.id === selectedLayerId)
    if (!layer) {
      setPlacementDraft(null)
      return
    }
    setPlacementDraft(layerDestOrDefault(layer, doc))
  }, [selectedLayerId, doc, doc.width, doc.height, layerPlacementSig, layersOrderSig])

  const commitLayerDest = useCallback(
    (d: TextureLayerDest) => {
      if (!selectedLayerId) return
      void onPatchLayer(selectedLayerId, { dest: d })
    },
    [selectedLayerId, onPatchLayer],
  )

  return {
    selectedLayer,
    nameDraft,
    setNameDraft,
    opacityDraft,
    setOpacityDraft,
    placementDraft,
    setPlacementDraft,
    commitLayerDest,
  }
}
