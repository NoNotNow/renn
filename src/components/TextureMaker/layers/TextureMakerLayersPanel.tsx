import { useRef } from 'react'
import type { BlendMode, TextureDocument, TextureLayer, TextureLayerDest } from '@/utils/textureCompositor'
import { TEXTURE_BLEND_MODES } from '@/utils/textureCompositor'

export interface TextureMakerLayersPanelProps {
  doc: TextureDocument
  selectedLayerId: string | null
  selectedLayer: TextureLayer | undefined
  placementDraft: TextureLayerDest | null
  setPlacementDraft: React.Dispatch<React.SetStateAction<TextureLayerDest | null>>
  nameDraft: string
  setNameDraft: React.Dispatch<React.SetStateAction<string>>
  opacityDraft: number
  setOpacityDraft: React.Dispatch<React.SetStateAction<number>>
  onSelectLayer: (layerId: string) => void
  onPatchLayer: (
    layerId: string,
    patch: Partial<Pick<TextureLayer, 'opacity' | 'blendMode' | 'visible' | 'name' | 'dest'>>,
  ) => void
  onReorderLayer: (fromIndex: number, toIndex: number) => void
  onRemoveLayer: (index: number) => void
  onAddEmptyLayer: () => void
  onImportLayer: (file: File) => void
  onMergeDown: (index: number) => void
}

export function TextureMakerLayersPanel({
  doc,
  selectedLayerId,
  selectedLayer,
  placementDraft,
  setPlacementDraft,
  nameDraft,
  setNameDraft,
  opacityDraft,
  setOpacityDraft,
  onSelectLayer,
  onPatchLayer,
  onReorderLayer,
  onRemoveLayer,
  onAddEmptyLayer,
  onImportLayer,
  onMergeDown,
}: TextureMakerLayersPanelProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const layersTopFirst = [...doc.layers].reverse()

  return (
    <div className="texture-maker-right" data-testid="texture-maker-right">
      <div className="texture-maker-layers">
        <div className="texture-maker-layers__title">Layers (top first)</div>
        {layersTopFirst.map((layer) => {
          const realIndex = doc.layers.indexOf(layer)
          const selected = layer.id === selectedLayerId
          return (
            <div
              key={layer.id}
              className={`texture-maker-layer-row${selected ? ' selected' : ''}`}
              onClick={() => onSelectLayer(layer.id)}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Select layer ${layer.name} for painting`}
              onKeyDown={(e) => e.key === 'Enter' && onSelectLayer(layer.id)}
            >
              <button
                type="button"
                title={layer.visible ? 'Hide' : 'Show'}
                onClick={(e) => {
                  e.stopPropagation()
                  onPatchLayer(layer.id, { visible: !layer.visible })
                }}
                className="texture-maker-layer-row__icon"
              >
                {layer.visible ? '👁' : '○'}
              </button>
              <span className="texture-maker-layer-row__name">{layer.name}</span>
              <button
                type="button"
                disabled={realIndex <= 0}
                title="Merge down"
                onClick={(e) => {
                  e.stopPropagation()
                  onMergeDown(realIndex)
                }}
                className="texture-maker-layer-row__icon"
              >
                ⬇
              </button>
              <button
                type="button"
                title="Remove"
                disabled={doc.layers.length <= 1}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveLayer(realIndex)
                }}
                className="texture-maker-layer-row__icon"
              >
                ✕
              </button>
            </div>
          )
        })}
        <div className="texture-maker-layers__actions">
          <button type="button" onClick={() => onAddEmptyLayer()}>
            + Empty layer
          </button>
          <button type="button" onClick={() => importRef.current?.click()}>
            + Import image
          </button>
          <input
            ref={importRef}
            type="file"
            accept="image/*"
            className="texture-maker-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportLayer(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="texture-maker-props" data-testid="texture-maker-layer-props">
        {selectedLayerId && selectedLayer ? (
          <div className="texture-maker-props__inner">
            <h3 className="texture-maker-props__heading">Layer properties</h3>
            {placementDraft ? (
              <dl className="texture-maker-props__dest-readout" data-testid="texture-maker-dest-readout">
                <div>
                  <dt>Placement X</dt>
                  <dd>{Math.round(placementDraft.x)}</dd>
                </div>
                <div>
                  <dt>Y</dt>
                  <dd>{Math.round(placementDraft.y)}</dd>
                </div>
                <div>
                  <dt>W</dt>
                  <dd>{Math.round(placementDraft.w)}</dd>
                </div>
                <div>
                  <dt>H</dt>
                  <dd>{Math.round(placementDraft.h)}</dd>
                </div>
              </dl>
            ) : null}
            <div className="texture-maker-props__quick">
              <button
                type="button"
                onClick={() => {
                  onPatchLayer(selectedLayer.id, { dest: undefined })
                  setPlacementDraft({ x: 0, y: 0, w: doc.width, h: doc.height })
                }}
              >
                Reset placement (full canvas)
              </button>
            </div>
            <label
              className="texture-maker-props__label"
              title="Layer opacity in the compositor preview; applied live until you bake with Apply."
            >
              Opacity (draft)
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={opacityDraft}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setOpacityDraft(next)
                  // Draft opacity updates preview immediately (final composite happens via Apply).
                  void onPatchLayer(selectedLayer.id, { opacity: next })
                }}
                aria-label="Layer opacity draft"
                data-testid="texture-maker-opacity-draft"
              />
              <span>{Math.round(opacityDraft * 100)}%</span>
            </label>
            <label
              className="texture-maker-props__label"
              title="How this layer combines with layers below (standard blend modes)."
            >
              Blend
              <select
                value={selectedLayer.blendMode}
                onChange={(e) => onPatchLayer(selectedLayer.id, { blendMode: e.target.value as BlendMode })}
              >
                {TEXTURE_BLEND_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="texture-maker-props__label"
              title="Display name for this layer in the stack list."
            >
              Name
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  const t = nameDraft.trim()
                  if (t && t !== selectedLayer.name) {
                    onPatchLayer(selectedLayer.id, { name: t })
                  }
                }}
                aria-label="Layer name"
                data-testid="texture-maker-name-draft"
              />
            </label>
            <div className="texture-maker-toolbar">
              <span title="Layer draw order: higher items in the list paint above lower ones.">Stack</span>
              <button
                type="button"
                title="Bring forward"
                disabled={doc.layers.indexOf(selectedLayer) >= doc.layers.length - 1}
                onClick={() => {
                  const i = doc.layers.indexOf(selectedLayer)
                  onReorderLayer(i, i + 1)
                }}
              >
                Up
              </button>
              <button
                type="button"
                title="Send backward"
                disabled={doc.layers.indexOf(selectedLayer) <= 0}
                onClick={() => {
                  const i = doc.layers.indexOf(selectedLayer)
                  onReorderLayer(i, i - 1)
                }}
              >
                Down
              </button>
            </div>
          </div>
        ) : (
          <p className="texture-maker-props__empty">Select a layer to edit properties</p>
        )}
      </div>
    </div>
  )
}
