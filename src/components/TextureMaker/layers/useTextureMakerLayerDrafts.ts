import { useCallback, useEffect, useState } from 'react'
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
  setNameDraft: React.Dispatch<React.SetStateAction<string>>
  opacityDraft: number
  setOpacityDraft: React.Dispatch<React.SetStateAction<number>>
  placementDraft: TextureLayerDest | null
  setPlacementDraft: React.Dispatch<React.SetStateAction<TextureLayerDest | null>>
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
  }, [selectedLayerId, selectedLayer?.id, selectedLayer?.name, selectedLayer?.opacity])

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
  }, [selectedLayerId, doc.width, doc.height, layerPlacementSig, layersOrderSig])

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
